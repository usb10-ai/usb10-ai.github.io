package com.example.phonelimiter

import org.junit.Assert.*
import org.junit.Test

class BadgesTest {
    private fun s(streak: Int = 0, perfect: Int = 0, prio: Int = 0, breaks: Int = 0, nights: Int = 0) =
        Badges.Stats(streak, perfect, prio, breaks, nights)

    @Test fun nothingEarnedAtStart() = assertTrue(Badges.newlyEarned(s(), emptySet()).isEmpty())

    @Test fun streakUnlocksTiers() {
        val ids = Badges.newlyEarned(s(streak = 7), emptySet()).map { it.id }
        assertEquals(listOf("first_habit", "streak3", "streak7"), ids)
    }

    @Test fun alreadyEarnedNotRepeated() {
        val ids = Badges.newlyEarned(s(prio = 10), setOf("prio1")).map { it.id }
        assertEquals(listOf("prio10"), ids)
    }

    @Test fun eachBadgeIdUnique() = assertEquals(Badges.ALL.size, Badges.ALL.map { it.id }.toSet().size)
}
