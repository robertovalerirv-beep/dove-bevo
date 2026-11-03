# Exact build 278 TestFlight distribution

This operator targets Dove Bevo iOS version `1.0.0`, build `278`, App Store
Connect app `6827324444`, and **only** the two existing private groups,
`Dove Bevo owner testing` (internal) and `Roberto feedback` (external). It does
not create groups or testers, enable a public invitation link, or submit the
public App Store version. The historical build 62 plan, workflows and tags are
unchanged.

The fully gated `mobile-beta/v1.0.0-website-palette-20261103-v2` run
`41635947245` passed Android checks, 158 iOS unit tests and four live UI tests,
then signed and uploaded source `89f9cef21222bda40ecafbc3da423ca8167864a6`.
Apple reported build `278` (`b71e441a-6238-4c01-a42b-19330a73ca53`) as `VALID`
at 12:58 UTC, ready for internal testing and external beta submission.
The browser build controls remain disabled, so this API audit is the scoped
fallback. An upload alone does not establish TestFlight distribution.
Do not substitute build 72, failed/unuploaded 271 or historical build 62.

## Read-only audit

The separate workflow accepts only the exact tag
`mobile-beta-distribution-audit/20261103-build278-v1` in Roberto's repository.
It has read-only repository permission and runs offline boundary tests before
the credentialed step. The command adds the explicitly allowed target:

```sh
node scripts/mobile-beta-distribution.mjs "$OUTPUT_PATH" --plan-output "$PLAN_PATH" --build-number 278
```

The operator reads only the exact app/build, parent version and beta-detail
relationships, existing group identities and membership, and beta review state.
It produces a canonical plan only for a `VALID`, unexpired build whose beta
states permit distribution, whose exact external group has its public link
disabled, and whose known groups still belong to the same app. The audit does
not POST. The receipt records a SHA-256 hash of canonical plan bytes; provider
errors and credentials are excluded.

## Reviewed apply follows the audit

No build 278 apply workflow or plan exists yet. After a complete fresh audit,
independently check the plan's app ID, version, build ID and number, exact two
existing group IDs/names/types, disabled external public link and byte hash.
Then add a separate apply workflow that pins those literal canonical bytes and
SHA-256 under a new exact tag. Review it before triggering it. The guarded
`--build-number 278` apply path validates the approved bytes and build number
**before** credential access or any API request; a build 62 plan is rejected.
Before each possible group link or beta review submission it re-reads the live
identity and eligibility, persists an indeterminate checkpoint, and uses an
immediate read-back. It never retries a POST after uncertainty. A completed
receipt and provider read-back are required to claim distribution.

Offline verification:

```sh
node --test scripts/tests/mobile-store-status.test.mjs scripts/tests/mobile-beta-distribution.test.mjs
node scripts/check-workflows.mjs
```

Public App Store submission, Google Play publication and installed-device
acceptance remain separate release gates.
