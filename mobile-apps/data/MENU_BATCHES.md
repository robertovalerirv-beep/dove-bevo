# Verified one-off menu batches

This register distinguishes actual public imports from research. Only existing catalogue identities are eligible. Menu transcriptions have no customer confirmations and are not evidence of a customer visit. Source files remain private local research artifacts; manifests retain their hashes and public URLs.

## 2026-11-01 batch A: live

Four prices were inserted for L'Asilo in Torino: Negroni EUR8, Sbagliato EUR8, wine by the glass EUR5 and water EUR1. Primary Google business evidence showed119 reviews and a place marker less than8 metres from the existing node. Existing venue name, address, coordinates and category were preserved.

Exact source: `ae964cb496b5176b988f7ab9d24ab0d7a985ad73`; manifest SHA256 `1360bc4300cad4fb9e1b530ae09eb1f4871e9cb8093d644aeb299273e533027a`. Read-only audit41354297059 and apply41354443443 both succeeded. The apply receipt is complete, records four inserts, production-domain/database attestation and cache invalidation. No observation, report or hidden-venue row was added or changed by the tool.

Coordinator and independent reviewer read the public `/api/prices/u0j2q` response. Independent fresh verification at2026-11-01T22:02:24Z returned all four exact values, date2026-11-01, hh0 and confirmations0. Apply receipt SHA256 `26b638f684bc37224dd2c91dea71f1e7aed255c5355a7676de081c311d06c2b0`; initial public snapshot SHA256 `916941df20f1425221e0e4258ef7ce2289db3c8dc00200be895fbd5410748b85`.

## 2026-11-01 batch B: live

Seventeen records cover I Frighi and Clorophilla in Torino, Abbey Theater in Roma, Orange Spritz Bar in Milano, and Vip's Bar in Firenze. Exact existing catalogue names, coordinates and addresses remain unchanged. Primary Google captures show565,668,3049,380 and472 reviews respectively. Current official menu sources and actual Google place markers were checked separately.

The first nine-record audit41355456767 failed before provider queries because Abbey's HTML wrapper changes between requests. No import was attempted. Version2 now declares an explicit source format: raw hashes for the published Frighi data chunk and Vip's PDF, and bounded canonical HTML-text hashes for the three HTML menus. This is extracted markup text, not a browser visibility assertion. Raw source snapshots remain retained locally, and semantic menu/identity checks are still manual. An altered price changes the canonical digest and stops the batch. No fallback from a failed raw pin is allowed.

Vip's current official homepage links a PDF under a2024 URL path. Its actual page was visually checked; the import date means the linked menu was checked today, not that it was issued today or that a customer paid today. Generic cocktail prices and beer with absent or incompatible serving volumes are excluded.

Final manifest SHA256 `07fc73fdb9b40d35126868ca8bd1bc96528609cfaad8157df83c5af934c95077`, exact source `6b77518b4d068cf1fb097f695bdab40d5bb969de`. Read-only audit41356050827 succeeded with all17 records eligible and unchanged before/after state. Audit receipt SHA256 `1809c1e31084fd68097662c7cc8f4653e7903817fcf97131238091d016e6270c`.

Apply41356129179 succeeded with17 inserts, a complete receipt, zero customer confirmations and invalidated cells `sr2y7`, `srb0b`, `u0j2r`, `u0nd9`. Apply receipt SHA256 `7753b89d59187ac002881605d9461a0099612aafc5ec12dcdce5e04c4f01e4a4`. Coordinator public read-back at2026-11-01T22:16:42Z matched every new key/drink/band/amount/date and zero confirmations. Together with batch A this is21 prices across six existing venues in four cities. These totals describe this one-off import, not every existing customer price in the service.

## Coverage limits at the first Italian batches

This is the first live batch, not complete European coverage. The current catalogue and price contract support existing Italian venues and EUR categories. No unmatched venue, inferred menu price, unspecified draft-beer volume, premium variant mapped to a classic, fabricated vote or confirmation is eligible. Other cities and currencies require separately verified compatible catalogue coverage.

