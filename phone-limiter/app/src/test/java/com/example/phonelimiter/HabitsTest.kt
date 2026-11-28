package com.example.phonelimiter

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.LocalDate

class HabitsTest {
    private val today = LocalDate.of(2026, 11, 28)
    private fun d(n: Long) = today.minusDays(n).toString()

    @Test fun noHistoryIsZero() = assertEquals(0, Habits.streak(emptySet(), today))
    @Test fun countsBackFromToday() = assertEquals(3, Habits.streak(setOf(d(0), d(1), d(2), d(4)), today))
    @Test fun notYetDoneTodayKeepsYesterdaysStreak() = assertEquals(2, Habits.streak(setOf(d(1), d(2)), today))
    @Test fun gapBreaksStreak() = assertEquals(0, Habits.streak(setOf(d(2), d(3)), today))
}

class ScreenTimeFormatTest {
    @Test fun formats() {
        assertEquals("0m", ScreenTime.format(0))
        assertEquals("45m", ScreenTime.format(45 * 60_000L))
        assertEquals("2h 5m", ScreenTime.format(125 * 60_000L))
    }
}

class ScreenTimeEventsTest {
    private val min = 60_000L
    private fun ev(t: Int, p: String, m: Long) = ScreenTime.Ev(t, p, m * min)
    private val none = emptySet<String>()

    @Test fun sumsAppSessions() {
        val evs = listOf(ev(1, "yt", 10), ev(2, "yt", 40), ev(1, "wa", 50), ev(2, "wa", 55))
        assertEquals(35 * min, ScreenTime.foregroundMs(evs, 0, 100 * min, none))
    }

    @Test fun screenOffEndsSession() {
        val evs = listOf(ev(1, "yt", 10), ev(16, "", 20), ev(2, "yt", 60))
        assertEquals(10 * min, ScreenTime.foregroundMs(evs, 0, 100 * min, none))
    }

    @Test fun excludesHomeScreen() {
        val evs = listOf(ev(1, "home", 0), ev(1, "yt", 30), ev(2, "yt", 45))
        assertEquals(15 * min, ScreenTime.foregroundMs(evs, 0, 100 * min, setOf("home")))
    }

    @Test fun openAppCountsUntilNow() {
        val evs = listOf(ev(1, "yt", 90))
        assertEquals(10 * min, ScreenTime.foregroundMs(evs, 0, 100 * min, none))
    }
}
