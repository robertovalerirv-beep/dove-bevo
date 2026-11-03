# Independent Android internal candidate 100

The exact-main Android checks and a real hidden Android emulator flow passed
at `91cceda621bcf6af9ca1489039532ed1feb49a21`. The combined beta 271 iOS job
failed simulator fixtures and app launch, so neither platform was signed by
that combined run. The iOS failure must remain visible and its signing gate
must remain closed.

This separate, one-off Android workflow runs the full existing Android unit,
lint, unsigned compilation, signing guards and private-runtime checks before
the signing step receives the existing Android credentials. Its source tree
and release-script blob are pinned to the independently tested content.
It accepts only `mobile-android-feedback/20261103-build100-v1` in Roberto's
repository and produces a verified AAB artifact with version code 100.
The previous live Play version code is 72. No iOS credentials, TestFlight
upload, Play publisher or public store submission is present.

After independent review and green required checks, create the exact tag on
the reviewed canonical commit. Verify successful checks, signing certificate,
package `com.dovebevo.app`, version code 100 and artifact SHA-256 before using
the authenticated Play Console to upload it to the existing internal track.
Preserve production 72's ongoing review and existing testers. Read back the
internal release state before claiming tester availability. This artifact
does not establish a public Play Store release or physical-iPhone acceptance.

The combined beta workflow and all its cross-platform gates are unchanged.
