package com.example.phonelimiter

import android.content.Context

object Prefs {
    private fun sp(c: Context) = c.getSharedPreferences("limiter", Context.MODE_PRIVATE)
    fun limitMin(c: Context) = sp(c).getInt("limit", 20)
    fun breakMin(c: Context) = sp(c).getInt("break", 5)
    fun enabled(c: Context) = sp(c).getBoolean("enabled", false)
    fun set(c: Context, limit: Int, brk: Int) = sp(c).edit().putInt("limit", limit).putInt("break", brk).apply()
    fun setEnabled(c: Context, on: Boolean) = sp(c).edit().putBoolean("enabled", on).apply()
    fun nightOn(c: Context) = sp(c).getBoolean("nightOn", true)
    fun nightStart(c: Context) = sp(c).getInt("nightStart", 23)
    fun nightEnd(c: Context) = sp(c).getInt("nightEnd", 4)
    fun setNight(c: Context, on: Boolean, start: Int, end: Int) =
        sp(c).edit().putBoolean("nightOn", on).putInt("nightStart", start).putInt("nightEnd", end).apply()
    fun allowedPkg(c: Context): String? = sp(c).getString("allowedPkg", null)
    fun setAllowedPkg(c: Context, pkg: String?) = sp(c).edit().putString("allowedPkg", pkg).apply()

    // ---- Today's 3 priorities (reset automatically each new day) ----
    private fun today() = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(java.util.Date())
    private fun rollover(c: Context) {
        if (sp(c).getString("tasksDate", "") != today()) {
            val e = sp(c).edit().putString("tasksDate", today())
            for (i in 0..2) e.remove("task$i").remove("done$i")
            e.apply()
        }
    }
    fun taskText(c: Context, i: Int): String { rollover(c); return sp(c).getString("task$i", "") ?: "" }
    fun taskDone(c: Context, i: Int): Boolean { rollover(c); return sp(c).getBoolean("done$i", false) }
    fun setTask(c: Context, i: Int, text: String) { rollover(c); sp(c).edit().putString("task$i", text).apply() }
    fun setDone(c: Context, i: Int, done: Boolean) { rollover(c); sp(c).edit().putBoolean("done$i", done).apply() }
    fun pendingTasks(c: Context): List<String> =
        (0..2).filter { taskText(c, it).isNotBlank() && !taskDone(c, it) }.map { taskText(c, it).trim() }
}
