# Lana Mixology & Rooftop bar, Roma — owner drink menu candidate

This separate candidate stages **36 named EUR offers** from Lana's [public Menù Drinks](https://lanarooftop.com/menu-drinks/), checked on 4 November 2026. It is for the additive mobile menu dataset only. No live import, Roberto website change, legacy customer-price edit, or customer confirmation has occurred.

## Venue identity

- Roberto's existing 20261102 static catalogue has `n11300371543`, **Lana Mixology & Rooftop bar**, bar kind `1`, 41.87219, 12.47695, Via del Porto Fluviale 35, cell `sr2y5`, Roma city ID `72959652`.
- [OSM node 11300371543](https://www.openstreetmap.org/node/11300371543) identifies the same named bar and address and links `lanarooftop.com`. The [owner's location page](https://lanarooftop.com/location/) and drink-menu footer independently give Via del Porto Fluviale 35. No new venue is created.
- The live mobile v2 menu endpoint returned zero offers for this venue before staging.

## Source and prices

- Owner URL: `https://lanarooftop.com/menu-drinks/`; `html_text_v1` canonical text SHA-256 `73242c12109613d9f2eba2e30d1f0c1ef584461eda24541aee0cfd48fe4edd9c`. Two fetches on the check day produced the same digest. Recheck the owner source before any guarded import.
- The 36 rows comprise seven named signature cocktails at the printed group price €15, three named alcohol-free cocktails at the printed group price €12, eight named wines with separate **bottiglia** and **calice** prices, two further named sparkling wines with bottle-only prices, three explicitly 33 cl beers at €8, three explicitly 33 cl sodas at €6, and two explicitly 45 cl waters at €4.
- Names and EUR amounts retain the owner's spelling and serving distinction. The generic `COCKTAILS CLASSICI 12 €` heading has no named products and is excluded. Food offers are excluded. The menu says a first drink is accompanied by kitchen tastings; no food price is inferred or added to the drink price.
- No complete service-fee statement appears, so `fees` and `fee_coverage` remain empty. Menu prices do not establish a customer payment, confirmation, or future availability.

## Gate

The separate manifest is `mobile-apps/data/mobile-menu-v2-seeds/10206a864082472f88a3bf48504ce6a7dceb5e7f86ee19801214aedd42803f0c.json`; its filename is the SHA-256 of its full UTF-8 bytes. Local `import_v2.validate` passes. Require independent name/amount/serving review, exact-head checks and protected identity/customer/moderation dry run for this manifest, followed by a separate guarded apply and public readback. Existing reports or hidden status block import.
