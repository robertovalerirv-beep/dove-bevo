# Opera 33 Milano: first-party 2026 drink list candidate

This is a **source-only, apps-only candidate**. It adds no public prices or venues, changes no customer contribution, and leaves Roberto's website and backend untouched.

## Existing venue and owner identity

- Roberto's [20261119 static `u0ndb` catalogue](https://www.dovebevo.com/data/20261119/v/u0ndb.json) contains `n3386285706`, **Opera 33**, kind `bar` (`1`), at `45.48964, 9.18308`, address `Via Carlo Farini 33`, Milano city ID `62505581`.
- The live [OSM node](https://www.openstreetmap.org/node/3386285706) returned `Opera 33`, `amenity=bar`, `Via Carlo Farini 33`, and coordinates `45.4896401, 9.1830758` on 20 November 2026. The owner's page gives the same name and address.
- The [live app-only v2 read](https://www.dovebevo.com/api/mobile/v2/menu/venues/n3386285706?cell=u0ndb&limit=1) returned `stored_offer_count: 0` on 20 November 2026. Recheck before any seed.

## Pinned source and reviewed facts

- The first-party [Cocktail Bar Milano page](https://opera33.it/cocktail-bar-milano-scalo-farini-zona-isola/) contains a *Listino Opera 2026* in its HTML. The page returned HTTPS 200, `text/html; charset=UTF-8`, and 117,300 bytes on two independent fetches. Raw SHA-256: `b17054bb8112616bc0a21f904fd827e9c290b2b9d750d89f090b3728421b44a9`. The importer's `html_text_v1` normalized SHA-256: `3f50e3c59f3643498f46b81011b6f71569a3485406638eb4fbcee5f0dc86b752`.
- The [immutable manifest](../../data/mobile-menu-v2-seeds/c9f6e85934c72f94171750cdd68f19de54b2bc59aba74a011b31eca5a94084b5.json) has SHA-256 equal to its filename and stages only the seven regular drink facts below. It records the owner's printed names and EUR amounts without inventing serving volumes or claiming that generic menu labels identify particular branded cocktails.

| Printed section | Printed item | Printed price |
| --- | --- | ---: |
| Birre | Peroni | €4 |
| Birre | Birra alla spina | €6 |
| Cocktail | Cocktail | €12 |
| Cocktail | Spritz | €10 |
| Cocktail | Analcolici | €10 |
| Barrels | Spirits neat | €6 |
| Amari | Amaro Saga | €6 |

The aperitivo entries are bundles, the whiskey and rum prices vary by ageing tier, and *Cocktails Experience* buys three small drinks; these are held out. Food, unspecified ritual prices and the conditional discount for eligible zone-9 residents or workers after 21:00 are also held out. The page does not establish a drink-only service-fee exemption or a specific serving size, so fee coverage and serving sizes remain **unknown**. The printed 2026 heading is not taken as an effective date, a purchase date or proof of current stock.

The owner site's [robots rules](https://opera33.it/robots.txt) permit this HTML page while disallowing several media extensions. No explicit restriction on reuse of the factual item names and prices was found on the inspected page; no descriptions, artwork, images or media are copied.

## Gate before public import

An independent reviewer must compare all seven facts against the live owner page and check the exact source digest, OSM/static identity, current duplicates, rights/use basis and fee treatment. Run the protected read-only importer audit on the content-addressed manifest. A changed owner menu or a failed audit must hold the import for review; this note and manifest alone are not evidence that the app shows these prices.
