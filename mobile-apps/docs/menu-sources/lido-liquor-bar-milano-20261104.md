# Lido Liquor Bar, Milano — owner drink menu candidate

Checked 4 November 2026. This source-only candidate stages **12 regular EUR offers** for an existing Roberto venue: 10 individually priced cocktails and two individually priced alcohol-free mocktails. It changes no public prices, website, backend or schema.

## Venue and duplicate baseline

- Roberto's published static cell `u0nd8` and [OSM node 12312606584](https://www.openstreetmap.org/node/12312606584) agree on `Lido Liquor Bar`, bar kind `1`, rounded coordinates `45.45653, 9.17324`, city `Milano`, and the catalogue address `Piazzale Antonio Cantore 4n06`. OSM links the same owner domain as the [menu](https://lidoliquorbar.it/MENU-1).
- The owner's [About page](https://lidoliquorbar.it/ABOUT-1) places this named bar in Piazzale Cantore. [Comune di Milano's business register](https://www.comune.milano.it/documents/20118/1355403/Occupazione%2BSuolo%2BPubblico-I%2BSemestre%2B2022.pdf/c0a9d82f-fe00-dd8f-5bb1-d4ddcfdcc07c?download=true&t=1757945041134&version=1.0) explicitly names `LIDO LIQUOR BAR` at Piazzale Antonio Cantore, civico `4`. OSM's `4n06` is a more specific house-number suffix; the owner site does not print that suffix. The same business name, street, civic base number and owner-domain link establish the match, but independent identity review must verify this before any import.
- Live `GET https://www.dovebevo.com/api/mobile/v2/menu/venues/n12312606584?cell=u0nd8` returned `stored_offer_count: 0`, zero offers, and `fee_coverage.status: unknown` before staging. The twelve candidates therefore add no same-venue offer duplicates at this snapshot. Recheck live inventory before the guarded audit and import.

## First-party source and exact offers

- The owner's public [MENU page](https://lidoliquorbar.it/MENU-1) directly lists each selected drink with one integer euro price. Its `html_text_v1` visible-text SHA-256 is `836cff830bf51491960c809aa1f70aba11ca06c906596df6b62059dfcdf81c74`, stable over two independent fetches using the protected audit user agent. The source is 171,439 bytes and served as `text/html; charset=UTF-8` on the check day.
- The ten `LIDO’S DRINKS` pairs are SAINT TROPEZ €12, MARIACHI €12, ILLEGALE €10, GINZEN €12, BRAT €12, ORIENT ESPRESSO €12, SPANISH MIRAGE €12, DINO €12, THAI MARGARITA €12, and WHITE DUKE €12. The `LIDO’S MOCKTAILS` pairs are BUBBLE BLOOM €9 and VIRGIN MARINA €9. The manifest preserves these factual names and EUR amounts only; it does not copy descriptions or images.
- No serving volumes are printed, so all serving fields are `null`. The unpriced classic cocktail invitation, sold-out wine, slash-separated wine and beer prices without a printed serving mapping, food, and other generic categories are excluded. All selected rows are menu prices, not customer observations or confirmations.
- The menu does not state whether a mandatory service or cover charge applies. `fees` and `fee_coverage` are empty, which leaves fee coverage **unknown** rather than claiming no fee. No compulsory charge is stated on the owner page; recheck this during independent source review.

## Gate

The exact UTF-8 manifest is `mobile-apps/data/mobile-menu-v2-seeds/dc5bec75c2a1d7b509c6ddf6f6b173e74895ce9f7e623f02b3b33e7056e3ad95.json`; the filename equals its full-file SHA-256. Local `import_v2.validate` accepted the manifest and a script asserted every selected name-price pair in the pinned owner HTML. This is a review candidate only. After independent source, address and fee review, merge a green PR, run a protected read-only `mobile-menu-v2-audit/<manifest-sha>` on the exact reviewed main commit, inspect the receipt for current source, static identity, reports and hidden state, then separately authorize the guarded seed tag and read the public app route back. A changed menu digest or an unresolved address/fee issue must hold the import.
