# Dove bevo iOS and Android apps

Status: implementation direction selected, 26 October 2026. The user selected reuse of the existing app with native phone integration and instructed autonomous execution with questions only when necessary. The coordinator owns the detailed choices below and the first bounded proof; release and credential gates remain in force.

## Outcome

Publish useful iOS and Android versions of Dove bevo for adults in Italy, preserving Roberto's existing Italian interface, map, price comparison and anonymous contribution behavior. Reuse the Preact application and Cloudflare backend. Add native location permission handling, venue sharing, external map navigation, Android back behavior and app lifecycle handling. The website remains a supported product.

Success requires installed, signed builds tested on both platforms, verified beta distribution, accurate store disclosures, store approval and public availability. Generating platform folders or uploading a binary alone does not meet that outcome.

## Verified starting state

- Source baseline: `60165157a9d92dec98febe3cd268ee8b7c4f3efe`. Preact/Vite/TypeScript, Hono/Workers/D1 and an installable PWA; no native projects.
- The connected GitHub account now has push access. It has no repository administration permission, so protected build-secret/environment configuration may require Roberto or a separately authorized release repository. Write permission alone does not prove secret-management access.
- Both organization developer accounts are enrolled and signed in. Apple API access is enabled. Dove bevo uses dedicated app records and credentials; existing applications stay outside this project's operational scope.
- Existing SPEC excludes native apps from Phase 0 and restricts dependencies. This design is a proposed mobile extension, not a claim that the Phase 0 specification already permits it. Do not edit the frozen feature-list entries or weaken existing tests.
- The current web release checklist still records production-environment and privacy-controller work. Those records are not a current Cloudflare attestation.

## Approaches

1. **Selected direction: package the existing interface with Capacitor.** Bundle reviewed client assets into iOS and Android binaries, add a small native adapter and an explicit mobile authentication path. This preserves the current product and tests while adding platform utility. The authentication integration is substantive and must be proved first.
2. **Separate React Native or Flutter interface.** Replaces the DOM/CSS UI and much of the map integration, creates a second product surface and increases maintenance. Not selected because the user chose reuse.
3. **Hosted website wrapper.** Preserves the website origin but depends on remote UI and is a weaker app experience. Capacitor documents `server.url` for development/live reload; it will not be the production design. Android TWA alone also does not cover iOS.

## Product boundaries

Preserve browsing without registration or first-launch onboarding, anonymous numeric prices, moderated missing-venue suggestions, Italian copy, the design system, accessibility, OSM attribution and separation of OSM data from prices. Keep the five-second undo behavior and display success only after a write is acknowledged.

Request location only after a relevant user action and only in the foreground. Keep device location coordinates on the device and retain manual city/map search after denial. A user's explicitly submitted missing-venue coordinates are a separate, existing contribution payload. Do not introduce tracking, advertising SDKs, background location, payments, profiles, messaging or a social feed. Existing sponsored venue presentation remains truthful; store ads declarations need a separate review of its actual behavior.

Before a user's first contribution, add a compact explicit acceptance of the contribution rules. It is not a browsing gate. Google requires terms acceptance before UGC creation; the moderation design must remain proportionate to structured prices and venue suggestions. Anonymous report/block-user policy applicability needs review before submission; do not invent an exemption or introduce user profiles without a new product decision. No blanket age-screen requirement has been established for numeric prices; the incidental-sexual-content policy is not a reason to add one.

## Client structure

