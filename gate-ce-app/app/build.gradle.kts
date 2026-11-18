plugins {
    id("com.android.application")
}
android {
    namespace = "in.gatece.mocktest"
    compileSdk = 34
    defaultConfig {
        applicationId = "in.gatece.mocktest"
        minSdk = 24
        targetSdk = 34
        versionCode = 7
        versionName = "2.2"
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
