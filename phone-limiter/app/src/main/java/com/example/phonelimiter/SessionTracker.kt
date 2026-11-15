package com.example.phonelimiter

/**
 * Pure logic (no Android deps) for "continuous use". Time is injected so it is unit-testable.
 * Use is continuous until the screen stays off for at least [breakMs] — a real break.
 */
class SessionTracker(var limitMs: Long, var breakMs: Long, var nagIntervalMs: Long = 5 * 60_000L) {
    private var sessionStart: Long? = null
    private var screenOffAt: Long? = null
    private var lastNudge: Long? = null
    private var snoozeUntil = 0L
    private var lastNightNudge: Long? = null
    var nightNagMs = 3 * 60_000L

    fun onScreenOn(now: Long) {
        val off = screenOffAt
        if (sessionStart == null || (off != null && now - off >= breakMs)) {
            sessionStart = now; lastNudge = null; snoozeUntil = 0L
        }
        screenOffAt = null
        lastNightNudge = null // at night, every unlock gets a prompt
    }

    fun onScreenOff(now: Long) { if (screenOffAt == null) screenOffAt = now }

    fun elapsedMs(now: Long): Long =
        if (screenOffAt != null) 0L else sessionStart?.let { now - it } ?: 0L

    fun snooze(now: Long, ms: Long) { snoozeUntil = now + ms; lastNudge = now }

    /** True when the user should be nudged right now; records the nudge. */
    fun shouldNudge(now: Long): Boolean {
        if (screenOffAt != null || elapsedMs(now) < limitMs || now < snoozeUntil) return false
        val last = lastNudge
        if (last != null && now - last < nagIntervalMs) return false
        lastNudge = now
        return true
    }

    /** Night rule: screen on during the night window => nudge now, then every [nightNagMs]. */
    fun shouldNightNudge(now: Long, hour: Int, startH: Int, endH: Int): Boolean {
        if (screenOffAt != null || !isNight(hour, startH, endH)) return false
        val last = lastNightNudge
        if (last != null && now - last < nightNagMs) return false
        lastNightNudge = now
        return true
    }

    companion object {
        /** Window may wrap midnight, e.g. 23 to 4 covers 23:00-03:59. */
        fun isNight(hour: Int, startH: Int, endH: Int) =
            if (startH <= endH) hour in startH until endH else hour >= startH || hour < endH
    }
}