- Keep the current web entry/build and same-origin transport unchanged.
- Add a separate native client build with a root `index.html`, bundled map styles/fonts/icons and a native-specific platform adapter. Exclude Worker output, admin UI, service workers and PWA install prompts. No production remote-code shell, arbitrary navigation allowlist, cleartext traffic or secret in assets.
- Centralize API, static-data and event URLs. Only the configured HTTPS Dove bevo backend and existing required map/challenge endpoints are allowed. Do not globally monkey-patch `fetch` or assume relative `sendBeacon` works in a native shell.
- Public data, canonical public read APIs, maps, challenge pages and anonymous events receive neither the mobile bearer nor web cookies. Keep price reads on `/api/prices/:cell` so existing cache invalidation remains correct. Attach a bearer only to an exact allowlist of mobile mutation paths and reject redirects for credentialed requests. Deliver native events to a dedicated unauthenticated `/api/mobile/events` handler sharing the existing closed schema, small body limit and identifier-free aggregate counters; it is never a session-authenticated telemetry channel.
- Supply a native CSP equivalent to the web policy, allowing only necessary hosts. Worker response headers do not protect local HTML.
- Native builds must obtain and validate the active static-data version from a reviewed backend manifest or a build-pinned retained version. Never release a build that silently uses `fixture`; fail closed with a useful retry state when the version is missing.
- Use platform adapters at `locate.ts`, API/session delivery, external navigation, share and lifecycle boundaries. Validate incoming venue links through the existing route parser. Android back closes the top overlay before navigating; exiting requires being at the root view. Location and navigation failures have manual fallbacks.
- A bundled shell can open without network, but nationwide offline venue/map data is outside this release. Clearly indicate unavailable data and retry after reconnection; do not imply cached stale prices are live.

## Authentication and network boundary

The current `requireOrigin` rejects foreign-origin POSTs, and the web session is a signed 30-minute Secure/HttpOnly/SameSite=Strict cookie. A native local origin cannot use the existing browser flow unchanged. Preserve those web protections; no wildcard CORS or skipped Turnstile checks. Replace the blanket origin-middleware registration only with an explicit routing split: the reviewed `/api/mobile/*` namespace gets its own authentication/origin rules, and every other web/admin API keeps the current origin checks. Preserve real-secret validation, rate limiting and business-handler quotas on mobile writes. Similar names, unrecognized paths or encoded path tricks do not inherit a mobile exemption.

Proposed native flow, subject to the first technical proof:

1. The app creates a random verifier and nonce in memory. A controlled HTTPS challenge page on the project's staging/production domain receives only a challenge derived from the verifier, never device coordinates or signing secrets.
2. The hosted page completes Turnstile using a stable WebView/browser environment. The server checks the exact hostname, action and challenge binding. Successful verification produces a short-lived one-use authorization code bound to the verifier challenge and intended mobile client.
3. The native app receives the callback through a validated HTTPS app/universal link. Use S256 verifier challenges and exact preconfigured client/callback/environment pairs; never accept arbitrary caller-supplied callback URLs. Validate scheme, host, path, nonce and active pending flow. Public client IDs and app links provide routing and audience boundaries, not proof of an authentic installed binary. Do not transmit a reusable session bearer in a URL. Cancelled, unexpected, duplicate and expired callbacks fail closed.
4. A native HTTPS transport redeems the authorization code with the verifier. Codes expire after 120 seconds. Redemption is an atomic conditional consume, never a read-then-delete sequence. The proposed additional D1 migration stores only hashed code/challenge material, fixed audience/callback/environment binding and expiry; no device ID, raw IP or location. Do not modify an existing migration. Reuse existing day-salted IP-HMAC rate controls without linking their keys to contribution rows. Start with at most five authorizations per minute and 60 per day per existing abuse-control key, retain the global write burst protection and cap outstanding codes at 1,000 per environment. Reject new issuance when the cap or storage boundary fails. Delete consumed codes immediately, purge expired codes before new issuance, and extend the existing hourly cleanup to remove expired entries. Test cleanup, concurrent redemption and unavailable storage; no token is issued on a storage failure. Physical deletion depends on healthy scheduled execution; report a missed cleanup rather than claiming automatic expiry erased bytes.
5. The server returns a versioned, cryptographically domain-separated mobile token expiring within 30 minutes, bound to the exact environment and mobile audience. Use a distinct mobile encoding/signing derivation so the web cookie validator cannot accept it, even if an audience check is accidentally omitted elsewhere. Keep it in memory, never logs, URLs, browser storage or backups. A restart may require a new challenge. Mobile mutation routes require the bearer and reject ambient web cookies; web/admin routes do not accept mobile tokens. Negative tests cover both token types, environments and route families.
6. Reuse validated business handlers, payload limits, rate controls, deduplication and error shapes behind separate mobile authentication middleware. Preserve the rule that no session/IP identifier is stored with a contribution. Reads and writes use an exact HTTPS destination allowlist. The native bridge must never be available to arbitrary external web content.

