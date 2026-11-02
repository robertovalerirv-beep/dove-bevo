# App recommendations for the European catalogue

The existing app-only endpoint remains
`GET|POST /api/mobile/venues/:key/recommendations?c=<geohash5>`.
It now resolves an OSM venue missing from the original Italian catalogue through
the trusted app catalogue helpers in `mobile-price-catalog.ts`.

The lookup order preserves known Italian OSM venues and approved user venues:

1. Use the existing `publicVenueName` resolver. A known venue does not depend on
   the availability of `/mobile-data/catalog.json`. User proposals continue to
   require their original approved status and exact cell, without a new fallback.
2. For an OSM miss, check the existing legacy hide by key. A hide wins even if its
   stored cell differs from the request, so the app catalogue cannot resurrect it.
3. Resolve the key and cell through `resolveMobileVenue`. The server takes the
   venue name, key and cell from the validated catalogue, never from a submitted
   display name. The helper enforces catalogue schema, country/currency rules,
   geographic cell, primary Google evidence metadata, legacy exclusion and app
   moderation. Both app moderation statuses (`review` and `hidden`) deny access.

A valid catalogue with no matching key/cell, or a hidden venue, returns 404.
An unavailable, HTML or malformed fallback catalogue returns 503 (`busy`), never
a successful zero-vote snapshot. This refines the previous app-only error status
for an unknown OSM venue when the new catalogue cannot be loaded. Known Italian
and approved-user resolution retains its existing behavior.

There is no new request or response shape, price dimension or currency argument.
The nine drink choices, venue/category/installation-scoped HMAC claims, shared
counts, idempotent set/undo, Origin/JSON/burst/secret/read guards and daily quotas
remain unchanged. GBP and EUR venues use the same recommendation semantics.
The endpoint remains `Cache-Control: no-store`. Stored claims contain no raw
installation UUID or IP; no browser session or new credentials are introduced.

Moderation is checked during venue resolution, as with the original legacy hide
lookup. This change does not add a transactional moderation fence to the existing
vote SQL. Set/undo and its returned snapshot still share the existing D1 batch
transaction. Blocking a venue prevents later requests without deleting its
durable votes; already authorized concurrent requests retain the existing race
semantics. No tables, migrations, website routes, resources or UI are changed.

## Verification

The route tests use the real local migrated D1 and the normal Worker middleware.
They cover foreign anonymous GET and idempotent votes, native GBP semantics,
unknown keys/wrong cells, both app moderation statuses, legacy hides with a
mismatched stored cell, unavailable/HTML/malformed catalogue responses, and known
Italian/user behavior during an app catalogue outage. The existing recommendation
regressions still cover quota boundaries, concurrent votes, privacy and price
replacement independently of recommendations.

```powershell
node node_modules/vitest/vitest.mjs run --project worker tests/worker/mobile-recommendations.test.ts
```

These are local fixtures; they do not create public recommendations or prove a
deployed feature or store release.
