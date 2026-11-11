# Bar San Jacopino, Firenze: owner QR menu candidate

This is a **source-only proposal** for 24 exact EUR drink offers at an already
mapped venue. It does not publish prices or change the website, backend,
customer contributions, or mobile application code.

## Venue identity and existing prices

- Roberto's [published 20261108 cell `spzcp`](https://www.dovebevo.com/data/20261108/v/spzcp.json)
  contains `n2052775899`, **Bar San Jacopino**, kind `2`, at
  `43.78423, 11.24065` in Firenze (city ID `61753360`). Its static
  address field is empty, so the manifest leaves `address` null.
- [OSM node 2052775899](https://www.openstreetmap.org/node/2052775899)
  matches the name and location. The [venue owner homepage](https://barsanjacopino.it/)
  identifies Bar San Jacopino at **Via del Ponte All'Asse 2/4R, Firenze** and
  links its own “Il nostro menu” page. This address confirms identity but is
  not substituted into Roberto's static record.
- The [app's live venue menu](https://www.dovebevo.com/api/mobile/v2/menu/venues/n2052775899?cell=spzcp&limit=100)
  returned `stored_offer_count: 0`, `offers: []`, and unknown fee coverage on
  11 November 2026. The [legacy cell prices](https://www.dovebevo.com/api/prices/spzcp)
  had no row for this venue. No matching manifest was found in the checked
  repository. Recheck all three before any guarded import.

## First-party source and exact rows

- The [owner's public QR menu](https://barsanjacopino.it/qrcode/menu) returned
  HTTP 200 with no redirect, `text/html; charset=UTF-8`, 32,803 bytes on
  11 November 2026. The importer's `html_text_v1` visible-text SHA-256 was
  `81bec72abf23337e1dd253f782a2ac20624a100f85d491284409bbf1af294450`
  with the importer's `DoveBevoMenuAudit/1` user agent. Any changed text
  digest must stop the later audit for review.
- Ten named cocktails are individually priced: nine at **EUR 6.00** and
  Carter&Bennet at **EUR 8.50**. The Negroni is the only one assigned a
  specific app category. No cocktail serving amount is printed.
- Fourteen named wines have an explicit **“Prezzo a bicchiere”** amount in
  EUR. The manifest records `bicchiere` as the serving label and uses only
  those glass prices, excluding adjacent bottle prices. It neither converts
  bottle prices to glass prices nor infers a glass volume.
- Food, coffee, broad beverage labels, bottle wines, and items without an
  individually clear price are outside this draft. The owner page provides no
  dated price validity guarantee, customer purchase evidence, fee statement,
  or current stock assurance. `fees` and `fee_coverage` remain empty and
  unknown. The homepage's copyright footer names an older business while its
  current contact block names Elisa&Charlie SAS; the menu is still directly
  linked from the live owner homepage. Review this provenance nuance before
  any import.

## Gate

The content-addressed draft is
`mobile-apps/data/mobile-menu-v2-seeds/fed7171a29ad58ee0a578c53c185135fd84e3c2b7edf6c9107fee348bd0f100b.json`.
An independent reviewer must compare each of the 24 names, section labels,
amounts, glass serving labels, current source text hash, static venue tuple,
and existing public offers before a guarded audit or seed. This draft alone
does not add public prices.
