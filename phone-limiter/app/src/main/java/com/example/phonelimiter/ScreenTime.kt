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

    data class Ev(val type: Int, val pkg: String, val time: Long, val cls: String = "")
    private const val RESUMED = 1; private const val PAUSED = 2; private const val STOPPED = 23
    private const val SCREEN_OFF = 16

    /**
     * Pure: visible time per app between [start] and [end] (like Digital Wellbeing).
     * An app counts from when one of its screens appears until all of them are hidden
     * (STOPPED on Android 10+, PAUSED on older phones) or the screen turns off.
     * Several apps can be visible at once (split screen, picture-in-picture).
     */
    fun perAppMs(events: List<Ev>, start: Long, end: Long): Map<String, Long> {
        val useStopped = events.any { it.type == STOPPED }
        val closeType = if (useStopped) STOPPED else PAUSED
        val open = HashMap<String, MutableSet<String>>()   // pkg -> visible activities
        val since = HashMap<String, Long>()
        val total = HashMap<String, Long>()
        fun addTime(pkg: String, t: Long) {
            val from = maxOf(since[pkg] ?: t, start); val to = minOf(t, end)
            if (to > from) total[pkg] = (total[pkg] ?: 0L) + (to - from)
        }
        fun closeAll(t: Long) { open.keys.toList().forEach { addTime(it, t) }; open.clear(); since.clear() }
        for (e in events.sortedBy { it.time }) when (e.type) {
            RESUMED -> {
                val acts = open.getOrPut(e.pkg) { mutableSetOf() }
                if (acts.isEmpty()) since[e.pkg] = e.time
                acts.add(e.cls)
            }
            closeType -> open[e.pkg]?.let { acts ->
                if (acts.remove(e.cls) && acts.isEmpty()) { addTime(e.pkg, e.time); open.remove(e.pkg); since.remove(e.pkg) }
            }
            SCREEN_OFF -> closeAll(e.time)
        }
        closeAll(end)
        return total
    }

    fun foregroundMs(events: List<Ev>, start: Long, end: Long, excluded: Set<String>): Long =
        perAppMs(events, start, end).filterKeys { it !in excluded }.values.sum()

    private fun excluded(c: Context) = setOfNotNull(c.packageName, Restriction.homePackage(c), "com.android.systemui")

    /** Per-app visible time for [day] from Android's usage history, or null without Usage access. */
    fun systemPerApp(c: Context, day: LocalDate): Map<String, Long>? {
        if (!Restriction.usageAccessGranted(c)) return null
        val zone = ZoneId.systemDefault()
        val start = day.atStartOfDay(zone).toInstant().toEpochMilli()
        val end = minOf(day.plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli(), System.currentTimeMillis())
        if (end <= start) return emptyMap()
        val usm = c.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        // Start 3h early so an app already open at midnight is counted from midnight.
        val it = usm.queryEvents(start - 3 * 3_600_000L, end)
        val e = UsageEvents.Event(); val list = ArrayList<Ev>()
        while (it.hasNextEvent()) {
            it.getNextEvent(e)
            if (e.eventType == RESUMED || e.eventType == PAUSED || e.eventType == STOPPED || e.eventType == SCREEN_OFF)
                list.add(Ev(e.eventType, e.packageName ?: "", e.timeStamp, e.className ?: ""))
        }
        val ex = excluded(c)
        return perAppMs(list, start, end).filterKeys { it !in ex }
    }

    fun systemMs(c: Context, day: LocalDate): Long? = systemPerApp(c, day)?.values?.sum()

    /** Best available figure: Android's history if allowed, else our own counter. */
    fun msFor(c: Context, day: LocalDate): Long = systemMs(c, day) ?: msOn(c, day)
}
