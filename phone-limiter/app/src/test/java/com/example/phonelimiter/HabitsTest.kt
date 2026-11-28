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
