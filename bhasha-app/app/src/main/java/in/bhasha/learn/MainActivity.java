package in.bhasha.learn;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;
import java.util.Set;

/**
 * Hosts the offline Bhasha web app (assets/www) in a WebView.
 * - Pronunciation: Android's WebView has no Web Speech API, so the phone's TextToSpeech
 *   engine is exposed to the page as window.AndroidTTS.
 * - Updates: window.AndroidApp checks the published version.json, downloads the new APK
 *   inside the app and hands it to Android's package installer (window.bhashaUpdate callbacks).
 */
public class MainActivity extends Activity {
    private static final String SITE = "https://usb10-ai.github.io/bhasha/";
    private static final String ACTION_INSTALL_STATUS = "in.bhasha.learn.INSTALL_STATUS";

    private WebView web;
    private TextToSpeech tts;
    private volatile boolean ttsReady = false;
    private volatile boolean downloading = false;
    private boolean checkedOnLaunch = false;
    private File pendingApk; // downloaded, waiting for "install unknown apps" permission

    private final BroadcastReceiver installStatus = new BroadcastReceiver() {
        @Override
        public void onReceive(Context c, Intent intent) {
            int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
            if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
                Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
                if (confirm != null) {
                    try { startActivity(confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); }
                    catch (Exception e) { js("onError", "Could not open the installer: " + e.getMessage()); }
                }
            } else if (status == PackageInstaller.STATUS_SUCCESS) {
                js("onStatus", "Updated! Restart Bhasha to use the new version.");
            } else if (status == PackageInstaller.STATUS_FAILURE_ABORTED) {
                js("onError", "Update cancelled. Tap Update now to try again.");
            } else {
                String msg = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
                js("onError", "Install failed" + (msg != null ? ": " + msg : "") + ". You can also download the APK from " + SITE);
            }
        }
    };

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setBuiltInZoomControls(false);
        s.setTextZoom(100);
        s.setMediaPlaybackRequiresUserGesture(false);

        web.addJavascriptInterface(new Speech(), "AndroidTTS");
        web.addJavascriptInterface(new AppBridge(), "AndroidApp");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, String url) {
                if (url.startsWith("file:///android_asset/")) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Exception ignored) { }
                return true;
            }

            @Override
            public void onPageFinished(WebView v, String url) {
                if (!checkedOnLaunch) { checkedOnLaunch = true; checkForUpdate(false); }
            }
        });
        web.setWebChromeClient(new WebChromeClient()); // shows the page's confirm() dialogs

        IntentFilter f = new IntentFilter(ACTION_INSTALL_STATUS);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(installStatus, f, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(installStatus, f);

        tts = new TextToSpeech(this, new TextToSpeech.OnInitListener() {
            @Override
            public void onInit(int status) {
                ttsReady = status == TextToSpeech.SUCCESS;
                notifyVoices();
            }
        });

        if (state != null) web.restoreState(state);
        else web.loadUrl("file:///android_asset/www/index.html");
    }

    /** Calls window.bhashaUpdate[fn](arg) in the page; arg is passed as a JSON string literal or raw JSON. */
    private void js(final String fn, final String arg) { jsRaw(fn, JSONObject.quote(arg == null ? "" : arg)); }

    private void jsRaw(final String fn, final String rawArg) {
        runOnUiThread(new Runnable() {
            public void run() {
                if (web != null) web.evaluateJavascript("window.bhashaUpdate && window.bhashaUpdate." + fn + " && window.bhashaUpdate." + fn + "(" + rawArg + ")", null);
            }
        });
    }

    /** Tell the page to re-check which voices exist (after start-up, or after returning from TTS settings). */
    private void notifyVoices() {
        runOnUiThread(new Runnable() {
            public void run() {
                if (web != null) web.evaluateJavascript("window.bhashaVoicesReady && window.bhashaVoicesReady()", null);
            }
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (ttsReady) notifyVoices();
        // Back from the "install unknown apps" settings screen with permission granted: continue the update.
        if (pendingApk != null && canInstall()) {
            File apk = pendingApk;
            pendingApk = null;
            install(apk);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    public void onBackPressed() {
        // Let the page handle Back first (leave a lesson, close a tab); exit only from the main screen.
        web.evaluateJavascript("window.bhashaBack ? String(window.bhashaBack()) : 'false'", new ValueCallback<String>() {
            public void onReceiveValue(String handled) {
                if (handled == null || !handled.contains("true")) finish();
            }
        });
    }

    @Override
    protected void onDestroy() {
        try { unregisterReceiver(installStatus); } catch (Exception ignored) { }
        if (tts != null) { tts.stop(); tts.shutdown(); }
        super.onDestroy();
    }

    /* ---------------- Updates ---------------- */

    private long installedCode() {
        try {
            PackageInfo pi = getPackageManager().getPackageInfo(getPackageName(), 0);
            return Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode;
        } catch (Exception e) { return 0; }
    }

    private String installedName() {
        try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; }
        catch (Exception e) { return "?"; }
    }

    private static HttpURLConnection open(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(30000);
        c.setUseCaches(false);
        c.setInstanceFollowRedirects(true);
        return c;
    }

    /** Fetch version.json; tell the page whether a newer APK exists. Quiet on errors unless manual. */
    private void checkForUpdate(final boolean manual) {
        new Thread(new Runnable() {
            public void run() {
                try {
                    HttpURLConnection c = open(SITE + "version.json?t=" + System.currentTimeMillis());
                    if (c.getResponseCode() != 200) throw new Exception("server replied " + c.getResponseCode());
                    InputStream in = c.getInputStream();
                    ByteArrayOutputStream buf = new ByteArrayOutputStream();
                    byte[] b = new byte[4096];
                    int n;
                    while ((n = in.read(b)) > 0) buf.write(b, 0, n);
                    in.close();
                    JSONObject v = new JSONObject(buf.toString("UTF-8"));
                    if (v.optLong("code", 0) > installedCode()) jsRaw("onAvailable", v.toString());
                    else if (manual) jsRaw("onNone", "null");
                } catch (Exception e) {
                    if (manual) js("onError", "Couldn't check for updates. Are you online?");
                }
            }
        }).start();
    }

    /** Download the APK into the app's cache with progress, then install it. */
    private void downloadUpdate(final String apkName) {
        if (downloading) return;
        downloading = true;
        new Thread(new Runnable() {
            public void run() {
                File out = new File(getCacheDir(), "bhasha-update.apk");
                try {
                    HttpURLConnection c = open(SITE + (apkName == null || apkName.isEmpty() ? "Bhasha.apk" : apkName) + "?t=" + System.currentTimeMillis());
                    if (c.getResponseCode() != 200) throw new Exception("server replied " + c.getResponseCode());
                    long total = c.getContentLength();
                    InputStream in = c.getInputStream();
                    OutputStream os = new FileOutputStream(out);
                    byte[] b = new byte[65536];
                    long done = 0;
                    int n, last = -1;
                    while ((n = in.read(b)) > 0) {
                        os.write(b, 0, n);
                        done += n;
                        int pct = total > 0 ? (int) (done * 100 / total) : -1;
                        if (pct != last) { last = pct; jsRaw("onProgress", String.valueOf(pct)); }
                    }
                    os.close();
                    in.close();
                    if (total > 0 && done != total) throw new Exception("download incomplete");
                    js("onStatus", "Download complete. Opening the installer…");
                    runOnUiThread(new Runnable() { public void run() { install(out); } });
                } catch (Exception e) {
                    js("onError", "Download failed: " + e.getMessage() + ". Check your connection and try again.");
                } finally {
                    downloading = false;
                }
            }
        }).start();
    }

    private boolean canInstall() {
        return Build.VERSION.SDK_INT < 26 || getPackageManager().canRequestPackageInstalls();
    }

    private void install(final File apk) {
        if (!canInstall()) {
            pendingApk = apk;
            new AlertDialog.Builder(this)
                .setTitle("Allow updates")
                .setMessage("To update itself, Bhasha needs permission to install apps. On the next screen, turn on \"Allow from this source\", then come back.")
                .setNegativeButton("Not now", new DialogInterface.OnClickListener() {
                    public void onClick(DialogInterface d, int w) { pendingApk = null; js("onError", "Update paused. Tap Update now when you're ready."); }
                })
                .setPositiveButton("Open settings", new DialogInterface.OnClickListener() {
                    public void onClick(DialogInterface d, int w) {
                        try {
                            startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName())));
                        } catch (Exception e) { js("onError", "Couldn't open settings: " + e.getMessage()); }
                    }
                })
                .show();
            return;
        }
        try {
            PackageInstaller pi = getPackageManager().getPackageInstaller();
            PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
            params.setAppPackageName(getPackageName());
            int id = pi.createSession(params);
            PackageInstaller.Session session = pi.openSession(id);
            InputStream in = new FileInputStream(apk);
            OutputStream out = session.openWrite("bhasha", 0, apk.length());
            byte[] b = new byte[65536];
            int n;
            while ((n = in.read(b)) > 0) out.write(b, 0, n);
            session.fsync(out);
            out.close();
            in.close();
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
            PendingIntent done = PendingIntent.getBroadcast(this, id, new Intent(ACTION_INSTALL_STATUS).setPackage(getPackageName()), flags);
            session.commit(done.getIntentSender());
            session.close();
        } catch (Exception e) {
            js("onError", "Install failed: " + e.getMessage());
        }
    }

    private class AppBridge {
        @JavascriptInterface public String versionName() { return installedName(); }
        @JavascriptInterface public String versionCode() { return String.valueOf(installedCode()); }
        @JavascriptInterface public void checkUpdate() { checkForUpdate(true); }
        @JavascriptInterface public void installUpdate(String apkName) { downloadUpdate(apkName); }
    }

    /* ---------------- Speech ---------------- */

    private static Locale localeFor(String code) { return new Locale(code, "IN"); }

    private class Speech {
        /** Name of an installed voice for the language code ("te", "or"), or "" if none is usable. */
        @JavascriptInterface
        public String voiceName(String code) {
            if (!ttsReady) return "";
            try {
                Locale loc = localeFor(code);
                int r = tts.isLanguageAvailable(loc);
                if (r < TextToSpeech.LANG_AVAILABLE) return "";
                Set<Voice> vs = tts.getVoices();
                if (vs != null) {
                    for (Voice v : vs) {
                        if (code.equals(v.getLocale().getLanguage())
                                && !v.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)) {
                            return loc.getDisplayLanguage(loc) + " · " + (v.isNetworkConnectionRequired() ? "online voice" : "on-device voice");
                        }
                    }
                }
                return loc.getDisplayLanguage(loc) + " voice";
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public void speak(String text, String code, float rate) {
            if (!ttsReady) return;
            try {
                tts.setLanguage(localeFor(code));
                tts.setSpeechRate(rate);
                tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "bhasha");
            } catch (Exception ignored) { }
        }

        /** Open Android's text-to-speech settings so the learner can install a Telugu or Odia voice. */
        @JavascriptInterface
        public void openSettings() {
            runOnUiThread(new Runnable() {
                public void run() {
                    try {
                        startActivity(new Intent("com.android.settings.TTS_SETTINGS").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                    } catch (Exception e) {
                        try { startActivity(new Intent(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA)); } catch (Exception ignored) { }
                    }
                }
            });
        }
    }
}
