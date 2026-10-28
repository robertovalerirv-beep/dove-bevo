# Mobile release status

Last verified: 28 October 2026 (UTC).

Neither mobile app has been submitted for store review or released publicly.
Google Play has accepted and saved the Italian listing with four genuine
1080 by 1920 emulator screenshots; it is ready to send for review once a
production release is prepared. Internal-testing setup is 2 of 3, with tester
selection missing. A locally derived, signed Android build 14 APK was installed
on an account-free emulator; this is not a Play-installed or physical-device
test. No signed iOS binary has been uploaded, and TestFlight still asks for a
build before testing can begin.
Store setup and successful build steps are preparation, not a launch.

## Source and scope

Roberto's `robertovalerirv-beep/dove-bevo` repository is canonical. Verified owner
main is `abeac75353ad5c2b73f97ee33b98fb2040d79ff4`, seven owner commits beyond
the previous baseline. It was merged without conflict into mobile source
`bbc6aa21709904ea001160a36a2f8b0792ab5cbc`. Relative to that current main, the
mobile work is confined to `mobile-apps/` and
`.github/workflows/mobile-apps.yml`. Our additions do not modify the website,
backend, schema or deployment; the owner's intervening changes are preserved.
Local project work stays in the selected OneDrive workspace. Credentials and
signing keys are excluded from source and OneDrive.

## Last completed release candidate

