# Circolo Degli Illuminati, Roma — app-only owner menu candidate

This candidate stages **78 directly priced EUR drink rows** from the venue's [public menu](https://www.circolodegliilluminati.it/menu/), checked on 4 November 2026. It is a review candidate for the additive mobile menu dataset. No live import, website change, legacy customer-price edit, or customer confirmation has occurred.

## Venue identity

- Roberto's existing 20261102 static catalogue contains `n5298561395`, **Circolo Degli Illuminati**, nightclub kind `4`, 41.86458, 12.481, Via Giuseppe Libetta 1, cell `sr2yh`, Roma city ID `72959652`.
- [OSM node 5298561395](https://www.openstreetmap.org/node/5298561395) names the same nightclub, has Via Giuseppe Libetta 1 and links the owner website. The owner's [contact page](https://www.circolodegliilluminati.it/contatti/) confirms that address. No new venue is created.
- The live mobile v2 endpoint returned zero offers for this venue before this staging.

## Source and transcription

- Owner URL: `https://www.circolodegliilluminati.it/menu/`. The `html_text_v1` canonical source SHA-256 is `adb49561ae7ad8b8264818cba5c895655586d203ca539b0af5e4d3031f0957ba`; two fetches on the check day produced the same normalized digest. Recheck the page before any import.
- The 78 rows cover 10 named signature cocktails, four Martini Spritz, six Unforgettables cocktails, three alcohol-free-section drinks, four Malfy gin tonics, 21 named beers, eight wines by the glass, eight explicitly 0.70 L bottled distillates, and 14 soft drinks/waters. The original owner names and EUR prices are retained. `Wine by the glass` is labelled `calice`; Heineken draft is explicitly 0.40 L, five bottled beers are 0.33 L, and the listed soft drink and water volumes are copied where stated. Beer brands without a printed volume keep volume unknown.
- The 0.70 L bottle offers have prices of €200 or €250 and are labelled as full bottles, never single drinks. The owner describes them as served with soft drinks. Food-and-drink aperitivo bundles, the `Via del conte` tasting/drink alternative, the Malfy variant bottle group, and multi-brand spirits/group-price alternatives are excluded from this candidate because they need separate condition or item review.
- The source has no complete service-fee statement. `fees` and `fee_coverage` remain empty. These are menu offers; they do not prove a customer payment, a confirmation, or continuing availability.

## Gate

The sole manifest is `mobile-apps/data/mobile-menu-v2-seeds/f0b2cc47f95d6868e17a7ef6a7a97193c6222e4eb89b67b58b5747ce3f5704ab.json`, named for the SHA-256 of its complete UTF-8 bytes. Local `import_v2.validate` passes. Require independent name/amount/serving review, exact-head checks, a protected identity/customer/moderation dry run on the merged commit, then a separate guarded apply and public readback. Existing reports or hidden status must block import.
