# Local Apple screenshot replacement operator

This operator handles only the six reviewed public App Store screenshots in the
Italian localization of app `6827324444`, version `1.0.0` / resource
`e01a5724-9314-4ed6-9353-abc5c4a21a07`. It does not select a build, update review
notes or contacts, upload a private demo video, or submit the app for review.
No live request was made during implementation.

## Reviewed local asset plan

The separate asset packager supplies
`mobile-apps/store-assets/ios-current-20261102/plan.json`. The canonical bytes are
`JSON.stringify(plan, null, 2) + "\n"`, UTF-8 without a BOM. The root fields are
`schemaVersion: 1`, `appId`, `versionId`, `localizationId`, `assets`, and `old`.
The localization is fixed to `7e96802e-cee8-4777-9384-4f743912be38` / `it`.

Each of six `assets` entries contains `setId`, `fileName`, `path`, `bytes`,
`sha256`, `md5`, `width`, `height`, `sourcePath`, and `sourceSha256`. Each of six
`old` entries contains `setId`, `id`, `path`, `bytes`, `sha256`, and `md5`.
There must be three entries of each kind for each fixed set:

| Set | Display type | Exact PNG dimensions |
| --- | --- | --- |
| `eb509607-4f07-442f-bb14-3c7b7d49fdf5` | `APP_IPHONE_61` | 1206 × 2622 |
| `0cf30963-b6ba-47d1-9bd7-a75f055abeef` | `APP_IPAD_PRO_3GEN_129` | 2048 × 2732 |

Paths must resolve under the plan directory without symlinks or traversal. Files
are capped at 20 MiB. New images and retained source copies require PNG magic and
an IHDR declaring eight-bit RGB without alpha. New images must match exact pinned
dimensions, bytes, SHA-256 and MD5; source copies must match their source SHA-256.
The operator checks the PNG header, not complete image decoding or visual content.
Independent visual review and the packager's image decoding remain necessary.
Backups must match both local pins and the old server file size and source MD5.
A processed CDN rendition is not an adequate backup if its bytes differ from the
server's original-file checksum; that mismatch blocks apply.

## Execution

The existing protected ASC environment and `tokenFor` helper are used only after
all local validation. Do not copy keys or authentication files into this repository
or an asset pack. The coordinator alone performs authorized live execution.

Audit is the default and uses only GET requests:

```text
node scripts/mobile-apple-screenshots.mjs --plan mobile-apps/store-assets/ios-current-20261102/plan.json
```

For apply, supply `--apply --approved-sha256` with the independently reviewed
canonical plan's actual SHA-256 and `--receipt` with a new, private local evidence
file path. No apply hash or fabricated asset plan is shipped by this operator.
The receipt path must not already exist. There is no Actions workflow or automatic
release trigger.

The fixed parent chain is established by Apple's parent-scoped lists: app →
version (iOS / 1.0.0) → Italian localization → both fixed display sets. Initial set
membership must be exactly the planned three original IDs per set. Paginated,
oversized, unsupported, redirected or unexpected responses fail closed.
Both before staging and before deleting originals, the version must still be
`PREPARE_FOR_SUBMISSION`. Its explicit build relationship must be exactly
`ff8ec5ad-3325-4f0e-b0d0-74e66d5a63cf`; a direct build read must confirm number
`62`, `VALID` processing and `expired: false`. This checks existing state without
selecting a build or changing submission metadata. The primary
[build relationship](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-appstoreversions-_id_-relationships-build)
and [build read](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-builds-_id_)
endpoints supply these read-only guards.

Each new screenshot is reserved, uploaded using all exact contiguous byte ranges
in Apple's upload operations, committed with its whole-file MD5 and `uploaded:
true`, then read back until COMPLETE with exact dimensions, size and checksum.
Processing is bounded to 30 reads per screenshot, two seconds apart, and API
requests are capped at 400. Storage operations are capped at 32 per image and use
only HTTPS `store-NNN.blobstore.apple.com` hosts, matching Apple's documented
example. Other legitimate storage hosts require a separately reviewed allowlist
change; they are not silently trusted. Only the upload operation's narrowly
allowed headers are forwarded. The ASC JWT never goes to storage. Signed upload
URLs, headers, bodies and server errors are never logged or put in receipts.

All six replacements must be COMPLETE before any original is deleted. Before each
deletion the current set membership, staged image state/pins, and the specific
original's backup checksum are rechecked. Only the six exact planned original IDs
can be removed. New images are never automatically cleaned up on failure. A
concurrent metadata change or partial run requires manual read-back reconciliation.

Apply uses a new exclusive receipt file containing append-only NDJSON snapshots.
Every mutation intent is written and fsynced before the request; an acknowledgment
is appended afterward. The previous intent survives a later write failure. After
any transport or receipt failure, the result can be unknown: stop, inspect the
last complete receipt line and read server state before deciding the next action.
There are no automatic mutation retries or resume mode. A new receipt does not
make a previous partial run safe to repeat.

## Primary contract and verification

Apple's [asset upload documentation](https://developer.apple.com/documentation/appstoreconnectapi/uploading-assets-to-app-store-connect)
describes reservation, ranged uploads without JWT, whole-file MD5 commit, and
asynchronous COMPLETE validation. The [screenshot create](https://developer.apple.com/documentation/appstoreconnectapi/post-v1-appscreenshots)
and [modify](https://developer.apple.com/documentation/appstoreconnectapi/patch-v1-appscreenshots-_id_)
endpoints were reviewed on 2 November 2026. Apple now deprecates these resources in
favor of Asset Library and placements. The currently inventoried legacy sets still
read successfully according to the coordinator's independent inventory; no write
availability is claimed. Unsupported writes stop this operator. No speculative
API migration or other metadata changes are included.

Run `node --test scripts/tests/mobile-apple-screenshots.test.mjs` for mocked
transport, local-file, exact scope, partial-write and receipt-failure guards.
Synthetic header-only PNGs in unit tests are validation fixtures, never publishable
screenshots or evidence of app runtime behavior.
