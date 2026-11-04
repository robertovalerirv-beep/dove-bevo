# Pigneto 66 Roma owner cocktail menu candidate, 4 November 2026

This is an **app-only, unimported candidate** for an existing Roberto venue. It writes no public prices, confirmations, votes, legacy website rows or live v2 offers. Independent line-by-line review and the protected dry-run audit remain required before any public seed.

## Venue identity and live duplicate check

- Roberto's published static venue 'n8974752139' is named **Pigneto 66** at '41.88867, 12.52677', cell 'sr2ym', city ID '72959652', kind '1', address **Via del Pigneto 66, Roma**. The public v2 route '/api/mobile/v2/menu/venues/n8974752139?cell=sr2ym' returned **zero offers** on 4 November 2026.
- The [current OpenStreetMap node](https://www.openstreetmap.org/node/8974752139) is named **Pigneto 66** at '41.8886738, 12.5267702', with 'addr:street=Via del Pigneto'. The [venue's own page](https://pigneto66.metro.bar/?lang=en) says **PIGNETO 66** and **Via del Pigneto 66**, matching Roberto's exact location and name. No same-venue v2 offer or seed manifest was found on the checked main branch.

## Source and exact scope

- The venue's own current page links [COCKTAILS CLASSICI](https://cdn.website.dish.co/media/de/97/110472/COCKTAILS-CLASSICI-1-T5Cn3Kx.pdf) as a visible customer menu under **Our menu**. The owner page returned HTTP 200 and contained both the address and the PDF link on 4 November. The PDF also returned HTTP 200. Its 'Last-Modified' header is **19 May 2025**; that is a file date, not a guarantee of today's in-venue tariff. The page still links it on the check date.
- PDF 'pdf_text_v1' raw SHA-256: '715329bbded3be846c56b964594fcd9cf5634f2cd0842f7370a8de9dbef91c2a'; whitespace-normalized 'pdftotext -layout -enc UTF-8' SHA-256: '24bf495bbe6871536d7bf9aeccc31bc78797d5a7ef69607fed25915f1f0e3099'. The one-page PDF is 231,589 bytes. A second fetch should match both pins in the protected audit.
- Candidate manifest: 'mobile-apps/data/mobile-menu-v2-seeds/2c0f4faa16a5fbb414058f0407301b96eb3991013ecc81902218acd2fdf54e6e.json'. Its filename is the SHA-256 of its exact UTF-8 bytes. It contains **40 EUR cocktail offers** from the single PDF. Each name and integer euro price is printed; no serving volume is printed, so serving fields are null. The menu states no happy-hour times or conditions, so context is regular.
- **Two Cosmopolitan entries are intentionally held out:** the PDF prints the same recipe at €7 near the top and €8 at the bottom. There is no basis for choosing which is valid. The page's other linked distillate and gin-tonic PDFs were not transcribed in this batch; their mixer and serving context require separate review.
- The source states no mandatory-fee coverage. Empty 'fees' and 'fee_coverage' mean **unknown**, not free. No publication date, recent customer visit, confirmation, review count, photo, description or copyright-protected presentation is claimed. Factual names and prices only are transcribed.

The draft PR is a review unit. A green manifest/preservation check is not live publication. Before seeding, independently recheck the owner menu link, price lines, duplicate exclusion, venue identity, production conflicts and protected audit receipt, then read back the public v2 route after any guarded seed.
