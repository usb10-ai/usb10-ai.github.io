package com.example.phonelimiter

import android.app.Activity
import android.content.Intent
import android.os.Bundle

/** Fallback prompt (opened from the notification) when overlay permission isn't granted. */
class BreakActivity : Activity() {
    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        setShowWhenLocked(true)
        setContentView(BreakView.build(this,
            night = intent.getBooleanExtra("night", false),
            mins = intent.getIntExtra("minutes", 20),
            onStop = { goHome(this); finish() },
            onSnooze = {
                startService(Intent(this, UsageService::class.java).setAction(UsageService.ACTION_SNOOZE))
                finish()
            }))
    }

    companion object {
        fun goHome(c: android.content.Context) = c.startActivity(
            Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}