## 2026-11-02 batch C: live

Eight normal-band prices concern two existing Firenze venues: Green Street Bar (`n4224393624`, four rows) and PanicAle (`n12541095156`, four rows), both in `srb10`. The fresh public catalogue data version is `20261031`. Exact normalized names and unique Google marker distances of4.89m and4.00m match existing OSM identities. Retained primary Google business facts checked on1November show223 and460 reviews. No venue metadata or catalogue row is changed.

Green's current official menu index directly links the visually inspected images: classic Negroni EUR9, Negroni Sbagliato EUR9, classic Spritz EUR7 and generic nonalcoholic mixed drink EUR5. Its standard Gin Tonic/Gin Lemon EUR8 facts are held: the legacy public price tuple cannot carry the distinction from premium EUR11. No arbitrary minimum or premium-brand substitution is imported. The private research record retains all ten original facts and the two held qualifications.

PanicAle's current official menu embeds a public guest menu. Its ordinary public GET JSON identifies the restaurant and EUR currency and lists classic Gin Lemon, Gin Tonic, Negroni and Negroni Sbagliato at EUR7 each. Differently priced spritz brands, beers, wines and mocktails are held. Only the public menu representation is pinned; no private authentication or operator URL is used. Full menu images/PDF and raw research files remain private local evidence and are not committed.

Manifest SHA-256 is `c501f0f9a0143edeb88a8dc23e796e32da2a6133a6c3c3f134ea6c958a366ea1`. All three source pins use existing `raw` format (two linked images and the guest JSON). The existing source URL query ban remains intact. A dedicated Google-evidence validator accepts canonical HTTPS `/maps?cid=<positive uint64>` evidence only, without allowing queries in any fetched menu source or accepting duplicate/encoded/extra CID parameters. Existing query-free Google place proof URLs remain supported.

The workflow accepts only exact tags `mobile-italy-menu-c-audit/20261102-v1` and `mobile-italy-menu-c-seed/20261102-v1` in Roberto's repository. Audit remains read-only; applying additionally requires the exact manifest SHA. Existing Cloudflare secrets, binding attestation, customer/history/report/hidden guards, cache invalidation and complete receipt checks remain. Runner temporary receipt paths occur only in step contexts.

The legacy schema stores a generic dated curated price with no customer confirmations; this date records an online menu check, not a customer's payment or visit.

Read-only audit [41370145175](https://github.com/robertovalerirv-beep/dove-bevo/actions/runs/41370145175) found all eight rows eligible. Its receipt SHA-256 is `e01954779fe21902d1beaf6ae490d7f6c98be0e3bdc4fa61c1d28e0593f8068b`. Guarded apply [41371417193](https://github.com/robertovalerirv-beep/dove-bevo/actions/runs/41371417193) inserted all eight, with complete receipt SHA-256 `5be1a201b59494d4043a4911345b2540bbbc4eb377182a0acf2417ed658e164e`. Coordinator public read-back of `/api/prices/srb10` matched each venue, drink, normal band, amount, date, zero confirmations and unquarantined state. Batches A, B and C total29 curated prices at eight Italian venues in four cities.

## Separate European catalogue and prices: live first cohort

The apps-only catalogue now contains24 corroborated venues in London, Paris and Madrid. The first guarded European import inserted21 menu variants at four of those venues: Escapologist in London, Little Temple and Le Carlie in Paris, and Viva Madrid. Its public API read-back matched all amounts, currencies, serving identities, source-check dates, menu items and happy-hour conditions. These menu sources have no customer observation or confirmation dates and zero customer confirmations.

See [European importer receipts](../docs/europe-menu-import.md#first-live-cohort-2-november-2026) for exact audit/apply and source hashes. Across both storage contracts the one-off imports total50 menu-price variants at12 venues in seven cities. These are partial verified cohorts, not complete European coverage or50 distinct venues. Existing customer contributions remain separate and unchanged.
