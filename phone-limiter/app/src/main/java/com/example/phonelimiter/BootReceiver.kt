package com.example.phonelimiter

import android.content.*

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(c: Context, i: Intent) {
        if (Prefs.enabled(c)) UsageService.start(c)
    }
}
