# Mobile usability and saved venues implementation plan

> **For agentic workers:** Use the code-work workflow task by task. Implementers own exclusive platform worktrees; an independent reviewer checks each frozen diff and the coordinator integrates and verifies the result.

**Goal:** Add useful local saved venues and improve native navigation/loading/recovery without changing the production website or submitted releases.

**Architecture:** Extend each platform's existing native WebView shell, use strict canonical website venue links, and persist the selected venue's existing name and link in app-private storage. Both implementations follow the shared design contract rather than sharing runtime or secret access.

**Tech stack:** Existing Java/Android SDK and Swift/UIKit/WebKit; no new dependencies.

**Spec:** `mobile-apps/docs/2026-10-28-mobile-usability-design.md`

## Global constraints

- Android 20 and iOS 26 review submissions remain intact.
- Only `mobile-apps/**` and `.github/workflows/mobile-apps.yml` may change; production website/backend/schema/deployment stay byte-identical to the starting tree.
- Native bookmarks: at most 50 records, automatic names bounded at 120 UTF-16 units, stored labels bounded at 120 Unicode scalars with legacy compatibility, exact canonical venue URL and identity contract in the design.
- Preserve existing URL, permission, adult-rules, no-public-write test guards and protected credential boundaries.
- No generic JavaScript bridge, page mutations, background location, added service endpoint or new dependency. The automatic-name revision allows only the fixed, bounded read of the current public venue heading/selection marker/URL described in the design.

## Review focus

- A malicious or corrupt stored URL cannot become an arbitrary internal/external navigation.
- Failed persistence cannot be reported as a successful save/removal or destroy previous records.
- Stop, late callbacks, recreation and history-root navigation remain understandable and recoverable.
- Large text and assistive navigation can reach native list/error/recovery controls without hidden covered content.
- Local saved links neither claim offline prices nor silently add location, browsing history or analytics collection.

## Task 1: Android native update

**Exclusive write paths:** `mobile-apps/android/**`.

- [x] Add focused unit tests for strict venue URL validation and saved-record identity, labels, corruption, duplicates, capacity and storage failure; demonstrate the missing feature before implementation where practical.
- [x] Add a small focused saved-venue policy/store instead of embedding parsing/storage logic in MainActivity.
- [x] Add native save/name/list/reopen/remove actions and empty/offline/storage-failure copy.
- [x] Add history-aware Forward/Back toolbar states, documented restoration before fallback loading, Stop/Reload state, and explicit location help/settings.
- [x] Add or extend owned-fixture instrumentation for saved venues, history/restoration and loading cancellation. Separate live production QA additionally observed actual Activity/process restoration. No real public submissions or test-only release bridge.
- [x] Run fresh affected unit tests, lint and debug build; freeze a commit for independent review.

## Task 2: iOS native update

**Exclusive write paths:** `mobile-apps/ios/**`.

- [x] Add Swift tests for strict venue URL validation and real saved-store persistence, invalid records, duplicates, capacity, labels and failure semantics.
- [x] Add a focused saved-venue model/store and native list controller with save/name/reopen/remove controls and accessibility identifiers.
- [x] Integrate More menu actions without crowding the toolbar or altering website history.
- [x] Implement Stop/Reload and explicit first-load-stop recovery; exclude covered web content from accessibility while native error recovery is visible and restore it after recovery.
- [x] Add meaningful UI checks for saved venues and navigation/cancellation using safe available seams. Retain existing live website checks and truthfully record any unavailable physical assistive-technology coverage.
- [x] Run locally available guards/syntax checks, then freeze a commit for independent review. The coordinator owns necessary hosted Mac execution after integration.

## Task 3: Integration and verification

**Coordinator write paths:** design/plan/update status/privacy documentation under `mobile-apps/`; shared test fixtures only when both platform owners agree on a seam. The independent reviewer stays read-only.

- [x] Independently review frozen platform patches, including negative URL/storage cases and stale callback risks; route fixes to their owners.
- [x] Integrate the platform commits into the dedicated update branch; inspect the complete literal scope diff against the submitted source.
- [x] Run fresh integrated Android unit/lint/build checks and all existing iOS script guards. Run hosted Mac checks on the frozen iOS inputs, then verify parity with the integrated source; avoid routine release/sign/upload runs.
- [x] Verify actual native flows with deterministic owned fixtures where available, retain screenshots/results, and keep physical-device gaps explicit.
- [x] Update app documentation/privacy wording if local saved data requires it, and verify no new server-collected fields or permission expansions.
- [x] Push the separate update branch to Roberto's canonical repository and attach any created PR; do not replace pending store submissions.

Canonical UOS continuity and separate backup/provider results are recorded after final source verification. The original public-launch objective remains open until store approval, availability and distributed installation are verified. See [verified update status](2026-10-28-native-update-status.md) for results and limits.

## Real-device feedback revision: automatic venue names

The initial tasks above produced build 31. The owner's subsequent explicit decision retains bookmarks but removes naming and rename forms: use the already displayed venue name automatically. Current correction tasks:

- [x] Implement one-action private bookmarks on both platforms, using the bounded public heading/URL/selection-marker reader and native generation checks.
- [x] Preserve previous valid stored records and test 120-unit imported names, ambiguity, hidden/overlaid sheets, stale callbacks, failures and the pre-route-commit identity gap. Fresh iOS unit/UI results passed as recorded below.
- [x] Independently review, integrate and run meaningful native runtime/UI checks without public test contributions. Android 47 units/12 runtime cases and independent normal live browsing passed; iOS 98 guards/35 Swift units/4 phone UI cases passed.
- [x] Sign and distribute corrected build 32, update the stable public policy wording and verify actual provider availability. Android internal testing is Active/Available; TestFlight reads Testing for both existing groups. Physical corrected-flow acceptance remains separate.
- [x] Keep short-card end-of-content behaviour separate from any demonstrated scrolling defect; do not change the website or apply an unproven native scroll workaround.
