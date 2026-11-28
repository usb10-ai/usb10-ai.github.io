package com.example.phonelimiter

import android.content.Context
import android.widget.Toast
import java.time.LocalDate

/** Motivation badges. Once earned, a badge is kept forever. */
object Badges {
    data class Stats(val bestStreak: Int, val perfectDays: Int, val prioritiesDone: Int,
                     val breaksTaken: Int, val goodNights: Int)

    class Badge(val id: String, val emoji: String, val name: String, val goal: String,
                val progress: (Stats) -> Pair<Int, Int>) {
        fun earned(s: Stats) = progress(s).let { it.first >= it.second }
    }

    val ALL = listOf(
        Badge("first_habit", "🌱", "First Step", "Tick a daily habit") { it.bestStreak to 1 },
        Badge("streak3", "🔥", "On Fire", "3-day habit streak") { it.bestStreak to 3 },
        Badge("streak7", "⭐", "Week Warrior", "7-day habit streak") { it.bestStreak to 7 },
        Badge("streak21", "🏆", "Habit Formed", "21-day habit streak") { it.bestStreak to 21 },
        Badge("streak50", "💎", "Unbreakable", "50-day habit streak") { it.bestStreak to 50 },
        Badge("perfect1", "🌈", "Perfect Day", "All habits done in one day") { it.perfectDays to 1 },
        Badge("perfect7", "👑", "Perfect Week", "7 perfect days") { it.perfectDays to 7 },
        Badge("prio1", "✅", "Done!", "Finish a priority") { it.prioritiesDone to 1 },
        Badge("prio10", "🎯", "Focused", "Finish 10 priorities") { it.prioritiesDone to 10 },
        Badge("prio50", "🚀", "Achiever", "Finish 50 priorities") { it.prioritiesDone to 50 },
        Badge("break1", "🧘", "Took a Break", "Put the phone down when reminded") { it.breaksTaken to 1 },
        Badge("break10", "💪", "Self-Control", "Put the phone down 10 times") { it.breaksTaken to 10 },
        Badge("night5", "🌙", "Sleep Well", "Tap \"Good night\" 5 times") { it.goodNights to 5 },
    )

    /** Pure: badges whose goal is met but aren't in [earned] yet. */
    fun newlyEarned(s: Stats, earned: Set<String>) = ALL.filter { it.id !in earned && it.earned(s) }

    private fun sp(c: Context) = c.getSharedPreferences("badges", Context.MODE_PRIVATE)
    fun earnedIds(c: Context): Set<String> = sp(c).getStringSet("earned", emptySet()) ?: emptySet()

    fun stats(c: Context) = Stats(
        bestStreak = (0 until Habits.count(c)).maxOfOrNull { Habits.streak(c, it) } ?: 0,
        perfectDays = sp(c).getInt("perfectDays", 0),
        prioritiesDone = sp(c).getInt("prioritiesDone", 0),
        breaksTaken = sp(c).getInt("breaksTaken", 0),
        goodNights = sp(c).getInt("goodNights", 0))

    private fun bump(c: Context, key: String, by: Int) =
        sp(c).edit().putInt(key, (sp(c).getInt(key, 0) + by).coerceAtLeast(0)).apply()

    fun onPriorityToggled(c: Context, done: Boolean) { bump(c, "prioritiesDone", if (done) 1 else -1); check(c) }

    fun onHabitToggled(c: Context) {
        val today = LocalDate.now().toString()
        if (Habits.count(c) > 0 && Habits.pending(c).isEmpty() && sp(c).getString("lastPerfect", "") != today) {
            sp(c).edit().putString("lastPerfect", today).apply(); bump(c, "perfectDays", 1)
        }
        check(c)
    }

    fun recordBreak(c: Context, night: Boolean) { bump(c, if (night) "goodNights" else "breaksTaken", 1); check(c) }

    /** Saves newly earned badges and celebrates them. */
    fun check(c: Context) {
        val earned = earnedIds(c)
        val fresh = newlyEarned(stats(c), earned)
        if (fresh.isEmpty()) return
        sp(c).edit().putStringSet("earned", earned + fresh.map { it.id }).apply()
        fresh.forEach { Toast.makeText(c, "🏅 Badge unlocked: ${it.emoji} ${it.name}", Toast.LENGTH_LONG).show() }
    }
}
