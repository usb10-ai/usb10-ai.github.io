package com.example.phonelimiter

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.os.*
import android.view.Gravity
import android.widget.*

/** Full-screen prompt. Day: break reminder with snooze. Night: no snooze, just go to sleep. */
class BreakActivity : Activity() {
    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        setShowWhenLocked(true)
        val c = this
        val night = intent.getBooleanExtra("night", false)
        val mins = intent.getIntExtra("minutes", 20)
        val root = LinearLayout(c).apply {
            orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER
            setBackgroundColor(if (night) Color.parseColor("#070B14") else Ui.BG)
            setPadding(Ui.dp(c, 32), Ui.dp(c, 32), Ui.dp(c, 32), Ui.dp(c, 32))
        }
        fun centered(s: String, size: Float, color: Int = Color.WHITE, bold: Boolean = false) =
            Ui.text(c, s, size, color, bold).apply { gravity = Gravity.CENTER; setPadding(0, 0, 0, Ui.dp(c, 16)) }

        if (night) {
            root.addView(centered("🌙", 72f))
            root.addView(centered("It's night time", 30f, bold = true))
            root.addView(centered("Don't use your phone.\nPut it down and go to sleep.", 18f, Ui.MUTED))
        } else {
            root.addView(centered("⏸", 64f))
            root.addView(centered("$mins minutes non-stop", 28f, bold = true))
            root.addView(centered("Look away. Stretch. Drink some water.", 18f, Ui.MUTED))
        }

        val stop = Ui.button(c, "Wait 10s…").apply { isEnabled = false; alpha = 0.5f }
        root.addView(stop)
        if (!night) {
            root.addView(Ui.button(c, "5 more minutes", Color.parseColor("#263449")).apply {
                setOnClickListener {
                    startService(Intent(c, UsageService::class.java).setAction(UsageService.ACTION_SNOOZE))
                    finish()
                }
            })
        }
        setContentView(root)

        object : CountDownTimer(10_000, 1_000) {
            override fun onTick(ms: Long) { stop.text = "Wait ${ms / 1000 + 1}s…" }
            override fun onFinish() {
                stop.text = if (night) "Good night" else "OK, I'll put it down"
                stop.isEnabled = true; stop.alpha = 1f
            }
        }.start()
        stop.setOnClickListener {
            startActivity(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            finish()
        }
    }
}
