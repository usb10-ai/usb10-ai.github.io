package com.example.phonelimiter

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Process

/** Pure rule: should [foreground] be covered while only [allowed] is permitted? */
object Restriction {
    private val ALWAYS_OK = setOf(
        "com.android.systemui", "com.android.dialer", "com.google.android.dialer",
        "com.samsung.android.dialer", "com.samsung.android.incallui", "com.android.emergency")

    fun shouldBlock(foreground: String, allowed: String, home: String?, own: String): Boolean =
        foreground != allowed && foreground != own && foreground != home && foreground !in ALWAYS_OK

    fun homePackage(c: Context): String? = c.packageManager.resolveActivity(
        Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME), PackageManager.MATCH_DEFAULT_ONLY
    )?.activityInfo?.packageName

    fun usageAccessGranted(c: Context): Boolean {
        val ops = c.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        @Suppress("DEPRECATION")
        val mode = ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), c.packageName)
        return mode == AppOpsManager.MODE_ALLOWED
    }

    fun appLabel(c: Context, pkg: String): String = try {
        c.packageManager.getApplicationLabel(c.packageManager.getApplicationInfo(pkg, 0)).toString()
    } catch (e: Exception) { pkg }
}

/** Finds the foreground app by reading app-resumed events (needs Usage access). */
class ForegroundDetector(private val c: Context) {
    private val usm = c.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
    private var current: String? = null
    private var lastQuery = 0L

    fun foreground(now: Long = System.currentTimeMillis()): String? {
        val from = if (lastQuery == 0L) now - 10 * 60_000L else lastQuery - 1_000L
        lastQuery = now
        val events = usm.queryEvents(from, now)
        val e = UsageEvents.Event()
        while (events.hasNextEvent()) {
            events.getNextEvent(e)
            @Suppress("DEPRECATION")
            if (e.eventType == UsageEvents.Event.MOVE_TO_FOREGROUND) current = e.packageName
        }
        return current
    }
}
