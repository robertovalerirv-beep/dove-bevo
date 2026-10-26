# Dove bevo Mobile Apps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking. The user's explicit swarm instruction overrides sequential-only implementation guidance: writers have disjoint file claims and worktrees; reviews remain independent.

**Goal:** Deliver tested native iOS/Android integrations and progress through verified beta/store release gates.

**Architecture:** Reuse the existing Preact UI in bundled Capacitor clients. Preserve web security through a separate, disabled-by-default preview mobile authentication path before any production migration or deployment. Prove native challenge/callback behavior before adopting a production transport.

**Tech Stack:** Existing Node 24/TypeScript/Preact/Vite/Hono/Cloudflare/D1 plus pinned Capacitor 8 packages documented in the design.

**Spec:** `docs/superpowers/specs/2026-10-26-mobile-apps-design.md` and existing Phase 0 invariants in `docs/SPEC.md`.

## Global Constraints

- Device location stays on device. Explicit venue coordinates are existing user-supplied contribution data.
- No accounts, tracking, background location, ad SDK or first-launch onboarding.
- Preserve web Origin/SameSite/Turnstile controls, shared business quotas, OSM separation and Italian copy.
- Preview identity `com.dovebevo.app.preview`, callback `dovebevopreview://auth/callback`; production registration is a later gate.
- Code lifetime 120 seconds; mobile sessions 1,800 seconds; S256 verifier, nonce, one-use atomic redemption, environment/domain-separated tokens.
- New preview API defaults off; existing staging Worker serves the public site and is not an experiment sandbox.
- No credentials in source/logs/OneDrive; no production deploy, purchase, legal acceptance or access grant without its applicable gate.
- Parent alone integrates. Every writer owns a separate worktree and disjoint tracked paths. Read-only reviewers are independent.

## Review Focus

- Foreign-origin web requests and cross-token-type authentication must remain rejected (Task 1).
- Redirects, malformed callbacks and public resource requests must never leak a bearer (Task 3).
- Missing data version, offline startup and app suspension must not produce fixture/live-data confusion or false saved state (Tasks 2–3).
- Real devices may handle Turnstile and app links differently from browser/simulator tests (Tasks 4–5).
- Release artifacts must contain no debug identity, secret, admin UI, service worker or unnecessary permission (Tasks 2 and 5).

## Task 1: Disabled-by-default preview backend and auth protocol

**Owner paths:** `src/worker/**`, new migration only, `tests/worker/mobile*.test.ts`, `tests/unit/mobile-auth*.test.ts`. No client, package, workflow, shared-protocol or existing migration edits.

**Consumes:** types/constants in `src/shared/mobile.ts`; current business routers and D1 boundary in `src/worker/lib/db.ts`.

**Produces:** `/api/mobile/config`, `/api/mobile/authorize`, `/api/mobile/session`, `/api/mobile/events` and authenticated mobile price/report/venue aliases. Preview routes answer 404 unless `MOBILE_PREVIEW_ENABLED=true`. `authorize` accepts only exact same-origin hosted challenge submissions and validates real Turnstile hostname/action; native session/events/mutations require `X-Dovebevo-Native: 1` and reject foreign browser Origin. No CORS headers. Return existing structured API error shapes.

- [x] Write focused worker tests proving disabled gate, accepted authorization/redemption, invalid/replayed/verifier/nonce/audience/environment rejection and web-cookie/mobile-token separation. Demonstrate absent routes fail first.
- [x] Add a new migration for bounded hashed authorization codes. D1 access stays in `db.ts`; atomic consume, expiry, cleanup and storage failure are tested. Apply five authorizations/minute and 60/day using existing abuse-control primitives, 1,000 outstanding maximum, existing global burst protection. Do not log code/verifier/token.
- [x] Implement separate mobile token encoding/signature derivation and middleware. Keep all web/admin origin and cookie checks intact. Share existing business routers and quotas; canonical public reads remain unchanged.
- [x] Test mobile events without session/cookie/identifier; enforce existing closed event schema/body/rate limits. Token-bearing web/admin access and cookie-only mobile access fail.
- [x] Run focused Vitest worker/unit checks, typecheck and format/lint for owned paths. Commit only owned paths and report exact commands, counts, commits and unverified device boundaries.

## Task 2: Native build and platform projects

**Owner paths:** `package.json`, `package-lock.json`, `capacitor.config.ts`, `vite.native.config.ts`, `native/**`, `ios/**`, `android/**`, `scripts/native-*.mjs`, `tests/unit/native-build*.test.ts`, native-output ignore entries. Do not edit existing client/Worker/shared source or web build behavior.

**Consumes:** current web HTML/entry/assets and selected design. Root will integrate the native adapter entry later.

**Produces:** `npm run build:native`, `npm run native:sync`, generated preview platform projects with exact pinned Capacitor versions. Native build output `dist/native` has a root HTML and explicit CSP; excludes admin, Worker output, service worker/install behavior, secrets and fixture fallback. Default preview may use fixture only when explicitly labelled preview; a release guard refuses it.

- [x] Add meaningful tests for build configuration/release guard: fixture/missing data version, arbitrary backend URL and production `server.url` are rejected.
- [x] Pin reviewed Capacitor packages; generate official Android/iOS projects without executing unreviewed hooks or downloading unknown software. Use `com.dovebevo.app.preview` and visible Preview naming.
- [x] Add isolated native Vite config and cross-platform build/sync/check scripts. Keep normal web bundle unchanged and measure before/after JS gzip; archive size is not runtime size.
- [x] Register preview callback scheme; foreground location strings/permissions only, no background/AD_ID permission. Android target at least API 36. Account for current iOS lifecycle/privacy template. Use existing brand icons where valid.
- [x] Build and sync locally, run focused tests/typecheck/format; attempt an Android debug build only if required JDK/SDK are already present or official installation is suitable. Record a concrete missing-tool blocker rather than claiming a binary.
- [x] Commit only owned paths. Return exact package versions, footprint, build results, generated platform paths and blockers. No CI launch, cloud mutation, signing material or public upload from the worker.

