# Phone Limiter (Android)

Nudges you after 20 minutes (configurable) of continuous phone use.

**How "continuous" works:** the clock runs while the screen is on. Brief lock/unlock
cycles don't reset it; the screen must stay off for the break length (default 5 min) to count as a real break.

**What happens at the limit:** high-priority notification + vibration, and — if you grant
"Display over other apps" — a full-screen break screen. "OK" is disabled for 10 s; "5 more minutes" snoozes.
If ignored, it re-nags every 5 minutes.

## Get the APK (no Android Studio needed)
Push to GitHub → Actions → "Build Phone Limiter APK" → download `phone-limiter-debug-apk`, copy to your phone and install.

## Build locally
`cd phone-limiter && gradle assembleDebug` (JDK 17, Android SDK 34).

## Notes
- Android 13+: allow notifications when prompted.
- Some vendors (Xiaomi, Samsung, OnePlus…) kill background apps: set battery to "Unrestricted" for this app.
- Only the screen-on/off state is read; nothing leaves your phone.
