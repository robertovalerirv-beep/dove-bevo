# Birrificio Torino: current-image menu candidate

**Status:** Draft source candidate. No protected audit, public price import or customer contribution was made. Independent visual and source-integrity review is required before merge or seed.

Roberto's current static catalogue contains Birrificio Torino at Via Parma 30, Torino, OSM `n1234453071`, cell `u0j2r`. The published v2 source catalogue version checked on 10 November 2026 is `20261108`. The venue [homepage](https://www.birrificiotorino.com/) and the catalogue's OSM menu tag both link `https://qrco.de/BirrificioTorino-Menu`; its current redirect ends at `https://marcopascoli-com-769919.hostingersite.com/menu/`, whose dinner menu links the four venue-branded JPEGs below. The protected manifest uses the final direct image URLs because protected import deliberately refuses redirects. The image path includes `/2026/11/`, but none of the images prints an effective menu date. Treat the upload month as provenance, not proof of a visit, opening hours or current till price.

The proposed [manifest](../../data/mobile-menu-v2-seeds/e7469250d9f2389a1ce2d7d1ecabf87b37cd36ec4e084a7a9dd463309ceb016d.json) has 57 candidate item-and-serving price rows. It pins each raw JPEG and a digest of the per-offer human review evidence; no image or descriptive copy is committed.

| Venue menu JPEG | Raw SHA-256 | Candidate rows |
| --- | --- | ---: |
| [Beer page 1](https://marcopascoli-com-769919.hostingersite.com/wp-content/uploads/2026/11/bbbvnnn.jpg) | `e5adac22aa14f5da3f667d4ef1917d661a750f989a01377c39b26cdd75a7769d` | 12 |
| [Beer page 2](https://marcopascoli-com-769919.hostingersite.com/wp-content/uploads/2026/11/bira2.jpg) | `47070a8a16168f1d57f62d0905f9a6b1a71954efdec58ce381b69b932f341bba` | 9 |
| [Beer page 3](https://marcopascoli-com-769919.hostingersite.com/wp-content/uploads/2026/11/bbbv22.jpg) | `97050f306bbbb8e4a87fbad5a15f3f2c3f3d3d5eda4ab3abe6cdd64ccd374764` | 4 |
| [Other drinks](https://marcopascoli-com-769919.hostingersite.com/wp-content/uploads/2026/11/bibitossiz.jpg) | `f3a01f76f4b53b100c736f8a06458b36906f913a6655c852e951e33c110d0f90` | 32 |

Beer pages 1 and 2 print one common format/price schedule for the named beers on each image: 25 cl €3.50, 50 cl €6.00 and 1 l €11.00. Page 3 prints D’ora's separate €4.00 / €6.50 / €12.00 schedule, and Calaide's bottle price of €15.00. The other-drinks page supplies separate printed values for water, bottled and draft soft drinks, specific long drinks, Negroni/Americano, Birra Spritz and other individually named items. Grouped brand lists under generic amaro, whisky and rum price headings were held rather than turned into asserted brand-specific prices. No millilitre equivalent is stored for sizes printed only in cl/l. There is no verified fee statement, so fee coverage is unknown rather than free.

**Source-integrity caveat:** The venue homepage currently includes an unrelated article about UK betting amid genuine venue details. That suggests the website may have been modified by a third party. Although the QR menu link is present on the same page, in OSM, and resolves to venue-branded menu images, the link chain alone is insufficient to prove present owner control. Independent review must corroborate the current menu via another trusted venue channel or hold the import. A reviewer must also compare all 57 rows with the four exact raw-image hashes. Do not use the old 2021 owner PDF as evidence of today's price.

The narrow `jpeg_image_v1` importer rejects changed bytes, non-JPEG content, unexpected MIME, redirects, missing evidence and different data under an existing source ID. Its source digest binds each byte-pinned image to the manually reviewed lines. These mechanical checks cannot authenticate a compromised source or see pixels; the independent review and protected dry-run gates remain necessary. No source image, OCR result, fabricated review count, visit, confirmation or customer price is included.
