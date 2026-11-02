# Exact-build TestFlight distribution, 2 November 2026

This operator prepares **Dove Bevo 1.0.0, iOS build 62**, app `6827324444`, bundle
`com.dovebevo.app`, for the two existing private testing audiences:

| Exact group name | Required type |
| --- | --- |
| Dove Bevo owner testing | Internal |
| Roberto feedback | External |

The historical group names are known; their live IDs and build 62's live ID must
come from a fresh read-only audit. There is no placeholder plan or “latest build”
selection. A beta upload, pending beta review, and successful distribution are
separate states. None establishes a public App Store launch or a real-phone test.

## Read-only first

The initial workflow accepts only
`mobile-beta-distribution-audit/20261102-v3` in
`robertovalerirv-beep/dove-bevo`. It has `contents: read`, pinned actions, no apply
step and no manual input. Its audit command is:

```sh
node scripts/mobile-beta-distribution.mjs "$OUTPUT_PATH" --plan-output "$PLAN_PATH"
```

Both paths are new files under the hosted runner's temporary directory. Only the
audit step receives the existing App Store Connect secrets. No private key is
written to a file. `tokenFor` from `mobile-store-status.mjs` generates a fresh
short-lived P-256 token for each request. Offline tests generate their own
ephemeral key and do not use the workflow credential.

The audit reads sparse build, app, pre-release version, beta detail, group,
build-membership and beta-review-submission fields. It never requests testers,
email addresses, contacts, existing review notes or public release settings. Its
receipt retains only the validated IDs, two known group names and distribution
state; provider error bodies and authentication headers are discarded.
When an audit fails, it additionally returns a fixed failure-stage name, bounded
request index and numeric HTTP status (or null). It never serializes a provider
message, URL, response body, contact or credential for diagnostics. The immutable
v1 audit stopped with a generic error on both attempts; v2 adds this diagnostic
boundary without changing distribution or identity checks.
The v2 audit isolated a `VERSION_IDENTITY` failure with HTTP 200. The v3 operator
independently reads the pre-release version's app-ID relationship, and requires
the exact parent app. An omitted nested relationship is accepted only with that
independent proof; an explicit contradictory nested relationship still fails.
The included version and platform checks remain mandatory.

The audit requires exactly one build numbered `62` for version `1.0.0`, platform
`IOS`, and verifies its parent app and bundle. It requires both exact group names,
the expected internal/external flags, and the same parent app. Missing, duplicate,
renamed or replacement groups fail closed. The external group must report
`publicLinkEnabled: false`; the operator never opens a public invitation link.

An actionable plan is emitted only when processing is `VALID`, the build is not
expired and its expiration is still in the future, export-compliance states allow
testing, and there is no rejected beta submission. Processing, missing or invalid
responses, pagination, unknown states and blocked states stop the operation. A
complete audit with `ready: false` is a failed distribution prerequisite, not a
successful release. If the exact build has not been uploaded yet, rerun a newly
reviewed audit after upload; do not substitute build 52 or another build.

## Future apply requires a reviewed, byte-pinned plan

The audit produces canonical UTF-8 JSON with LF newlines and a final newline. The
plan identifies the exact app, build ID, build number, version, two group IDs,
their names and types, and `submit_beta_review_if_needed: true`. The receipt
contains SHA-256 of these exact bytes. A future apply workflow must be a separate
reviewed change with its own exact trigger and fixed plan hash. This initial
workflow cannot apply a plan. Do not add a generic input accepting arbitrary
app IDs, group IDs or unreviewed hashes.

For an authorized operator environment, the guarded CLI is:

```sh
node scripts/mobile-beta-distribution.mjs "$NEW_RECEIPT_PATH" --apply --plan "$REVIEWED_PLAN_PATH" --approved-plan-sha "$REVIEWED_PLAN_SHA"
```

Local plan validation and hash comparison happen before credential access or any
network request. Noncanonical, duplicate-field, extra-field, wrong-app,
wrong-build, wrong-version or altered group plans are rejected. The receipt path
must be new. Before each mutation, the operator re-reads the build, parent app,
version, group identities, membership and review state.

