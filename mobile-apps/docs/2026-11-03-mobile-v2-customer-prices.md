# App-only customer prices for vetted menu venues

This route is separate from Roberto's website prices and from the source-verified named menu. It never edits a source snapshot or an offer. A menu amount is a cited menu fact; a customer amount is a reported observation, without a claim that a purchase was verified.

## Public read

`GET /api/mobile/v2/customer-prices/venues/:key?cell=xxxxx&limit=50&after=<item_key>`

Only vetted registry venues are eligible. Italian static OSM venues keep their existing route. Hidden or moderated venues return 404. The response has `schema_version: 1`, `price_scope: customer_reported_drink_item`, `venue`, `rows`, and `next_after`. A row has `revision`, `item_key`, `kind`, `offer_id` (null for a new drink), `name`, `category`, `serving`, `amount_minor`, original `currency` and `currency_exponent`, `observed_on`, `source_kind: customer`, and `observation_kind: customer_reported_price`. Only the latest active revision of each item appears. A source offer that is no longer approved and active suppresses its linked customer row. No unpublished or reported entry is shown.

## Submission

`POST /api/mobile/v2/customer-prices` uses the existing same-origin, Turnstile-backed anonymous `__Host-sid` session and daily per-session/per-IP price quota. Body variants:

```json
{"kind":"menu_offer","venue_key":"m...","cell":"u0nd9","offer_id":"source-offer-id","amount_minor":650,"currency":"EUR","currency_exponent":2,"expected_revision":null}
```

```json
{"kind":"new_drink","venue_key":"m...","cell":"u0nd9","name":"Negroni della casa","category":"negroni","serving_label":"bicchiere","serving_ml":null,"amount_minor":900,"currency":"EUR","currency_exponent":2,"expected_revision":null}
```

A source offer submission returns 201 `{status:"active",revision,source_kind:"customer"}`; a first newly named drink returns 202 `{status:"pending",revision,source_kind:"customer"}`. The new drink appears publicly only after an authorized admin approves it. Replacing an active customer observation requires its current `revision` as `expected_revision`; a stale revision returns 409. Identical active amounts return `unchanged` without a new row. Amounts are positive integer minor units up to 100000. Currency is checked against the venue country and the approved offer when present. For a country without a built-in currency rule, a new drink requires exactly one source-verified active menu currency/exponent at the venue. No conversion occurs. A menu amount is never used as proof of a paid-price outlier.

`POST /api/mobile/v2/customer-prices/report` with `{venue_key,cell,entry_id,reason:"wrong_price"|"spam"}` uses the existing report quota and per-day dedup claims. Multiple independent reports move an active observation to review and remove it from public reads. Reports never mutate menu offers.

Access-protected `GET /api/admin/mobile/v2/customer-prices/pending` lists pending and reported entries; `POST /api/admin/mobile/v2/customer-prices/entries/:id/decision` with `{decision:"approve"|"remove"}` records an auditable decision. Source and venue gates are rechecked before approval. No app or website admin UI is introduced by this route.

Migration `0012_mobile_menu_v2_customer_prices.sql` adds append-only customer facts, reports, and decisions. It creates no Cloudflare resource and changes no legacy table or API. Deploy only after PR review and CI, then integrate the mobile form and distinguish reported customer prices from cited menu facts in the app.
