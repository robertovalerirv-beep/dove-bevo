import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

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
