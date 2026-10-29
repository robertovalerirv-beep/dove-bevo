# Native bottom navigation — candidate and verification status

29 October 2026 UTC. Corrected candidate source: **`fe8d1c9a8c378c97e07fe3022859141a8a193507`** in Roberto's canonical `robertovalerirv-beep/dove-bevo` repository. [Build 39 / run 40948425592](https://github.com/robertovalerirv-beep/dove-bevo/actions/runs/40948425592) is the pending native iOS/UI and signing gate. Builds 37 and 38 failed and produced no signed release. This record describes implemented source and the checks actually completed; it does not establish testing distribution or a public launch of this candidate.

## Implemented navigation

- **Home, Mappa, Preferiti, Salva and Consigliati** share the bottom area. The short action labels retain full accessibility names **Salva nei preferiti** and **Drink consigliati**. Context actions remain visible and disabled without a usable open venue.
- **Condividi** and **Ricarica**, or **Interrompi** during loading, are in the top three-dot menu. Preferiti appears only in the bottom navigation. Native Back and Forward remain available in the header.
- Only **Mappa** and **Preferiti** are destinations. They retain the existing browser and native favourites screen. Home resets the same browser to the service home; Mappa resumes its retained state. Save and recommendations do not create blank destinations.
- A private save uses the venue's actual existing name automatically, confirms the result and keeps the current venue/map open. No naming form is introduced. Private bookmarks stay in this app installation, without account synchronization.
- Preferiti keeps the existing comparison of a selected drink across saved venues, with separate Normale and Happy hour bands, dates and confirmations. Missing prices remain explicit. Live prices require internet.
- **Drink consigliati** shows shared per-drink recommendation totals for the existing venue. These public totals are separate from private bookmarks and from adding or confirming a public price. Public price contributions retain Roberto's existing orange **Aggiungi un prezzo qui** flow.

Android's bottom controls reflow from their actual measured width, including resizing the existing bar, and deferred favourites restoration retains foreground safety. The corrected iOS source uses explicit native buttons with full touch/accessibility bounds and adaptive rows instead of the clipped standalone tab bar observed in build 37. Its new runtime result remains pending.

## Completed verification

| Check | Evidence and result |
| --- | --- |
| Android local JVM tests | **72 passed**, no failures or skips |
| Android lint and compilation | Lint **0 errors**; Debug app and instrumentation APKs built successfully |
| Owned Android API 36 runtime | **26 cases passed**, no failures or skips; installed app/test APK hashes matched the built artifacts |
| Android navigation visuals | Original normal/enlarged-text captures reviewed; font scale restored; owned headless emulator stopped |
| Android live browsing | Actual Milano city result, rendered map, existing venue and recorded beer price; actual-name save stayed on the venue; Preferiti reopened that same venue |
| Android recommendation browsing | Shared totals loaded through the native existing-venue read flow; no vote was tapped |
| Corrected iOS source/release guards | **110 passed**; this is source/tooling verification, not Swift compilation or a passing phone UI run |
| Corrected iOS native/UI and signing | **Pending** in build 39; new signed artifacts and provider testing availability are not established |

Android application inputs remain those reviewed at `f30fa2bad5125c10ecfcc3014f23009e5cb9fe29`; the subsequent integrated fixes are iOS source, test and workflow changes. Root's evidence receipts are under the selected workspace's `test-evidence/bottom-navigation-20261029/`, including `android-runtime-verification.json`, `android-live-verification.json`, `android-live-shutdown.json`, original PNG/XML captures and `ios-corrected-central-guards.log`.

The live check removed only its own private test bookmark and verified an empty list afterwards. No test submitted public prices, venues, confirmations, reports or recommendation votes. Android evidence is from an owned headless emulator running a Debug build, with the user's desktop free; it is not a physical-phone or public-store installation check.

## Failed build 37 and corrected candidate

[Run 40938801279 / build 37](https://github.com/robertovalerirv-beep/dove-bevo/actions/runs/40938801279), source `32f98f8872c0bffa5a4a08da619e90b4c0283c82`, is retained as a failed gate. Android checks passed. iOS compiled, but **81 native tests reported three failed assertions**, and **four phone UI tests reported three failures**. The original standalone bottom bar was visibly clipped; native control measurement, the owned same-document history fixture and menu/UI behavior required correction. This was not solely a timeout.

Xcode printed **TEST FAILED** before the 18-minute workflow step timed out during its remaining result/cleanup path. Independent comparison with successful build 36 supported a bounded step increase to 22 minutes, retaining the 25-minute job and all test/signing dependencies. That timing adjustment does not waive any failed assertion.

Both build-37 signing jobs were skipped. Its checked artifact `12926358586` has retained ZIP SHA-256 `849b9221c472d048142fd48ae14f81784efae7d58c748145652f83168f9e8961`, with size, safe paths and CRC verification recorded in `ios37-checks-verification.json`. This is failed-test evidence, not a signed app.

[Build 38 / run 40944405886](https://github.com/robertovalerirv-beep/dove-bevo/actions/runs/40944405886), source `9a3e5cf79500ea3d53cc232cb899eaf6158dc05c`, also failed: 81 native tests reported nine assertion failures in two cases, and two of four UI cases failed. Privacy and favourites/Home/disabled-action UI checks passed, and the original images show the bar clipping repaired. Remaining defects included an unavailable Save symbol and duplicate accessibility title elements. The owned HTML history fixture still lacked native history items, and the menu-dismissal check did not complete. Neither intended signer ran. Verified artifact `12929037459` has ZIP SHA-256 `de4149ce1b67585cc7016bc6ad69c61e251b0fb984bc26a0ec25c30ed2c8d645`; original exported images and accessibility text are retained in `ios38-checks/`.

The next reviewed iOS patch uses the working bookmark symbol, exposes each full native button once, and leaves decorative title/image children out of accessibility. Its history test uses Apple's public `loadSimulatedRequest` API with an owned asset-free response and actual Back/Forward list assertions. The live menu check uses the existing Informazioni/Chiudi flow and still requires no Share presentation, retained map state and the single actual city-search tap. Coordinator source guards pass, but build 39 must demonstrate actual native/UI success before either signer can run.

## Distribution and remaining gates

The latest verified available beta remains [build 36](2026-10-28-favourites-comparison-status.md): Android **Available to internal testers**, and iOS **Testing** for the existing owner and Roberto groups. That earlier beta does not contain this new bottom layout.

The latest observed public states remain Android **20 — Changes in review**, with managed publishing off, and iOS **1.0.0 (26) — Waiting for Review**, with automatic release selected. The navigation task has not cancelled or replaced either public submission. Review state is time-sensitive and must be read again before any replacement or version update.

Next owner: the coordinator must read the complete build-39 result; inspect the actual signed packages, source/build provenance, signer and bundled policies; verify upload/processing and existing tester-group availability; and complete changed-control device acceptance. Updated original Android screenshots are prepared separately with provenance. A single isolated iPad capture is planned after a passing candidate, with the same app input tree and bounded 20-minute capture step/25-minute job. Public release then requires the current store review decision, public country/listing availability and a store-delivered installation. A source commit, green source guards, uploaded binary or testing track alone cannot establish those later states.

Roberto's website interface, backend, schema, business plan and separately paused European importer remain unchanged by this navigation update. All source, worktrees, builds and retained project evidence stay under the selected OneDrive workspace. GitHub is canonical; local OneDrive presence is not verified cloud synchronization. Signing material and authentication remain outside source, OneDrive and memory.
