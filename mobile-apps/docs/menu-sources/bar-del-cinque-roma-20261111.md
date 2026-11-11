# Bar del Cinque, Roma: owner beverage menu candidate

This is a **source-only proposal** for 21 regular EUR drink offers at an
existing mapped venue. It changes no website interface, backend, schema,
customer price, or public app data.

## Identity and current app baseline

- Roberto's published catalogue version `20261108`, cell `sr2y7`, contains
  `n3739059086`, **Bar del Cinque**, kind `1`, coordinates
  `41.89056, 12.46904`, city Roma (`72959652`). Its static address is
  empty, so the manifest keeps `address: null`. The corresponding
  [OSM node](https://www.openstreetmap.org/node/3739059086) identifies the
  same mapped venue.
- The [owner homepage](https://www.bardelcinque.it/) names Bar del Cinque at
  **Vicolo del Cinque 5, 00153 Roma** and displays its own beverage menu.
- The [live mobile-v2 venue read](https://www.dovebevo.com/api/mobile/v2/menu/venues/n3739059086?cell=sr2y7)
  returned `stored_offer_count: 0` and `offers: []` on 11 November 2026.
  The [legacy cell price read](https://www.dovebevo.com/api/prices/sr2y7)
  had no price row for this venue. No matching owner menu manifest was found
  in the checked source tree.

## Source and scope

- On 11 November 2026 the owner homepage returned HTTP 200, `text/html`,
  181,875 bytes. Its `html_text_v1` canonical visible-text SHA-256 is
  `4ce1324412617fae0dec4d9a00591338774a522874901c3959368c0fc2a955fa`.
  The manifest binds to that digest and cites each printed name, section and
  price.
- The 21 offers cover five soft drinks, eight individually priced aperitivi,
  and eight individually priced bottled beers. The seven bottles with printed
  33CL or 66CL retain that serving, including the source spelling of each
  product name. `ALCOHOL FREE BEER` has no size printed, so its serving
  remains unknown. `CALICE DI PROSECCO` is a wine-by-the-glass offer.
- The owner homepage prints four draft beers with two prices each but gives
  **no serving labels for the two columns**. Those prices are held out rather
  than assigning a small/medium size. The owner homepage also links a
  [five-page PDF menu](https://irp.cdn-website.com/1de24a33/files/uploaded/MENU%20BAR%20DEL%20CINQUE%20SENZA%20PROPO.pdf)
  whose prices differ from the live homepage; the PDF is held out. Food,
  coffee, unpriced cocktails, and inferred bundles are excluded.
- The source does not establish a recent customer payment, fee coverage,
  opening hours, or a guarantee that each item is still available.
  `fees` and `fee_coverage` remain empty and unknown.

## Gate

The content-addressed manifest is
`mobile-apps/data/mobile-menu-v2-seeds/5ddc5186c61fe133f328274d7347cb5a9586d9465ba2e708f99b07ed06be76ea.json`.
Before any protected import, an independent reviewer must compare the exact
21 names, amounts, serving labels, owner address and current source digest.
Only a separate guarded audit and seed can publish the offers. This draft
does not affect public data.
