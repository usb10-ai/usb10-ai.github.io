package com.example.phonelimiter

import org.junit.Assert.*
import org.junit.Test

class SessionTrackerTest {
    private val min = 60_000L
    private fun tracker() = SessionTracker(limitMs = 20 * min, breakMs = 5 * min)

    @Test fun nudgesAfterTwentyMinutes() {
        val t = tracker(); t.onScreenOn(0)
        assertFalse(t.shouldNudge(19 * min))
        assertTrue(t.shouldNudge(20 * min))
    }

    @Test fun shortScreenOffDoesNotResetSession() {
        val t = tracker(); t.onScreenOn(0)
        t.onScreenOff(10 * min); t.onScreenOn(12 * min)
        assertTrue(t.shouldNudge(20 * min))
    }

    @Test fun realBreakResetsSession() {
        val t = tracker(); t.onScreenOn(0)
        t.onScreenOff(15 * min); t.onScreenOn(21 * min)
        assertFalse(t.shouldNudge(30 * min))
        assertTrue(t.shouldNudge(41 * min))
    }

    @Test fun nagsRepeatAndSnoozeWorks() {
        val t = tracker(); t.onScreenOn(0)
        assertTrue(t.shouldNudge(20 * min))
        assertFalse(t.shouldNudge(22 * min))
        assertTrue(t.shouldNudge(25 * min))
        t.snooze(25 * min, 10 * min)
        assertFalse(t.shouldNudge(34 * min))
        assertTrue(t.shouldNudge(36 * min))
    }
}
