package com.example.phonelimiter

import android.content.Context
import java.time.LocalDate

/** Daily screen-on time and reminder counts, kept on the phone. */
object ScreenTime {
    private fun sp(c: Context) = c.getSharedPreferences("usage", Context.MODE_PRIVATE)

    fun add(c: Context, ms: Long) {
        val k = "ms_${LocalDate.now()}"
        sp(c).edit().putLong(k, sp(c).getLong(k, 0L) + ms).apply()
    }
    fun msOn(c: Context, day: LocalDate) = sp(c).getLong("ms_$day", 0L)

    fun addReminder(c: Context) {
        val k = "rem_${LocalDate.now()}"
        sp(c).edit().putInt(k, sp(c).getInt(k, 0) + 1).apply()
    }
    fun reminders(c: Context, day: LocalDate) = sp(c).getInt("rem_$day", 0)

    /** e.g. 0m, 45m, 2h 5m */
    fun format(ms: Long): String {
        val m = ms / 60_000L
        return if (m < 60) "${m}m" else "${m / 60}h ${m % 60}m"
    }
}
