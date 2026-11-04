# Birrificio La Piazza, Torino — Via Durandi owner menu

This candidate records **10 printed EUR drink prices** from the owner's [Via Durandi menu](https://birrificiolapiazza.com/il-menu/), checked on 4 November 2026. It stages app-only named offers for review. It does not change Roberto's website, legacy EUR customer-price records, or public live data.

## Venue identity

- Roberto's existing 20261102 static catalogue has `n5257878293`, **Birrificio La Piazza**, kind `pub`, 45.08192, 7.65963, cell `u0j2q`, Torino city ID `63621589`. Its catalogue address is blank, represented by `null` in the manifest rather than inventing a catalogue address.
- [OSM node 5257878293](https://www.openstreetmap.org/node/5257878293) identifies the same pub at **Via Jacopo Durandi 13** and links `https://www.birrificiolapiazza.com/`. The owner's [Via Durandi pub page](https://birrificiolapiazza.com/il-pub/) and menu footer identify this address. The owner site specifically links the captured menu under **Il Menu – Via Durandi**. This excludes its distinct Via Perosa pub.
- The live mobile v2 menu endpoint returned zero offers for this venue before staging.

## Source and transcription

- Owner URL: `https://birrificiolapiazza.com/il-menu/`. The importer `html_text_v1` canonical text SHA-256 is `aa3fddf262fcec91562feb4ce562cbda8801e6b6d0468b11a0ee030e30cec245`, unchanged across two fetches on the check day. Recheck the owner page before any guarded import.
- The **Per dissetarsi** section prints draught beer `piccola` €5.00 and `media` €6.50. These size names are preserved without guessing millilitres. Bottled beer has 33 cl €6.00 and 75 cl €12.00, plus separately marked **da asporto** €5.00 and €10.00. The two takeaway amounts are conditional offers, not ordinary on-premises prices.
- The same section explicitly prints water 1/2 litre €2.00, `Bibite` €4.00, red/white wine **bottiglia** €20.00, and `Caffè` €2.00. Generic menu names remain generic; no brands are invented. The wine-glass `€6.00 / €7.00` and spirits `€4.00–€7.00` ranges are excluded because the owner does not map a precise amount to each item.
- The page does not state complete service-fee coverage, so `fees` and `fee_coverage` remain empty. These are menu offers, not customer payments or confirmations, and availability may change.

## Gate

The content-addressed manifest is `mobile-apps/data/mobile-menu-v2-seeds/3147cf9c68b37f4f288c9368bc792724cef7d45e98a23d4ed68f7d038e4b21a2.json`; its filename is the SHA-256 of its full UTF-8 bytes. `import_v2.validate` passes. Require independent source and row review, exact-head checks, protected identity/customer/moderation dry run on a merged commit, then a separate guarded apply and public readback. Do not import while an existing report or hidden state blocks the venue.
