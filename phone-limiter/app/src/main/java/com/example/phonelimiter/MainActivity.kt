package com.example.phonelimiter

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.view.ViewGroup
import android.widget.*

class MainActivity : Activity() {
    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 0)
        val c = this
        val root = LinearLayout(c).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Ui.BG)
            setPadding(Ui.dp(c, 20), Ui.dp(c, 48), Ui.dp(c, 20), Ui.dp(c, 32))
        }
        root.addView(Ui.text(c, "Phone Limiter", 30f, bold = true))
        root.addView(Ui.text(c, "Take breaks. Sleep at night.", 15f, Ui.MUTED))

        // Status + start/stop
        val status = Ui.text(c, "", 18f, bold = true)
        val toggle = Ui.button(c, "")
        val hero = Ui.card(c).apply { addView(status); addView(toggle) }
        root.addView(hero)

        // Break reminder settings
        val limit = Ui.number(c, Prefs.limitMin(c))
        val brk = Ui.number(c, Prefs.breakMin(c))
        root.addView(Ui.card(c).apply {
            addView(Ui.text(c, "Break reminder", 18f, bold = true))
            addView(Ui.row(c, "Remind after (minutes of use)", limit))
            addView(Ui.row(c, "Screen-off minutes = real break", brk))
        })

        // Night mode settings
        val nightOn = Switch(c).apply { isChecked = Prefs.nightOn(c); setTextColor(Color.WHITE) }
        val ns = Ui.number(c, Prefs.nightStart(c)); val ne = Ui.number(c, Prefs.nightEnd(c))
        root.addView(Ui.card(c).apply {
            addView(Ui.text(c, "Night mode", 18f, bold = true))
            addView(Ui.text(c, "Tells you not to use the phone at night.", 14f, Ui.MUTED))
            addView(LinearLayout(c).apply {
                gravity = android.view.Gravity.CENTER_VERTICAL
                addView(Ui.text(c, "Enabled", 15f).apply { layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f) })
                addView(nightOn)
            })
            addView(Ui.row(c, "Starts at (hour, 0-23)", ns))
            addView(Ui.row(c, "Ends at (hour, 0-23)", ne))
        })

        // Overlay permission
        root.addView(Ui.card(c).apply {
            addView(Ui.text(c, "Full-screen prompt", 18f, bold = true))
            addView(Ui.text(c, "Allow \"Display over other apps\" so the break screen appears on top of whatever you're using.", 14f, Ui.MUTED))
            addView(Ui.button(c, "Grant overlay permission", Color.parseColor("#263449")).apply {
                setOnClickListener {
                    startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
                }
            })
        })

        root.addView(Ui.button(c, "Test the prompt (in 5 seconds)", Color.parseColor("#263449")).apply {
            setOnClickListener {
                // Switch to YouTube (or any app) now to check the prompt shows on top of it.
                UsageService.start(c, UsageService.ACTION_TEST)
                Toast.makeText(c, "Open YouTube now. The prompt appears in 5 seconds.", Toast.LENGTH_LONG).show()
            }
        })

        fun save() {
            Prefs.set(c, limit.text.toString().toIntOrNull()?.coerceAtLeast(1) ?: 20,
                brk.text.toString().toIntOrNull()?.coerceAtLeast(1) ?: 5)
            Prefs.setNight(c, nightOn.isChecked,
                (ns.text.toString().toIntOrNull() ?: 23).coerceIn(0, 23),
                (ne.text.toString().toIntOrNull() ?: 4).coerceIn(0, 23))
        }
        fun refresh() {
            val on = Prefs.enabled(c)
            status.text = if (on) "● Monitoring is ON" else "○ Monitoring is OFF"
            status.setTextColor(if (on) Color.parseColor("#4CD98A") else Ui.MUTED)
            toggle.text = if (on) "Stop monitoring" else "Start monitoring"
        }
        toggle.setOnClickListener {
            save()
            val on = !Prefs.enabled(c)
            Prefs.setEnabled(c, on)
            if (on) UsageService.start(c) else UsageService.stop(c)
            refresh()
        }
        // Restart the service so changed settings take effect while running.
        root.addView(Ui.button(c, "Save settings", Color.parseColor("#263449")).apply {
            setOnClickListener {
                save()
                if (Prefs.enabled(c)) { UsageService.stop(c); UsageService.start(c) }
                Toast.makeText(c, "Saved", Toast.LENGTH_SHORT).show()
            }
        })
        refresh()
        setContentView(ScrollView(c).apply { setBackgroundColor(Ui.BG); addView(root) })
    }
}
