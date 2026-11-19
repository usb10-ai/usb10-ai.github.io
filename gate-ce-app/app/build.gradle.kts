plugins {
    id("com.android.application")
}
// Version comes from gate-ce/version.js (shared with the web app's update check)
val gateVersion = rootProject.file("../gate-ce/version.js").readText()
val gateCode = Regex("code:\\s*(\\d+)").find(gateVersion)!!.groupValues[1].toInt()
val gateName = Regex("name:\\s*\"([^\"]+)\"").find(gateVersion)!!.groupValues[1]
android {
    namespace = "in.gatece.mocktest"
    compileSdk = 34
    defaultConfig {
        applicationId = "in.gatece.mocktest"
        minSdk = 24
        targetSdk = 34
        versionCode = gateCode
        versionName = gateName
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
