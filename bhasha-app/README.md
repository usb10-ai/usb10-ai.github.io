# Bhasha (Android)

Offline Android app for the Telugu & Odia course in `../bhasha/`.
The web app (`index.html`, `courses.js`) is copied into the APK's assets at build time,
so editing lessons in `bhasha/courses.js` and pushing produces an updated APK.

## Get the APK (no Android Studio needed)
Every push that touches `bhasha/` or `bhasha-app/` runs the "Build Bhasha APK" workflow,
which publishes `bhasha/Bhasha.apk` (linked from the Bhasha page). The APK is also attached
to each workflow run as the `bhasha-apk` artifact.

## Build locally
```
mkdir -p app/src/main/assets/www && cp ../bhasha/index.html ../bhasha/courses.js app/src/main/assets/www/
gradle assembleDebug        # JDK 17, Android SDK 34
```

## Notes
- Pronunciation uses the phone's text-to-speech engine (Android's WebView has no Web Speech API).
  Telugu voices come with Google's speech engine on most phones; if a language has no voice,
  the app hides listening drills and offers a "Get voice" button that opens Android's TTS settings.
- Back leaves a lesson or tab first, and exits only from the main screen.
- Follows the phone's light/dark mode.
- Signed with a fixed key (`app/debug.keystore`), so new versions install over old ones and keep progress.
  The version code is the workflow run number.
