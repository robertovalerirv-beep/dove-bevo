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

`mobile-release/v1.0.0-rc.3` identifies source
`c83f9d864f1bfbeb3459cec6bb3058073df94a01` and
[workflow run 40425106605](https://github.com/robertovalerirv-beep/dove-bevo/actions/runs/40425106605).

- Android APK and unsigned bundle compilation, unit tests, lint and runner guards
  passed. AVD creation failed before an emulator or application could start.
  Verbose output identifies conflicting deprecated `ANDROID_SDK_HOME` and
  modern `ANDROID_USER_HOME` preferences locations.
- iOS simulator compilation, ten unit tests and the native privacy UI test
  passed according to the job log. The overall ten-minute test-step limit
  interrupted the live search log just after its field wait began. No completed
  field-assertion outcome is recorded. The result bundle is unfinished, so
  complete test results and diagnostic cleanup are unverified.
- Both signing/upload jobs were correctly skipped because live tests failed.
- The retained iOS image is 1178 by 2556 pixels. It is not an accepted
  store asset, and no successful iPad or large-iPhone capture exists yet.

The next candidate removes the conflicting legacy environment variable,
including inherited values, and gives the complete iOS suite twenty minutes
inside a fifty-minute job. Individual assertions, eight-minute device captures
and mandatory signing dependencies remain unchanged. These corrections require
fresh live verification. Do not resize failed-test screenshots or weaken the
live map checks to satisfy a store requirement.

## Store preparation

- Google Play: app record, content rating and data-safety declarations saved;
  listing text, icon and feature graphic saved as a draft. Actual phone
  screenshots, signed bundle, testing and submission remain outstanding.
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
