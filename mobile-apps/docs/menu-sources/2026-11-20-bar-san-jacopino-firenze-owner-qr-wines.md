# Bar San Jacopino Firenze: 31 wine variants from the owner QR menu

This is an **app-only, source-only candidate** for Roberto's existing venue. It does not alter the website, legacy customer prices, database, or any public menu row. It complements the separately staged ten cocktail rows in PR #387; the wine IDs are `011` through `041`, with no cocktail overlap.

## Identity and current source

- On 20 November 2026, [Dove Bevo health](https://www.dovebevo.com/api/health) returned catalogue version `20261112`. The published `spzcp` cell and [mobile v2 venue read](https://www.dovebevo.com/api/mobile/v2/menu/venues/n2052775899?cell=spzcp&limit=1) agreed on the existing `n2052775899` Bar San Jacopino in Firenze, with 0 stored owner-menu offers at this read. The source manifest preserves that published identity and its null street address. The [venue's own location page](https://barsanjacopino.it/dove-siamo/) names Bar San Jacopino at Via del Ponte All'Asse 2/4R; no address is inserted into Roberto's catalogue.
- The [owner-domain QR menu](https://barsanjacopino.it/qrcode/menu) returned HTTPS 200 and 32,803 HTML bytes through the importer's direct, no-redirect public fetch. The new `html_text_images_v1` canonical source digest is `f4b86eb25d504fb50501e8453f8bc0cf0c13464b38a419d51ba4079e808f689e`. For comparison, its old visible-text-only digest is `81bec72abf23337e1dd253f782a2ac20624a100f85d491284409bbf1af294450`. The manifest pins the new digest in both source hash fields.
- The owner page has 17 wine item blocks. Every price is adjacent to an image whose alt text says `Prezzo a bicchiere` or `Prezzo a bottiglia`. A direct HTML extraction produced **14 glass and 17 bottle variants**. All 31 extracted `(name, serving, EUR cents)` triples matched the original held 41-row candidate's wine portion exactly, in order. The new digest also includes ordered image `alt` and `src` attributes; altering a glass/bottle label or image URL invalidates the pin.

## Transcription and limits

The 31 rows cover `VINI`, `BIANCHI` and `ROSSI`, including Prosecco Cuvée Extra Dry at EUR 3.50/glass and EUR 15/bottle, Chianti at EUR 3/glass and EUR 12/bottle, and Brunello di Montalcino at EUR 48/bottle. Each glass and bottle variant has a separate exact ID and `serving_label`; the menu states no volume, so `serving_ml` remains null. All rows retain the owner-menu source ID, original EUR amount and regular menu context. No exchange conversion, customer observation, discount, photos, descriptions or recipes are copied.

No mandatory fee or explicit no-fee statement was found in the checked wine sections. `fees` and `fee_coverage` stay empty, which means **unknown fee coverage**, not a claim that no charge exists. The source is an owner-published menu and the recorded names, variants and prices are factual data; independent review must confirm current menu provenance and permitted factual use before any public import.

## Hold before publication

The QR page has no visible revision date. The home page's `Il nostro menu` link points to `/menu-completo/`, which returned 404 on 20 November; a footer retains an older 2020 business name while the current contact section names a different operator. These facts warrant independent freshness and venue-rights review. Also, the semantic pin covers the image `alt` and `src` attributes, **not the bytes of an image reused at an unchanged URL**; a reviewer should inspect the current icon meaning alongside all 31 price rows.

The immutable manifest is `633c7adb52a2dacbe66b4b6306ca3250601887880aaa672e0f8b19d744df9f5e.json`. Local schema validation, SHA filename validation and a fresh 31/31 first-party source comparison passed. No production dry run or seed has been triggered. After independent approval and a green exact-head merge, a protected read-only production audit must verify source pin, current static identity, existing rows, reports/hidden state and fee scope before a separate guarded seed. Read back every public row after any seed; never overwrite customer contributions.
