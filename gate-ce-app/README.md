# GATE CE Mock Test (Android)

Offline Android app for the GATE Civil Engineering mock exam in `../gate-ce/`.
The web app (`index.html`, `questions.js`) is copied into the APK's assets at build time,
so editing questions in `gate-ce/questions.js` and pushing produces an updated APK.

## Get the APK (no Android Studio needed)
Push to GitHub → Actions → "Build GATE CE APK" → open the latest run → download
`gate-ce-mocktest-apk`, unzip, copy `GATE-CE-MockTest.apk` to the phone and install.

## Build locally
```
mkdir -p app/src/main/assets/www && cp ../gate-ce/index.html ../gate-ce/questions.js app/src/main/assets/www/
gradle assembleDebug        # JDK 17, Android SDK 34
```

## Notes
- Signed with a fixed key (`app/debug.keystore`), so new versions install over old ones and keep stored results.
- Results/settings live on the phone; export JSON from each phone and import on one to build a merit list.
