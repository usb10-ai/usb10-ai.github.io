package com.example.phonelimiter

import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import java.time.LocalDate
import java.time.ZoneId

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

    data class Ev(val type: Int, val pkg: String, val time: Long)
    private const val RESUMED = 1; private const val PAUSED = 2; private const val STOPPED = 23
    private const val SCREEN_OFF = 16

    /**
     * Pure: time spent in apps between [start] and [end], from app resume/pause events
     * (the same idea as Digital Wellbeing). Apps in [excluded] (home screen etc.) don't count.
     */
    fun foregroundMs(events: List<Ev>, start: Long, end: Long, excluded: Set<String>): Long {
        var cur: String? = null; var since = start; var total = 0L
        fun close(t: Long) {
            val p = cur
            if (p != null && p !in excluded) total += (minOf(t, end) - maxOf(since, start)).coerceAtLeast(0L)
            cur = null
        }
        for (e in events.sortedBy { it.time }) when (e.type) {
            RESUMED -> { close(e.time); cur = e.pkg; since = e.time }
            PAUSED, STOPPED -> if (e.pkg == cur) close(e.time)
            SCREEN_OFF -> close(e.time)
        }
        close(end)
        return total
    }

    /** Screen time for [day] from Android's usage history, or null without Usage access. */
    fun systemMs(c: Context, day: LocalDate): Long? {
        if (!Restriction.usageAccessGranted(c)) return null
        val zone = ZoneId.systemDefault()
        val start = day.atStartOfDay(zone).toInstant().toEpochMilli()
        val end = minOf(day.plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli(), System.currentTimeMillis())
        if (end <= start) return 0L
        val usm = c.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val it = usm.queryEvents(start, end)
        val e = UsageEvents.Event(); val list = ArrayList<Ev>()
        while (it.hasNextEvent()) {
            it.getNextEvent(e)
            if (e.eventType in setOf(RESUMED, PAUSED, STOPPED, SCREEN_OFF)) list.add(Ev(e.eventType, e.packageName ?: "", e.timeStamp))
        }
        val excluded = setOfNotNull(c.packageName, Restriction.homePackage(c), "com.android.systemui")
        return foregroundMs(list, start, end, excluded)
    }

    /** Best available figure: Android's history if allowed, else our own counter. */
    fun msFor(c: Context, day: LocalDate): Long = systemMs(c, day) ?: msOn(c, day)
}
