# Bacco's Wine and Food, Napoli: app-only menu seed

The immutable [manifest](../data/mobile-menu-v2-seeds/9da5d0bdeb5ef8c90fab37dec5966f3a0d89f9db5456b34ccbace332176a9643.json) stages **139 individually priced drink offers** from a public [Bacco's digital menu](https://www.menudigitale.io/rvufn/?lang=it), checked on 2026-11-04. This is a source-backed candidate, not a public import or a customer-confirmed price. It adds no venue and leaves Roberto's website, legacy prices and customer contributions unchanged.

## Venue identity and source

- The current Dove Bevo `20261102` static [cell](https://www.dovebevo.com/data/20261102/v/sr607.json) contains `n13009225849`, **Bacco's Wine and Food**, kind `1`, `40.83582, 14.20989`, Via Michelangelo da Caravaggio 56, Napoli city ID `428339558`.
- The live [OpenStreetMap node](https://www.openstreetmap.org/node/13009225849) matches the name, bar type, street, number and coordinates (`40.8358153, 14.2098893`). An independent [Napoli venue listing](https://restaurantguru.it/Baccos-Wine-And-Food-Naples) reports the same name and address and describes its distinctive all-you-can-drink wine offer, which the tenant menu also describes. This ties the menu to this venue more strongly than the name alone. The digital menu itself does not display a street address or an owner-site backlink; an independent reviewer should decide whether that identity chain is sufficient before any protected seed tag.
- Menu source: `https://www.menudigitale.io/rvufn/?lang=it`, HTTP 200 without redirect at review. It is a public venue-branded tenant menu. The source's canonical `html_text_v1` visible-text SHA-256 was `5e9099d0f01caa8f1c507b14bec81a52801db05f74354cb36b295000d0afe297` on two consecutive fetches. The raw HTML hash differed between those fetches because wrapper bytes change; the importer deliberately pins the normalized visible text. Re-fetch and reject on any visible-text change.
- [MenuDigitale's published service policy](https://www.menudigitale.io/subs/?p=33) was checked for source use on 2026-11-04. I found no explicit factual-extraction ban there; this is not a general licence. The seed copies factual names, prices and stated serving labels only, without descriptions, photos or menu layout. No Google review count or inferred visit date is asserted.

## Price scope

The 139 EUR offers comprise 14 draft-wine glass entries, 74 wine-list glass or bottle variants, 7 beers with unstated serving, 28 cocktails or soft drinks, and 16 digestif serving variants. `wine_glass` is assigned only to a listed *calice*; bottle wines and unspecified beers retain a null drink category. Only explicit volumes are represented in millilitres (Naonis 1.5 L bottle and two 0.5 L waters). Original labels such as `Calice`, `Bottiglia`, `Cicchetto`, `Porzione`, `drink` and `lattina` are kept as printed. None of the prices is silently converted or treated as a bargain.

The unlimited-wine offer and event packages are excluded because they are conditional bundles rather than a per-drink price. Food, unpriced descriptions and inferred beer bottle sizes are excluded. The menu states no general mandatory fee or no-fee policy, so `fee_coverage` remains unknown. Menu availability and prices can change after the source check.

## Gate before live data

Local structural validation passed with `import_v2.validate`, and the filename equals the SHA-256 of the exact UTF-8 manifest bytes. The next independent reviewer must check venue ownership/linkage, source-use basis, each visible menu amount and serving, and current venue operation. Then the protected **read-only audit** must re-fetch this exact source and current static identity and report no moderation, conflict or price-history issue. Only a separately authorized guarded seed run on the same reviewed main commit may publish app-only rows, followed by public API and phone-app readback. Do not substitute this draft PR for those gates.
