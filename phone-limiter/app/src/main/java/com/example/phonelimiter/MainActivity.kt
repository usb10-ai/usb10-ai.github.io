package com.example.phonelimiter

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.Paint
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.view.ViewGroup
import android.widget.*

class MainActivity : Activity() {
    private var refreshAllowedHook: (() -> Unit)? = null
    override fun onResume() { super.onResume(); refreshAllowedHook?.invoke() }

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

        // Today's priorities: add as many as needed; ticked ones are struck out
        val prio = Ui.card(c)
        prio.addView(Ui.text(c, "Today's priorities", 18f, bold = true))
        prio.addView(Ui.text(c, "Shown on the break screen. Resets every day.", 14f, Ui.MUTED))
        val list = LinearLayout(c).apply { orientation = LinearLayout.VERTICAL }
        prio.addView(list)
        fun strike(field: EditText, done: Boolean) {
            field.paintFlags = if (done) field.paintFlags or Paint.STRIKE_THRU_TEXT_FLAG
                               else field.paintFlags and Paint.STRIKE_THRU_TEXT_FLAG.inv()
            field.setTextColor(if (done) Ui.MUTED else Color.WHITE)
        }
        lateinit var refreshTasks: () -> Unit
        refreshTasks = {
            list.removeAllViews()
            for (i in 0 until Prefs.taskCount(c)) {
                val field = EditText(c).apply {
                    hint = "Priority ${i + 1}"; setText(Prefs.taskText(c, i)); textSize = 16f
                    setHintTextColor(Ui.MUTED); setSingleLine(true); background = null
                    addTextChangedListener(object : android.text.TextWatcher {
                        override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c2: Int) {}
                        override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c2: Int) {}
                        override fun afterTextChanged(s: android.text.Editable?) { Prefs.setTask(c, i, s.toString()) }
                    })
                }
                val box = CheckBox(c).apply {
                    isChecked = Prefs.taskDone(c, i)
                    setOnCheckedChangeListener { _, v -> Prefs.setDone(c, i, v); strike(field, v) }
                }
                strike(field, box.isChecked)
                val del = TextView(c).apply {
                    text = "✕"; textSize = 18f; setTextColor(Ui.MUTED)
                    setPadding(Ui.dp(c, 12), Ui.dp(c, 8), Ui.dp(c, 4), Ui.dp(c, 8))
                    setOnClickListener { Prefs.removeTask(c, i); refreshTasks() }
                }
                list.addView(LinearLayout(c).apply {
                    gravity = android.view.Gravity.CENTER_VERTICAL
                    addView(box)
                    addView(field, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
                    addView(del)
                })
            }
        }
        refreshTasks()
        prio.addView(Ui.button(c, "+ Add priority", Color.parseColor("#263449")).apply {
            setOnClickListener {
                if (Prefs.taskCount(c) < Prefs.MAX_TASKS) { Prefs.setTaskCount(c, Prefs.taskCount(c) + 1); refreshTasks() }
                else Toast.makeText(c, "Maximum ${Prefs.MAX_TASKS} priorities", Toast.LENGTH_SHORT).show()
            }
        })
        root.addView(prio)

        // Daily habits: kept every day, ticks reset daily, streak shown
        val habitCard = Ui.card(c)
        habitCard.addView(Ui.text(c, "Daily habits", 18f, bold = true))
        habitCard.addView(Ui.text(c, "Repeat every day. Ticks reset each morning; 🔥 is your streak.", 14f, Ui.MUTED))
        val habitList = LinearLayout(c).apply { orientation = LinearLayout.VERTICAL }
        habitCard.addView(habitList)
        lateinit var refreshHabits: () -> Unit
        refreshHabits = {
            habitList.removeAllViews()
            if (Habits.count(c) == 0)
                habitList.addView(Ui.text(c, "No habits yet. e.g. Walk 30 min, Read 10 pages, Drink water", 14f, Ui.MUTED)
                    .apply { setPadding(0, Ui.dp(c, 10), 0, 0) })
            for (i in 0 until Habits.count(c)) {
                val streak = Ui.text(c, "", 15f, Color.parseColor("#FFB347"))
                fun showStreak() { val n = Habits.streak(c, i); streak.text = if (n > 0) "🔥 $n" else "" }
                val field = EditText(c).apply {
                    hint = "Habit ${i + 1}"; setText(Habits.name(c, i)); textSize = 16f
                    setHintTextColor(Ui.MUTED); setSingleLine(true); background = null
                    addTextChangedListener(object : android.text.TextWatcher {
                        override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c2: Int) {}
                        override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c2: Int) {}
                        override fun afterTextChanged(s: android.text.Editable?) { Habits.setName(c, i, s.toString()) }
                    })
                }
                val box = CheckBox(c).apply {
                    isChecked = Habits.doneToday(c, i)
                    setOnCheckedChangeListener { _, v -> Habits.setDoneToday(c, i, v); strike(field, v); showStreak() }
                }
                strike(field, box.isChecked); showStreak()
                val del = TextView(c).apply {
                    text = "✕"; textSize = 18f; setTextColor(Ui.MUTED)
                    setPadding(Ui.dp(c, 12), Ui.dp(c, 8), Ui.dp(c, 4), Ui.dp(c, 8))
                    setOnClickListener {
                        android.app.AlertDialog.Builder(c).setMessage("Delete this habit and its streak?")
                            .setPositiveButton("Delete") { _, _ -> Habits.remove(c, i); refreshHabits() }
                            .setNegativeButton("Cancel", null).show()
                    }
                }
                habitList.addView(LinearLayout(c).apply {
                    gravity = android.view.Gravity.CENTER_VERTICAL
                    addView(box)
                    addView(field, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
                    addView(streak); addView(del)
                })
            }
        }
        refreshHabits()
        habitCard.addView(Ui.button(c, "+ Add habit", Color.parseColor("#263449")).apply {
            setOnClickListener {
                if (Habits.count(c) < Habits.MAX) { Habits.add(c); refreshHabits() }
                else Toast.makeText(c, "Maximum ${Habits.MAX} habits", Toast.LENGTH_SHORT).show()
            }
        })
        root.addView(habitCard)

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

        // One allowed app
        val allowedText = Ui.text(c, "", 15f, Ui.MUTED).apply { setPadding(0, Ui.dp(c, 10), 0, 0) }
        val usageBtn = Ui.button(c, "Grant usage access (needed)", Color.parseColor("#7A4B12"))
        val removeBtn = Ui.button(c, "Remove restriction", Color.parseColor("#5A2A36"))
        fun refreshAllowed() {
            val p = Prefs.allowedPkg(c)
            allowedText.text = if (p == null) "No restriction is set." else "Allowed app: ${Restriction.appLabel(c, p)}"
            removeBtn.visibility = if (p == null) android.view.View.GONE else android.view.View.VISIBLE
            usageBtn.visibility = if (p != null && !Restriction.usageAccessGranted(c)) android.view.View.VISIBLE else android.view.View.GONE
        }
        refreshAllowedHook = { refreshAllowed(); refreshTasks(); refreshHabits() }
        usageBtn.setOnClickListener { startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)) }
        removeBtn.setOnClickListener { Prefs.setAllowedPkg(c, null); refreshAllowed() }
        root.addView(Ui.card(c).apply {
            addView(Ui.text(c, "Allow only one app", 18f, bold = true))
            addView(Ui.text(c, "When your break reminder is due, or at night, every app except the one you choose is blocked. Only one app can be allowed.", 14f, Ui.MUTED))
            addView(allowedText)
            addView(Ui.button(c, "Choose the allowed app").apply {
                setOnClickListener {
                    val pm = packageManager
                    val apps = pm.queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER), 0)
                        .map { it.activityInfo.packageName }.distinct().filter { it != packageName }
                        .map { it to Restriction.appLabel(c, it) }.sortedBy { it.second.lowercase() }
                    android.app.AlertDialog.Builder(c).setTitle("Choose the one allowed app")
                        .setItems(apps.map { it.second }.toTypedArray()) { _, i ->
                            Prefs.setAllowedPkg(c, apps[i].first); refreshAllowed()
                            if (!Restriction.usageAccessGranted(c)) startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
                        }.show()
                }
            })
            addView(usageBtn); addView(removeBtn)
        })
        refreshAllowed()

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
