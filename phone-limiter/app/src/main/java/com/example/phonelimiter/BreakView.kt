package com.example.phonelimiter

import android.content.Context
import android.graphics.Color
import android.os.CountDownTimer
import android.view.Gravity
import android.view.View
import android.widget.*

/** The break / night prompt UI, shared by the on-top overlay and BreakActivity. */
object BreakView {
    /** Lists today's unfinished priorities so the prompt says what to do instead. */
    private fun addPriorities(root: LinearLayout, c: Context) {
        val pending = Prefs.pendingTasks(c)
        if (pending.isEmpty()) return
        root.addView(Ui.text(c, "Instead, do your priorities:", 14f, Ui.MUTED)
            .apply { gravity = Gravity.CENTER; setPadding(0, 0, 0, Ui.dp(c, 6)) })
        pending.forEach {
            root.addView(Ui.text(c, "• $it", 17f).apply { gravity = Gravity.CENTER; setPadding(0, 0, 0, Ui.dp(c, 4)) })
        }
        root.addView(android.view.View(c).apply { minimumHeight = Ui.dp(c, 12) })
    }

    fun build(c: Context, night: Boolean, mins: Int, onStop: () -> Unit, onSnooze: () -> Unit): View {
        val root = LinearLayout(c).apply {
            orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER
            setBackgroundColor(if (night) Color.parseColor("#070B14") else Ui.BG)
            setPadding(Ui.dp(c, 32), Ui.dp(c, 32), Ui.dp(c, 32), Ui.dp(c, 32))
            isClickable = true // swallow touches so the app underneath can't be used
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
        addPriorities(root, c)
        val stop = Ui.button(c, "Wait 10s…").apply { isEnabled = false; alpha = 0.5f }
        root.addView(stop)
        if (!night) {
            root.addView(Ui.button(c, "5 more minutes", Color.parseColor("#263449")).apply {
                setOnClickListener { onSnooze() }
            })
        }
        val timer = object : CountDownTimer(10_000, 1_000) {
            override fun onTick(ms: Long) { stop.text = "Wait ${ms / 1000 + 1}s…" }
            override fun onFinish() {
                stop.text = if (night) "Good night" else "OK, I'll put it down"
                stop.isEnabled = true; stop.alpha = 1f
            }
        }
        root.addOnAttachStateChangeListener(object : View.OnAttachStateChangeListener {
            override fun onViewAttachedToWindow(v: View) { timer.start() }
            override fun onViewDetachedFromWindow(v: View) { timer.cancel() }
        })
        stop.setOnClickListener { onStop() }
        return root
    }

    /** "Only <app> is allowed right now" prompt. */
    fun buildRestricted(c: Context, appLabel: String, night: Boolean,
                        onOpenAllowed: () -> Unit, onHome: () -> Unit, onSnooze: (() -> Unit)?): View {
        val root = LinearLayout(c).apply {
            orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER
            setBackgroundColor(if (night) Color.parseColor("#070B14") else Ui.BG)
            setPadding(Ui.dp(c, 32), Ui.dp(c, 32), Ui.dp(c, 32), Ui.dp(c, 32))
            isClickable = true
        }
        fun centered(s: String, size: Float, color: Int = Color.WHITE, bold: Boolean = false) =
            Ui.text(c, s, size, color, bold).apply { gravity = Gravity.CENTER; setPadding(0, 0, 0, Ui.dp(c, 16)) }
        root.addView(centered(if (night) "🌙" else "🔒", 64f))
        root.addView(centered("Only $appLabel is allowed", 26f, bold = true))
        root.addView(centered(if (night) "It's night time. Put the phone down." else "You've had your 20-minute limit. Take a break.", 17f, Ui.MUTED))
        addPriorities(root, c)
        root.addView(Ui.button(c, "Open $appLabel").apply { setOnClickListener { onOpenAllowed() } })
        root.addView(Ui.button(c, "Go to home screen", Color.parseColor("#263449")).apply { setOnClickListener { onHome() } })
        if (onSnooze != null) root.addView(Ui.button(c, "5 more minutes", Color.parseColor("#263449")).apply { setOnClickListener { onSnooze() } })
        return root
    }
}
