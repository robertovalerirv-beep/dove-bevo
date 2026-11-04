# Off Topic Torino owner drink list, 4 November 2026

This source-only batch stages 98 regular drink offers and a separately disclosed EUR 2 coperto for Roberto's existing Torino map venue. It does not publish prices or alter the website, backend, schema, or customer contributions.

## Identity and baseline

- Roberto's current static cell `u0j2r` identifies `Off Topic`, key `n10278098110`, kind `4`, coordinates `45.07326, 7.70342`, address Via Giorgio Pallavicino 35, and city Torino. The current [OSM node](https://www.openstreetmap.org/node/10278098110) has the same name and street number, at coordinates `45.0732649, 7.7034157`.
- The [owner menu page](https://offtopictorino.it/menu/) gives Via Giorgio Pallavicino 35 and directly links the [DRINKLIST PDF](https://offtopictorino.it/wp-content/uploads/2026/10/DRINKLIST.pdf). This is a first-party source, not an aggregator menu.
- The [live v2 venue](https://www.dovebevo.com/api/mobile/v2/menu/venues/n10278098110?cell=u0j2r) returned `stored_offer_count: 0`, `offers: []`, and `next_after: null` on 4 November 2026. The older static customer-price inventory found no current rows for this key, although its cell scan had unrelated errors; the protected import must recheck customer state.

## Source and interpretation

- The owner PDF URL path is dated October 2026 and was linked by the owner page on 4 November. Two fresh downloads produced the same 4,225,900-byte PDF SHA-256 `54d8638e7c0ff601605f479e90ea08414f4fc8b4812c6619cbe4ac89188c687b`. The whitespace-normalized `pdftotext -layout -enc UTF-8` digest is `bc7c70b5864dd6e54965ce86bd965f7fdfc2e27b96e9bab080d8487dd2e7e561`.
- The 98 offers cover 12 draft-beer size prices, four named 33 cl bottled beers, 26 named bottle wines, 14 cocktails, 36 gin-and-tonics and six vodka-and-tonics. Draft `Piccola`/`Media` volume is not stated, so those `serving_ml` fields remain null. Bottle wine volume is unstated. Bottled beers and bottle wines have no false `beer_draft` or `wine_glass` category. Gin-and-tonic prices include Schweppes per the owner's text.
- The menu prints `Coperto €2,00` without saying whether a drink-only visit incurs it. It is a separate fee with unknown applicability and partial fee coverage. The optional EUR 2 tonic substitutions are not mandatory fees and are excluded.
- The PDF text has an ambiguous `MONKEY 47 TONIC 10 12 €` line, so that cocktail row is excluded. The separate unambiguous Monkey 47 gin-and-tonic list price EUR 12 remains. The generic `Alcool free` wine rows, one OCR-obscured Favorita wine, food, descriptions, and images are excluded. Slash-labelled Campari/Aperol Spritz and Moscow/London Mule remain one menu-labelled row each, with the stated common price; no invented variants were added.
- Only factual names, amounts, servings, fee, and short source references are staged. This menu is a source check, not a customer-paid price report or confirmation.

## Release boundary

The content-addressed manifest is a draft source proposal. An independent reviewer must compare its 98 name/price pairs and fee scope against the owner PDF. Recheck the exact source bytes, venue identity, live duplicates and customer preservation in the protected dry-run before any one-off seed. No import is authorized by this draft alone.
