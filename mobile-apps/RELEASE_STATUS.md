# Mobile release status

Last verified: 27 October 2026 (UTC).

Neither mobile app has been submitted for store review or released publicly.
Android build 10 has been published to the internal-testing track; Google marks
it available to internal testers. No testers are selected, so the track summary
remains inactive and no installation is established. No signed iOS binary has been uploaded.
Store setup and successful build steps are preparation, not a launch.

## Source and scope

Roberto's `robertovalerirv-beep/dove-bevo` repository is canonical. All mobile
changes are in `mobile-apps/` and `.github/workflows/mobile-apps.yml`; the existing
website, backend, schema and deployment remain unchanged. Local project work is
in the selected OneDrive workspace. Credentials and signing keys are excluded
from source and OneDrive.

## Last completed release candidate

`mobile-release/v1.0.0-rc.5` identifies source
`6672962bbb16d89712f55d70863c45bfb3a468eb` and
[workflow run 40431293096](https://github.com/robertovalerirv-beep/dove-bevo/actions/runs/40431293096).

- Android APK and unsigned bundle compilation, twenty unit tests, lint and
  runner guards passed. The API 36 emulator booted and displayed the native
  rules screen. Offline privacy, decline/relaunch, explicit acceptance and owned
  runtime cleanup passed. The live website wait failed because the WebView
  displayed Cloudflare's human-verification challenge. No search or live map
  check completed. This does not establish what normal users will experience,
  or justify altering the website's security configuration.
- iOS simulator compilation, ten unit tests and both native privacy/navigation
  UI tests passed. The live search opened the correct city field and first-run
  keyboard. The exact city field exists in post-tap accessibility evidence,
  then the native collector records `GPUProcessCrashedTooManyTimes` and renderer
  recovery. The city sheet is lost and the live assertion fails. This recurred
  on macOS 26.6.2 ARM with pinned Xcode 26.3/iOS 26.2 and an iPhone 17
  simulator; changing the host did not prevent it. Cleanup passed. The preceding
  candidate's linked graphics reports established SimMetalHost aborts and WebKit
  GPU Metal code 102; the underlying graphics assertion remains unavailable.
- Both signing/upload jobs were correctly skipped because live tests failed.
- The retained iPhone 17 images are 1206 by 2622 pixels, but are failed-test
  evidence, not approved store assets. No successful iPad or large-iPhone capture
  exists yet.

The complete iOS suite has twenty minutes inside a fifty-minute job. Individual
assertions, eight-minute device captures and mandatory signing dependencies
remain enforced. Do not resize failed-test screenshots, reopen a lost sheet or
weaken the live map checks to satisfy a store requirement.

The host comparison retained pinned Xcode 26.3 and iOS 26.2. Simulator Metal uses
the host graphics implementation; this was a test of the observed host abort
path, not an established crash fix.
The main test selects the actual iPhone 17 type for a medium Dynamic Island
capture; separate large-iPhone and 13-inch iPad checks remain required. This
differs from the preceding iPhone 16 and is not an identical hardware comparison.
The runtime and model pins must fail
instead of silently selecting a newer OS. Supported inventory and compatibility:
[GitHub runner](https://github.com/actions/runner-images/blob/main/images/macos/macos-26-arm64-Readme.md),
[Apple Xcode requirements](https://developer.apple.com/xcode/system-requirements),
[Apple Simulator Metal architecture](https://developer.apple.com/videos/play/wwdc2019/418/).

## Store preparation

- Google Play: app record, content rating and data-safety declarations saved;
  listing text, icon and feature graphic saved as a draft. Actual phone
  screenshots, completed device testing and submission remain outstanding.
  Signed version 1.0.0, versionCode 10, was published to internal testing
  with Italian test notes. Google reports no selected testers and no
  deobfuscation file; this build deliberately has minification disabled. The
  release read-back is **Available to internal testers / Released / Not
  reviewed**, while the track summary remains **Inactive** with no selected
  testers. A saved provider screenshot records this distinction. No tester
  invitations were sent; no installation or public availability is claimed.
  Production availability is saved for 178 countries/regions pending review;
  the production track remains inactive.
- App Store Connect: app record, published privacy label, free pricing and
  mobile distribution settings saved. A processed signed build, valid device
  screenshots, remaining account verification and submission are outstanding.
- Apple's trader-contact email verification is on hold until the account holder
  explicitly asks to resume. Do not resend email, start phone verification or
  schedule an automatic retry while that instruction is active.

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

## Next release gate

`mobile-testing/v1.0.0-internal.2` at
`bdcdb89573120db2dadac7d96989ec22c468f362` runs the safe import diagnostics in
[40436490550](https://github.com/robertovalerirv-beep/dove-bevo/actions/runs/40436490550).
Both check jobs passed again. Its iOS signing step reports the fixed catalog
classification `pkcs12-verification-failed`, OSStatus `-25264`, before archive or
upload. This does not establish an incorrect password or a general lack of
modern PKCS12 support. A separate container has been privately verified with
the same certificate, key, password and empty additional chain; AES256 remains
selected for both encrypted bags and only the container MAC uses SHA1. Original
signing inputs are preserved. Actual Apple import of this candidate remains
unverified.
`mobile-testing/v1.0.0-internal.3` at
`b675e82f39f8e51ee06285ebdb4442bebe6a0d5f` tests this candidate in
[40438320128](https://github.com/robertovalerirv-beep/dove-bevo/actions/runs/40438320128),
with fresh unit gates and the same macOS 26 signing host. Only the iOS
certificate-container secret was updated; the password, profile, API key and
Android identity are unchanged. A successful check job alone will not establish
import, archive, upload or provider processing.
The reviewed Intel host experiment, `mobile-release/v1.0.0-rc.6` at
`51ee5c2708f0528193622222e823793c5c23f569`, runs in
[40436740241](https://github.com/robertovalerirv-beep/dove-bevo/actions/runs/40436740241).
Only the production iOS native job changes to explicit `macos-15-intel`; its
toolchain, simulator pins, live assertions and dependent signing gates are
unchanged. This is an architecture/graphics experiment, not an established fix.
Internal check and signing jobs remain on macOS 26.

Production remains gated on required live Android and iOS verification,
including successful genuine phone and iPad store screenshots. Run the required
Android and iOS tests against one reviewed source commit, including actual iPad
and large-iPhone screenshots. Then verify each provider's
processing result, complete the remaining store checks and submit for review.
An upload, successful processing and public store approval are separate states.
