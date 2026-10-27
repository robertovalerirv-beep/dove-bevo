# Mobile release status

Last verified: 27 October 2026 (UTC).

Neither mobile app has been submitted for store review or released publicly.
No signed production binary has been uploaded. Store setup and successful build
steps are preparation, not a launch.

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
  on macOS 26.6.2 ARM with pinned Xcode 26.3/iOS 26.2 and a real iPhone 17
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
  screenshots, signed bundle, testing and submission remain outstanding.
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

## Next release gate

An explicitly separate internal-testing path is being prepared for real-phone
checks on normal networks. It requires fresh unit tests, lint/build checks and
signing guards. Its iOS export is restricted to TestFlight Internal Only; Android
bundles are for the Play internal track. It does not submit a production release
or invite testers automatically. Both paths use the same workflow's increasing
build counter. This path has not run or uploaded a binary yet.

Production remains gated on required live Android and iOS verification,
including successful genuine phone and iPad store screenshots. Run the required
Android and iOS tests against one reviewed source commit, including actual iPad
and large-iPhone screenshots. Then verify each provider's
processing result, complete the remaining store checks and submit for review.
An upload, successful processing and public store approval are separate states.
