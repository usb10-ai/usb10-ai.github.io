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

    fun onScreenOn(now: Long) {
        val off = screenOffAt
        if (sessionStart == null || (off != null && now - off >= breakMs)) {
            sessionStart = now; lastNudge = null; snoozeUntil = 0L
        }
        screenOffAt = null
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
}