Its only possible writes are:

1. Add build 62 to either exact existing group's `relationships/builds` when
   absent. The payload contains only that build ID; fresh membership must confirm
   the association.
2. Create one beta app review submission for that same build if it is
   `READY_FOR_BETA_SUBMISSION`, has no existing review submission, and is not
   already pending, approved or testing. The returned submission ID must be
   confirmed by a fresh filtered read.

Pending review (`WAITING_FOR_REVIEW` or `IN_REVIEW`, or corresponding external
build state), an approved submission, and approved/testing external states never
cause another submission. Already-linked groups are left alone. The receipt only
sets `owner_in_beta_testing` / `roberto_in_beta_testing` when the corresponding
fresh build state actually equals `IN_BETA_TESTING`; a completed operation may
still mean Roberto is waiting for Apple's beta review.

Completion also requires fresh final evidence of pending/approved beta review or
testing: either the external build state, or a validated pending/approved
submission for the same build. The operator retains the created or previously
validated submission ID, and a final submission-list proof must match that ID.
A `READY_FOR_BETA_SUBMISSION` final state with no matching submission is
incomplete even when the POST and its immediate read-back previously succeeded.
Only read-only reconciliation follows that uncertainty; no second POST is sent.

The tool does not create or invite testers, create groups, edit descriptions or
review metadata, select a public App Store build, change public version 1.0.0,
change privacy/trader settings, or submit/resubmit public App Store review.
Apple requires beta-review metadata to be complete before submission; if it is
missing, this narrow tool fails rather than modifying it.

## Recovery after an uncertain write

Each action is persisted and synced as `indeterminate` **before** its POST. It
changes to `confirmed_by_read_back` only after successful provider response and
read-back. The transport is fixed to Apple's HTTPS origin, rejects redirects,
limits each request to 20 seconds and response JSON to 256 KiB, and bounds total
requests. There are no automatic POST retries.
The bound is 42 requests: five six-GET inspections, three possible POSTs, three
immediate read-backs, and one six-GET reconciliation after failure. A successful
full three-write operation takes 36 requests; a final failure plus reconciliation
takes at most 42. Both paths have owned transport fixtures.

If a request times out, the response is lost, or read-back fails, all further
mutations stop. The tool attempts one read-only reconciliation and retains the
indeterminate action even when that read sees the expected change. Preserve the
receipt, audit the exact build and group state again, and review the result
before using a fresh plan and receipt. Never rerun blindly or delete the receipt
to bypass uncertainty. Failure to durably write a checkpoint prevents dispatch.

## Verification and primary contracts

Offline verification:

```sh
node --test scripts/tests/mobile-store-status.test.mjs scripts/tests/mobile-beta-distribution.test.mjs
node scripts/check-workflows.mjs
```

The fixtures exercise exact identities, mismatched parents, wrong hashes,
noncanonical plans, missing/duplicate groups, public-link refusal, expiry,
export-compliance blocks, pending review, idempotent membership, sparse receipts,
indeterminate writes and failed storage. They make no live Apple requests. A
fresh live audit and guarded execution read-back remain the release operator's
separate gates after build 62 uploads.

Apple's primary API contracts, checked 2 November 2026:

- [List builds](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-builds)
  and [read build](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-builds-_id_):
  build `version` is the build number; `preReleaseVersion` identifies version and
  platform.
- [List beta groups](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-betagroups):
  app/name/ID filters, internal flag and app relationship.
- [Get a pre-release version's app ID](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-prereleaseversions-_id_-relationships-app):
  an identifier-only GET verifies the pre-release version's parent app even when
  the compound build document omits nested linkage.
- [Add builds to a beta group](https://developer.apple.com/documentation/appstoreconnectapi/post-v1-betagroups-_id_-relationships-builds):
  exact relationship POST, successful response `204`.
- [List beta app review submissions](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-betaappreviewsubmissions):
  filter by build and read review state.
- [Submit a beta app for review](https://developer.apple.com/documentation/appstoreconnectapi/post-v1-betaappreviewsubmissions):
  exact build relationship, successful response `201`; beta review descriptions
  must already be populated.
