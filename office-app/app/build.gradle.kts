plugins {
    id("com.android.application")
}
// Bump versionCode for every release so new APKs install over old ones.
android {
    namespace = "in.usb10.officeeditor"
    compileSdk = 34
    defaultConfig {
        applicationId = "in.usb10.officeeditor"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }
    signingConfigs {
        // Fixed debug key committed to the repo so every build is signed identically
        // and new APKs install over old ones. Public key: fine for sideloading, never for Play Store.
        getByName("debug") {
            storeFile = file("debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
}
dependencies {
    implementation("androidx.webkit:webkit:1.11.0")
}
