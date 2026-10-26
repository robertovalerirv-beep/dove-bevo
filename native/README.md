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

The backend has a separate build-only, disabled configuration prerequisite:

```sh
node scripts/mobile-preview-build.mjs --local-proof
```

This selects `.mobile-preview.wrangler.json` at Vite build time without borrowing the `staging`
environment. It builds into `.wrangler/mobile-preview-build`, checks the flattened Worker and
byte-compares every fixture asset, then removes its local-only synthetic configuration and executable
outputs. The remaining `.wrangler/mobile-preview-build-proof.json` contains hashes and check counts.
The helper restores Vite's deployment redirect and leaves ordinary web/native build outputs alone.
It refuses local env/secret files, inherited environment/config selections and pre-existing preview
artifacts rather than overwriting them. It makes no remote API calls, migrations or deployments.

After a new preview D1 database is separately provisioned and verified, the same helper accepts
`--database-id <new-D1-UUID>` and retains the checked disabled config/output for inspection. It rejects
every database UUID found in the ordinary config and the reserved local-only identifiers. An explicit
UUID is an input requirement, not proof that its owner/account is correct: provisioning receipts and
provider read-back are still required before any deployment. `node scripts/check-config.mjs` also
checks this generated config when present. Its only reviewed profile has fixture data, mobile auth
disabled, an empty public sitekey and Access identifiers, no routes/queues/extra bindings, and both
`workers_dev` and `preview_urls` disabled. Independent rate-limit namespaces `2026102601` and
`2026102602` avoid the website's configured namespaces; account-wide availability still needs live
verification. Real Turnstile/secrets, enabling mobile auth, attaching the exact preview host and a
trusted deployment job require a further reviewed change. No deploy workflow is added here.

Android: open `android/` in compatible Android Studio, with JDK 21, compile SDK 37 and Build Tools
36.0.0. The checked-in project targets API 36 (minimum 24). `android/gradlew assembleDebug` builds a package signed
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
The real app workspace lock is now committed after review of hosted Xcode resolution evidence.
Its 696 bytes have SHA256 `0414941858be1cb14b1ae5407f2da755c8b8cb7ca54f1a425fb6de2530382b65`.
The npm pins alone do not pin all native transitive dependencies, including the geolocation SDK's
permitted 3.x range. Subsequent Xcode builds validate the committed resolution with
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

The supported OkHttp Android variant is `okhttp-android`, selected by Gradle module metadata;
its 5.5.1 AAR requires compile SDK 37. The JVM jar above is an installation-size reference,
not the Android runtime artifact. Do not replace the Android variant with `okhttp-jvm`: the
upstream JVM platform registry has no Android platform integration. Keep the generic pinned
`okhttp:5.5.1` dependency so Android TLS, initialization and the certificate security fix remain.
Compile SDK 37 does not change the explicit target API 36 or minimum API 24.