The first implementation slice is an explicitly labelled prototype using isolated preview resources, test credentials and fixture data. The current configuration maps the public domain to the staging Worker; it is not a disposable mobile sandbox. Do not apply the prototype migration to that Worker/D1 or merge prototype routes into its live deployment. Prepare a separate controlled HTTPS preview domain/Worker/D1 and Turnstile configuration through the approved CI/owner route before remote proof. Until that provisioned route exists, only local/simulator checks are possible and real challenge proof remains blocked. It must prove challenge completion, callback binding, token redemption and a single acknowledged contribution on iOS and Android before production API/schema work is finalized. If that proof fails, stop for a revised transport design; do not fall back to weakening the website protections. A simulator test alone does not establish physical-device behavior.

## Dependency proposal and budgets

The initial platform identity is explicitly `com.dovebevo.app.preview`, labelled Dove bevo Preview. Its development callback is `dovebevopreview://auth/callback`, bound to S256 PKCE and a nonce. This callback is a preview-only exception for testing before verified domain association exists; it is not app authenticity. Production retains validated HTTPS app/universal links. Both new server routes and mobile publishing must fail closed outside explicitly enabled preview configuration. No public-site deployment or production identity registration follows from a passing local prototype.

Use Node 24 or newer, as required by this repository. Pin exact stable versions in the lockfile after approval. Keep imports isolated so the normal web bundle does not gain a native bridge.

| Proposed direct package  | Version | Purpose                                                                 | Compressed npm archive bytes |
| ------------------------ | ------- | ----------------------------------------------------------------------- | ---------------------------: |
| `@capacitor/core`        | 8.5.3   | Native bridge and HTTPS transport                                       |                       71,282 |
| `@capacitor/cli`         | 8.5.3   | Development-only platform generation/sync                               |                      612,592 |
| `@capacitor/ios`         | 8.5.3   | iOS project/runtime                                                     |                       87,631 |
| `@capacitor/android`     | 8.5.3   | Android project/runtime                                                 |                       92,342 |
| `@capacitor/app`         | 8.1.2   | Lifecycle, validated app links and Android back                         |                       15,091 |
| `@capacitor/geolocation` | 8.2.4   | Foreground location and permission state                                |                       27,436 |
| `@capacitor/share`       | 8.0.3   | Native venue sharing                                                    |                       11,187 |
| `@capacitor/browser`     | 8.0.5   | Conditional, only if selected challenge/external browsing flow needs it |                       12,950 |

Archives were measured against official npm registry integrity, without installation or execution. Required direct archives total 917,561 bytes; adding Browser makes 930,511 bytes. These are compressed installation downloads, not shipped JavaScript gzip or native binary growth; transitive packages and SDKs are additional. Before retaining the first implementation slice, measure the before/after production JS gzip and Android/iOS artifact sizes, document the actual dependency impact and obtain any further approval required by SPEC 4.1. No additional third-party SDK is implicitly approved by this table.

## Build, signing and identity

