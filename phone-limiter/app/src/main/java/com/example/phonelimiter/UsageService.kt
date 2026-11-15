package com.example.phonelimiter

import android.app.*
import android.content.*
import android.os.*
import android.provider.Settings
import android.os.PowerManager
import java.util.Calendar

class UsageService : Service() {
    private lateinit var tracker: SessionTracker
    private val handler = Handler(Looper.getMainLooper())
    private val tick = object : Runnable {
        override fun run() {
            check(); handler.postDelayed(this, 30_000L)
        }
    }

    private val screenReceiver = object : BroadcastReceiver() {
        override fun onReceive(c: Context, i: Intent) {
            when (i.action) {
                Intent.ACTION_SCREEN_ON -> { tracker.onScreenOn(now()); startTicking(); handler.postDelayed({ check() }, 1_500L) }
                Intent.ACTION_SCREEN_OFF -> { tracker.onScreenOff(now()); handler.removeCallbacks(tick) }
            }
        }
    }

    private fun now() = SystemClock.elapsedRealtime()

    override fun onCreate() {
        super.onCreate()
        tracker = SessionTracker(Prefs.limitMin(this) * 60_000L, Prefs.breakMin(this) * 60_000L)
        val pm = getSystemService(POWER_SERVICE) as PowerManager
        if (pm.isInteractive) { tracker.onScreenOn(now()); startTicking() }
        registerReceiver(screenReceiver, IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_ON); addAction(Intent.ACTION_SCREEN_OFF)
        })
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel("status", "Monitoring", NotificationManager.IMPORTANCE_MIN))
        nm.createNotificationChannel(NotificationChannel("nudge", "Break reminders", NotificationManager.IMPORTANCE_HIGH))
        startForeground(1, Notification.Builder(this, "status")
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle("Phone Limiter is watching your screen time").build())
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_SNOOZE) {
            tracker.snooze(now(), 5 * 60_000L)
            getSystemService(NotificationManager::class.java).cancel(2)
        }
        return START_STICKY
    }

    private fun startTicking() { handler.removeCallbacks(tick); handler.postDelayed(tick, 30_000L) }

    private fun check() {
        val hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
        if (Prefs.nightOn(this) &&
            tracker.shouldNightNudge(now(), hour, Prefs.nightStart(this), Prefs.nightEnd(this))) {
            nudge("It's night time", "Don't use your phone. Go to sleep.", 0, true)
        } else if (tracker.shouldNudge(now())) {
            val mins = (tracker.elapsedMs(now()) / 60_000L).toInt()
            nudge("$mins minutes on your phone", "Put it down and take a break.", mins, false)
        }
    }

    private fun nudge(title: String, text: String, mins: Int, night: Boolean) {
        val breakIntent = Intent(this, BreakActivity::class.java)
            .putExtra("minutes", mins).putExtra("night", night).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        val pi = PendingIntent.getActivity(this, 0, breakIntent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val n = Notification.Builder(this, "nudge")
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle(title).setContentText(text)
            .setContentIntent(pi).setFullScreenIntent(pi, true).setAutoCancel(true).build()
        getSystemService(NotificationManager::class.java).notify(2, n)
        (getSystemService(VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
            .vibrate(VibrationEffect.createWaveform(longArrayOf(0, 300, 150, 300), -1))
        // With the overlay permission Android lets us open the break screen directly.
        if (Settings.canDrawOverlays(this)) startActivity(breakIntent)
    }

    override fun onDestroy() {
        handler.removeCallbacks(tick); unregisterReceiver(screenReceiver); super.onDestroy()
    }

    override fun onBind(i: Intent?): IBinder? = null

    companion object {
        const val ACTION_SNOOZE = "com.example.phonelimiter.SNOOZE"
        fun start(c: Context) = c.startForegroundService(Intent(c, UsageService::class.java))
        fun stop(c: Context) = c.stopService(Intent(c, UsageService::class.java))
    }
}
