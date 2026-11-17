#!/usr/bin/env bash
# Builds the GATE CE Mock Test Android APK from ../gate-ce (offline WebView wrapper).
# Requires (Ubuntu): apt-get install aapt apksigner zipalign android-sdk-platform-23 dalvik-exchange openjdk
# Usage: KEYSTORE=path/to/release.jks KS_PASS=... ./build.sh
set -euo pipefail
cd "$(dirname "$0")"
SDK_JAR=/usr/lib/android-sdk/platforms/android-23/android.jar
KEYSTORE=${KEYSTORE:-keystore/gatece.jks}
KS_PASS=${KS_PASS:-gatece-mocktest}
OUT=build; rm -rf "$OUT"; mkdir -p "$OUT"/{gen,classes,assets/www}

cp ../gate-ce/index.html ../gate-ce/questions.js "$OUT/assets/www/"
[ -f res/drawable-mdpi/ic_launcher.png ] || python3 make_icon.py

aapt package -f -m -J "$OUT/gen" -M AndroidManifest.xml -S res -I "$SDK_JAR"
javac -nowarn -Xlint:-options -source 8 -target 8 -bootclasspath "$SDK_JAR" -d "$OUT/classes" \
      $(find src "$OUT/gen" -name '*.java')
dalvik-exchange --dex --min-sdk-version=21 --output="$OUT/classes.dex" "$OUT/classes"

aapt package -f -M AndroidManifest.xml -S res -A "$OUT/assets" -I "$SDK_JAR" -F "$OUT/unsigned.apk"
(cd "$OUT" && aapt add unsigned.apk classes.dex >/dev/null)
zipalign -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"

if [ ! -f "$KEYSTORE" ]; then
  mkdir -p "$(dirname "$KEYSTORE")"
  keytool -genkeypair -keystore "$KEYSTORE" -storepass "$KS_PASS" -keypass "$KS_PASS" -alias gatece \
          -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=GATE CE Mock Test" >/dev/null 2>&1
fi
apksigner sign --ks "$KEYSTORE" --ks-pass "pass:$KS_PASS" --ks-key-alias gatece \
          --out "$OUT/GATE-CE-MockTest.apk" "$OUT/aligned.apk"
apksigner verify "$OUT/GATE-CE-MockTest.apk"
cp "$OUT/GATE-CE-MockTest.apk" ../gate-ce/GATE-CE-MockTest.apk
echo "Built: gate-ce/GATE-CE-MockTest.apk ($(du -h ../gate-ce/GATE-CE-MockTest.apk | cut -f1))"
