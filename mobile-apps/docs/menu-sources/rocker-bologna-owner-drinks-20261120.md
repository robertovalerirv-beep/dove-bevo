# The Rocker Inn, Bologna: owner drink-menu candidate

This is a **source-only app-menu candidate**, not a public import. The existing [live app-only venue route](https://www.dovebevo.com/api/mobile/v2/menu/venues/n4268817589?cell=srbj1&limit=1) returned zero stored offers and unknown fee coverage on 20 November 2026. It identifies static OSM node [n4268817589](https://www.openstreetmap.org/node/4268817589), cell `srbj1`, Bologna city ID `667350399`, at `44.49759, 11.33216`, name The Rocker Inn, address Via San Felice 77. The [owner homepage](https://therockerinn.it/) prints **Via San Felice 77A** and links the Italian PDF below. OSM and the app print 77; the A suffix is an identity alias for independent review, not an address edit.

The [first-party Italian menu PDF](https://therockerinn.it/wp-content/uploads/2026/01/TRI_Menu_IT_0126-web.pdf) was linked from the current owner homepage on 20 November 2026. A direct no-redirect GET with the review user agent returned HTTP 200, `application/pdf`, 165,395 bytes and raw SHA-256 `da0831ec4d2f5f0bf5ac1fc32f519a6c9ccbfdcb28c73aaf13760abaf0d04046`. The importer `pdf_text_v1` canonical text digest is `631add0d644f5c94057fc0fb7f98089eb76f75693a285a3483cc2d8aa107639c`. The PDF reports creation 5 January and modification 7 January 2026 and has three pages; the drink list is page 2. It remains linked from the owner's live homepage, but there is no printed effective date or proof that every price still applies. [robots.txt](https://therockerinn.it/robots.txt) does not disallow this menu path. No explicit commercial reuse licence was found; the candidate retains factual names, amounts and serving labels only, without artwork or descriptions.

The [immutable manifest](../../data/mobile-menu-v2-seeds/a02cbe50492606340a4187259d486c42943429ca7b753aa10c5cb3a3417c14af.json) stages **38 regular EUR drink-price offers** in one existing venue, all from the single menu page:

| Printed section | Staged offers | Interpretation |
| --- | ---: | --- |
| BIRRE | 12 | Six draft beer names, each with two printed serving labels and prices |
| APERITIVI | 3 | Crodino, Campari Soda, Americano |
| SPRITZ | 5 | Five named Spritz variants |
| LONG DRINKS | 5 | Gin Tonic Premium and four unambiguous named mixed drinks |
| COCKTAIL | 13 | Thirteen named fixed-price cocktails, including Negroni |
| **Total** | **38** | |

The beer menu prints `0.2` and `0.4` without an explicit volume unit; the manifest keeps those labels and leaves `serving_ml` null. It likewise keeps `Mezza Pinta` and `Pinta` as printed, without converting to millilitres. Other drink servings are unspecified. `Gin Tonic / Lemon` and `Vodka Tonic / Lemon` are combined alternatives, so neither is staged. Bottled/canned beers, Vermouth, wine, distillates and soft drinks have ranges or no individual named amount. Takeaway-only paid water is excluded; the menu says water on site is free. Food is excluded. The menu says there is no table service. It does not prove that all fees are absent, so the manifest asserts no fee or minimum and leaves fee coverage unknown. These are owner-menu price facts, not customer receipts.

The manifest filename is its exact byte SHA-256. Local `import_v2.validate` passed for 38 offers, one venue and one source. Source/OSM identity and every printed name, amount and serving still require independent review before any protected import. After a green source PR, the protected read-only audit must verify the current PDF digest, venue identity, moderation and customer-data guards. Only a separate guarded seed on reviewed main can publish app-only offers, followed by exact public API readback. This PR does not alter Roberto's website, database, or customer contributions.