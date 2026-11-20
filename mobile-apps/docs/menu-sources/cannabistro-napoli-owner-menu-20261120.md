# Canna Bistro, Napoli: owner drink menu candidate

This is a **source-only candidate**, not a public price import. The existing Roberto catalogue contains `n11476202839` in cell `sr60k`, as `Canna Bistro`, kind 1, at `40.85068, 14.25048`, Napoli city ID `428339558`. The [live app-only venue route](https://www.dovebevo.com/api/mobile/v2/menu/venues/n11476202839?cell=sr60k&limit=1) returned zero stored offers, zero fees and unknown fee coverage on 20 November 2026. [OSM node 11476202839](https://www.openstreetmap.org/node/11476202839) matches that identity and position. The [venue's own site](https://www.cannabistro.it/?lang=it) says CANNABISTRÓ, Via V. Bellini 13, Napoli and directly links its [20-page MENU PDF](https://cdn.website.dish.co/media/14/3e/10286332/MENU.pdf). The PDF itself prints Via Vincenzo Bellini 13, Napoli on page 20. The static catalogue has an empty address; the manifest preserves that tuple rather than replacing it with a guessed static address.

Checked 20 November 2026. The owner-linked PDF responded as `application/pdf`, 7,553,321 bytes, with Last-Modified 12 November 2026 and embedded modification date 11 November 2026. It is image-only (`pdftotext -layout` yielded no text), so every short name, EUR amount, serving label and service-charge line below was checked against rendered pages. Exact PDF SHA-256 is `b0f14c481fd10b0145061bf95de5993f699214ebc01e41474b674e1455bd34de`; the review digest binding its page evidence is `dd68c1050ff03a0c612f5bb6da8ce030bceb02be26d54f828b04a879a278e722`. An independent reviewer should inspect that exact PDF before seeding; machine checks alone cannot prove a visual transcription.

Candidate manifest: `mobile-apps/data/mobile-menu-v2-seeds/47a3ed58b0f55a9f1851cc5e835ede04fa3f8424597d31dee0ed288dba71c1e5.json`. The filename is the manifest's exact SHA-256. It contains **51 regular EUR drink offers** and **one separate service-fee row**:

| PDF page | Offers | Treatment |
| --- | ---: | --- |
| 4 | 3 | Named draught beers. The printed `Size medium` is retained; no millilitre amount is inferred. |
| 6–7 | 14 | Named house cocktails. The PDF prints no serving amount, so serving fields are unknown. |
| 8 | 14 | Six available named classics, five variants under `I NEGRONI`, and three variants under `GINPOSIO TONIC`. The group headings are retained in evidence; category codes reflect those headings. |
| 9 | 17 | Wines under `VINI AL CALICE`, with printed `Calice` serving and no invented volume. |
| 20 | 3 | Generic `ACQUA`, `SOFT DRINK`, and `SPRITZ` item prices, preserving the published generic names. |

Page 20 also prints **`SERVIZIO 10% MIN.1€`**. The manifest records a 10% bill service charge with a minimum EUR 1.00 stated in its label. This fee is displayed separately from every drink amount; the app does not compute a bill total or claim that a drink's menu amount includes service. The source does not establish fee coverage outside this printed charge, so `fee_coverage` remains unknown. The image-PDF importer extension requires a one-to-one fee page reference, exact printed rate and minimum, and rejects conditional or unsupported image fees.

The two page-8 cocktails marked `OUT OF STOCK` (CanaSpritz and CBS-OUR), `COMING SOON` gin variants, unpriced `TAILORED`, and the ambiguous `ALTRI DRINK IBA 8 | 12 €` range are **not** offers. No food, photos, prose descriptions, reviews, customer submissions, serving-volume conversions or exchange-rate conversions are included. The PDF has a recent file modification date but does not state a price-effective date; these remain owner-published menu observations, not receipts or guaranteed current paid prices. If the owner changes the PDF bytes or menu, review a new immutable manifest before any protected import.
