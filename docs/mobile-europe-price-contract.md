# Apps-only European price contract

Owner-approved on 1 November 2026: add a European app catalogue and currency-aware sourced prices/customer updates while preserving Roberto's website. This document describes source capability, not a deployed dataset or store release.

## Isolation and trusted catalogue

Migration `0010_mobile_europe_prices.sql` adds only `mobile_menu_sources`, `mobile_prices_current`, `mobile_price_obs`, `mobile_price_reports` and `mobile_venues_moderation`. The existing website price/history tables, API tuples, contribution routes, catalogue and interface are unchanged. Existing `counters` and `dedup` implement the shared abuse budgets and ephemeral claims.

`ASSETS` must serve `/mobile-data/catalog.json` as JSON. This is a build artifact from independently reviewed OSM/Google business facts, never a customer upload. Its exact object shape is:

- `schema_version: 1`, `version: string` matching `[A-Za-z0-9._-]{1,100}`; a lowercase 16-character content hash is accepted.
- `venues: []`, at most 5,000 unique canonical OSM node/way/relation keys.
- Each venue has exactly `key`, `name`, `kind`, `lat`, `lon`, `cell`, `city`, `country`, `currency`, `google`.
- `name` and `city` have 2–120 UTF-16 units, no controls or unpaired surrogates. Preserve the OSM name. `kind` is 1–4. Coordinates must encode to the exact geohash5 cell and lie within the supported country's broad European bounds.
- Countries are `IT`, `GB`, `FR`, `ES`, `DE`; currency is `GBP` for `GB`, otherwise `EUR`.
- `google` has exactly `url`, `review_count`, `checked_on`; the URL is a supported primary Google HTTPS host without credentials/fragment, count is an integer above 100, and checked date is a real nonfuture UTC date. A `https://www.google.com/maps?cid=...` URL is supported. This validates the curated record; it does not independently verify the Google fact.

Catalogue and Italian legacy-cell reads reject HTML SPA fallback, malformed UTF-8/JSON/schema, unavailable assets and bodies above 2 MiB with 503. Reads are request scoped, without a long-lived stale catalogue cache. For Italian venues, absence/failure of the legacy cell is **not** evidence that the venue is new: it fails closed. A key already present in that cell is returned in `legacy_venues`, and mobile writes/seeding reject it with 409. Legacy hidden keys and app-only moderation blocks are returned in `hidden`, and suppressed from rows. User/pending `u...` keys are never accepted in this catalogue.

## Price identity and serving

The key is `(venue, drink, hh, currency, serving_key)`. The nine existing drink codes remain intact; `hh` is 0/1. `serving` is exactly `{unit: "drink" | "glass" | "ml", ml?: integer}`. `ml` is 1–2,000 and required for unit `ml`.

- Draft beer and water require unit `ml`.
- Wine requires unit `glass`, optionally with an explicit volume.
- Classic cocktails and alcohol-free drinks require unit `drink`, without a volume.
- Canonical storage keys are `drink:`, `glass:`, `glass:150`, `ml:400`, `ml:568`, etc.

A 400 ml beer and a 568 ml beer are independent prices. An unspecified glass and a 150 ml glass are independent. Comparisons, medians and quarantines must group by the **same drink, band, currency and serving**. No exchange-rate conversion occurs. Do not infer volume from a menu photograph or merge differently sized prices into one cheapest-category figure.

EUR category bounds remain the existing shared catalogue's inclusive cent bounds. GBP bounds are independent native pound-penny guardrails: draft beer 100–3,000; cocktails/wine 100–5,000; alcohol-free 100–3,000; water 1–1,500. They are validation caps, not converted prices or claims about market prices. Each venue has at most 100 mobile variants. The source importer must retain actual serving/context in its reviewed evidence; this API does not infer menu meaning.

## Public reads

- `GET /api/mobile/prices/cells/:cell`
- `GET /api/mobile/prices/venues/:key?cell=<geohash5>`; exactly one `cell` query is required.

Both return `Cache-Control: no-store` and exactly `schema_version: 1`, `catalog_version`, `rows`, `hidden`, `legacy_venues`. The last two arrays contain exact catalogue keys in that cell. Hidden takes precedence over legacy. Public rows have:

```ts
{
  venue: string; cell: string; drink: string; hh: 0 | 1;
  currency: "EUR" | "GBP"; amount_minor: number;
  serving: { unit: "drink" | "glass" | "ml"; ml?: number };
  observed_on: string | null; confirmed_on: string | null;
  confirmations: number; status: "active" | "quarantined";
  revision: string; // UUID: pass this exact revision when confirming/reporting
  provenance: {
    kind: "customer" | "online_menu";
    source_url: string | null; source_checked_on: string | null;
    source_sha256: string | null; menu_item: string | null;
  };
}
```

Review/removed rows are omitted; quarantined rows remain explicitly identified. Reads cap at 5,000 rows per cell and fail rather than silently truncate. Do not reinterpret legacy Italian rows as customer-paid evidence: their older provenance can include the original curated menu batch.

## Customer writes

