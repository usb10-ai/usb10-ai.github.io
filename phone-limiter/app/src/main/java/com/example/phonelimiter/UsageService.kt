package com.example.phonelimiter

import android.app.*
import android.content.*
import android.os.*
import android.provider.Settings
import android.os.PowerManager
import android.graphics.PixelFormat
import android.view.View
import android.view.WindowManager
import java.util.Calendar

class UsageService : Service() {
    private lateinit var tracker: SessionTracker
    private val handler = Handler(Looper.getMainLooper())
    private var ticks = 0
    private val detector by lazy { ForegroundDetector(this) }
    private var overlayIsRestriction = false
    private val tick = object : Runnable {
        override fun run() {
            check(); enforce(); if (++ticks % 10 == 0) updateStatus(); handler.postDelayed(this, 3_000L)
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
        startForeground(1, statusNotification("Watching your screen time"))
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_SNOOZE -> {
                tracker.snooze(now(), 5 * 60_000L)
                getSystemService(NotificationManager::class.java).cancel(2)
            }
            ACTION_TEST -> handler.postDelayed({
                nudge("Test prompt", "This is how a break reminder looks.", Prefs.limitMin(this), false)
            }, 5_000L)
        }
        return START_STICKY
    }

    private fun statusNotification(text: String) = Notification.Builder(this, "status")
        .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
        .setContentTitle("Phone Limiter").setContentText(text).setOnlyAlertOnce(true).build()

    /** Lets you see tracking working, e.g. while watching YouTube. */
    private fun updateStatus() {
        val mins = tracker.elapsedMs(now()) / 60_000L
        getSystemService(NotificationManager::class.java)
            .notify(1, statusNotification("Screen on for $mins min (reminder at ${Prefs.limitMin(this)})"))
    }

    private fun startTicking() { handler.removeCallbacks(tick); handler.postDelayed(tick, 3_000L) }

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
        if (Settings.canDrawOverlays(this)) showOverlay(night, mins)
    }

    private var overlay: View? = null

    private fun dismissOverlay() {
        overlay?.let { v -> runCatching { (getSystemService(WINDOW_SERVICE) as WindowManager).removeView(v) } }
        overlay = null; overlayIsRestriction = false
    }

    /** One-app restriction: when limited (or at night), cover every app except the allowed one. */
    private fun enforce() {
        val allowed = Prefs.allowedPkg(this)
        val hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
        val night = Prefs.nightOn(this) && SessionTracker.isNight(hour, Prefs.nightStart(this), Prefs.nightEnd(this))
        val restricted = allowed != null && (night || tracker.isLimited(now()))
        if (!restricted) { if (overlayIsRestriction) dismissOverlay(); return }
        if (overlay != null || !Settings.canDrawOverlays(this) || !Restriction.usageAccessGranted(this)) return
        val fg = detector.foreground() ?: return
        if (!Restriction.shouldBlock(fg, allowed!!, Restriction.homePackage(this), packageName)) return

        val wm = getSystemService(WINDOW_SERVICE) as WindowManager
        val label = Restriction.appLabel(this, allowed)
        val v = BreakView.buildRestricted(this, label, night,
            onOpenAllowed = {
                dismissOverlay()
                packageManager.getLaunchIntentForPackage(allowed)?.let { startActivity(it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
            },
            onHome = { dismissOverlay(); BreakActivity.goHome(this) },
            onSnooze = if (night) null else ({ dismissOverlay(); onStartCommand(Intent(ACTION_SNOOZE), 0, 0) }))
        val lp = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.OPAQUE)
        runCatching { wm.addView(v, lp); overlay = v; overlayIsRestriction = true }
    }

    /** Drawn straight on top of every app (YouTube included) — no activity launch needed. */
    private fun showOverlay(night: Boolean, mins: Int) {
        if (overlay != null) return
        val wm = getSystemService(WINDOW_SERVICE) as WindowManager
        fun dismiss() { overlay?.let { runCatching { wm.removeView(it) } }; overlay = null }
        val v = BreakView.build(this, night, mins,
            onStop = { dismiss(); BreakActivity.goHome(this) },
            onSnooze = { dismiss(); onStartCommand(Intent(ACTION_SNOOZE), 0, 0) })
        val lp = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.OPAQUE)
        runCatching { wm.addView(v, lp); overlay = v }
    }

    override fun onDestroy() {
        overlay?.let { runCatching { (getSystemService(WINDOW_SERVICE) as WindowManager).removeView(it) } }
        handler.removeCallbacks(tick); unregisterReceiver(screenReceiver); super.onDestroy()
    }

    override fun onBind(i: Intent?): IBinder? = null

    companion object {
        const val ACTION_SNOOZE = "com.example.phonelimiter.SNOOZE"
        const val ACTION_TEST = "com.example.phonelimiter.TEST"
        fun start(c: Context, action: String? = null) =
            c.startForegroundService(Intent(c, UsageService::class.java).setAction(action))
        fun stop(c: Context) = c.stopService(Intent(c, UsageService::class.java))
    }
}
