plugins {
    id("com.android.application")
}
// Every CI build gets a higher version code, so a new APK always installs over the old one.
val buildNumber = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()
android {
    namespace = "in.bhasha.learn"
    compileSdk = 34
    defaultConfig {
        applicationId = "in.bhasha.learn"
        minSdk = 24
        targetSdk = 34
        versionCode = buildNumber
        versionName = "1.0.$buildNumber"
    }
    signingConfigs {
        // Fixed debug key committed to the repo so every build is signed identically
        // and new APKs install over old ones (keeping progress). Fine for sideloading, never for Play Store.
        getByName("debug") {
            storeFile = file("debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
}
