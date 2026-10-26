# Isolated mobile preview deployment

This is a default-disabled source route. Adding it to GitHub does not provision or deploy
anything. It is separate from the native compile workflow, the read-only readiness workflow,
the disabled preview build helper, and staging/production deployment.

The only target is Worker and D1 name `dovebevo-mobile-preview`, with the single custom
hostname `mobile-preview.dovebevo.com`. The reviewed profile uses fixture data, dedicated
rate-limit namespaces `2026102601` and `2026102602`, `MOBILE_PREVIEW_ENABLED=true`, and a
dedicated real public Turnstile sitekey. Both `workers.dev` and preview URLs are disabled,
including preview routing on the custom domain. Empty Access settings keep admin closed.
This does not establish store acceptance or a production release.

## Owner prerequisites

Roberto Valeri or an authorized account owner must first:

1. Confirm the Cloudflare account hosting the configured `dovebevo-staging` Worker and its
   existing D1 binding, and the active `dovebevo.com` zone in that same account.
2. Create a fresh, preview-only D1 named `dovebevo-mobile-preview`. Its UUID must differ from
   every root and named-environment database in `wrangler.jsonc`. The CI never creates a D1,
   clones production data, seeds user data, or changes the existing databases.
3. Create a dedicated Turnstile widget named `Dove bevo mobile preview`, mode `managed`, with
   only `mobile-preview.dovebevo.com` in its hostname list, ephemeral IDs disabled and
   clearance level `no_clearance`. Install that widget's matching secret through GitHub's
   secret UI. CI reads only widget list metadata: the detail endpoint returns the secret and
   is deliberately not used. Turnstile hostname rules include subdomains; the application's
   existing exact hostname check still applies.
4. Install a dedicated API token and independent preview-only session/HMAC keys. Do not
   copy the staging credentials. The owner must approve its resource scope: reads of the
   source Worker settings, account Worker/domain lists and bindings, target D1 metadata,
   Turnstile widget metadata, zone metadata/DNS/routes; writes to the preview D1 migrations,
   preview Worker code/secrets/assets and its custom hostname. The conventional API token
   permission names include D1 Write, Workers Scripts Write, Workers Routes Write, Zone Read,
   DNS Read and Turnstile Sites Read. Review current provider permissions for this account;
   no token-administration permission is required by this route.
5. Configure the GitHub environment `mobile-preview` for the exact trusted branch, with
   an owner approval requirement and no self-approval where available. Keep repository
   activation absent or `false` until resource ownership and scope approval are complete.

Read success establishes resource identity and configuration, **not write capability**.
Scope approval is an owner authorization/attestation. The first intended D1 migration and
Worker upload supply actual write evidence; they are not permission probes. A denied write
stops the job. CI cannot establish whether a database has never held data from metadata:
Cloudflare explicitly deprecates `num_tables` as unreliable. Fresh/preview-only ownership,
the matching widget secret and independent key generation remain owner attestations.

## Dedicated GitHub configuration

Repository variables:

| Variable | Required value |
| --- | --- |
| `MOBILE_PREVIEW_DEPLOY_ENABLED` | `true` only after owner authorization; otherwise absent or `false` |
| `MOBILE_PREVIEW_APPROVED_SHA` | Full reviewed push commit SHA |

Environment `mobile-preview` variables:

| Variable | Required value |
| --- | --- |
| `MOBILE_PREVIEW_OWNER_APPROVED_SHA` | Same full SHA, set after owner resource/scope approval |
| `MOBILE_PREVIEW_ACCOUNT_ID` | Verified account ID |
| `MOBILE_PREVIEW_ZONE_ID` | Verified active `dovebevo.com` zone ID |
| `MOBILE_PREVIEW_DATABASE_ID` | New preview D1 UUID |
| `MOBILE_PREVIEW_TURNSTILE_SITE_KEY` | Dedicated widget's public sitekey |
| `MOBILE_PREVIEW_PREVIOUS_SHA` | `absent` for the first deployment, otherwise the verified current preview deployment SHA |

Environment secrets (never put their values in source, command arguments, logs or reports):

- `MOBILE_PREVIEW_API_TOKEN`
- `MOBILE_PREVIEW_SESSION_HMAC_KEY`
- `MOBILE_PREVIEW_HASH_KEY`
- `MOBILE_PREVIEW_TURNSTILE_SECRET`

There are no legacy credential fallbacks. The code rejects empty, placeholder or reused
input keys. Equality with an unknown production secret cannot be checked without reading it;
the owner must ensure these keys are dedicated. No token policy introspection is performed.

## Execution and evidence

