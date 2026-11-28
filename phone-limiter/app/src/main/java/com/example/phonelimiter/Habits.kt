package com.example.phonelimiter

import android.content.Context
import java.time.LocalDate

/**
 * Daily habits: names persist every day; only the tick resets daily.
 * Each habit keeps the dates it was done, which gives its streak.
 */
object Habits {
    const val MAX = 15
    private fun sp(c: Context) = c.getSharedPreferences("habits", Context.MODE_PRIVATE)
    private fun today() = LocalDate.now()

    fun count(c: Context) = sp(c).getInt("count", 0)
    fun name(c: Context, i: Int) = sp(c).getString("name$i", "") ?: ""
    fun setName(c: Context, i: Int, n: String) = sp(c).edit().putString("name$i", n).apply()
    private fun dates(c: Context, i: Int): Set<String> =
        (sp(c).getString("dates$i", "") ?: "").split(",").filter { it.isNotBlank() }.toSet()

    fun doneToday(c: Context, i: Int) = today().toString() in dates(c, i)
    fun streak(c: Context, i: Int) = streak(dates(c, i), today())

    fun setDoneToday(c: Context, i: Int, done: Boolean) {
        val d = dates(c, i).toMutableSet()
        if (done) d.add(today().toString()) else d.remove(today().toString())
        // keep about a year of history
        val kept = d.sorted().takeLast(400)
        sp(c).edit().putString("dates$i", kept.joinToString(",")).apply()
    }

    /** Habit names not yet ticked today. */
    fun pending(c: Context): List<String> =
        (0 until count(c)).filter { name(c, it).isNotBlank() && !doneToday(c, it) }.map { name(c, it).trim() }

    /** Snooze/re-prompt length: only 1 minute while any habit is still undone, else 5. */
    fun snoozeMs(c: Context): Long = if (pending(c).isNotEmpty()) 60_000L else 5 * 60_000L

    fun add(c: Context) { val n = count(c); if (n < MAX) sp(c).edit().putInt("count", n + 1).putString("name$n", "").remove("dates$n").apply() }

    fun remove(c: Context, i: Int) {
        val n = count(c); val e = sp(c).edit()
        for (j in i until n - 1) {
            e.putString("name$j", name(c, j + 1)).putString("dates$j", sp(c).getString("dates${j + 1}", ""))
        }
        e.remove("name${n - 1}").remove("dates${n - 1}").putInt("count", (n - 1).coerceAtLeast(0)).apply()
    }

    /** Consecutive days done, ending today (or yesterday if today isn't ticked yet). */
    fun streak(doneDates: Set<String>, today: LocalDate): Int {
        var day = if (today.toString() in doneDates) today else today.minusDays(1)
        var n = 0
        while (day.toString() in doneDates) { n++; day = day.minusDays(1) }
        return n
    }
}
