# Native bottom navigation — candidate and verification status

29 October 2026 UTC. Signed source: **`c24c7be2a67039ac80385e809f5f68d0614307e4`** in Roberto's canonical `robertovalerirv-beep/dove-bevo` repository. [Build 41 / run 40952554881](https://github.com/robertovalerirv-beep/dove-bevo/actions/runs/40952554881), tag `mobile-beta/v1.0.0-bottom-navigation.4`, passed both platform checks and intended signers. Provider readback confirms Android **Available to internal testers** and iOS **Testing** for the existing owner and Roberto groups. Builds 37–39 failed and produced no signed release. Public release and physical acceptance of the changed controls remain unverified.

## Implemented navigation

- **Home, Mappa, Preferiti, Salva and Consigliati** share the bottom area. The short action labels retain full accessibility names **Salva nei preferiti** and **Drink consigliati**. Context actions remain visible and disabled without a usable open venue.
- **Condividi** and **Ricarica**, or **Interrompi** during loading, are in the top three-dot menu. Preferiti appears only in the bottom navigation. Native Back and Forward remain available in the header.
- Only **Mappa** and **Preferiti** are destinations. They retain the existing browser and native favourites screen. Home resets the same browser to the service home; Mappa resumes its retained state. Save and recommendations do not create blank destinations.
- A private save uses the venue's actual existing name automatically, confirms the result and keeps the current venue/map open. No naming form is introduced. Private bookmarks stay in this app installation, without account synchronization.
- Preferiti keeps the existing comparison of a selected drink across saved venues, with separate Normale and Happy hour bands, dates and confirmations. Missing prices remain explicit. Live prices require internet.
- **Drink consigliati** shows shared per-drink recommendation totals for the existing venue. These public totals are separate from private bookmarks and from adding or confirming a public price. Public price contributions retain Roberto's existing orange **Aggiungi un prezzo qui** flow.

Android's bottom controls reflow from their actual measured width, including resizing the existing bar, and deferred favourites restoration retains foreground safety. iOS uses explicit native buttons with full touch/accessibility bounds and adaptive rows. Mounted native geometry, icons, accessibility, narrow/large-text reflow and the phone navigation cases passed; original map, favourites and recommendation captures were inspected.

## Completed verification

| Check | Evidence and result |
| --- | --- |
| Android local JVM tests | **72 passed**, no failures or skips |
| Android lint and compilation | Lint **0 errors**; Debug app and instrumentation APKs built successfully |
| Owned Android API 36 runtime | **26 cases passed**, no failures or skips; installed app/test APK hashes matched the built artifacts |
| Android navigation visuals | Original normal/enlarged-text captures reviewed; font scale restored; owned headless emulator stopped |
| Android live browsing | Actual Milano city result, rendered map, existing venue and recorded beer price; actual-name save stayed on the venue; Preferiti reopened that same venue |
| Android recommendation browsing | Shared totals loaded through the native existing-venue read flow; no vote was tapped |
| Corrected iOS source/release guards | **111 passed** on the integrated source |
| iOS native/UI execution | **81 native tests and four phone UI cases passed**, zero failures; the live city/venue/history/bookmark/comparison/recommendation case took 309.727 seconds |
| Signed packages | Both intended signers succeeded after both platform checks; local packages, provider provenance, public signer identity and bundled policies independently verified |
| Testing availability | Android build 41 **Available to internal testers**; iOS 41 **Testing** in both existing groups |

Android application inputs remain those reviewed at `f30fa2bad5125c10ecfcc3014f23009e5cb9fe29`; the subsequent integrated fixes are iOS source, test and workflow changes. Root's evidence receipts are under the selected workspace's `test-evidence/bottom-navigation-20261029/`, including `android-runtime-verification.json`, `android-live-verification.json`, `android-live-shutdown.json`, original PNG/XML captures and `ios-corrected-central-guards.log`.

The live check removed only its own private test bookmark and verified an empty list afterwards. No test submitted public prices, venues, confirmations, reports or recommendation votes. Android evidence is from an owned headless emulator running a Debug build, with the user's desktop free; it is not a physical-phone or public-store installation check.

## Failed build 37 and corrected candidate

