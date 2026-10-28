# Mobile release status

Last verified: 28 October 2026 (UTC).

Neither mobile app has been submitted for store review or released publicly.
The last saved Google Play read-back marks Android build 10 available to internal
testers, with no selected testers and an inactive track summary. That provider
state has not yet been refreshed on 28 October; no installation is established.
No signed iOS binary has been uploaded.
Store setup and successful build steps are preparation, not a launch.

## Source and scope

Roberto's `robertovalerirv-beep/dove-bevo` repository is canonical. Verified owner
main is `abeac75353ad5c2b73f97ee33b98fb2040d79ff4`, seven owner commits beyond
the previous baseline. It was merged without conflict into mobile source
`bbc6aa21709904ea001160a36a2f8b0792ab5cbc`. Relative to that current main, the
mobile work is exactly 98 added files, confined to `mobile-apps/` and
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
  listing text, icon and feature graphic saved as a draft. Actual phone
  screenshots, completed device testing and submission remain outstanding.
  Signed version 1.0.0, versionCode 10, was published to internal testing
  with Italian test notes. Google reports no selected testers and no
  deobfuscation file; this build deliberately has minification disabled. The
  last saved release read-back is **Available to internal testers / Released / Not
  reviewed**, while the track summary remains **Inactive** with no selected
  testers. A saved provider screenshot records this distinction. No tester
  invitations were sent; no installation or public availability is claimed.
  Production availability is saved for 178 countries/regions pending review;
  the production track remains inactive.
- App Store Connect: app record, published privacy label, free pricing and
  mobile distribution settings saved. A processed signed build, valid device
  screenshots, remaining account verification and submission are outstanding.
- The account holder explicitly resumed Apple trader-contact verification on
  28 October. The current OTP step remains unverified. No automatic morning
  retry is scheduled; account verification remains a release requirement.

The app privacy and deletion pages are publicly readable on the preserved
`codex/mobile-store-disclosures-20261026` branch. Roberto Valeri is the service's
current responsible person; support remains `dovebevo@gmail.com`.

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

## Active internal retry and next release gate

A separate encrypted 3DES compatibility container was privately verified against
the same certificate, key and password. The original container and the AES trial
are retained in the secure signing store. Only the existing
`DOVEBEVO_IOS_CERTIFICATE_BASE64` repository secret was updated; the password,
profile, API key and Android identity are unchanged.

`mobile-testing/v1.0.0-internal.4` identifies merged source
`bbc6aa21709904ea001160a36a2f8b0792ab5cbc` and
[workflow run 40664068073](https://github.com/robertovalerirv-beep/dove-bevo/actions/runs/40664068073)
(build number 14). It is running with fresh checks. Apple import, archive, IPA
export, upload and provider processing have not yet been verified for this
container. A successful check job alone establishes none of those steps.

The secret publisher still defaults to `ios-distribution.p12`. The compatibility
container requires explicit `-IosCertificateFile ios-distribution-apple-3des.p12`
with `-IosCertificateOnly`; this selects only the existing iOS certificate secret.

Production remains gated on required live Android and iOS verification,
including successful genuine phone and iPad store screenshots. Run the required
Android and iOS tests against one reviewed source commit, including actual iPad
and large-iPhone screenshots. Then verify each provider's
processing result, complete the remaining store checks and submit for review.
An upload, successful processing and public store approval are separate states.