Only a push to `robertovalerirv-beep/dove-bevo`, branch `codex/mobile-launch-20261026`, with
the exact approved SHA can enter the deployment job. There is no pull-request or manual
dispatch trigger and no main/production target. Set approvals for the known reviewed local
commit before its authorized push; merely setting variables after a skipped push does not
start a deployment. Do not use workflow reruns as a routine deployment route.

The job checks out the exact SHA with persisted credentials disabled, installs locked
dependencies, checks the guard/tests, and builds the existing **disabled** preview profile
without deployment credentials. Only the final step receives the dedicated secrets. The
deployment helper verifies the disabled build profile and proof, then creates its own exact
deployment configuration. A Vite selector or staging environment never authorizes it.

Before writes, CI verifies the source account/binding, target database ID/name, zone, widget,
complete resource listings, and absence of conflicting domains/DNS/routes. It checks every
listed Worker for reuse of the preview database or rate namespaces. Reads are bounded to
three pages of 100 entries, 100 Worker settings, 256 KiB per response and 20 seconds per
request. An incomplete or oversized list fails closed. These limits can prevent a large
account from using this initial route; they never silently omit resource checks.

For updates, the existing Worker must have the explicitly expected prior SHA marker,
the exact preview variables and binding names, dedicated database/rates, required secret
names, disabled workers.dev URLs and only the exact custom hostname. The marker is a
deployment precondition, not cryptographic proof of the old code. Unexpected or partially
configured Workers are not adopted automatically.

The intended writes are ordered:

1. `wrangler d1 migrations apply DB --remote --config <exact generated profile>`.
2. Repeat the complete ownership/collision preflight.
3. `wrangler deploy --config <same exact profile> --secrets-file <private temporary input>`.
   Wrangler uploads the dedicated secrets alongside code. It does not use `secret bulk`,
   which can create a draft Worker implicitly when a name is missing.
4. Read provider configuration back, including bindings, SHA marker, custom hostname and
   disabled workers.dev/preview URLs. The final message is `PROVIDER_CONFIGURATION_VERIFIED`.

The helper runs only on hosted Linux CI. It builds a small allowlisted child environment,
uses a private runner-temporary directory and a mode-0600 secret input, removes that input
immediately after upload, and removes the temporary directory in `finally`. Wrangler output
is suppressed and its debug log is redirected to `/dev/null`. No artifact or cache is
uploaded by this workflow. A forced runner termination can bypass cleanup; use ephemeral
hosted runners only, and do not add diagnostic dumps, broad artifact uploads or secret caches.

Concurrency serializes this workflow without cancelling a running deployment. Repeated
readback narrows races but Cloudflare does not provide a cross-resource transaction or lock
for this sequence. The owner must avoid simultaneous provider edits. Migrations can finish
before a later upload fails; an upload can partly apply before a route/readback failure.
The helper prints the last completed/started phase and never automatically rolls back,
deletes resources, extends permissions or retries unknown writes. Investigate provider state
before setting a new expected prior SHA or authorizing a new attempt.

Provider configuration readback does not prove DNS/TLS propagation, application behavior,
Turnstile completion on a device, or native/store acceptance. After a successful deployment,
verify those separately against the exact preview hostname. Keep production untouched.

## Local verification and source references

Pure tests use synthetic identifiers and mocked provider responses. They never read tokens
or invoke remote mutations:

```text
npx vitest run --project unit tests/unit/mobile-preview-deploy.test.ts tests/unit/check-config.test.ts
npx tsc -b
node scripts/check-config.mjs
```

`check-config.ts` also pins the exact workflow text digest. A trigger, secret mapping or
checkout change requires deliberate review and updating that digest; there is no generic
exception for arbitrary helper workflows. Existing named-environment deployment checks and
the exact disabled build checks remain in force.

Primary references checked against the pinned Wrangler 4.149.0 implementation/schema:

- [Wrangler deployment and secrets commands](https://developers.cloudflare.com/workers/wrangler/commands/workers/) and [atomic secrets/code upload](https://developers.cloudflare.com/workers/configuration/secrets/).
- [D1 migration command](https://developers.cloudflare.com/workers/wrangler/commands/d1/) and [D1 metadata and deprecated table count](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/get/).
- [Turnstile widget list metadata](https://developers.cloudflare.com/api/resources/turnstile/subresources/widgets/methods/list/) and [widget detail including its secret](https://developers.cloudflare.com/api/resources/turnstile/subresources/widgets/methods/get/).
- [Worker custom domains](https://developers.cloudflare.com/api/resources/workers/subresources/domains/methods/list/), [subdomain flags](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/subdomain/) and [rate namespace sharing](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).
- [Provider authorization roles and scope distinctions](https://developers.cloudflare.com/workers/authorization/).
