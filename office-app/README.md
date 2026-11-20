# Office Editor (Android)

Android app for the Word / PowerPoint editor in `../office/`. The web app is copied into the
APK's assets at build time, so it works fully offline and any change to `office/` produces an
updated APK.

## Features on top of the web version
- **Open with / Share to Office Editor** from any file manager, email or chat app (.docx, .pptx)
- Saving uses Android's "Save as" screen, so you choose the name and folder (Downloads, Drive, …)
- Print or save Word documents as PDF through Android's print service
- Full-screen slideshow (swipe or tap to change slides, Back to exit)
- Back button warns about unsaved changes

## Get the APK (no Android Studio needed)
Every push that changes `office/` or `office-app/` runs **Actions → "Build Office Editor APK"**.
It publishes the APK at `office/OfficeEditor.apk` (download link in the editor's status bar,
`https://usb10-ai.github.io/office/OfficeEditor.apk` once merged) and as the run artifact
`office-editor-apk`. Copy it to the phone and install (allow "install unknown apps").

## Build locally
```
mkdir -p app/src/main/assets/www && cp -r ../office/index.html ../office/*.css ../office/*.js ../office/blank.pptx ../office/*.png ../office/vendor app/src/main/assets/www/
gradle assembleDebug        # JDK 17, Android SDK 34
```

## Notes
- Requires Android 7.0+ (API 24) with an up-to-date Android System WebView.
- Signed with a fixed key (`app/debug.keystore`, same public debug key as the GATE CE app) so new
  versions install over old ones. Bump `versionCode` in `app/build.gradle.kts` for each release.
  For the Play Store you would need your own release key.
