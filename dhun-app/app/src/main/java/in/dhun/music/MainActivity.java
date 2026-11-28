package in.dhun.music;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.InputStream;
import java.lang.ref.WeakReference;

/**
 * Hosts the Dhun web app (assets/www) in a WebView.
 * The page is served from https://appassets.androidplatform.net/ (intercepted below) rather than file://,
 * so IndexedDB, fetch() to the Internet Archive and fonts behave exactly as on the website.
 * While music plays, PlaybackService keeps the app alive in the background with a media notification.
 */
public class MainActivity extends Activity {
    static final String HOST = "appassets.androidplatform.net";
    private static final int PICK_AUDIO = 7;
    private static WeakReference<MainActivity> current = new WeakReference<>(null);

    private WebView web;
    private ValueCallback<Uri[]> pickCallback;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        current = new WeakReference<>(this);
        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setTextZoom(100);
        s.setAllowFileAccess(false);
        // Many radio stations only stream over plain http.
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        web.addJavascriptInterface(new Bridge(), "DhunAndroid");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (!HOST.equals(u.getHost())) return null;
                String path = u.getPath();
                if (path == null || path.equals("/") || path.isEmpty()) path = "/index.html";
                try {
                    InputStream in = getAssets().open("www" + path);
                    return new WebResourceResponse(mime(path), "utf-8", in);
                } catch (Exception e) {
                    return new WebResourceResponse("text/plain", "utf-8", 404, "Not found", new java.util.HashMap<String, String>(), null);
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (HOST.equals(u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (pickCallback != null) pickCallback.onReceiveValue(null);
                pickCallback = cb;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("audio/*");
                i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try {
                    startActivityForResult(Intent.createChooser(i, "Add music"), PICK_AUDIO);
                } catch (Exception e) {
                    pickCallback = null;
                    return false;
                }
                return true;
            }
        });

        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
        }

        if (state != null) web.restoreState(state);
        else web.loadUrl("https://" + HOST + "/index.html");
    }

    private static String mime(String p) {
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js")) return "application/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".json")) return "application/json";
        return "application/octet-stream";
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req != PICK_AUDIO || pickCallback == null) return;
        Uri[] out = null;
        if (res == RESULT_OK && data != null) {
            ClipData clip = data.getClipData();
            if (clip != null && clip.getItemCount() > 0) {
                out = new Uri[clip.getItemCount()];
                for (int k = 0; k < out.length; k++) out[k] = clip.getItemAt(k).getUri();
            } else if (data.getData() != null) {
                out = new Uri[]{data.getData()};
            }
        }
        pickCallback.onReceiveValue(out);
        pickCallback = null;
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    public void onBackPressed() {
        // The page closes the player, menus or sub-pages first; leaving the home screen sends the app to the
        // background (music keeps playing) instead of closing it.
        web.evaluateJavascript("window.dhunBack ? String(window.dhunBack()) : 'false'", new ValueCallback<String>() {
            public void onReceiveValue(String handled) {
                if (handled == null || !handled.contains("true")) moveTaskToBack(true);
            }
        });
    }

    @Override
    protected void onDestroy() {
        stopService(new Intent(this, PlaybackService.class));
        if (web != null) web.destroy();
        super.onDestroy();
    }

    /** Called by the notification's buttons. */
    static void command(final String cmd) {
        final MainActivity a = current.get();
        if (a == null || a.web == null) return;
        a.runOnUiThread(new Runnable() {
            public void run() { a.web.evaluateJavascript("window.dhunCmd && window.dhunCmd('" + cmd + "')", null); }
        });
    }

    private class Bridge {
        /** The page reports playback state; the service shows it in the notification. */
        @JavascriptInterface
        public void state(boolean playing, String title, String artist) {
            Intent i = new Intent(MainActivity.this, PlaybackService.class);
            i.setAction(PlaybackService.ACTION_STATE);
            i.putExtra("playing", playing);
            i.putExtra("title", title == null ? "" : title);
            i.putExtra("artist", artist == null ? "" : artist);
            try {
                if (playing && !PlaybackService.running && Build.VERSION.SDK_INT >= 26) startForegroundService(i);
                else if (playing || PlaybackService.running) startService(i);
            } catch (Exception ignored) { }
        }
    }
}