All mobile POSTs pass the existing same-Origin, real-secret, burst limiter and anonymous session middleware. The session still comes from the existing Turnstile-protected `/api/session`; an installation/voter header cannot substitute for it. The existing session/IP daily quotas are shared with website contributions: 30 price attempts, 50 confirmations and 20 reports. No raw session/IP is stored in mobile price/source/report tables.

`POST /api/mobile/prices` accepts exactly:

```ts
{
  venue: string; cell: string; currency: "EUR" | "GBP";
  items: Array<{
    drink: string; hh: 0 | 1;
    serving: { unit: "drink" | "glass" | "ml"; ml?: number };
    amount_minor: number;
  }>; // 1–9, no duplicate identities
}
```

Currency must match the server catalogue. Source URLs, source-kind claims, source checked dates and client observation dates are forbidden. Customer changes receive the server's Europe/Rome observation day and a fresh UUID revision; they reset confirmations and remove current menu attribution, while immutable source/history evidence remains. A repeated current amount counts as a guarded confirmation, not fabricated history. Same-currency/serving cell medians retain the existing five-peer, ±50% quarantine rule; blocked/legacy venues do not count as peers. The response is `{results:[{status,code?}]}` with active/quarantined/confirmed/rejected results. Mutations are atomic per item; a later concurrent error in a multi-item request can leave earlier valid items committed. Re-read after a non-200 or transport loss rather than blindly repeating a whole batch.

`POST /api/mobile/prices/confirm` accepts exactly `venue`, `cell`, `currency`, `drink`, `hh`, `serving`, `revision`. Confirmation checks the viewed revision and distinct session/IP claims, including author checks for today/yesterday. It returns `{status:"confirmed"|"already", confirmations}`. A stale revision returns 409; a removed/review/blocked row returns 404. No-op mutations recheck scope/current state before acknowledging. Confirmation updates `confirmed_on`, **never converts a source check into a customer observation**.

`POST /api/mobile/prices/report` accepts exactly `venue`, `cell`, `reason` and optional `price`. Reasons are `wrong_price`, `closed`, `not_exists`, `wrong_info`, `offensive`. A price target is exactly `{drink,hh,currency,serving,revision}`. Wrong-price reports need a price target. Closed/nonexistent/wrong-info target the venue, matching the original moderation flow. One session/IP cannot accumulate reports alone; more than three independent reports on a revision move it to review and fence further updates. Reports on a previous revision do not hide a later genuine change. Venue reports enter the operator queue and do not automatically delete venues.

## Trusted sourced-price import

There is **no public source write or operator endpoint**. `seedMobileMenuPrice` in `src/worker/routes/mobile-price-store.ts` is an internal trusted deploy/import adapter and is not called by any HTTP route. It receives the exact `TrustedMobileSeed` type: batch/manifest SHA-256, matching catalogue version, venue/cell/drink/band/currency/serving/amount, official HTTPS source URL, raw/source-representation SHA-256, actual source-check UTC day and menu item. It validates metadata and identity, but deliberately does not fetch/interpret a menu. The trusted Actions/D1 operator must verify pinned menu response bytes, currency, serving, conditions, primary review proof and frozen manifest approval **before** invoking equivalent guarded mutations.

Seeding is one D1 transaction: immutable content-addressed source snapshot, guarded current insert and observation. It refuses existing current/history in any status, reports, moderation/hidden barriers and any legacy price/history/report state. It never overwrites a customer, silently relabels GBP, increments confirmations or supplies a paid date. A source row has `observed_on: null`; its separate `source_checked_on` means only when the menu was checked. UI must label this as menu evidence, not a visit/payment. Source snapshots cannot be updated/deleted. Replay is skipped without changing price/history; a source/customer race never overwrites an accepted customer write.

## Operator moderation and retention

Roberto's trusted operator uses existing protected D1/CI access. No credentials or new Cloudflare resource are required by this feature. Begin with these read-only queries, bind reviewed targets, and retain an audit receipt outside source control:

```sql
SELECT venue_key,target,revision,reason,day FROM mobile_price_reports ORDER BY id DESC;
SELECT * FROM mobile_prices_current WHERE status IN ('review','quarantined');
SELECT * FROM mobile_venues_moderation;
```

After checking evidence, an operator can set the exact reviewed revision's status to active/removed, or insert/update `mobile_venues_moderation(venue_key,status,reason)` to review/hide a venue. Use an exact revision predicate when editing a price so a concurrent genuine customer change is preserved. Removing an app-only block restores only mobile eligibility; legacy `venues_hidden` still wins. Source audit snapshots stay immutable. Do not directly copy these tables into the website price tables or change legacy moderation records to make a seed succeed.

The existing cron purges shared day-salted counters/dedup within 48 hours. Source snapshots, anonymous observation history, reports and moderation decisions contain business/price facts and no copied menus, raw IPs, cookies, installation IDs or personal reviews; they remain until an explicit operator retention/retirement process. No automatic new deletion job is installed here. Reported source capability, tests and local rows do not prove deployed coverage or an approved store release.
