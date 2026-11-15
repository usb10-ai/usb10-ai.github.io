package com.example.phonelimiter

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.os.*
import android.view.Gravity
import android.widget.*

/** Full-screen break prompt. "Stop" is available after a short pause so it isn't a reflex tap. */
class BreakActivity : Activity() {
    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        setShowWhenLocked(true)
        val mins = intent.getIntExtra("minutes", 20)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#1B2A41")); setPadding(64, 64, 64, 64)
        }
        fun text(s: String, size: Float) = TextView(this).apply {
            this.text = s; textSize = size; setTextColor(Color.WHITE); gravity = Gravity.CENTER
        }
        root.addView(text("$mins minutes of non-stop phone.", 26f))
        root.addView(text("\nLook away. Stretch. Drink some water.\n", 18f))
        val stop = Button(this).apply { text = "Wait 10s…"; isEnabled = false }
        val more = Button(this).apply { text = "5 more minutes" }
        root.addView(stop); root.addView(more)
        setContentView(root)

        object : CountDownTimer(10_000, 1_000) {
            override fun onTick(ms: Long) { stop.text = "Wait ${ms / 1000 + 1}s…" }
            override fun onFinish() { stop.text = "OK, I'll put it down"; stop.isEnabled = true }
        }.start()
        stop.setOnClickListener {
            startActivity(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            finish()
        }
        more.setOnClickListener {
            startService(Intent(this, UsageService::class.java).setAction(UsageService.ACTION_SNOOZE))
            finish()
        }
    }
}
