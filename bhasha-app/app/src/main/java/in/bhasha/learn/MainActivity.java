package in.bhasha.learn;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.util.Locale;
import java.util.Set;

/**
 * Hosts the offline Bhasha web app (assets/www) in a WebView.
 * Android's WebView has no Web Speech API, so pronunciation goes through the
 * phone's own TextToSpeech engine, exposed to the page as window.AndroidTTS.
 */
public class MainActivity extends Activity {
    private WebView web;
    private TextToSpeech tts;
    private volatile boolean ttsReady = false;

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
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, String url) {
                if (url.startsWith("file:///android_asset/")) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Exception ignored) { }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient()); // shows the page's confirm() dialogs

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
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    public void onBackPressed() {
        // Let the page handle Back first (leave a lesson, close a tab); exit only from the main screen.
        web.evaluateJavascript("window.bhashaBack ? String(window.bhashaBack()) : 'false'", new android.webkit.ValueCallback<String>() {
            public void onReceiveValue(String handled) {
                if (handled == null || !handled.contains("true")) finish();
            }
        });
    }

    @Override
    protected void onDestroy() {
        if (tts != null) { tts.stop(); tts.shutdown(); }
        super.onDestroy();
    }

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
