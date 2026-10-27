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

`mobile-release/v1.0.0-rc.4` identifies source
`6cad77ab511ecaa1ff9a0eedcfdccc27a80a2fa0` and
[workflow run 40427026872](https://github.com/robertovalerirv-beep/dove-bevo/actions/runs/40427026872).

- Android APK and unsigned bundle compilation, twenty unit tests, lint and
  runner guards passed. The API 36 emulator booted and displayed the native
  rules screen, confirming the preferences-location correction worked in this
  run. The decline/relaunch check timed out on the launcher and owned process
  group cleanup failed. Website navigation and acceptance persistence remain
  unverified. A reviewed correction now waits for the declined activity to
  leave the foreground before one relaunch, and for all tracked process-group
  members to exit within the existing cleanup deadlines; hosted verification is
  pending.
- iOS simulator compilation, ten unit tests and both native privacy/navigation
  UI tests passed. The live search opened the correct city field and first-run
  keyboard prompt. The retained app console then records repeated WebKit GPU
  crashes and `GPUProcessCrashedTooManyTimes`; renderer recovery discarded the
  city sheet before its Continue action could complete. Linked graphics crash
  reports record three SimMetalHost aborts in the host Metal argument encoder
  and WebKit GPU termination with Metal code 102 after its simulator host
  connection was interrupted. The underlying graphics assertion is unavailable.
  The suite finished normally with a failed assertion, and the bounded lifecycle
  collector confirmed cleanup.
- Both signing/upload jobs were correctly skipped because live tests failed.
- The retained iOS image is 1178 by 2556 pixels. It is not an accepted
  store asset, and no successful iPad or large-iPhone capture exists yet.

The complete iOS suite has twenty minutes inside a fifty-minute job. Individual
assertions, eight-minute device captures and mandatory signing dependencies
remain enforced. Do not resize failed-test screenshots, reopen a lost sheet or
weaken the live map checks to satisfy a store requirement.

The next candidate tests the supported ARM macOS 26 host while retaining pinned
Xcode 26.3 and iOS 26.2. Simulator Metal uses the host graphics implementation;
this is a test of the observed host abort path, not an established crash fix.
The runner may supply a different iPhone model, which will be reported rather
than treated as an identical hardware comparison. The runtime pin must fail
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

Diagnose and correct the emulator and live-search failures. Run the required
Android and iOS tests against one reviewed source commit, including actual iPad
and large-iPhone simulator screenshots. Only then sign and upload, verify each provider's
processing result, complete the remaining store checks and submit for review.
An upload, successful processing and public store approval are separate states.
