# Opt-in Android public browsing smoke test

`PublicBrowseRuntimeTest` is a separate instrumentation case for the real production HTTPS mobile document. It has no fixture server, response interception, synthetic venue/price, injected application bridge, or substituted WebView client. Normal `MainActivity` owns its lifecycle, browser policy, user agent and navigation. Run this class alone in a fresh instrumentation process: earlier fixture classes can install process-wide network interceptors.

Default instrumentation runs skip this test **before** local preference changes, Activity launch or networking. Opt in with `publicBrowse=true`. `NativeFixtureRunner` must select its fresh API-28+ WebView data-directory suffix before app startup; that isolates the test browser profile and preserves the original profile. The test neither clears browser storage nor changes cookies, service-worker policy, permissions, location, UA, IP or network identity. The rules-version preference alone is temporarily set to the bundled accepted version and its exact original presence/value is restored afterward, including on failure. Bookmarks are never modified.

The bounded vertical slice is:

1. Launch the normal Activity and wait up to 45 seconds for the production `/mobile/` document, actual `data-dovebevo-mobile-shell="1"` marker and normal map search button.
2. Open normal search, enter the fixed query `Milano` using ordinary input events, and wait up to 30 seconds for the actual unique city option. The selector requires the existing place-option identifier and exact displayed city name, so it cannot select the venue-proposal action or a similarly named bar.
3. Select that city through its normal UI click. Wait up to 60 seconds for the real map's ready state, a nonempty rendered MapLibre canvas, closed search, zoom at least 13 and a finite map center inside the bounded Milano area.
4. Finish the Activity and restore only the original local rules-version key. No page reload/retry, venue selection, contribution handler, save, vote, report, proposal, sponsorship/ad action, sharing or external navigation is triggered.

Success sends a small `public_browse` instrumentation status with document origin/path/title (bounded), marker/search/challenge booleans and map readiness/center/zoom. A separate opt-in case calls the unchanged native HTTPS transport and typed catalogue/venue parser for two actually imported UK/France venues, requiring live GBP/EUR prices and truthful online-menu dates without browser credentials. It emits `native_public_prices=PASS` only after those actual reads succeed. Neither case establishes every tile loaded, backend mutation safety, complete app coverage, or a physical-device/store-release result.

## Protection and failure behavior

Cloudflare challenge forms/frames and familiar challenge wording are detected using read-only DOM state. The test immediately fails with `PUBLIC_BROWSE_BLOCKED_BY_CLOUDFLARE`, without clicking the challenge, solving a CAPTCHA, changing identity, retrying requests or bypassing protections. A network/rendering/selector failure produces `PUBLIC_BROWSE_NOT_READY` and the small public document state. Body text, cookies, storage, URL query tokens, raw HTML and screenshots are not retained. A timeout or challenge is a truthful blocked result, not a passed test. The case makes only normal browsing/search actions; it is not a general network method blocker.

## Compile and later controlled execution

Implementation lane validation compiles only; it does not launch an emulator, call production or execute instrumentation. With the existing authorized SDK/JDK/cache, from this worktree's `mobile-apps/android` directory:

```powershell
$env:JAVA_HOME = 'C:\Users\stefa\AppData\Local\DoveBevo\sdk\jdk21'
$env:ANDROID_HOME = 'C:\Users\stefa\AppData\Local\Android\Sdk'
$env:GRADLE_USER_HOME = 'C:\Users\stefa\OneDrive\Dove Bevo\android-autoname-liveqa-20261028\mobile-apps\android\.gradle-user-home'
$env:TEMP = 'C:\Users\stefa\OneDrive\Dove Bevo\.task-tmp\android-local\java-temp'
$env:TMP = $env:TEMP
.\gradlew.bat --offline --no-daemon :app:assembleDebug :app:assembleDebugAndroidTest
```

The coordinator may later install the compiled debug and instrumentation APKs on the already approved owned SDK AVD and run only this case through its existing runner, using the device's ordinary local consumer network. Set `$ownedAvdSerial` to that already approved running emulator's actual serial first. These commands are documentation, not an executed live result:

```powershell
$adb = Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe'
if ($ownedAvdSerial -notmatch '^emulator-[0-9]+$') { throw 'Set the approved owned AVD serial first' }
& $adb -s $ownedAvdSerial install -r app/build/outputs/apk/debug/app-debug.apk
& $adb -s $ownedAvdSerial install -r app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
& $adb -s $ownedAvdSerial shell am instrument -w -r -e class com.dovebevo.app.PublicBrowseRuntimeTest -e publicBrowse true com.dovebevo.app.test/com.dovebevo.app.NativeFixtureRunner
```

Do not change system test-lab flags, launch a visible emulator window, solve protection challenges or create public contributions to obtain a green result. Do not call a hosted-runner Cloudflare checkbox result an app failure or a protection bypass opportunity. This implementation cannot guarantee the future live network outcome.