[Run 40938801279 / build 37](https://github.com/robertovalerirv-beep/dove-bevo/actions/runs/40938801279), source `32f98f8872c0bffa5a4a08da619e90b4c0283c82`, is retained as a failed gate. Android checks passed. iOS compiled, but **81 native tests reported three failed assertions**, and **four phone UI tests reported three failures**. The original standalone bottom bar was visibly clipped; native control measurement, the owned same-document history fixture and menu/UI behavior required correction. This was not solely a timeout.

Xcode printed **TEST FAILED** before the 18-minute workflow step timed out during its remaining result/cleanup path. Independent comparison with successful build 36 supported a bounded step increase to 22 minutes, retaining the 25-minute job and all test/signing dependencies. That timing adjustment does not waive any failed assertion.

Both build-37 signing jobs were skipped. Its checked artifact `12926358586` has retained ZIP SHA-256 `849b9221c472d048142fd48ae14f81784efae7d58c748145652f83168f9e8961`, with size, safe paths and CRC verification recorded in `ios37-checks-verification.json`. This is failed-test evidence, not a signed app.

[Build 38 / run 40944405886](https://github.com/robertovalerirv-beep/dove-bevo/actions/runs/40944405886), source `9a3e5cf79500ea3d53cc232cb899eaf6158dc05c`, also failed: 81 native tests reported nine assertion failures in two cases, and two of four UI cases failed. Privacy and favourites/Home/disabled-action UI checks passed, and the original images show the bar clipping repaired. Remaining defects included an unavailable Save symbol and duplicate accessibility title elements. The owned HTML history fixture still lacked native history items, and the menu-dismissal check did not complete. Neither intended signer ran. Verified artifact `12929037459` has ZIP SHA-256 `de4149ce1b67585cc7016bc6ad69c61e251b0fb984bc26a0ec25c30ed2c8d645`; original exported images and accessibility text are retained in `ios38-checks/`.

[Build 39 / run 40948425592](https://github.com/robertovalerirv-beep/dove-bevo/actions/runs/40948425592), source `fe8d1c9a8c378c97e07fe3022859141a8a193507`, passed geometry, icons, accessibility and three native-only UI cases, but its synthetic same-document history assertions and live city-input delivery failed. Both intended signers skipped. Artifact `12931716056`, ZIP SHA-256 `4de5e805183653832804ed3753520bbe8412c03ede7f935b8de88ece5a20b407`, is retained with original images and accessibility evidence.

The final test-only repair uses mounted, owned request-created documents for native Back/Forward and complements them with real user-created SPA history in the live venue test. City input uses one actual field tap, a visible usable keyboard and the unchanged exact Milano assertion. No production app code or website was changed by this last repair. Build 41 passed the complete native and live suite before signing.

## Build 41 signed evidence

- Android AAB SHA-256: `7ee3678043ebe5c398b495509a4f42dc74390d49a01d98a5736f5ded67a20d75`; provider artifact `12932233565`.
- iOS IPA SHA-256: `01d390cb56895f213b12a1a846d9abc1211746e81c98d12a798c24d2c83d9623`; provider artifact `12933263006`. Manifest records App Store scope, strict Mac signature verification and successful upload; Apple processing and group availability were then verified separately in the UI.
- Both packages contain privacy SHA-256 `c36fb4364c776426b08991349c5a2476d7f3b4054401075c0c5481667aa0c48f`, matching the existing public privacy URL. No new privacy declaration was accepted in this update.
- iOS check artifact `12932483908`, ZIP SHA-256 `88cef9df0d87e4a1d30e9f11fa5c2e100d8f1d54713ddb79cce304b1f6d56ba6`, has verified provider source/run metadata, size, CRC and safe extraction. Original PNGs include the live Milano map, actual Camparino name/recorded price and native recommendation totals.

Artifact source metadata is not an embedded binary source attestation. Upload success is separate from provider processing, tester assignment and public release. These limits remain recorded in the local verification receipts.

## App-only integration and separate PR checks

[Draft PR 78](https://github.com/robertovalerirv-beep/dove-bevo/pull/78) starts from Roberto's current main `efce9110348dfdaf129feece70daac57772c759c`. Only `mobile-apps/**` and the mobile workflow differ; the website, Worker, schema and owner security changes are preserved. The existing recommendation API remains wire-compatible. Four provenance JSON files were formatted with the pinned formatter; parsed values were unchanged.

Website CI run `40952557122` passed all five jobs, including Chromium/WebKit E2E and security checks. Separate mobile PR run 42 (`40952557161`) failed: Android compiled/tested successfully, but its real-site smoke reached Cloudflare human verification; the old Intel/Xcode 26 iOS job passed 81 native tests and the first UI case, then its 20-minute deadline interrupted the live-city case before the search tap. Neither failure is presented as a passing check. Original Android challenge evidence and the timed-out iOS log are retained. A narrow normal-PR host correction is independently reviewed; the Android real-site assertion and provider protections are unchanged.

## Distribution and remaining gates

The newest verified available beta is **41**, with [build 36](2026-10-28-favourites-comparison-status.md) and older records retained. Both iOS groups retain their existing tester, and Android retains its existing internal track/testers. Owner-group and Roberto-group **Testing**, and Android **Available to internal testers**, were read back after the updates.

The production submissions have now been replaced by the concrete verified candidate: Android **41 — Changes in review**, with managed publishing off, and iOS **1.0.0 (41) — Waiting for Review**, with automatic release selected. Google confirmed that sending the three changes would restart the review; the verified bundle, new description and four original Android screenshots were then submitted together. Apple version 26 was withdrawn by the developer, edited to build 41 with updated metadata and three original screenshots per required device size, and resubmitted as `4db2c63c-3a65-4b6d-be43-dccdf0635790`. The earlier Developer Rejected state described that owner-authorized withdrawal, not a rejection decision from Apple. Both final provider review states were read back. This is submission evidence, not approval or public availability.

Original iPad capture **43**, run `40955432655`, passed at the exact signed application source. Its actual 13-inch iPad live case passed in 345.411 seconds; the capture step took 17m40 and its original RGB PNGs are 2048×2732. Artifact `12934367430`, ZIP SHA-256 `5eaf88c5743a3904af216c3877483c0e105422eb93660a03d932bffa5563dfa3`, was checked for provider identity, size, hash, safe paths and CRC. All three phone and three iPad originals were independently inspected and copied byte-for-byte with provenance into their dated store-assets folders. They were uploaded to Apple's matching medium Dynamic Island and 13-inch iPad slots; old images remain in Asset Library. No extra iPhone capture or image resizing was needed.

Next owner: check the current store decisions and any review messages, complete the pending physical-iPhone acceptance of build 41, and verify public country/listing availability and store-delivered installation after approval. Keep PR78's source/check status honest: the independently reviewed normal-PR host correction preserves full native/phone tests and unsigned archiving, while production release tags retain both captures; its next hosted result remains separate from the successful signed build 41. Testing availability alone cannot establish public release.

Roberto's website interface, backend, schema, business plan and separately paused European importer remain unchanged by this navigation update. All source, worktrees, builds and retained project evidence stay under the selected OneDrive workspace. GitHub is canonical; local OneDrive presence is not verified cloud synchronization. Signing material and authentication remain outside source, OneDrive and memory.