## Task 3: Native client adapter and application integration

**Owner paths:** `src/app/**`, `tests/unit/native-client*.test.ts`, `tests/unit/mobile-transport*.test.ts`, `tests/e2e/native*.spec.ts`. No package/config/Worker/shared edits.

**Consumes:** protocol in `src/shared/mobile.ts` and Task 2's Capacitor packages; use local no-save dependency installation if needed without committing manifests. `import.meta.env.VITE_NATIVE` identifies the native build.

**Produces:** native-only platform/transport boundary, foreground location, validated callback handling, native share/navigation/back/lifecycle, and PWA/SW suppression. Web behavior stays unchanged. Public reads/events get no token; only exact mobile mutation paths receive it; redirects and arbitrary destinations fail closed.

- [x] Write tests for allowlisted URL construction, bearer exclusion on public/static/map/event requests, verifier/state/callback parsing, missing config/version and denied location. Demonstrate missing adapter behavior fails first.
- [x] Implement native HTTPS adapter and in-memory session state. Load `/api/mobile/config`, open the controlled challenge path, validate callback and redeem code; clear expired/cancelled state. Never persist/log tokens or coordinates.
- [x] Route existing data/search/session/mutation/event call sites through narrow adapters; no global fetch patch. Preserve canonical web APIs and public cache paths. Native first contribution fails visibly if the preview backend is not enabled; never silently falls back to web authentication.
- [x] Integrate one-shot native location, sharing/maps, Android back and lifecycle. Keep user-facing Italian text in `it.ts`; preserve manual fallback and acknowledged save/undo semantics. Isolate native imports from the ordinary web entry.
- [x] Add early native initialization, suppress SW and PWA hints, and add route handling needed for callbacks. Native admin is excluded/blocked. No contributor terms/age gate change until the actual pre-contribution design is tested without breaking the four-tap flow.
- [x] Run owned unit and affected web/e2e tests and formatting/typecheck; commit owned paths with a report distinguishing mocks from real-device evidence.

## Task 4: Coordinator integration, controlled challenge page and independent review

**Owner:** coordinator. Paths: shared contracts, mobile challenge page/entry, integration tests, docs/ADR/SPEC addendum/PROGRESS, final cross-lane fixes only after ownership transfer.

- [x] Review each worker diff independently for spec and correctness before integration; cherry-pick only their exact owned commits. Resolve contract mismatches explicitly.
- [x] Add a controlled hosted challenge page using existing Turnstile widget/action, S256 challenge/nonce and fixed preview callback. No arbitrary redirects or bearer in URLs. Italian copy remains centralized.
- [x] Add native scope/ADR and truthful progress; preserve frozen feature-list and migrations. Run fresh integrated lint, format, typecheck, web/unit/worker, native build/sync and affected Chromium/WebKit workflows at 390×844.
- [x] Review final assets/network surfaces and perform whole-branch independent security/spec/code review. Push one coherent PR after local gates; no manual routine workflow dispatch.

## Task 5: Isolated hosted proof, beta and release

- [ ] Provision an isolated preview Worker/D1/Turnstile host through the approved CI/owner route, after confirming available permissions. Never use the public staging database as disposable test data.
- [ ] Use a bounded standard macOS runner build when no Mac is available; validate iOS simulator launch and unsigned artifact contents. Keep secrets out of PR workflows and public artifacts.
- [ ] Prepare exact dedicated Apple/Google credential operations and their secure destination; request the required action-time access confirmation only when ready. Resolve repository environment administration without reusing another app's secrets.
- [ ] Verify real iPhone/Android challenge→callback→redeem→contribution, permissions, offline/lifecycle, failure and replay behavior. If the proof fails, revise transport before production work.
- [ ] Complete publishing-rights/controller/trader/support facts, UGC terms/moderation review and actual privacy/data-safety/permission audit; no invented declarations.
- [ ] Register verified production identities/associations; sign reviewed commits; upload TestFlight/Play beta and verify installed behavior. Proceed through owner-only/legal/security gates and store review, then verify public listings/installability.

## Task 6: Concrete moderation release corrections

- [x] Make every price/venue report actionable from the first report through protected admin review/removal/dismissal.
- [x] Keep pending venue names out of public cell APIs, old D1/edge cache bodies and other contributors’ selectors; preserve the proposer’s local acknowledgement.
- [x] Implement temporary contribution restrictions through membership checks against existing daily anti-abuse keys, with no new actor attribution or persistent identifier.
- [x] Independently review the restrictions, rerun combined source/browser gates and verify the changed admin interface in both themes.
- [ ] Reconcile privacy/store worksheets with the actual candidate and test the controls on the isolated service.

The first two corrections are recorded in ADR 0037 and deliberately replace the earlier pending-venue chooser exposure. ADR 0038 records the implemented temporary restrictions, bounded by existing marker retention and shared-network limitations; they cannot be described as durable person bans or store approval. Roberto Valeri is personally responsible for now and the support/content-report address remains dovebevo@gmail.com.

## Coordination ledger

Observed concurrency capacity is four including root. Initial implementation wave uses three independent writers in separate worktrees (backend, build/platform, client); later waves reallocate to independent review, macOS proof and release preparation. Root owns integration and the final verified handoff. Model choices follow task complexity; safety scoping is organizational, not capability-enforced. No unlimited-concurrency or hardened-swarm claim is made.
