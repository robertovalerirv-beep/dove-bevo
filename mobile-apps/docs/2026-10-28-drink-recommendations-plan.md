# Public drink recommendations implementation plan

> **For agentic workers:** Implement exclusive platform/service slices with the code-work workflow, then return frozen commits for independent review and root integration. Do not overwrite another lane.

**Goal:** Let app customers recommend and undo a thumbs-up for each venue/drink category and see shared totals.

**Architecture:** Add a narrow recommendation route and indexed persistent claims to the existing Worker/D1. Native clients use a separate anonymous installation identifier and validated current venue context; website UI and price confirmation remain unchanged.

**Tech stack:** Existing Hono/Zod/D1/Vitest, Java/Android and Swift/UIKit/URLSession. No new service, account, runtime dependency or secret is required.

**Spec:** [Frozen API, UI, privacy and safety contract](2026-10-28-drink-recommendations-design.md).

## Global constraints

- Owner approved apps-only shared voting; preserve all existing website UI and price/session/Origin behavior.
- App work stays in selected OneDrive folder and Roberto GitHub remains canonical.
- Count by canonical venue key and one of nine existing drink codes, independent of prices/happy hour.
- No copied browser credentials, raw identifiers at rest/logs, public test votes, fabricated prices, or one-human claims.
- Both methods use the exact frozen API shape and no-store response; native HTTP has bounded trust/input checks.
- Original public Android20/iOS26 reviews remain intact; main merge is a live backend deployment event.

## Review focus

- Stale venue or reordered network results cannot recommend a different venue or overwrite newer choice.
- Atomic duplicate/undo/concurrent behavior cannot double-count, go negative or remove another installation.
- Hidden/unknown/unapproved venues and unknown drink categories cannot collect recommendations.
- Read-only automated environments cannot bypass safety through new native HTTP.
- Network failures and unavailable counts cannot appear as successful votes or zero recommendations.

## Task 1: Shared backend

Owner: backend lane, separate branch from current owner main. Paths: new recommendation route/lib/types/migration/tests; narrowly scoped index/config registration only. Do not change app UI, existing routes or unrelated schema.

- [x] Add failing local worker/D1 tests for public reads, distinct installations, duplicate true/false, another installation's removal, same IP fairness, concurrency, invalid input, public visibility, quotas, no-store, and retained existing price state.
- [x] Implement frozen contract with shared catalog and existing venue resolver, purpose-separated per-pair HMAC and additive indexed persistence.
- [x] Keep existing global guards; apply native-route identity plus separate daily addition budgets, with no session-cookie bridge.
- [x] Prove migration compatibility, existing guard/price regressions, formatting/lint/type checks and no raw identity persisted.
- [x] Freeze backend commit for root/independent review and source-only PR preparation; root owns merge/deploy.

## Task 2: Android native UI and client

Owner: Android lane. Exclusive paths: mobile-apps/android/**.

- [x] Add native catalog/context/snapshot and installation identity storage; explicit validated HTTPS transport and read-only TestLab fence.
- [x] Add a visible venue-scoped thumbs-up entry and native nine-row recommendation UI with shared totals, own state, undo and honest loading/error/refresh behavior.
- [x] Add focused JVM and owned runtime tests for response trust, identity persistence, stale/delayed results, double taps, removal, accessibility and no mutation in restricted mode.
- [x] Preserve existing navigation/bookmark behavior and normal WebView credentials. Run affected units/lint/compilation; no production test writes.
- [x] Freeze commit for independent review. Root owns SDK execution, signing and distribution.

## Task 3: iOS native UI and client

Owner: iOS lane. Exclusive paths: mobile-apps/ios/**.

- [x] Add native catalog/context/snapshot and installation identity storage; bounded HTTPS URLSession transport with no redirects/browser cookies.
- [x] Capture validated current venue before presentation and add visible native thumbs-up entry plus nine-row accessible recommendation screen.
- [x] Implement authoritative counts/own state, undo, serialized writes/reconciliation, active-scene/generation cancellation and clear retry/offline behavior.
- [x] Add meaningful unit/controller/transport and safe UI checks through test-only injection seams, without a release fixture URL or public writes.
- [x] Run local guards/available checks and freeze commit. Root owns hosted Mac execution, signing and TestFlight assignment.

## Task 4: Root integration, privacy and delivery

- [x] Independently review each frozen slice, resolve contract/security issues with its owner, and integrate without touching existing website UI.
- [x] Update public/bundled privacy and app-specific docs for anonymous public recommendations and retention; verify current store-disclosure category fit.
- [x] Run fresh integrated backend and native gates; map requirements to actual evidence, preserve failures and exact source identity.
- [x] Create narrow additive backend PR; verify exact-head green checks before authorized main merge. Observe migration, deploy and public GET readback.
- [x] Produce one gated signed beta for both native apps, verify actual artifacts and provider availability, preserve public review builds.
- [x] Record source, failures, fresh checks, actual testing availability and the remaining physical/public-review boundary for handoff.

Canonical continuity and backup outcomes are verified separately through the journal-bound handoff, sealed publication receipt and derived-provider receipts; this app checklist does not attest a memory publication or cloud synchronization.
