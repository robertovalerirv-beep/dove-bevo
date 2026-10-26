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
"$ANDROID_HOME/build-tools/36.0.0/aapt2" dump badging "$apk" | tee "$evidence/apk-badging.txt"
"$ANDROID_HOME/build-tools/36.0.0/apksigner" verify --verbose "$apk" | tee "$evidence/apk-signature.txt"
# Inspect AGP's final packaged merged manifest, including library permissions.
manifest="$appbuild/intermediates/packaged_manifests/debug/processDebugManifestForPackage/AndroidManifest.xml"
test -s "$manifest"
cp "$manifest" "$evidence/AndroidManifest.xml"
cp "$appbuild/outputs/logs/manifest-merger-debug-report.txt" "$evidence/manifest-merger-debug-report.txt"
python3 - "$manifest" "$apk" "$RUNNER_TEMP/mobile-android-assets" <<'PY'
import pathlib, sys, xml.etree.ElementTree as ET, zipfile
manifest, apk, assets = sys.argv[1:]
root = ET.parse(manifest).getroot()
android = '{http://schemas.android.com/apk/res/android}'
assert root.attrib['package'] == 'com.dovebevo.app.preview'
sdk = root.find('uses-sdk')
assert int(sdk.attrib[android + 'targetSdkVersion']) >= 36
permissions = {node.attrib[android + 'name'] for node in root.findall('uses-permission')}
allowed = {'android.permission.INTERNET', 'android.permission.ACCESS_COARSE_LOCATION', 'android.permission.ACCESS_FINE_LOCATION'}
# AndroidX Core may add its app-private signature permission for receiver protection.
internal = 'com.dovebevo.app.preview.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION'
if internal in permissions:
    declaration = next(node for node in root.findall('permission') if node.attrib[android + 'name'] == internal)
    assert declaration.attrib[android + 'protectionLevel'] == 'signature'
    permissions.remove(internal)
assert permissions == allowed, permissions
app = root.find('application')
assert app.attrib[android + 'allowBackup'] == 'false'
assert app.attrib[android + 'usesCleartextTraffic'] == 'false'
with zipfile.ZipFile(apk) as archive:
    for name in archive.namelist():
        if name.startswith('assets/public/') and not name.endswith('/'):
            relative = pathlib.PurePosixPath(name).relative_to('assets/public')
            assert '..' not in relative.parts
            output = pathlib.Path(assets, *relative.parts)
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_bytes(archive.read(name))
print('Merged manifest: preview identity, API36+, foreground location only, no backup or cleartext')
PY
node --input-type=module -e 'import {checkNativeOutput} from "./native/build-policy.ts"; console.log(`Packaged native assets: ${checkNativeOutput(process.argv[1])} reviewed files`)' "$RUNNER_TEMP/mobile-android-assets" | tee "$evidence/asset-check.txt"
sha256sum "$apk" | tee "$evidence/apk-sha256.txt"
