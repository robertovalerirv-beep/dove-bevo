#!/usr/bin/env bash
set -euo pipefail
: "${RUNNER_TEMP:?GitHub runner temporary directory required}"
: "${ANDROID_HOME:?Hosted Android SDK required}"
evidence="$RUNNER_TEMP/mobile-evidence/android"
mkdir -p "$evidence"
{
  node --version
  npm --version
  java -version
  git rev-parse HEAD
  bash android/gradlew -p android --version
} 2>&1 | tee "$evidence/toolchain.txt"
# Use the official preinstalled command-line tools and already accepted runner SDK licences.
sdkmanager="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
# Google's stable API 37 platform package includes the minor-version suffix.
"$sdkmanager" 'platforms;android-37.0' 'build-tools;36.0.0' 2>&1 | tee "$evidence/sdk-install.log"
"$sdkmanager" --list_installed > "$evidence/sdk-packages.txt"
# Keep every Gradle module's output and project cache outside the checkout.
cat > "$RUNNER_TEMP/mobile-android.init.gradle" <<'GRADLE'
allprojects {
    layout.buildDirectory.set(new File(System.getenv('RUNNER_TEMP'), 'mobile-android-build/' + project.path.replace(':', '_')))
}
GRADLE
bash android/gradlew -p android --no-daemon --console=plain --max-workers=2 \
  --project-cache-dir "$RUNNER_TEMP/mobile-android-cache" \
  -Pkotlin.project.persistent.dir="$RUNNER_TEMP/mobile-kotlin-cache" \
  --init-script "$RUNNER_TEMP/mobile-android.init.gradle" :app:assembleDebug 2>&1 | tee "$evidence/build.log"
appbuild="$RUNNER_TEMP/mobile-android-build/_app"
apk="$appbuild/outputs/apk/debug/app-debug.apk"
test -s "$apk"
cp "$apk" "$evidence/app-debug.apk"
sha256sum "$apk" | tee "$evidence/apk-sha256.txt"
"$ANDROID_HOME/build-tools/36.0.0/aapt2" dump badging "$apk" | tee "$evidence/apk-badging.txt"
"$ANDROID_HOME/build-tools/36.0.0/apksigner" verify --verbose "$apk" | tee "$evidence/apk-signature.txt"
# Inspect AGP's final packaged merged manifest, including library permissions.
manifest="$appbuild/intermediates/packaged_manifests/debug/processDebugManifestForPackage/AndroidManifest.xml"
test -s "$manifest"
cp "$manifest" "$evidence/AndroidManifest.xml"
cp "$appbuild/outputs/logs/manifest-merger-debug-report.txt" "$evidence/manifest-merger-debug-report.txt"
python3 - "$apk" "$RUNNER_TEMP/mobile-android-assets" <<'PY'
import pathlib, sys, zipfile
apk, assets = sys.argv[1:]
with zipfile.ZipFile(apk) as archive:
    for name in archive.namelist():
        if name.startswith('assets/public/') and not name.endswith('/'):
            relative = pathlib.PurePosixPath(name).relative_to('assets/public')
            assert '..' not in relative.parts
            assert '\\' not in name
            output = pathlib.Path(assets, *relative.parts)
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_bytes(archive.read(name))
PY
node --input-type=module -e 'import {checkNativeOutput} from "./native/build-policy.ts"; console.log(`Packaged native assets: ${checkNativeOutput(process.argv[1])} reviewed files`)' "$RUNNER_TEMP/mobile-android-assets" | tee "$evidence/asset-check.txt"
python3 scripts/mobile-ci-android-check.py "$manifest" "$evidence/apk-badging.txt" | tee "$evidence/manifest-check.txt"