The corresponding build toolchain is AGP 9.1.1, Gradle 9.3.1 and external Kotlin Gradle plugin
2.4.21 with JDK 21. These versions are covered by the official
[Android compatibility matrix](https://developer.android.com/build/releases/agp-9-1-0-release-notes)
and [Kotlin compatibility matrix](https://kotlinlang.org/docs/gradle-configure-project.html).
The pinned Capacitor 8 plugins still use the old Android DSL and external `kotlin-android`, so
the documented temporary `android.newDsl=false` and `android.builtInKotlin=false` migration
opt-outs preserve those scripts without patching `node_modules`. They do not suppress AAR/API
metadata checks. Full native-plugin migration is required before those AGP compatibility
opt-outs are removed. Hosted debug APKs have passed the corrected packaged-manifest and
optional-hardware checks; see `docs/PROGRESS.md` for source-bound artifact evidence. Compilation
and package inspection alone do not establish successful installation or device behavior.

### Android merged manifest checks

The pinned `iongeolocation-android:2.2.2` SDK contributes the normal
`ACCESS_NETWORK_STATE` permission. Its provider selection and settings-error handling call
`ConnectivityManager.activeNetwork` and `getNetworkCapabilities`, which require this permission.
Retain that specific reviewed permission alongside Internet and foreground coarse/fine location;
the final-manifest guard rejects every other external permission, including background location
and advertising ID. AndroidX's app-private receiver permission is accepted only when declared
with signature protection. This does not authorize a broader permission set for future SDKs.

Location remains optional for manual map/search use. Generic location, GPS and network location
hardware are explicitly `required=false`; the helper checks both the merged XML and `aapt2`
badging so an inferred required hardware feature cannot silently filter supported devices.
`scripts/mobile-ci-android-check.py` validates real merged output and is exercised with negative
manifest/permission/hardware fixtures. APK hashing and packaged-asset checks run before this
manifest check, preserving their evidence even when a manifest policy fails. The inspected hosted
APKs include these declarations; future source changes still require a fresh package check.

### Bounded Android emulator startup evidence

The Android job prepares Google's stable API 36 Google APIs x86_64 image and emulator through
the official SDK manager, then runs `scripts/mobile-ci-android-launch.py launch` after APK
inspection. Setup and launch have separate nine-minute workflow steps and 480-second helper
budgets; launch reserves 60 seconds for cleanup. The runner must already have the Android SDK
licence: stdin is closed and no licence-acceptance command runs. Installed emulator/image
revisions are checked explicitly, so changing SDK metadata requires review.

Startup requires available KVM, one uniquely owned temporary AVD, a private foreground ADB
server and explicit serial/ports. It checks the installed ADB's closed-port behavior, process
identity and socket ownership; no shared server, physical device, permission change, CPU
fallback or second boot/install/launch attempt is used. Read-only boot/provider readiness
polling stays within the overall work deadline. The active valid WebView must be installed,
enabled and finished preparing, with Chromium 111 or newer; it is never updated or switched.

Evidence binds the actual compiled/copied APK hash, checkout, API/image/tool versions, install
result, exact component and surviving foreground PID after 25 seconds, plus PNG dimensions/hash.
Only tracked process groups and guarded temporary homes are cleaned. Missing ownership or
cleanup evidence fails the job. Deadlines are soft subprocess limits with an outer margin;
this is not a hardened process sandbox. One-day artifact retention applies.

Root must inspect the actual PNG. The unavailable/retry screen is expected until the isolated
backend exists; it proves limited OS startup rather than maps, challenge completion, device
permissions, contribution delivery, physical-device compatibility or store readiness. Fake
subprocess tests establish orchestration behavior only. See `docs/PROGRESS.md` for actual runs.

### Bounded iOS Simulator startup evidence

After the locked unsigned build, the existing macOS job runs
`scripts/mobile-ci-ios-launch.py` once. It uses installed Simulator help/inventory and an
available iPhone's explicit runtime/type pairing, preferring the current SDK; it downloads
no runtime and fails if it cannot establish a reliable compatible stable pair at iOS 16.4+.
It creates one uniquely named job-owned simulator, boots/installs/launches the preview, checks
the returned PID still belongs to the installed executable after 25 seconds, and captures
one PNG. A 330-second overall deadline reserves 60 seconds for exact-UDID cleanup inside the
six-minute workflow step. Existing simulators are never booted, shut down or deleted.

The launch evidence folder records the checkout SHA, a deterministic app-tree hash, selected
runtime/device, bounded command/failure logs, launch PID, screenshot/hash and cleanup result.
Root must inspect the PNG: a live PID or valid PNG does not establish a functional UI. Pure
selection/error/deadline tests use fake subprocesses and are not simulator evidence. This phase
does not exercise real Turnstile, backend contributions, location consent, physical devices or
production signing; those remain separate gates. Existing one-day artifact retention applies.
The 25-second wait accommodates the native config request's 20-second timeout so an unavailable
preview can render its closed failure state. The PNG may still show loading and requires
inspection; this is OS/limited-shell startup evidence, not a claim that the map app is ready.
