package com.example.phonelimiter

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import android.widget.TextView
import android.widget.Toast
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/** In-app updates from the "phone-limiter-latest" GitHub release (built by GitHub Actions). */
object Updater {
    private const val BASE =
        "https://github.com/usb10-ai/usb10-ai.github.io/releases/download/phone-limiter-latest/"

    private fun open(url: String) = (URL(url).openConnection() as HttpURLConnection).apply {
        connectTimeout = 15_000; readTimeout = 30_000; instanceFollowRedirects = true
    }

    /** (versionCode, versionName) of the newest build, or null if it can't be reached. */
    private fun latest(): Pair<Int, String>? = runCatching {
        val json = JSONObject(open(BASE + "version.json").inputStream.bufferedReader().use { it.readText() })
        json.getInt("versionCode") to json.optString("versionName", "new build")
    }.getOrNull()

    /** [silent]: only speak up when an update exists (used on app start). */
    fun check(a: Activity, silent: Boolean) {
        if (!silent) Toast.makeText(a, "Checking for updates…", Toast.LENGTH_SHORT).show()
        Thread {
            val l = latest()
            a.runOnUiThread {
                if (a.isFinishing) return@runOnUiThread
                when {
                    l == null -> if (!silent) Toast.makeText(a, "Couldn't check for updates. Are you online?", Toast.LENGTH_LONG).show()
                    l.first <= BuildConfig.VERSION_CODE ->
                        if (!silent) Toast.makeText(a, "You have the latest version (${BuildConfig.VERSION_NAME}).", Toast.LENGTH_LONG).show()
                    else -> AlertDialog.Builder(a).setTitle("Update available")
                        .setMessage("${l.second} is ready. You have ${BuildConfig.VERSION_NAME}.\n\nYour priorities, habits, badges and settings are kept.")
                        .setPositiveButton("Update now") { _, _ -> download(a) }
                        .setNegativeButton("Later", null).show()
                }
            }
        }.start()
    }

    private fun download(a: Activity) {
        // Android asks once for permission to install apps from this app.
        if (!a.packageManager.canRequestPackageInstalls()) {
            AlertDialog.Builder(a).setTitle("One-time permission")
                .setMessage("Allow Phone Limiter to install updates: turn on \"Allow from this source\", come back, and tap Update again.")
                .setPositiveButton("Open setting") { _, _ ->
                    a.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${a.packageName}")))
                }.setNegativeButton("Cancel", null).show()
            return
        }
        val label = TextView(a).apply { text = "Downloading… 0%"; textSize = 16f; setPadding(64, 48, 64, 24) }
        val dlg = AlertDialog.Builder(a).setTitle("Updating Phone Limiter").setView(label).setCancelable(false).show()
        Thread {
            val result = runCatching {
                val dir = File(a.cacheDir, "updates").apply { mkdirs() }
                val f = File(dir, "update.apk")
                val conn = open(BASE + "phone-limiter.apk")
                val total = conn.contentLength.toLong()
                conn.inputStream.use { input ->
                    f.outputStream().use { out ->
                        val buf = ByteArray(32 * 1024); var done = 0L; var lastPct = -1
                        while (true) {
                            val n = input.read(buf); if (n < 0) break
                            out.write(buf, 0, n); done += n
                            val pct = if (total > 0) (done * 100 / total).toInt() else -1
                            if (pct != lastPct) { lastPct = pct; a.runOnUiThread { label.text = "Downloading… $pct%" } }
                        }
                    }
                }
                f
            }
            a.runOnUiThread {
                dlg.dismiss()
                result.onSuccess { install(a, it) }
                    .onFailure { Toast.makeText(a, "Download failed. Please try again.", Toast.LENGTH_LONG).show() }
            }
        }.start()
    }

    private fun install(a: Activity, apk: File) {
        val uri = FileProvider.getUriForFile(a, "${a.packageName}.files", apk)
        a.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}
