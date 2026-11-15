package com.example.phonelimiter

import android.content.Context

object Prefs {
    private fun sp(c: Context) = c.getSharedPreferences("limiter", Context.MODE_PRIVATE)
    fun limitMin(c: Context) = sp(c).getInt("limit", 20)
    fun breakMin(c: Context) = sp(c).getInt("break", 5)
    fun enabled(c: Context) = sp(c).getBoolean("enabled", false)
    fun set(c: Context, limit: Int, brk: Int) = sp(c).edit().putInt("limit", limit).putInt("break", brk).apply()
    fun setEnabled(c: Context, on: Boolean) = sp(c).edit().putBoolean("enabled", on).apply()
    fun nightOn(c: Context) = sp(c).getBoolean("nightOn", true)
    fun nightStart(c: Context) = sp(c).getInt("nightStart", 23)
    fun nightEnd(c: Context) = sp(c).getInt("nightEnd", 4)
    fun setNight(c: Context, on: Boolean, start: Int, end: Int) =
        sp(c).edit().putBoolean("nightOn", on).putInt("nightStart", start).putInt("nightEnd", end).apply()
}
