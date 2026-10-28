# Native usability update candidate

This is a separate update after the submitted Android 20 and iOS 26 releases. Those original store submissions remain under review. This update has not replaced their binaries or been distributed through the stores.

## Implemented behaviour

- Both platforms: **Salva locale** and **Locali salvati** provide an explicit native venue-name form, local list, reopening and removal. Only an actual usable public venue page is eligible. The list holds up to 50 entries; it is readable offline, while live maps/prices still require a connection.
- Both platforms: the Reload action becomes **Interrompi** while a document loads, with retry/recovery after cancellation. It does not undo an already submitted website contribution.
- Android: history-aware Back/Forward controls, bounded trusted WebView history restoration, and user-triggered location help/App Settings. System Back still closes the app at history root.
- iOS: native error recovery excludes covered web content from accessibility and restores it after recovery. Stopped/superseded navigation callbacks do not replace the current recovery state in the verified cases.

Saved entries contain only the validated public venue link and the chosen name. They do not automatically capture browsing history, device coordinates, prices, cookies or tokens. iOS establishes backup exclusion before atomic file replacement; Android reports same-directory file write/rename errors. Both reject unreadable whole-file data without silently overwriting it. The bundled privacy policy describes local storage and platform backup/transfer limits.

## Verification

| Platform | Authoritative evidence | Result |
| --- | --- | --- |
| Android | Fresh integrated unit tests, lint and debug/application-test compilation at `4f2553ef6e59a6768adca07cb3ef325a3d9d50fc` | 40 units passed; zero lint errors and 24 existing warnings |
| Android | Installed integrated APK on the owned headless API 36 emulator; native usability plus local page/service-worker fence suites | 9 of 9 passed in 18.799 seconds |
| Android | Normal production shell and live website, outside instrumentation fixtures | Native saved venue lifecycle, navigation, location help and Reload passed; venue/history survived observed Activity recreation and process restart |
| iOS | [Quality run 40738410794](https://github.com/robertovalerirv-beep/dove-bevo/actions/runs/40738410794), exact source `6980dc4ee7333bef5978fa2afb23ea03964a4d6c` | 93 script guards, 29 Swift units and 4 phone UI tests passed, with zero test-case skips |
| iOS | Live website city/map flow followed by native save, navigation away, reopening, edited-name cancellation, removal of only the QA entry and positive map return | Passed on an owned fresh iPhone 17 simulator |
| iOS | Original artifact 12839287041, digest and archive safety checked before extraction | Original native saved-list and final live-map PNGs verified |

The final integrated source retains the exact tested iOS App, project, scripts, workflow and bundled privacy inputs. Changes to native code after that Mac check are Android-only. The Mac quality tag activates one credential-free test job; the eleven existing jobs, including every signer and store uploader, are skipped.

Original, unedited screenshots from the successful tests: [iOS saved venues](images/ios-saved-venues-native-test.png) and [Android saved venues](images/android-saved-venues-native-test.png). These show local QA entries that were removed after testing; they are not store-distribution evidence.

Android regressions were demonstrated before repair: an old stopped HTTP failure could replace usable content, and an old same-URL finish could end a replacement load before its start. Runtime checks also caught an early HTTP 500 callback being cleared by a later page-start callback. The repaired suite retains positive HTTP failure/retry coverage and unconditional SSL cancellation. Fixture-only corrections use an actual touch for history activation and real dialog event-loop boundaries.

The first Mac quality attempt failed to compile a test because a throwing expression was inside XCTest's nonthrowing assertion wrapper, making an outer catch unreachable. The narrow test-only correction retained malformed-data and disk-preservation checks; the next exact-source run passed. No passing result is inferred from the failed attempt.

## Remaining boundaries

Separate production Android QA observed the actual toolbar, native saved list and location-help/settings return without granting permissions. Changing font scale from 1.0 to 1.5 produced observed Activity destroy/create events; the venue and Back/Forward history survived. A settled background process kill changed the app PID and was followed by an actual MainActivity creation; venue, history and saved row survived. The font setting was restored to 1.0, only the QA saved row was removed, and the owned emulator was shut down afterward. At scale 1.5, Condividi/Ricarica wrap within their buttons while all actions remain visible. Fifteen original screenshots and 125 timestamped observations are retained in the selected project evidence folder. This covers the observed emulator/configuration, not every lifecycle or device variation.

The new iOS checks use a Debug phone simulator. This update has no new iPad, signed Release, physical-device or complete held-load/VoiceOver acceptance result. Identical-URL overlapping response attribution remains an API limitation. Generic unattributed jetsam metadata exists, so the result is not a claim of a crash-free system.

Before distributing this update, retain the existing review submissions, choose its store version/build deliberately, sign it, update any applicable public privacy-policy reference and verify the distributed installation. Public approval, availability and Roberto's invitation delivery remain separate provider outcomes. GitHub is canonical; OneDrive working-copy presence is not cloud-sync proof.

Implementation: [design](2026-10-28-mobile-usability-design.md), [plan](2026-10-28-mobile-usability-plan.md).
