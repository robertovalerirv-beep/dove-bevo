# Next exact-build TestFlight distribution operator

The existing build 62 and build 278 plans, workflows, tags and receipts are
historical records. Do not reuse either plan for a new binary. The shared
`scripts/mobile-beta-distribution.mjs` operator now accepts an explicit positive
decimal build number of up to nine digits. Its historical default is still 62,
so **always pass `--build-number` for a new build**.

This operator can link only Dove Bevo iOS version `1.0.0` in App Store Connect
app `6827324444` to the existing private `Dove Bevo owner testing` and
`Roberto feedback` groups. It never creates testers or groups, enables public
links, submits the public App Store version, or touches Google Play.

## After a signed beta upload

Record the exact successful `mobile-beta/v*` workflow run, source commit and
uploaded build number. Confirm through a fresh App Store Connect read that this
build is `VALID`, unexpired, and eligible for internal and external beta. Use
that number for the following read-only audit. Store the audit and plan in the
selected Dove Bevo workspace or a protected runner temporary directory; never
store credentials there.

```sh
node --test scripts/tests/mobile-store-status.test.mjs scripts/tests/mobile-beta-distribution.test.mjs
node scripts/mobile-beta-distribution.mjs "$AUDIT_PATH" --plan-output "$PLAN_PATH" --build-number "$BUILD_NUMBER"
```

The audit uses GET only and writes a canonical plan only when the app, exact
build and both existing group identities match; the external group's public
link must be disabled. An upload or a successful audit is not proof that the
build was distributed.

Review the audit receipt and plan. Pin the exact canonical plan bytes and its
SHA-256 in a new one-shot release workflow or operator revision, following the
historical `mobile-beta-distribution-278-apply.yml` boundary. Do not use its
tag, build number, plan or hash. Before exposing credentials, validate the new
plan with the same exact build number:

```js
import { readFile } from "node:fs/promises";
import { validatePlan } from "./scripts/mobile-beta-distribution.mjs";
validatePlan(await readFile(process.env.PLAN_PATH), process.env.APPROVED_PLAN_SHA, process.env.BUILD_NUMBER);
```

Then run the independently reviewed plan in that one-shot release lane:

```sh
node scripts/mobile-beta-distribution.mjs "$APPLY_RECEIPT_PATH" --apply \
  --plan "$PLAN_PATH" --approved-plan-sha "$APPROVED_PLAN_SHA" \
  --build-number "$BUILD_NUMBER"
```

Before each possible POST, the operator re-reads live build and group state and
persists an indeterminate checkpoint. It read-backs every link and beta review
submission. If a write or read-back is uncertain, it stops without retrying a
POST. Inspect the receipt and run a fresh read-only audit before planning any
further action. Distribution is established only by a complete apply receipt
and fresh provider read-back showing the exact build linked to both groups;
external availability also requires Apple's beta approval and testing state.
Public App Store release and real-device acceptance remain separate gates.
