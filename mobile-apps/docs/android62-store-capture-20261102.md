# Android 62 read-only store capture and viewport regression

Status: the map and venue images are diagnostic evidence, **not store-ready screenshots**. The native Scopri image shows genuine read-only production data, but the complete capture flow is blocked by the viewport regression below. No public store release is established by this work.

## Scope and provenance

The opt-in `PublicBrowseRuntimeTest.storeCaptureShowsActualMilanoMapDiscoveryAndVenue` runs through normal MainActivity and the public HTTPS app. It requires both `publicBrowse=true` and `storeCapture=true`, an explicit `expectedBuildNumber` matching the actual installed app, and version 1.0.0. The expected build must be a canonical positive decimal no greater than Android's 2100000000 bound; missing, malformed, out-of-range or mismatched build numbers fail before capture. The baseline evidence below uses build 62; a production fix needs a fresh build number and separate evidence directory. NativeFixtureRunner creates its ordinary fresh isolated WebView profile. The existing local rules key is restored in teardown. It never posts prices, confirmations, votes or reports; it does not intercept responses, change user agents, bypass a challenge, or alter production settings.

The test uses ordinary Instrumentation touch/key events for city search, then the genuine native Home/Scopri controls and an actually returned venue. It saves the original UiAutomation frame as lossless PNG, without cropping, resizing, painting, or other image editing. Each fresh app-internal capture directory contains SHA-256, image size, UTC timestamp and bounded public/native geometry in `provenance.json`. Images are transferred as bytes from the owned app's files; no manual ADB screenshot or Activity launch is used.

The background-only owned emulator is `dovebevo-local`, serial `emulator-5580`, Android API 36, 1080 x 1920, density 420. Its name is checked before installation and shutdown. It does not use the user's desktop or personal phone. Existing host-local Android SDK/JDK/AVD state is the necessary OS-tool exception; source, builds, project temporary files and evidence stay in the selected OneDrive project. OneDrive cloud synchronization is unverified.

The debug app was built at canonical source `73b7a7fb995e37ef6fafc0d97c82cc147d0c807c`. Its production `app/src/main` Git tree is `3ebc355aeba8d3e2e1d330b978730d8c486e52fb`, byte-identical to uploaded build 62's source `8a408fe677d8e7962601c26eaec9bbfb009980b0`; both Android build.gradle files also match. These are debug-runtime captures of the same production sources, not proof that the signed Play-delivered binary was installed.

## Reproduction and actual results

Evidence is retained outside the repository at `C:\Users\stefa\OneDrive\Dove Bevo\test-evidence\android62-modern-store-20261102`.

- Offline cached-SDK `:app:assembleDebug` and `:app:assembleDebugAndroidTest` compile successfully. No dependency or SDK download was needed.
- Existing production search/readiness and actual GBP/EUR native transport tests pass. The instrumentation reports three test cases because the new capture case is skipped without its second explicit opt-in: two executed passes and one assumption skip.
- Initial JS-only selection captures exposed a blank map and a horizontally clipped venue. They are preserved, not published.
- `pointer-attempt-6` repeats the behavior with ordinary touch, actual keyboard entry and normal Back keyboard dismissal. The flow completes, but its genuine PNGs show the same defect. It is not explained solely by JS-generated search events.
- `instrumentation-geometry-guard.txt` records the stronger capture test failing at actual map visibility. The test now requires at least 95 percent of the real map canvas to intersect the visible viewport and requires an opened venue sheet to fit its visible width. It will not accept DOM map readiness as proof of a usable screenshot.

Before search, the page body/client is approximately 412 x 540 CSS pixels but `innerWidth/innerHeight` and document extent are 800 x 1049. The fixed location button is positioned near x=738.76, y=817.52, consistent with that larger layout viewport, so it is outside the visible phone area. Search uses a 640-pixel dialog centered in the larger viewport. After selection, native WebView scrollY=1337 physical pixels at scale 2.625 corresponds to visualViewport.offsetTop=509.33 CSS pixels. The actual map canvas spans y=111.76 through 475.95, entirely above that visible viewport. A subsequent real venue sheet also remains too wide and clipped. The correct viewport meta tag is present; WebView wideViewport and overview settings are both false. These facts establish the regression, not a verified production fix.

No forced scroll, zoom, screenshot cleanup, or test-only production-setting adjustment is used to obtain attractive images. A production fix requires its own coordinated change and a fresh normal-flow capture run.

## Re-run

Use the existing trusted SDK/JDK and Gradle cache. For the preserved baseline, build with `DOVEBEVO_BUILD_NUMBER=62` and pass `expectedBuildNumber=62`; a reviewed fixed candidate uses its own matching build number and a new evidence directory. Then verify the owned AVD name and install the app/debug test APKs. The only UI entry is:

```text
adb -s emulator-5580 shell am instrument -w -r -e class com.dovebevo.app.PublicBrowseRuntimeTest#storeCaptureShowsActualMilanoMapDiscoveryAndVenue -e publicBrowse true -e storeCapture true -e expectedBuildNumber 62 com.dovebevo.app.test/com.dovebevo.app.NativeFixtureRunner
```

Inspect instrumentation `OK`/`FAILURES` output: adb's shell exit status alone does not establish a passing test. Keep unsuccessful originals and logs. Recheck source/build parity before using future images; do not label captures from a patched source as build-62 evidence.
