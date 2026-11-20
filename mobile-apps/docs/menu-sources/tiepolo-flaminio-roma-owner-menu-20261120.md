# Tiepolo Flaminio, Roma: owner menu review (20 November 2026)

## Identity and current source

- Existing static venue: `n6341768881`, cell `sr2ye`, Roma, Via Giovanni Battista Tiepolo 3. The [OSM node](https://www.openstreetmap.org/node/6341768881) has the same name, street, number, and owner domain. Its coordinates round to the static catalogue values `41.92423, 12.46936`.
- The owner's [Flaminio location page](https://www.tiepolobistrot.it/it/ristoranti-attenzione-qualita) names Via Giovanni Battista Tiepolo 3. The shared site footer says number 5; this appears to be an adjacent-number inconsistency on the owner's own site, and should be watched on review. The phone number agrees with the OSM record.
- The [current owner homepage](https://www.tiepolobistrot.it/) links the Italian Flaminio PDF under its Menu section. The exact source is [flaminio_ita.pdf](https://www.tiepolobistrot.it/file/flaminio_ita.pdf), not the separate Arenula menu. The PDF was created 18 April 2025 and remained the owner-linked menu when checked on 20 November 2026. This age is a freshness caveat; recheck the owner link and source hash before public import.
- Two independent downloads on 20 November returned 200, `application/pdf`, 1,252,656 bytes and the same SHA-256 `2992bbe404ca343e64c958e99ce81c09c1784e175e40169d096c637a1a7574d3`. The importer `pdf_text_v1` normalized text SHA-256 is `2b4a21b62a66f361fe8dfc3c98f16c2080df76b10d59b550365e225871ad7cb1`.
- The live mobile v2 endpoint reported `stored_offer_count: 0` for this exact key and cell at review. This is a source-only candidate; no public import is included in this change.

## Extraction decisions

Only factual product labels, amounts, servings and the owner source link are carried into the app-only manifest. No PDF layout, artwork, descriptions or images are copied. The public site exposes the menu without login; its robots file contains only a sitemap entry, and the reviewed owner pages showed no separate source-use restriction. No permission or license beyond factual use is claimed.

All 32 staged rows are visible on **PDF page 7** (one-based). House wine's red or white alternatives are each listed at the printed 1 L, 1/2 L and 1/4 L amounts. The slash-separated Spritz, Gin/Vodka Tonic and Sprite/Coke/Fanta alternatives each share the one printed amount; they are split only to make individual choices searchable. The two Menebrea draft sizes are called *piccola* and *media*; millilitres are not printed, so no volume is inferred. Six named craft beers are listed separately from the draft heading; they have no invented size or draft designation. The owner menu spells `Menebrea` and `Georgica - Blache`; those spellings are retained. The `wine_glass` category is used only for the explicit *vino al calice* section. Fee and minimum-spend coverage remain unknown because the owner PDF does not establish them.

The owner page remains the freshness authority. Before any import, independent review should verify the exact source hash, address association and current availability, and the guarded importer should run in dry-run mode. Neither this note nor the manifest claims that these prices have been publicly seeded.
