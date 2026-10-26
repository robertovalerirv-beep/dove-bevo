import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

// Real 206dc25 permission shape, with this fix's explicit optional location features.
const mergedManifest = `<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.dovebevo.app.preview">
<uses-sdk android:minSdkVersion="24" android:targetSdkVersion="36" />
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<permission android:name="com.dovebevo.app.preview.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION" android:protectionLevel="signature" />
<uses-permission android:name="com.dovebevo.app.preview.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION" />
<uses-feature android:name="android.hardware.location" android:required="false" />
<uses-feature android:name="android.hardware.location.gps" android:required="false" />
<uses-feature android:name="android.hardware.location.network" android:required="false" />
<application android:allowBackup="false" android:usesCleartextTraffic="false" />
</manifest>`;
const runManifestGuard = (manifest: string, badging = "") => {
  const dir = mkdtempSync(join(tmpdir(), "dovebevo-manifest-"));
  try {
    const xml = join(dir, "AndroidManifest.xml");
    const badge = join(dir, "badging.txt");
    writeFileSync(xml, manifest);
    writeFileSync(badge, badging);
    return execFileSync("python", ["scripts/mobile-ci-android-check.py", xml, badge], {
      encoding: "utf8",
      stdio: "pipe",
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

describe("merged Android manifest validation", () => {
  it("accepts only the reviewed SDK network-state permission and app-private signature permission", () => {
    expect(runManifestGuard(mergedManifest)).toContain("foreground location optional");
    expect(() =>
      runManifestGuard(
        mergedManifest.replace(
          'android:protectionLevel="signature"',
          'android:protectionLevel="normal"',
        ),
      ),
    ).toThrow(/signature/);
  });

  it.each([
    "android.permission.CAMERA",
    "android.permission.ACCESS_BACKGROUND_LOCATION",
    "com.google.android.gms.permission.AD_ID",
  ])("rejects unreviewed permission %s", (permission) => {
    expect(() =>
      runManifestGuard(
        mergedManifest.replace(
          "</manifest>",
          `<uses-permission android:name="${permission}" /></manifest>`,
        ),
      ),
    ).toThrow(/permission/);
  });

  it.each(["allowBackup", "usesCleartextTraffic"])("rejects unsafe %s", (attribute) => {
    expect(() =>
      runManifestGuard(mergedManifest.replace(`${attribute}="false"`, `${attribute}="true"`)),
    ).toThrow(/application/);
  });

  it("rejects the wrong identity or changed target API", () => {
    expect(() =>
      runManifestGuard(
        mergedManifest.replace('package="com.dovebevo.app.preview"', 'package="com.other.app"'),
      ),
    ).toThrow(/identity/);
    expect(() =>
      runManifestGuard(mergedManifest.replace('targetSdkVersion="36"', 'targetSdkVersion="37"')),
    ).toThrow(/SDK/);
  });

  it.each([
    "android.hardware.location",
    "android.hardware.location.gps",
    "android.hardware.location.network",
  ])("rejects missing/required optional hardware %s", (feature) => {
    const declaration = `<uses-feature android:name="${feature}" android:required="false" />`;
    expect(() => runManifestGuard(mergedManifest.replace(declaration, ""))).toThrow(/location/);
    expect(() =>
      runManifestGuard(
        mergedManifest.replace(
          declaration,
          declaration.replace('required="false"', 'required="true"'),
        ),
      ),
    ).toThrow(/location/);
  });

  it("rejects a required location feature inferred into actual aapt badging", () => {
    expect(() =>
      runManifestGuard(mergedManifest, "uses-feature: name='android.hardware.location'\n"),
    ).toThrow(/badging/);
    expect(
      runManifestGuard(
        mergedManifest,
        "uses-feature-not-required: name='android.hardware.location'\n",
      ),
    ).toContain("foreground location optional");
  });
});

describe("generated native platform boundaries (source checks, not device proof)", () => {
  it("aligns every iOS deployment minimum with the explicit bundled browser targets", () => {
    const project = read("ios/App/App.xcodeproj/project.pbxproj");
    const targets = [...project.matchAll(/IPHONEOS_DEPLOYMENT_TARGET = ([^;]+);/g)];
    expect(targets).toHaveLength(4); // App and project, Debug and Release.
    expect(targets.map((target) => target[1])).toEqual(Array(4).fill("16.4"));
    expect(read("vite.native.config.ts")).toContain('target: ["safari16.4", "chrome111"]');
    expect(read("android/variables.gradle")).toMatch(/minSdkVersion = 24/);
    expect(read("scripts/mobile-ci-ios.sh")).toContain("Print :MinimumOSVersion");
    expect(read("native/README.md")).toContain("iOS 16.4");
  });

  it("registers only foreground location and the preview callback on Android", () => {
    const manifest = read("android/app/src/main/AndroidManifest.xml");
    expect(manifest).toContain('android:allowBackup="false"');
    expect(manifest).toContain('android:usesCleartextTraffic="false"');
    expect(manifest).toContain(
      'android:scheme="dovebevopreview" android:host="auth" android:path="/callback"',
    );
    expect(
      [...manifest.matchAll(/uses-permission android:name="([^"]+)"/g)]
        .map((match) => match[1])
        .sort(),
    ).toEqual([
      "android.permission.ACCESS_COARSE_LOCATION",
      "android.permission.ACCESS_FINE_LOCATION",
      "android.permission.INTERNET",
    ]);
    expect(read("android/variables.gradle")).toMatch(/targetSdkVersion = 36/);
  });

  it("retains the Android OkHttp security release with a compatible compile toolchain", () => {
    const sdk = read("android/variables.gradle");
    expect(sdk).toMatch(/compileSdkVersion = 37/);
    expect(sdk).toMatch(/targetSdkVersion = 36/);
    expect(sdk).toMatch(/minSdkVersion = 24/);
    const build = read("android/build.gradle");
    expect(build).toContain("com.android.tools.build:gradle:9.1.1");
    expect(build).toContain("kotlin_version = '2.4.21'");
    expect(read("android/gradle/wrapper/gradle-wrapper.properties")).toContain(
      "gradle-9.3.1-all.zip",
    );
    const app = read("android/app/build.gradle");
    expect(app).toContain("com.squareup.okhttp3:okhttp:5.5.1");
    expect(app).not.toContain("okhttp-jvm");
    expect(app).toContain("proguard-android-optimize.txt");
    const properties = read("android/gradle.properties");
    expect(properties).toContain("android.builtInKotlin=false");
    expect(properties).toContain("android.newDsl=false");
    expect(properties).not.toMatch(/suppressUnsupportedCompileSdk|disable.*[Aa]ar/);
    expect(read("scripts/mobile-ci-android.sh")).toContain("'platforms;android-37.0'");
  });

  it("retains the iOS scene lifecycle and preview callback without background location", () => {
    const plist = read("ios/App/App/Info.plist");
    expect(plist).toContain("UIApplicationSceneManifest");
    expect(plist).toContain("NSLocationWhenInUseUsageDescription");
    expect(plist).toContain("dovebevopreview");
    // Linked official SDK requires this string; it does not enable background location.
    expect(plist).toContain("NSLocationAlwaysAndWhenInUseUsageDescription");
    expect(plist).not.toMatch(/UIBackgroundModes|NSAllowsArbitraryLoads/);
    expect(read("ios/App/App/SceneDelegate.swift")).toContain("SceneDelegateProxy.shared.scene");
    expect(read("ios/App/App.xcodeproj/project.pbxproj")).toContain(
      "PrivacyInfo.xcprivacy in Resources",
    );
  });

  it("uses a dedicated cookie-free no-redirect Android transport, registered by the activity", () => {
    const plugin = read(
      "android/app/src/main/java/com/dovebevo/app/preview/DoveBevoHttpPlugin.java",
    );
    expect(plugin).toContain("CookieJar.NO_COOKIES");
    expect(plugin).toContain("followRedirects(false)");
    expect(plugin).toContain("followSslRedirects(false)");
    expect(plugin).toContain("mobile-preview.dovebevo.com");
    expect(plugin).toContain("MAX_RESPONSE_BYTES");
    expect(plugin).not.toMatch(/Logger|System\.out|HttpURLConnection|CookieHandler/);
    expect(read("android/app/src/main/java/com/dovebevo/app/preview/MainActivity.java")).toContain(
      "registerPlugin(DoveBevoHttpPlugin.class)",
    );
  });

  it("uses an ephemeral cookie-free iOS session that refuses redirects, registered in the live scene", () => {
    const plugin = read("ios/App/App/DoveBevoHttpPlugin.swift");
    expect(plugin).toContain("URLSessionConfiguration.ephemeral");
    expect(plugin).toContain("httpCookieStorage = nil");
    expect(plugin).toContain("httpShouldSetCookies = false");
    expect(plugin).toContain("httpShouldHandleCookies = false");
    expect(plugin).toContain("completionHandler(nil)");
    expect(plugin).toContain("maxResponseBytes");
    expect(plugin).not.toMatch(/print\(|NSLog|URLSession\.shared/);
    expect(read("ios/App/App/DoveBevoViewController.swift")).toContain(
      "registerPluginInstance(DoveBevoHttpPlugin())",
    );
    expect(read("ios/App/App/SceneDelegate.swift")).toContain("DoveBevoViewController()");
  });
});
