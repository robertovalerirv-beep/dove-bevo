# Hostaria Ai Do Archi, Padova: owner menu review (20 November 2026)

This is a **source-only candidate** for the apps-only menu catalogue. The [immutable manifest](../../data/mobile-menu-v2-seeds/c64c3e9b0cc55f45eb9e112c3c4351d8ce53256a1d38b34564b99049d9535dd0.json) stages **52 EUR drink offers** for one existing venue. It does not add a venue, write public prices, alter customer contributions, or change Roberto's website or backend.

## Venue identity and source

- The [owner home page](https://www.aidoarchi.it/) names **Hostaria Ai Do Archi, Via Nazario Sauro 23, Padova** and links its [current menu](https://www.aidoarchi.it/menus). The home page describes a bacaro and cocktail bar at this single address. Its OSM [node 1503764278](https://www.openstreetmap.org/node/1503764278) has the same name, address number, bar type, coordinates and owner website tag.
- The current Dove Bevo public static catalogue, version `20261119`, has `n1503764278` in cell `u206q`, Padova city ID `406747508`, kind `1`, coordinates `45.40834, 11.87385` and no static address field. The [app-only venue read](https://www.dovebevo.com/api/mobile/v2/menu/venues/n1503764278?cell=u206q) returned `stored_offer_count: 0` on 20 November 2026. The manifest uses that exact static identity; it does not assert a new registry venue.
- The direct owner menu returned HTTP 200 and `text/html` without redirect. Its importer `html_text_v1` digest was `161f219126a812fff499f5d2fa0a4e99a1a47985e2d6cd27cf6b104d299738b6` on consecutive fresh fetches. The manifest's SHA-256 is the full filename above. Source hash changes must hold the candidate until re-reviewed.

## Reviewed rows and limits

| Section | Selected offers |
| --- | ---: |
| Classic spritz | 10 |
| House spritz | 12 |
| Negroni section | 7 |
| Gin tonic section | 7 |
| Draft beers, two named beers in two printed sizes each | 4 |
| Alcohol-free cocktails | 12 |
| **Total** | **52** |

Each selected printed name and EUR amount was checked against the owner menu section. A fresh owner-text check also confirmed all 52 name/amount pairs within their section; the two beer sizes are printed as **20 cl** and **40 cl** and are stored as 200/400 ml. The menu does not specify a volume for the cocktails, so none is inferred. App-facing names add the printed section where a standalone label such as “APEROL” or “CLASSICO” would otherwise be ambiguous. No descriptions or images are copied. The openly accessible first-party menu did not show restrictive reuse terms for factual names and prices; the source URL remains attached to every row.

The owner menu is broader than this candidate. Food, unpriced items, ambiguous wine glass/bottle associations, duplicate “media” beer rows, possible fruit-option surcharges, and promotions are excluded. The base Virgin Mojito is EUR 7; its printed EUR 1 fruit-variant surcharge is excluded, not folded into that base price. No mandatory cover, service fee or minimum-spend statement was found on the menu; fee coverage stays **unknown** rather than asserted free. No visit date or customer confirmation is inferred. The owner may edit the menu at any time.

## Release boundary

The importer schema validation and source hash checks passed locally. Independent source, identity, conditional-price, fee, and duplicate review is required before a green merge. After merge, a separate protected read-only audit must re-fetch this exact source and verify production D1 state and moderation. Only a distinct guarded seed may publish app-only menu facts; this draft does not run either operation.