`mobile-release/v1.0.0-rc.6` identifies source
`51ee5c2708f0528193622222e823793c5c23f569` and
[workflow run 40436740241](https://github.com/robertovalerirv-beep/dove-bevo/actions/runs/40436740241),
which completed with failure.

- Android APK and unsigned bundle compilation, twenty unit tests with zero
  failures, lint (zero errors, 24 warnings) and runner guards passed. The API 36
  emulator booted and displayed the native rules screen. Offline privacy,
  decline/relaunch, explicit acceptance and owned
  runtime cleanup passed. The live website wait failed because the WebView
  displayed Cloudflare's human-verification challenge. No search or live map
  check completed. This does not establish what normal users will experience,
  or justify altering the website's security configuration.
- iOS simulator compilation, ten unit tests and both native privacy/navigation
  UI tests passed. The actual host was Intel macOS 15.7.9 (24G830),
  `Macmini6,2` / `x86_64h`, with Xcode 26.3 and iOS 26.2 (23C54) on an
  iPhone 17 `x86_64` simulator. The live test failed after 191.737686 seconds at
  `typeText` on the original city field (`BrowserSmokeTests.swift:76`), following
  `GPUProcessCrashedTooManyTimes` and a renderer reload. The city sheet was lost.
  The native diagnostic collector stopped cleanly. Moving the live job to Intel
  did not establish a fix for the failure already observed on ARM.
- Production signing/upload jobs were skipped because live tests failed.
  No successful store capture, iPad/large-iPhone capture or archive was produced.
  Retained failed-test images are diagnostic evidence, not approved store assets.

The complete iOS suite has twenty minutes inside a fifty-minute job. Individual
assertions, eight-minute device captures and mandatory signing dependencies
remain enforced. Do not resize failed-test screenshots, reopen a lost sheet or
weaken the live map checks to satisfy a store requirement.

The production live job uses explicit `macos-15-intel`; internal checks and
signing jobs remain on macOS 26 ARM. The host comparison retained pinned
Xcode 26.3 and iOS 26.2; neither host has passed the required live suite.
The main test selects the actual iPhone 17 type for a medium Dynamic Island
capture; separate large-iPhone and 13-inch iPad checks remain required. This
differs from the preceding iPhone 16 and is not an identical hardware comparison.
The runtime and model pins must fail
instead of silently selecting a newer OS. Supported inventory and compatibility:
[mobile workflow](https://github.com/robertovalerirv-beep/dove-bevo/blob/bbc6aa21709904ea001160a36a2f8b0792ab5cbc/.github/workflows/mobile-apps.yml),
[Apple Xcode requirements](https://developer.apple.com/xcode/system-requirements),
[Apple Simulator Metal architecture](https://developer.apple.com/videos/play/wwdc2019/418/).

## Store preparation

- Google Play: app record, content rating and data-safety declarations saved;
  listing text, icon, feature graphic and four genuine screenshots are saved.
  The provider confirms **Ready to send for review** for the listing; the
  publishing overview still disables submission until the production release
  is completed. Internal testing has **2 of 3 steps**, with **Select testers**
  outstanding. Physical device testing and store submission remain open.
  Signed version 1.0.0, versionCode 10, was published to internal testing
  with Italian test notes. Google reports no selected testers and no
  deobfuscation file; this build deliberately has minification disabled. The
  last saved release read-back is **Available to internal testers / Released / Not
  reviewed**, while the track summary remains **Inactive** with no selected
  testers. A saved provider screenshot records this distinction. No tester
  invitations were sent; no Play-delivered installation or public availability
  is established.
  Production availability is saved for 178 countries/regions pending review;
  the production track remains inactive.
- App Store Connect: app record, published privacy label, free pricing and
  mobile distribution settings saved. Digital Services Act trader status is
  **Active in 27 countries**, verified on 28 October. Retained evidence is
  `test-evidence/store-readback-20261028/apple-trader-active.jpg`.
  Fresh TestFlight read-back says **Submit a build to start testing**. A
  processed signed build, valid screenshots, device testing and submission
  remain outstanding.

The app privacy and deletion pages are publicly readable on the preserved
`codex/mobile-store-disclosures-20261026` branch. Roberto Valeri is the service's
current responsible person; support remains `dovebevo@gmail.com`.

## Current local verification

The integrated Android source passed all **28 unit tests**, including the three
Android-dependent back-navigation cases, debug lint, debug APK and release
bundle compilation on Windows with the official Android SDK and JDK. This
build result does not establish a signed production upload or store approval.

Signed build 14 passed Milano search and selection, live map tiles/markers,
existing venue details, native back navigation, the system share chooser with
the public website URL, cold restart, offline privacy and network-restored
reload on the owned emulator. Directions opened Google Maps; return navigation
was not established. Nearby permission denial and approximate permission were
exercised, but a successful location result was not established. No public
contributions were created and no shares were sent. The four original store
captures and hashes are retained in `store-assets/android-screenshots/`.

The emulator runs headlessly; the user's desktop mouse, keyboard and personal
iPhone remain available. SDK automation operates only this owned virtual
device. The installed upload-certificate APK is distinct from a Google Play
App Signing installation and is not a physical-phone test.

The app now explicitly protects public submissions on devices reporting the
documented Firebase Test Lab flag. Its transparent native banner, local method
interception and external-action restrictions are documented in
`android/TEST_LAB_SAFETY.md`. Independent review and pure policy tests passed;
the two isolated real WebView/service-worker runtime cases also passed on API
36 with Google's WebView provider. Read-only page and worker POSTs returned
local 403 responses and reached zero local submission sinks; the normal-mode
negative controls returned 200 and reached one local sink each. Safe GETs
returned 200 and both fixture workers unregistered. All fixture traffic used
a reserved `.invalid` origin and in-memory responses. This verifies the tested
callback paths, not a general network firewall or every review environment. The
known automatic Play pre-launch crawl is why the older unguarded bundle has
not been promoted to production.

Apple's Xcode 26.3 and the pinned Xcode 27.1 internal trial both imported the
existing identity successfully and passed the unit checks, but archive creation
failed to find the selected provisioning profile. One replacement App Store
profile has now been created using the same certificate and bundle, preserving
the original active profile. Both CMS layers verified to official Apple roots;
the DER and XML metadata/entitlements agree and the certificate digest matches.
This verification does not include a revocation check. Only the verified
profile secret was updated. Exact Apple-supplied UUID casing is now preserved
in signing pins, installed filenames and export mapping; 77 iOS script guards
and 26 profile-planner tests pass. A successful iOS archive is not yet
established.

## Internal build evidence

The separate internal-testing path has run for real-phone preparation. It
requires fresh unit tests, lint/build checks and signing guards. Its requested
iOS export is TestFlight Internal Only; no iOS export has succeeded yet. Android
bundles are uploaded only to the Play internal track. The path does not submit
a production release or invite testers automatically. Both tag families use
the same workflow's increasing build counter; never rerun an accepted upload.

`mobile-testing/v1.0.0-internal.1` at
`cc0f55b5ee062e741b6de21ed6ac933444d27b6c` ran as
[40434038741](https://github.com/robertovalerirv-beep/dove-bevo/actions/runs/40434038741):

- Check jobs passed: exactly ten Swift unit tests, twenty Android unit tests,
  lint and unsigned compilation. No live UI tests were selected in this path.
- Android signing, strict hosted JAR verification and cleanup passed. Retained
  AAB SHA-256 is `6cb25f63686106f06072be0bfde009c1260a7c9435eb6d8aee99662433226452`.
  Independent local CMS verification and all 132 payload digests passed; the
  public signer matches the approved upload certificate.
- iOS stopped at `security import`, before archive, export or upload. Its P12
  opens with the approved password in OpenSSL, but that does not establish
  compatibility with Apple's importer. The original failure remains
  unclassified because diagnostic output was suppressed. The reviewed
  source captures private stderr and emits only fixed, bounded classifications;
  import arguments, encryption, access restrictions and failure gates remain
  unchanged.

## Completed import diagnostics

`mobile-testing/v1.0.0-internal.2` at
`bdcdb89573120db2dadac7d96989ec22c468f362` ran the safe import diagnostics in
[40436490550](https://github.com/robertovalerirv-beep/dove-bevo/actions/runs/40436490550).
Both check jobs passed again. Its iOS signing step reports the fixed catalog
classification `pkcs12-verification-failed`, OSStatus `-25264`, before archive or
upload. This does not establish an incorrect password or a general lack of
modern PKCS12 support. A separate container has been privately verified with
the same certificate, key, password and empty additional chain; AES256 remains
selected for both encrypted bags and only the container MAC uses SHA1. Original
signing inputs were preserved.

`mobile-testing/v1.0.0-internal.3` at
`b675e82f39f8e51ee06285ebdb4442bebe6a0d5f` tested that AES256/SHA1-MAC container in
[40438320128](https://github.com/robertovalerirv-beep/dove-bevo/actions/runs/40438320128),
which completed with failure. Its 54 signing guards, ten Swift unit tests,
twenty Android unit tests, lint and compilation checks passed; zero iOS UI tests
were selected. Android signing passed. On the macOS 26 signing host, Apple's
importer returned fixed catalog classification `import-format-unknown`,
OSStatus `-25257`, before archive, export or upload. The original certificate,
key and password were not changed.

## Signing retries

A separate encrypted 3DES compatibility container was privately verified against
the same certificate, key and password. The original container and the AES trial
are retained in the secure signing store. Only the existing
`DOVEBEVO_IOS_CERTIFICATE_BASE64` repository secret was updated; the password,
profile, API key and Android identity are unchanged.

`mobile-testing/v1.0.0-internal.4` identifies merged source
`bbc6aa21709904ea001160a36a2f8b0792ab5cbc` and
[workflow run 40664068073](https://github.com/robertovalerirv-beep/dove-bevo/actions/runs/40664068073)
(build number 14). Apple imported the 3DES container and selected the matching
valid distribution identity. Archive then failed because Xcode could not find
the pinned profile UUID for the approved team. No IPA was exported or uploaded.

`mobile-testing/v1.0.0-internal.5` at
`5ab25c23486f39c358877973aae79e58421a583f` ran as
[40668057999](https://github.com/robertovalerirv-beep/dove-bevo/actions/runs/40668057999).
The pure guard suite stopped on a test fixture that assumed a OneDrive checkout,
before native unit tests or signing. The portable fixture fix is
`13848c75146ef12e367be77dd751c8ce7de62e31`.

Internal.6 again passed Apple import and exact identity matching, but installing
the same validated profile in both current and legacy OS discovery locations
did not resolve Xcode's profile-not-found archive failure.

`mobile-testing/v1.0.0-internal.7` at
`05363cee0657f35490c046ea0290d4717a60878b` ran as
[40673414558](https://github.com/robertovalerirv-beep/dove-bevo/actions/runs/40673414558).
All check jobs passed. The upload-only authenticated manual-provisioning
download trial still failed archive with the same pinned profile-not-found
error. No signed IPA, upload or TestFlight build resulted. The team, certificate,
profile UUID and post-export validation gates remain pinned.

`mobile-testing/v1.0.0-internal.8` at
`e25cbd224a4439c6149a21df0636c5a936a8d545` is running as
[40675741220](https://github.com/robertovalerirv-beep/dove-bevo/actions/runs/40675741220).
Android checks passed; iOS unit tests are running. No final signing, archive or
upload result is available yet.

The secret publisher still defaults to `ios-distribution.p12`. The compatibility
container requires explicit `-IosCertificateFile ios-distribution-apple-3des.p12`
with `-IosCertificateOnly`; this selects only the existing iOS certificate secret.

## Local Android acceptance progress

A universal release APK, versionCode 14, was derived locally and verified with
the approved signer. Its SHA-256 is
`7e1324f830b9861a03d6d5888155fbee983194738e519c5f59dff2d5db8fab6b`.
It is installed on an account-free Android 16 / API 36 emulator
(`sdk_gphone64_x86_64`, `ranchu`), using WHPX acceleration and SwiftShader
graphics. No host security setting was changed.

The native rules, scrolling, Privacy before acceptance, decline/exit and return
to the rules on relaunch were observed. After the owner explicitly approved
adult terms acceptance for this test, the actual acceptance button was tapped.
The live website and initialized Italy map loaded without a Cloudflare challenge
on this local connection. Retained evidence is
`test-evidence/local-android-20261028/after-acceptance.png`.

The city-search sheet opens, but ordinary keyboard entry is being resolved.
No Milano result, city-map or venue check has passed yet; location and subsequent
navigation remain untested. Emulator evidence does not establish physical-device
behavior. Follow
[the acceptance checklist](PHYSICAL_TEST_CHECKLIST.md) and retain original
screenshots with their dimensions.

The owner's iPhone 16 Plus on iOS 27.0.1 remains in use until a signed TestFlight
build is ready. Phone Link cannot control its apps; no physical iPhone test has
been completed.

## Next release gate

Internal.8 tests whether the same validated signing identity is visible in the
configured user keychain search list. Its hosted result is unverified; it does
not establish that Xcode can discover the pinned profile.

Production remains gated on required live Android and iOS verification,
including successful genuine phone and iPad store screenshots. Run the required
Android and iOS tests against one reviewed source commit, including actual iPad
and large-iPhone screenshots. Then verify each provider's
processing result, complete the remaining store checks and submit for review.
An upload, successful processing and public store approval are separate states.
