package in.usb10.officeeditor;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.webkit.WebViewAssetLoader;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * Hosts the offline Office Editor web app (assets/www, copied from ../office at build time).
 * The page is served from https://appassets.androidplatform.net so fetch() and blobs behave
 * exactly as on the website. A small JavaScript bridge ("AndroidBridge") lets the page save
 * files through the system "Save as" screen, print, go full screen and receive files that
 * other apps open with / share to Office Editor.
 */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String START = "https://" + HOST + "/assets/www/index.html";
    private static final String DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    private static final String PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    private static final int REQ_PICK = 1;
    private static final int REQ_SAVE = 2;

    private WebView web;
    private WebViewAssetLoader assets;
    private ValueCallback<Uri[]> pickCallback;
    private byte[] pendingSave;
    private boolean pageReady;

    // a file handed to us by another app, waiting for the page to collect it
    private volatile String incomingName;
    private volatile String incomingData;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.parseColor("#2b579a"));
        getWindow().setNavigationBarColor(Color.parseColor("#26292e"));
        web = new WebView(this);
        setContentView(web);

        assets = new WebViewAssetLoader.Builder()
            .setDomain(HOST)
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
            .build();

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100);
        s.setMediaPlaybackRequiresUserGesture(true);

        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest req) {
                return assets.shouldInterceptRequest(req.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (HOST.equals(u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true;
            }

            @Override
            public void onPageFinished(WebView v, String url) {
                pageReady = true;
                deliverIncoming();
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (pickCallback != null) pickCallback.onReceiveValue(null);
                pickCallback = cb;
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                List<String> mimes = new ArrayList<>();
                boolean office = false;
                for (String t : params.getAcceptTypes()) {
                    for (String part : t.split(",")) {
                        part = part.trim();
                        if (part.contains("/")) mimes.add(part);
                        if (part.equals(".docx") || part.equals(".pptx")) office = true;
                    }
                }
                if (office) {
                    if (!mimes.contains(DOCX)) mimes.add(DOCX);
                    if (!mimes.contains(PPTX)) mimes.add(PPTX);
                    mimes.add("application/octet-stream"); // some providers don't know Office types
                }
                if (mimes.isEmpty()) i.setType("*/*");
                else {
                    i.setType(mimes.size() == 1 ? mimes.get(0) : "*/*");
                    i.putExtra(Intent.EXTRA_MIME_TYPES, mimes.toArray(new String[0]));
                }
                try {
                    startActivityForResult(i, REQ_PICK);
                } catch (ActivityNotFoundException e) {
                    pickCallback = null;
                    toast("No file manager available");
                    return false;
                }
                return true;
            }
        });

        if (state != null) web.restoreState(state);
        else web.loadUrl(START);
        handleIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleIntent(intent);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    /* ---------- files opened from other apps ---------- */
    private void handleIntent(Intent intent) {
        if (intent == null) return;
        Uri uri = null;
        String action = intent.getAction();
        if (Intent.ACTION_VIEW.equals(action) || Intent.ACTION_EDIT.equals(action)) uri = intent.getData();
        else if (Intent.ACTION_SEND.equals(action)) uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        if (uri == null) return;
        final Uri src = uri;
        final String type = intent.getType() != null ? intent.getType() : getContentResolver().getType(uri);
        new Thread(new Runnable() {
            public void run() {
                try {
                    byte[] data = readAll(src);
                    String name = displayName(src);
                    if (name == null) name = "Document";
                    String lower = name.toLowerCase();
                    if (!lower.endsWith(".docx") && !lower.endsWith(".pptx")) {
                        if (PPTX.equals(type) || looksLikePptx(data)) name += ".pptx";
                        else name += ".docx";
                    }
                    incomingData = Base64.encodeToString(data, Base64.NO_WRAP);
                    incomingName = name;
                    runOnUiThread(new Runnable() { public void run() { deliverIncoming(); } });
                } catch (Exception e) {
                    runOnUiThread(new Runnable() { public void run() { toast("Could not open the file"); } });
                }
            }
        }).start();
    }

    private void deliverIncoming() {
        if (pageReady && incomingName != null) web.evaluateJavascript("window.App && App.openFromAndroid()", null);
    }

    private static boolean looksLikePptx(byte[] zip) {
        // the zip's central directory names its parts; "ppt/" means PowerPoint
        String head = new String(zip, 0, Math.min(zip.length, 1 << 20), java.nio.charset.StandardCharsets.ISO_8859_1);
        return head.contains("ppt/") && !head.contains("word/");
    }

    private byte[] readAll(Uri uri) throws Exception {
        InputStream in = getContentResolver().openInputStream(uri);
        if (in == null) throw new Exception("no stream");
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        byte[] buf = new byte[64 * 1024];
        int n;
        while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
        in.close();
        return bos.toByteArray();
    }

    private String displayName(Uri uri) {
        try (Cursor c = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                String n = c.getString(0);
                if (n != null && !n.isEmpty()) return n;
            }
        } catch (Exception ignored) { }
        String last = uri.getLastPathSegment();
        if (last != null && last.contains("/")) last = last.substring(last.lastIndexOf('/') + 1);
        return last;
    }

    /* ---------- activity results ---------- */
    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == REQ_PICK) {
            if (pickCallback != null) {
                Uri u = (res == RESULT_OK && data != null) ? data.getData() : null;
                pickCallback.onReceiveValue(u == null ? null : new Uri[]{u});
                pickCallback = null;
            }
        } else if (req == REQ_SAVE) {
            boolean ok = false;
            String name = "";
            if (res == RESULT_OK && data != null && data.getData() != null && pendingSave != null) {
                try {
                    OutputStream os = getContentResolver().openOutputStream(data.getData(), "wt");
                    os.write(pendingSave);
                    os.close();
                    ok = true;
                    String n = displayName(data.getData());
                    if (n != null) name = n;
                } catch (Exception e) {
                    toast("Could not save: " + e.getMessage());
                }
            }
            pendingSave = null;
            web.evaluateJavascript("App.onAndroidSaved(" + ok + "," + jsString(name) + ")", null);
        }
    }

    private static String jsString(String s) {
        StringBuilder b = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            if (c == '"' || c == '\\') b.append('\\').append(c);
            else if (c < 0x20 || c == 0x2028 || c == 0x2029) b.append(String.format("\\u%04x", (int) c));
            else b.append(c);
        }
        return b.append('"').toString();
    }

    /* ---------- back button: leave slideshow / warn about unsaved work ---------- */
    @Override
    public void onBackPressed() {
        web.evaluateJavascript(
            "(function(){var p=document.getElementById('presenter');if(p&&!p.hidden){PptEditor.presExit();return 'pres';}" +
            "var f=document.getElementById('findBar');if(f&&!f.hidden){f.hidden=true;return 'find';}" +
            "return (window.App&&App.isDirty())?'dirty':'clean';})()",
            new ValueCallback<String>() {
                public void onReceiveValue(String v) {
                    if (v == null || v.contains("clean")) finish();
                    else if (v.contains("dirty")) {
                        new AlertDialog.Builder(MainActivity.this)
                            .setTitle("Unsaved changes")
                            .setMessage("Your changes have not been saved. Leave anyway?")
                            .setNegativeButton("Stay", null)
                            .setPositiveButton("Leave", (d, w) -> finish())
                            .show();
                    }
                }
            });
    }

    private void toast(String m) { Toast.makeText(this, m, Toast.LENGTH_LONG).show(); }

    private void setFullscreen(boolean on) {
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c == null) return;
            if (on) {
                c.hide(WindowInsets.Type.systemBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            } else c.show(WindowInsets.Type.systemBars());
        } else {
            web.setSystemUiVisibility(on
                ? View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                : 0);
        }
    }

    /* ---------- JavaScript bridge ---------- */
    private class Bridge {
        /** Save a file the page produced (base64) through the system "Save as" screen. */
        @JavascriptInterface
        public void saveBase64(final String name, final String mime, final String b64) {
            final byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
            runOnUiThread(new Runnable() {
                public void run() {
                    pendingSave = bytes;
                    Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    String lower = name.toLowerCase();
                    i.setType(lower.endsWith(".pptx") ? PPTX : lower.endsWith(".docx") ? DOCX
                        : (mime == null || mime.isEmpty() ? "application/octet-stream" : mime));
                    i.putExtra(Intent.EXTRA_TITLE, name);
                    try {
                        startActivityForResult(i, REQ_SAVE);
                    } catch (ActivityNotFoundException e) {
                        pendingSave = null;
                        toast("No file manager available");
                        web.evaluateJavascript("App.onAndroidSaved(false,\"\")", null);
                    }
                }
            });
        }

        /** Print the Word page (or save it as PDF) with Android's print service. */
        @JavascriptInterface
        public void print() {
            runOnUiThread(new Runnable() {
                public void run() {
                    PrintManager pm = (PrintManager) getSystemService(PRINT_SERVICE);
                    pm.print("Office Editor document", web.createPrintDocumentAdapter("Document"),
                        new PrintAttributes.Builder().build());
                }
            });
        }

        @JavascriptInterface
        public void setFullscreen(final boolean on) {
            runOnUiThread(new Runnable() { public void run() { MainActivity.this.setFullscreen(on); } });
        }

        /** Name of a file another app opened with us ("" if none). */
        @JavascriptInterface
        public String pendingName() { String n = incomingName; return n == null ? "" : n; }

        /** Contents (base64) of that file; collecting it clears it. */
        @JavascriptInterface
        public String pendingData() {
            String d = incomingData;
            incomingData = null;
            incomingName = null;
            return d == null ? "" : d;
        }
    }
}
