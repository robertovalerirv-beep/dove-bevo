# Mobile usability and saved venues implementation plan

> **For agentic workers:** Use the code-work workflow task by task. Implementers own exclusive platform worktrees; an independent reviewer checks each frozen diff and the coordinator integrates and verifies the result.

**Goal:** Add useful local saved venues and improve native navigation/loading/recovery without changing the production website or submitted releases.

**Architecture:** Extend each platform's existing native WebView shell, use strict canonical website venue links, and persist only user-selected labels and links in app-private storage. Both implementations follow the shared design contract rather than sharing runtime or secret access.

**Tech stack:** Existing Java/Android SDK and Swift/UIKit/WebKit; no new dependencies.

**Spec:** `mobile-apps/docs/2026-10-28-mobile-usability-design.md`

## Global constraints

- Android 20 and iOS 26 review submissions remain intact.
- Only `mobile-apps/**` may change; production website/backend/schema/deployment stay byte-identical to the starting tree.
- Native saved venues: at most 50 records, label limit 80 characters, exact canonical venue URL contract in the design.
- Preserve existing URL, permission, adult-rules, no-public-write test guards and protected credential boundaries.
- No generic JavaScript bridge, injected website code, background location, added service endpoint or new dependency.

## Review focus

- A malicious or corrupt stored URL cannot become an arbitrary internal/external navigation.
- Failed persistence cannot be reported as a successful save/removal or destroy previous records.
- Stop, late callbacks, recreation and history-root navigation remain understandable and recoverable.
- Large text and assistive navigation can reach native list/error/recovery controls without hidden covered content.
- Local saved links neither claim offline prices nor silently add location, browsing history or analytics collection.

## Task 1: Android native update

**Exclusive write paths:** `mobile-apps/android/**`.

- [ ] Add focused unit tests for strict venue URL validation and saved-record identity, labels, corruption, duplicates, capacity and storage failure; demonstrate the missing feature before implementation where practical.
- [ ] Add a small focused saved-venue policy/store instead of embedding parsing/storage logic in MainActivity.
- [ ] Add native save/name/list/reopen/remove actions and empty/offline/storage-failure copy.
- [ ] Add history-aware Forward/Back toolbar states, documented restoration before fallback loading, Stop/Reload state, and explicit location help/settings.
- [ ] Add or extend owned-fixture instrumentation for saved venues, history/recreation and loading cancellation. No real public submissions or test-only release bridge.
- [ ] Run fresh affected unit tests, lint and debug build; freeze a commit for independent review.

## Task 2: iOS native update

**Exclusive write paths:** `mobile-apps/ios/**`.

- [ ] Add Swift tests for strict venue URL validation and real saved-store persistence, invalid records, duplicates, capacity, labels and failure semantics.
- [ ] Add a focused saved-venue model/store and native list controller with save/name/reopen/remove controls and accessibility identifiers.
- [ ] Integrate More menu actions without crowding the toolbar or altering website history.
- [ ] Implement Stop/Reload and explicit first-load-stop recovery; exclude covered web content from accessibility while native error recovery is visible and restore it after recovery.
- [ ] Add meaningful UI checks for saved venues and navigation/cancellation using safe available seams. Retain existing live website checks and truthfully record any unavailable physical assistive-technology coverage.
- [ ] Run locally available guards/syntax checks, then freeze a commit for independent review. The coordinator owns necessary hosted Mac execution after integration.

## Task 3: Integration and verification

**Coordinator write paths:** design/plan/update status/privacy documentation under `mobile-apps/`; shared test fixtures only when both platform owners agree on a seam. The independent reviewer stays read-only.

- [ ] Independently review frozen platform patches, including negative URL/storage cases and stale callback risks; route fixes to their owners.
- [ ] Integrate only the two platform commits into the dedicated update branch; inspect the complete literal scope diff against the submitted source.
- [ ] Run fresh integrated Android unit/lint/build checks and all existing iOS script guards. Run the required exact-head hosted Mac checks once the candidate is review-ready; avoid routine release/sign/upload runs.
- [ ] Verify actual native flows with deterministic owned fixtures where available, retain screenshots/results, and keep physical-device gaps explicit.
- [ ] Update app documentation/privacy wording if local saved data requires it, and verify no new server-collected fields or permission expansions.
- [ ] Push the separate update branch to Roberto's canonical repository and attach any created PR; do not replace pending store submissions.
- [ ] Record one canonical UOS handoff and separate provider/mirror status after verified phases, retaining the original public-launch objective.
