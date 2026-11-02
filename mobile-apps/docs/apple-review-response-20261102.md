# Apple 2.1 response preparation — 2 November 2026

Status: physical-device recording **pending**. No physical iPhone recording has been supplied or reviewed in this preparation. No attachment, metadata update, submission or release is claimed. Apple's generic Prevent Common Issues checklist is not evidence of a specific crash rejection.

The six numbered English notes are in `mobile-apps/store-assets/app-review-notes-20261102.txt` (2,943 characters, LF UTF-8; SHA-256 `5632cd392dcc18e507ebbb85947e16544d80752b183287fa13d625e6734ace3f`). They describe purpose/audience, access, contributions/safety, external services, regional differences, and business model/regulated services. They deliberately do not claim a recording is attached, consumer blocking exists, or that all proposed names remain private. Before use, compare all visible features against the final installed iPhone build; source readiness is not installed-build evidence.

## Physical iPhone recording, approximately two minutes

The owner records a real iPhone running the latest public iOS available on the recording date, after the intended build is ready. Windows Phone Link cannot operate iOS. A simulator, Android recording, compile log or screenshot does not satisfy this physical-device request.

Dated check, 2 November 2026: [Apple's release information](https://support.apple.com/en-sa/100100) lists iOS 27.2, released 26 October 2026. Verify Software Update again on the recording day and record the actual iPhone model, installed OS and app version/build. This device-evidence requirement does not change the known working Xcode 27.1 SDK configuration.

1. **0:00–0:15:** Begin on the iPhone Home Screen and immediately tap Dove Bevo to launch it. The recording must begin with launching the app, as Apple requested. Show the real startup/loading flow; do not begin in Settings, TestFlight or another app.
2. **0:15–0:35:** Continue in Dove Bevo. Show the rules/privacy and adult gate when available on a fresh install. Accept only if actually an adult. Deny optional location; search for a real supported city. Do not misrepresent a previously accepted gate as first launch.
3. **0:35–1:00:** Open a real venue and its actual prices. Show source/check-date wording and currency/serving size when present in this installed build. Save a favourite and show its comparison. Do not invent missing prices or force different servings into one comparison.
4. **1:00–1:20:** Open Scopri and explore a real supported area. Show recommendations and existing aggregate counts. Do not cast a made-up vote merely for demonstration.
5. **1:20–1:45:** Open price entry and the reporting form, show their controls, and cancel each before sending. If showing a venue proposal, cancel before publication. Do not create test prices, reports or venues on public services.
6. **1:45–2:00:** Show Privacy/support and optionally the native share sheet, then dismiss. Do not send an email or share to another person. Close with normal app navigation.

If the fresh-build flow takes longer, keep the recording honest rather than cutting out failures or fabricating a two-minute result. Preserve the original recording privately outside source control. Check that it contains no personal notifications, credentials or third-party personal data before attaching it in App Store Connect.

After the app demonstration, show the actual iPhone model and iOS version in Settings, or provide separate cropped screenshots. Show the installed app's actual version/build through its available version interface or TestFlight build details after the flow or in separate evidence. Avoid serial number, Apple ID and notifications. Record the actual values, not an expected build number; this evidence must not precede the app launch in the demonstration recording.

## UGC facts and limits

There are structured numeric prices, confirmations and aggregate category votes. Venue proposals contain limited free text and a location. Pending proposals are hidden from normal browsing but can be visible, marked unconfirmed, in the contribution venue picker. Name validation rejects controls/contact/link patterns; it is not a complete objectionable-language filter. Price/venue reporting and operator moderation exist; automatic review thresholds are not a promise of immediate removal or a response SLA.

There is no verified consumer user-block interface or durable abusive-user ban in this audited build. No accounts, public author profiles, direct messages, review text or photos does not establish an exemption from Guideline 1.2. Local content hiding would be a possible separate app-only improvement, not proof of contributor blocking. This preparation adds no such feature and makes no broader compliance guarantee.

## Bounded API preparation

Fixed app: `6827324444`. Fixed App Store version: `e01a5724-9314-4ed6-9353-abc5c4a21a07`. This is App Store review information, not TestFlight beta review information.

Default command, using only the already configured release credential environment:

```powershell
node scripts/mobile-apple-review.mjs <new-private-audit-receipt-path.json>
```

The tool reuses the existing P-256 `tokenFor` implementation. It uses only Apple's fixed HTTPS API origin, errors on redirects, limits each JSON response to 256 KiB with a 15-second request timeout, and never follows pagination or provider links. It verifies version → app, review detail → version and attachments → detail. Incomplete/paginated attachment lists fail closed. Audit requests sparse fields and excludes existing notes, contacts, credentials, upload operations and attachment filenames from receipts. A candidate video filename and `COMPLETE` are merely processing indicators; neither proves recording content, physical hardware or latest OS.

The shipped workflow is **audit-only** on the exact `mobile-apple-review-audit/20261102-v1` tag in `robertovalerirv-beep/dove-bevo`. It uses the existing three ASC secrets without adding an environment. It cannot call apply, upload a recording, change a build, resubmit or change review contacts. No workflow/tag/provider action was executed by this implementation lane.

The existing immutable v1 audit tag and receipt refer to their original revision and notes hash. This corrected draft leaves both untouched; no provider audit or metadata update of these corrected notes is claimed.

### Apply capability — unavailable until real manual evidence exists

No production evidence JSON ships in this change. The coordinator may create one only after receiving and viewing the actual physical recording, verifying its original bytes/hash, checking actual device/OS/build, verifying the latest public OS on that date, and uploading that same recording to this version's review attachments. This is explicit human attestation, **not cryptographic proof of physical provenance**. The API cannot independently establish those facts. No fabricated test fixture may be used as evidence.

Required JSON keys (no extra keys): `appId`, `versionId`, `notesSha256`, `attachmentId`, `fileName`, `fileSize` (positive integer bytes), `recordingSha256` (original video SHA-256), `deviceModel` (actual iPhone model), `osVersion` (actual numeric version), `appVersion`, `buildNumber`, `captureDate`, `latestOSVerifiedOn` (ISO calendar dates), `ownerAttested` and `reviewerViewed` (both true only after the real checks). All identities and notes hash must match the fixed values above. Capture cannot predate this preparation or be in the future; latest-OS verification cannot precede capture. Filename/byte length must exactly match the selected attachment, which must be `COMPLETE`. The current version/build relationships must match the evidence; the build must be valid and unexpired.

Only after these checks may the coordinator use:

```powershell
node scripts/mobile-apple-review.mjs <new-private-apply-receipt-path.json> --apply --evidence <reviewed-physical-evidence.json> --notes-sha 5632cd392dcc18e507ebbb85947e16544d80752b183287fa13d625e6734ace3f
```

This capability PATCHes only `notes` and `demoAccountRequired: false` on the verified review-detail ID, with the exact pinned notes bytes. It does not change contacts, demo credentials, attachments, build relationships or submission state. It reserves a new receipt path before making requests, does not overwrite receipts, and never retries a mutation. A lost/invalid PATCH response produces an **unknown outcome** receipt, requiring a separate read-back before any retry. A success receipt includes only allowed state, notes/evidence/recording hashes and attachment ID; no contacts, raw old notes, filename or token. Final notes must remain under 4,000 characters with no placeholders. Any notes edit requires a new reviewed hash and workflow/tag revision; existing v1 is read-only.

## Official references verified for this preparation

- [App Review Guidelines 2.1](https://developer.apple.com/app-store/review/guidelines/#app-completeness) and [1.2](https://developer.apple.com/app-store/review/guidelines/#user-generated-content): accurate complete review access, reporting/filtering/blocking/contact requirements. The current request should receive the requested demonstration and factual explanations, not an invented crash diagnosis.
- [Read version review detail](https://developer.apple.com/documentation/appstoreconnectapi/read_the_app_store_review_details_resource_information_of_an_app_store_version): `GET /v1/appStoreVersions/{id}/appStoreReviewDetail`.
- [List review attachments](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-appstorereviewdetails-_id_-appstorereviewattachments) and [attachment information](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-appstorereviewattachments-_id_): attachment metadata and processing state.
- [Uploading assets](https://developer.apple.com/documentation/appstoreconnectapi/uploading-assets-to-app-store-connect): upload completion and subsequent processing are distinct; inspect the processed asset and the real original recording.
- [Modify review detail](https://developer.apple.com/documentation/appstoreconnectapi/patch-v1-appstorereviewdetails-_id_): `PATCH /v1/appStoreReviewDetails/{id}`. No submission endpoint is used.
