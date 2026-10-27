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

`mobile-release/v1.0.0-rc.2` identifies source
`c8c456d6fca1888854b06b6430a1f1478db27fad` and
[workflow run 40421141558](https://github.com/robertovalerirv-beep/dove-bevo/actions/runs/40421141558).

- Android APK and unsigned bundle compilation, unit tests, lint and runner guards
  passed. AVD creation failed before an emulator or application could start.
- iOS simulator compilation, ten unit tests and two native UI tests passed.
  The required live city-search test failed because its search field did not
  appear. The recorded tap coordinates overlap the search button's frame in
  the later failure hierarchy; the cause remains unconfirmed.
- Both signing/upload jobs were correctly skipped because live tests failed.
- The retained iOS screenshots are 1178 by 2556 pixels. They are not accepted
  store assets, and no successful iPad or large-iPhone capture exists yet.

Subsequent diagnostic changes must pass fresh live tests before a release is
considered ready. Do not resize failed-test screenshots or weaken the live map
checks to satisfy a store requirement.

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
