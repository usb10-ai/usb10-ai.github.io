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
    const val MAX_TASKS = 10
    private fun rollover(c: Context) {
        if (sp(c).getString("tasksDate", "") != today()) {
            val e = sp(c).edit().putString("tasksDate", today()).remove("taskCount")
            for (i in 0 until MAX_TASKS) e.remove("task$i").remove("done$i")
            e.apply()
        }
    }
    fun taskCount(c: Context): Int { rollover(c); return sp(c).getInt("taskCount", 3).coerceIn(1, MAX_TASKS) }
    fun setTaskCount(c: Context, n: Int) { rollover(c); sp(c).edit().putInt("taskCount", n.coerceIn(1, MAX_TASKS)).apply() }
    fun taskText(c: Context, i: Int): String { rollover(c); return sp(c).getString("task$i", "") ?: "" }
    fun taskDone(c: Context, i: Int): Boolean { rollover(c); return sp(c).getBoolean("done$i", false) }
    fun setTask(c: Context, i: Int, text: String) { rollover(c); sp(c).edit().putString("task$i", text).apply() }
    fun setDone(c: Context, i: Int, done: Boolean) { rollover(c); sp(c).edit().putBoolean("done$i", done).apply() }

    /** Deletes row [i]; later rows move up. The list never drops below one row. */
    fun removeTask(c: Context, i: Int) {
        val n = taskCount(c)
        val e = sp(c).edit()
        for (j in i until n - 1) {
            e.putString("task$j", taskText(c, j + 1)).putBoolean("done$j", taskDone(c, j + 1))
        }
        e.remove("task${n - 1}").remove("done${n - 1}")
        if (n > 1) e.putInt("taskCount", n - 1)
        e.apply()
    }

    fun pendingTasks(c: Context): List<String> =
        (0 until taskCount(c)).filter { taskText(c, it).isNotBlank() && !taskDone(c, it) }.map { taskText(c, it).trim() }
}
