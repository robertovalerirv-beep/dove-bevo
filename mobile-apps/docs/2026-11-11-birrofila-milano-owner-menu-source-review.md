# La Birrofila, Milano: owner evening-menu source review candidate

This is a source-only candidate for the already mapped venue `n4949740193` in cell `u0nd3`. It creates no venue, public price, customer observation, vote, or website change. Protected production audit, independent all-row source review, guarded seed, and public readback remain required.

## Venue and source identity

- The Italian source queue records `n4949740193`, La Birrofila, pub kind `2`, coordinates `45.43821, 9.18458`, `Via privata Sant'Ampellio 14`, Milano city ID `62505581`, and website `https://labirrofila.com/`.
- The live [OSM node](https://www.openstreetmap.org/node/4949740193) API returned version 4 on 11 November 2026: `La Birrofila`, pub, `Via privata Sant'Ampellio 14`, `45.4382102, 9.1845842`, website `https://labirrofila.com/`, phone `+39 02 3672 3336`.
- The owner's [contact page](https://labirrofila.com/contatti/) identifies its Milano Tap Room at `Via Sant’Ampellio 14` with phone `0236723336`. Its separate Bernareggio brewery address is **not** the mapped venue. The owner's [evening menu](https://labirrofila.com/menu/sera/) is linked from this same site.
- The evening menu was fetched with the protected importer's `DoveBevoMenuAudit/1` user agent on 11 November 2026, HTTP 200 with no redirect, 262,266 bytes. Raw HTML SHA-256: `7ad2565cfdf2c95bcaddcab86dfea0c9f6a3c89e5bc1fc894e3b148e5040c2c1`. The importer's `html_text_v1` visible-markup-text SHA-256, pinned in the manifest: `a452a3e86b4e9e3be248037ad47db1741e7222cee6b5e2ed127d5418553d4f6c`. A second current GET returned the same raw bytes.

## Offer extraction and conservative exclusions

The menu has 61 distinct drink headings before its food section. Each staged row retains one exact heading, printed amount, and printed serving or service condition where available. Multi-price cards pair their displayed labels and amounts by the owner's matching two-column layout. The 73 rows comprise 16 draft-beer size prices, three bottled ciders, ten canned beers, six wine glass/bottle prices, seven long drinks, eight soft-drink/water service prices, 11 amari, six whiskies, three rums, two grappas, and one chupito option. Each `evidence_ref` gives the heading, serving or condition, and amount.

- Draft beer is labelled `MEDIA` or `PICCOLA`, but no numerical volume is printed. Both size labels remain verbatim and every `serving_ml` is null. Beer names and tap availability may rotate.
- The ciders explicitly state 33 cl, 33 cl, and 70 cl; those alone receive 330, 330, and 700 ml. Cans, wine glasses/bottles, cocktails, spirits, and the chupito have no supported numerical volume. `Vino bianco` and `Vino rosso` instruct customers to ask staff, so no specific wine label is invented.
- `Acqua nat/frizz` is €1 `asporto` and €2 `al tavolo`; these are separate conditional prices, not one regular price. The Spritz heading offers Aperol **or** Campari at one price; it is preserved as one menu option, not two invented offers.
- The €10 aperitivo bundle (one drink plus food), all food, and the €0.50 per-added-ingredient customization amount are excluded. The menu does not state a mandatory service fee or explicit no-fee policy. Both `fees` and `fee_coverage` are empty, meaning unknown coverage.
- The page shows no publication or last-updated date. Prices are a source observation as of 11 November 2026, not a promise of current in-venue availability.

The candidate manifest is `mobile-apps/data/mobile-menu-v2-seeds/d2de196981d68f1a12f24754e3c924ee8b9a4c8c4287be8426e7cc2c95445328.json`. The importer validated its schema locally. An independent reviewer must compare all rows with the current owner page before a main merge or protected audit. Any subsequent normalized menu change stops the guarded run until a new source review.
