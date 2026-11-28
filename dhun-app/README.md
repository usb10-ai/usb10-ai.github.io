# Dhun (Android)

Android app for the Dhun music player in `../dhun/`.
The web app (`index.html`, `engine.js`) is copied into the APK's assets at build time,
so changing the web app and pushing produces an updated APK.

## Get the APK (no Android Studio needed)
Every push that touches `dhun/index.html`, `dhun/engine.js` or `dhun-app/` runs the "Build Dhun APK" workflow,
which publishes `dhun/Dhun.apk` (linked from the home page). The APK is also attached
to each workflow run as the `dhun-apk` artifact.

## Build locally
```
mkdir -p app/src/main/assets/www && cp ../dhun/index.html ../dhun/engine.js app/src/main/assets/www/
gradle assembleDebug        # JDK 17, Android SDK 34
```

## Notes
- The page is served from `https://appassets.androidplatform.net/` (intercepted in `MainActivity`) instead of
  `file://`, so IndexedDB (your uploaded files), localStorage and requests to the Internet Archive work as on the web.
- Music keeps playing with the screen off: `PlaybackService` is a media-playback foreground service with a
  notification (previous / play-pause / next). Android 13+ asks for notification permission on first start.
- "Add music files" opens Android's file picker; files are copied into the app's own storage.
- Back closes the player, menus and pages first; on the home screen it sends the app to the background
  (music keeps playing) instead of closing it.
- Follows the phone's light/dark mode.
- Signed with a fixed key (`app/debug.keystore`), so new versions install over old ones and keep your library.
  The version code is the workflow run number.
