# Dove bevo Preview

Local Capacitor prototype, identity `com.dovebevo.app.preview`, callback
`dovebevopreview://auth/callback`. It is labelled **Dove bevo Preview** on both platforms.
The backend origin `https://mobile-preview.dovebevo.com` is planned and not provisioned.
This repository does not register a domain, application identity, signing key or store account.

Use Node 24 or newer:

```sh
npm ci --ignore-scripts
npm run build:native
npm run native:check
npm run native:sync
```

`build:native` explicitly selects preview and fixture data. Its root HTML has a local CSP;
only reviewed app assets are copied, with no Worker, admin pages, service worker or web manifest.
`dist/native/native-build.json` records that the build is a prototype, its data version and its
unprovisioned backend. The ordinary web build does not use this configuration.

For a retained real dataset in the preview, run `node scripts/native-build.mjs --preview` with
an explicit `VITE_DATA_VERSION=YYYYMMDD` in the process environment. The version's static files
must remain available from the reviewed backend. The build reads no `.env` files. Custom
backend origins are rejected. `node scripts/native-build.mjs --release` always fails until
production resources, HTTPS app links, signing and device validation are separately approved.
The preview identity and custom callback must never be shipped as a production release.

Android: open `android/` in compatible Android Studio, with JDK 21 and SDK 36. The checked-in
project targets API 36 (minimum 24). `android/gradlew assembleDebug` builds a package signed
with the local development debug key once the toolchain is installed. Location is foreground only and optional. Backups,
cleartext traffic and WebView debugging are disabled; no background location or advertising ID.

The preview supports iOS 16.4 or newer and Android API 24 or newer with an updated Android
System WebView at Chromium 111 or newer. The native Vite build explicitly targets `safari16.4`
and `chrome111`; an Android OS version alone does not establish WebView compatibility. The
iOS app and project deployment targets are all 16.4, so iPhone 6s and iPhone 7 are excluded.
This deliberate baseline covers the bundled UI's browser APIs and build output without
claiming compatibility with older engines. Capacitor's package minimum may remain lower.
The unsigned iOS CI helper checks the built `MinimumOSVersion`; configuration checks and a
successful build do not prove execution on the oldest supported OS. Simulator and physical
device testing at these baselines remains a release gate.

iOS: open `ios/App/App.xcodeproj` on macOS with compatible Xcode. The official Capacitor 8.5.3
SPM template retains AppDelegate and SceneDelegate routing. Location is when-in-use only.
The linked official geolocation SDK requires an Always usage description; the app never requests
that authorization and enables no background mode. The privacy manifest declares no tracking
or collected device location. Its app-level privacy
answers remain subject to real platform inspection before submission. Windows generation and
sync do not establish that Xcode builds or runs the application.

Retain the app's resolved Swift dependency graph at
`ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved`.
The first successful hosted Xcode dependency resolution must export that actual file for review
and commit; it has not been resolved or captured locally. The npm pins do not pin all native
transitive dependencies, including the geolocation SDK's permitted 3.x range. After the real
app workspace lock is committed, validate subsequent Xcode builds with
`-onlyUsePackageVersionsFromResolvedFile -disableAutomaticPackageResolution`; dependency
changes require a deliberately refreshed, reviewed lock. A standalone `CapApp-SPM/Package.resolved`
is not a substitute for the app workspace lock.

`npm run native:icons` renders the existing approved SVG brand asset into the native icon sets.
No new icon artwork or third-party asset generator is used.

The app uses a dedicated `DoveBevoHttp` bridge for cookie-free JSON requests. Capacitor's built-in
HTTP implementation shares cookies with the WebView even when global JS patching is disabled.
The custom bridge has a fixed preview origin, bounded JSON bodies, no redirects, no HTTP cache,
and no cookie send/store. Android pins OkHttp `5.5.1` with `CookieJar.NO_COOKIES`; iOS uses an
ephemeral URLSession with cookie handling and storage disabled. Source checks cannot establish
these guarantees on a device: verify them with seeded cookies and redirect endpoints on both
platforms before any release.

OkHttp is Apache 2.0 licensed and supports Java 8+/Android 21+, compatible with this minimum API
24 project. Its official Maven `okhttp-jvm-5.5.1.jar` is 963,622 bytes before shrinking, with Kotlin
and Okio transitive libraries additional; this is not a measured APK increase. Its exact artifact
and current security release were checked against [Maven Central](https://repo.maven.apache.org/maven2/com/squareup/okhttp3/okhttp/5.5.1/okhttp-5.5.1.pom)
and the [official changelog](https://lysine.dev/okhttp/changelogs/changelog/).
