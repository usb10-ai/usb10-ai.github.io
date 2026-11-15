package com.example.phonelimiter

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.widget.*

class MainActivity : Activity() {
    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 0)
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(48, 96, 48, 48) }
        fun label(s: String) = TextView(this).apply { text = s; textSize = 16f; setPadding(0, 32, 0, 8) }
        fun number(v: Int) = EditText(this).apply { setText(v.toString()); inputType = 2 }

        root.addView(TextView(this).apply { text = "Phone Limiter"; textSize = 28f })
        root.addView(label("Remind me after this many minutes of continuous use"))
        val limit = number(Prefs.limitMin(this)).also { root.addView(it) }
        root.addView(label("Screen-off minutes that count as a real break"))
        val brk = number(Prefs.breakMin(this)).also { root.addView(it) }

        val toggle = Button(this)
        fun refresh() { toggle.text = if (Prefs.enabled(this)) "Stop monitoring" else "Start monitoring" }
        toggle.setOnClickListener {
            val l = limit.text.toString().toIntOrNull()?.coerceAtLeast(1) ?: 20
            val k = brk.text.toString().toIntOrNull()?.coerceAtLeast(1) ?: 5
            Prefs.set(this, l, k)
            val on = !Prefs.enabled(this)
            Prefs.setEnabled(this, on)
            if (on) UsageService.start(this) else UsageService.stop(this)
            refresh()
        }
        refresh(); root.addView(toggle)

        root.addView(label("For a full-screen break prompt that appears over other apps, allow \"Display over other apps\"."))
        root.addView(Button(this).apply {
            text = "Grant overlay permission"
            setOnClickListener {
                startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
            }
        })
        setContentView(ScrollView(this).apply { addView(root) })
    }
}
