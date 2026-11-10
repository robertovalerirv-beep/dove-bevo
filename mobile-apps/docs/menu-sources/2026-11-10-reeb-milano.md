# REEB, Milano: owner-linked drinks menu review

This is an app-only candidate for the guarded one-off importer. The manifest has **not** been seeded, published as a customer price, or added to Roberto's website. Independent review and the protected audit remain required before any seed tag.

## Existing venue and current owner source

- Roberto's live `20261108` static [cell `u0nd9`](https://www.dovebevo.com/data/20261108/v/u0nd9.json) contains `n14066139394`, `Reeb`, kind `2`, `45.44659, 9.19597`, `Viale Toscana 6`, Milano (`62505581`). The public app-only [v2 menu route](https://www.dovebevo.com/api/mobile/v2/menu/venues/n14066139394?cell=u0nd9&limit=100) reported `stored_offer_count: 0` during review; this does not describe legacy customer prices or later imports.
- The [OSM node](https://www.openstreetmap.org/node/14066139394) has the same name, coordinates and `website=https://reeb.pub/`. REEB's [owner homepage](https://reeb.pub/) and [menu](https://reeb.pub/menu/) use `Via Cesare Balbo 36`. Its entrance is at the Viale Toscana corner: [Tripadvisor's venue listing](https://www.tripadvisor.it/Restaurant_Review-g187849-d13401732-Reviews-Reeb-Milan_Lombardy.html) explicitly says “Incrocio con Viale Toscana”, while its OSM-linked map address is `Viale Toscana 6`. The two street-number labels refer to the same corner venue, not a newly invented venue. Recheck this identity at protected audit.
- The current owner homepage directly links its menu. Three direct fetches on 10 November 2026 returned HTTP 200, identical 193,564-byte UTF-8 HTML with raw SHA-256 `c26abaa4ea3e3ae815fdcc3255760833a24f3799864d53a3073aec96977d142a` and importer's `html_text_v1` digest `20f0b8a272805c020756c4f637c48dfe78e5d162b7b0b0ab939e1b9b170a52f0`. The manifest pins the normalized text digest in both fields, per importer contract.

## Prices and fee scope

- The manifest records **26 printed, named drink/serving offers**: eight `Birra alla Spina` size/price combinations, 14 named cocktails, three wine glasses and one 50 cl water. It excludes the separate `Birre della Settimana` section, which explicitly changes with availability, and excludes unpriced, ranged and food items. These are owner-menu offers, not observed customer receipts.
- The draft-beer header prints `Piccola 25cl / Media 40cl`. The size-specific rows preserve those labels; `250` and `400` ml are exact unit conversions. No serving volume is assigned to cocktails or wine glasses beyond the printed `Calice` label. The menu is not a promise that a particular beer remains on tap; the protected audit must recheck availability and digest.
- Under `Informazioni extra`, the menu prints `Coperto +2`. The manifest records a separate EUR 2 fixed fee with **unspecified basis and unknown applicability** because the owner does not say whether it is per person or applies to drinks-only orders. `documented_partial` does not claim that every fee is known. The printed drink amount is never increased silently.
- Only factual drink names, amounts and serving labels are transcribed. No menu descriptions, images, Google review counts, inferred visits, confirmations, currency conversions or public/customer writes are included.

## Held sources checked in this lane

- [Harris Bar Milano](https://www.harrisbarmilano.it/) is the existing `n10692066207` at Via Andrea Solari 50. Its homepage links a [five-page image-only menu](https://www.harrisbarmilano.it/harris-bar-menu.pdf). All five rendered pages were visually inspected: drinks are named, but **no drink prices, sizes or fee amounts are printed**. The PDF's last-modified date is 19 September 2020; its exact raw SHA-256 was `defc72f2b1b15e887d314bffdc6997b88628080ec8445516377207d5b0256a16`. It has no seedable `pdf_image_v1` offer and remains held.
- [Spillo Birra & Cucina, Roma](https://www.spillobirraecucina.com/) has a search-indexed priced [menu URL](https://www.spillobirraecucina.com/menu), but both direct and browser fetches returned HTTP 404 on review. Cached prices are not an auditable current owner source, so it remains held.
- [Spiller Milano Solari's owner menu page](https://spillerbirrerie.it/menu/) links a priced PDF, but the downloaded file was 8,407,900 bytes, exceeding the importer's 8 MiB source cap by 19,292 bytes. No importer limit was relaxed in this lane.

## Verification

- The pinned REEB HTML was reviewed against each source section, item, price and the cover-charge line. The owner homepage link and live static venue were checked separately. Three direct source responses were byte-identical.
- The focused manifest test and importer preservation tests validate file identity, venue, 26 offers, serving variants, category mapping and the explicit partial fee row. Twenty Python importer tests passed locally. The full 21-test command also ran, but its one protected-tag shell test failed in all four cases because this Windows host's WSL lacks `/bin/bash`; it did not reach the importer. The protected Linux audit and independent source review still gate seeding.