- Proposed app name: Dove bevo; Italian default language; free; adult intended audience. Complete age-rating questionnaires from actual content, including alcohol references and UGC, rather than inventing a rating.
- Proposed bundle/application identifier: `com.dovebevo.app`, checked for availability before registration or first upload. The builder may select an available project-domain identifier if a collision is found, but must report that identity before irreversible store use.
- The requested release uses the signed-in organization accounts. Publishing metadata must distinguish the store publisher from Roberto, who is personally responsible for Dove bevo for now. Support remains dovebevo@gmail.com. Exact legal identity, trader information and final declarations must reflect verified facts.
- iOS uses the matching Capacitor lifecycle template, compatible Xcode/macOS and current App Store SDK requirements. Android uses the current Play target SDK, at least API 36 for the current phone-app requirement, with pinned compatible Gradle/JDK tooling. Reverify requirements before submission.
- Perform local checks first. If no Mac is available, one bounded standard GitHub macOS runner validation is the proposed necessary hosted build path. No larger runner or paid build subscription is authorized. Keep artifact retention short. This does not authorize a deploy or release before its gates.
- Use separate Dove bevo release credentials and app records. Apple team keys cover every app in the organization, so creation requires an explicit action-time access confirmation. Google service-account permissions should apply only to Dove bevo. Prefer workload federation when supported.
- Sign only reviewed release commits in a protected environment. Secrets never enter PR jobs, logs, public artifacts, source or this document. A collaborator with write access cannot be assumed able to configure repository secrets. Resolve the owner/admin step before signed builds.
- Configure Play App Signing and protect its separate upload key. First Play binary setup uses Console. Apple and Google verification, legal agreements and required security/access confirmations remain with the owner. Staging/production backend changes use the repository's approved CI/owner deployment route.

## Acceptance evidence and staged delivery

1. **Design:** owner-approved design, recorded native scope/ADR, dependency rationale and realistic budgets; frozen Phase 0 acceptance records preserved.
2. **Authentication proof:** both platforms complete the controlled challenge and contribution flow; replay, wrong nonce/verifier/hostname/action/audience, expired code/token and foreign web-origin requests are rejected. Prove atomic redemption and bounded transient-state cleanup.
3. **Native integration:** local checks and an Android build; macOS iOS simulator build/launch; no fixture fallback, admin surface, service worker/install prompt or secret in release assets. Confirm current web regressions remain green.
4. **Device validation:** signed installs on a real iPhone and Android phone. Check location granted/denied/approximate/disabled, maps/manual search, keyboard/safe areas, accessibility, validated cold/warm links, sharing, back navigation, network loss, resume and acknowledged/undone price writes without duplicates. On Android inspect the merged release manifest, min/target SDK and increasing versionCode; include only required foreground permissions, no background location or advertising ID. Test the oldest supported and current OS, any native-library 16 KB page compatibility, and a Play-generated install from the signed AAB.
5. **Store readiness:** accurate controller/trader/support data; UGC policy review; actual SDK/privacy-manifest/data-safety audit; screenshots, metadata and reviewer instructions. Do not answer no data collected without auditing WebView, Turnstile, map and abuse-prevention traffic.
6. **Beta:** TestFlight and Play internal testing uploads, provider read-back, installed testing and defect fixes.
7. **Launch:** required production environment approval, store review approval and verified public listings/installability. No claim of launch from a successful upload alone.

Independent reviewers inspect security-sensitive implementation and device evidence. The coordinator reruns fresh integrated checks after all edits. If a gate fails, record the concrete failure and the next owner; do not mark unrelated web milestone checks complete.

## Builder choices and unresolved owner facts

The builder owns file layout within these boundaries, small adapter interfaces, exact build commands and proportionate test fixtures. Revisit the transport only with evidence. The authentication proof, actual gzip/binary measurements, organization publishing rights, legal-controller data, signing-environment administration and physical-device testers remain unverified. Approval of this design authorizes planning and a bounded implementation proof; it is not approval to create credentials, accept contracts, weaken protections, purchase services or publish untested production builds.

## Primary references

- [Capacitor configuration](https://capacitorjs.com/docs/config), [environment](https://capacitorjs.com/docs/getting-started/environment-setup), [8.5 lifecycle](https://capacitorjs.com/docs/updating/8-5), [location](https://capacitorjs.com/docs/apis/geolocation).
- [Cloudflare mobile Turnstile](https://developers.cloudflare.com/turnstile/get-started/mobile-implementation/).
- [Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/), [Apple API access](https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-api/).
- [Google UGC](https://support.google.com/googleplay/android-developer/answer/9876937?hl=en), [target API](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en-EN), [data safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en).
- Official npm registry package metadata for the pinned dependency proposals.
