# Camparino in Galleria, Milano: room-specific owner menu prices

Checked 11 November 2026 UTC. This is a **source-only review candidate**. It does not write public prices or modify the website, legacy prices or customer observations.

## Existing venue and source identity

- Roberto's published `20261108` catalogue contains `n13001337602`, **Camparino in Galleria**, in `u0nd9`, Milano city ID `62505581`, kind `1`, coordinates `45.46492, 9.18988`, address `Galleria Vittorio Emanuele Secondo 1n02`. The current [OSM node](https://www.openstreetmap.org/node/13001337602) names Camparino in Galleria and links `https://www.camparino.com/` as its website. Its current coordinates are only rounding distance from the published tuple.
- The owner's [Italian menu page](https://www.camparino.com/it/menu/) directly links separate **Bar di Passo** and **Sala Spiritello** PDFs and gives Piazza Duomo 21 as the public contact address. The mapped OSM address names the Galleria entrance instead; the matching first-party website, venue name and Piazza Duomo/Galleria location support one venue identity, but this address form difference remains visible for independent review.
- The public app-only v2 route returned zero stored offers for this venue at the check. The legacy `u0nd9` price feed returned three customer category rows: draft beer EUR 8, gin tonic EUR 10 and spritz EUR 11. These are separate customer observations; this candidate neither overwrites nor reinterprets them.

## Exact owner documents

Both PDF URLs below are the current links on the Italian owner menu page. Each returned direct HTTP 200 `application/pdf` to `DoveBevoMenuAudit/1` on 11 November, with no redirect. The PDF metadata says 18 September 2026; the URL's `2026/07` path is not used as a price-validity date. The footer on both PDFs says **IVA e servizio inclusi**. No customer visit date, confirmation, bottle volume or additional fee absence is inferred.

| Room PDF | Raw SHA-256 | Importer `pdf_text_v1` text SHA-256 |
| --- | --- | --- |
| [Bar di Passo, Italian PDF](https://www.camparino.com/app/uploads/sites/2/2026/07/Men%C3%B9_Bar-di-Passo_111_ITA.pdf) | `0d1193930187cdb37695e2ac4f8a4e54efe54607558e96bd8bb3009bee92904f` | `72fe3496dbb8edfb8832cd485200fc70601d2bc62c670d281b6c0e33c72d9c25` |
| [Sala Spiritello, Italian PDF](https://www.camparino.com/app/uploads/sites/2/2026/07/Men%C3%B9_Sala-Spiritello_111_ITA.pdf) | `e577313e6390b6fbd754200f228b9112633a02e598efe50597f4fe0e2bbc913e` | `a55b6a27bf57d802fa6f131ef5bdd5084da532f1c26b1422fb568a181346cf3c` |

The [SHA-named manifest](../../data/mobile-menu-v2-seeds/14443b2f72efb5bf9381af6fc2c24d14414ca3167e8ba851c408b85392ce757e.json) stages **22 individually paired EUR drink prices**. The original PDF page numbers and adjacent printed amounts were visually checked, including the differing Campari Seltz and Campari Shakerato prices between rooms. Room and the Bar di Passo coffee cut-off appear as app-visible conditions. “Bottiglia” is retained for the two explicitly bottled beers; no size is guessed. EUR is supported by the menu's euro denomination and service footer.

| Room | PDF page | Named drinks and printed EUR amounts |
| --- | ---: | --- |
| Bar di Passo | 2 | Campari Seltz 15; Campari Shakerato 19; Americano 20 |
| Bar di Passo | 3 | Bayleaf Negroni 20 |
| Bar di Passo | 6 | Crodino Spritz 15; Soft Drinks 8; Acqua Minerale 5; bottled Menabrea 10; bottled Ichnusa 10 |
| Bar di Passo, caffetteria fino alle 17:00 | 7 | Espresso Lavazza 5; Espresso Decaffeinato 5; Cappuccino 6; Latte 5; Selezione di Tè e Infusi 8; Ice Coffee 8 |
| Sala Spiritello | 2 | Mediterranean Del Professore & Soda 20 |
| Sala Spiritello | 4 | Campari Seltz 14; Campari Shakerato 20 |
| Sala Spiritello | 5 | bottled Menabrea 10; Crodino Spritz 15; Soft Drinks 10; Acqua 5 |

Other named cocktails, several non-alcoholic drinks, Ichnusa/Asahi in Sala Spiritello and the four Champagnes appear in sections where an amount is printed only once for a group, away from individual rows. Those possible group prices are deliberately **excluded** because the item-to-amount pairing is not explicit. The Bar di Passo caffetteria “Americano” is excluded to avoid conflating it with the separately priced cocktail of the same name. Food, pastries, packaged aperitivo bites and generic Champagne glass/bottle prices are excluded. The footer proves service is included in these menu prices but does not establish that every possible charge is absent, so fee coverage remains unasserted.

The source-only manifest passed local schema validation and exact PDF hash/text extraction. An independent reviewer must compare **all 22** original PDF page/line pairs, room conditions, categories, venue identity, fee treatment and the three older customer rows before merge. A protected production read-only audit, separate guarded seed and complete public all-row readback are required before any price is called live.
