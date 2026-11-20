# Birrifugio Trastevere, Roma: current menu delta candidate

This is a **source-only, unapproved refresh proposal** for the existing OSM venue `n3631760159` in cell `sr2y5`. It does not change Roberto's website, legacy customer prices, venue rows, live app-menu data, or fees. No executable refresh workflow exists yet.

## Venue and source

- The current OSM node version 3 names Birrifugio at Via Federico Rosazza 4, coordinates 41.8775735, 12.4660827, and links `https://www.birrifugio.com/`. The owner menu identifies Birrifugio Trastevere at Via Federico Rosazza 4-6 and `trastevere@birrifugio.com`; civic 4 falls inside the owner's range.
- Current first-party source: [Birrifugio Trastevere menu](https://www.birrifugiotrastevere.com/menu/). Two `DoveBevoMenuAudit/1` GETs on 20 November 2026 produced identical 1,801,871-byte HTML, raw SHA-256 `db3ac9bfb2ce633da6a6c10866ffa9269543ed6d7dc33b5f2ab199d1c46e1045`, and importer `html_text_v1` normalized SHA-256 `155daaa3c0ef8c99a909d21cdd2903eccb9d11a8729ffba195d0fc9e88011e31`.
- Existing approved source snapshot was checked 11 November, normalized SHA-256 `041684462ee8d119f404c3e5267c6382d723e2f94827dcd0d05612ff29a31a3a`; original manifest byte SHA-256 `60bf65995177d7d00b098833518a6280b2089041ae9711bde6056979e91d14b7`.
- The current public app-menu endpoint returned 266 active offers over three pages, with incomplete coverage. The existing manifest has exactly the same 266 offer IDs. The current owner page still contains 259 of those products with unchanged title, paired amount, and section. For product IDs `3408`, `3818`, and `3823`, the current popups show ambiguous dimensions while the published serving labels remain null. This proposal preserves the serving labels of all 259 retained offers.

## Exact proposed delta

The current menu has 361 unique product IDs. Nine old IDs disappeared and nine appeared. Two removed IDs were never published: a split-price wine (`3810`) and food (`3863`). Four newly appearing IDs are food and remain excluded (`3455`, `3457`, `3460`, `3514`); another is food (`3899`). The exact app-only proposal is seven retirements and five new drink offers:

| Action | Owner product ID | Drink | Amount | Serving/evidence |
| --- | ---: | --- | ---: | --- |
| Retire | 3406 | MARRY ME IN RIO | €6 | Old product ID absent |
| Retire | 3411 | BOCK | €6 | Old product ID absent |
| Retire | 3423 | BANANA REPUBLIC | €6 | Old product ID absent |
| Retire | 3604 | MC IVORS | €8 | Old product ID absent |
| Retire | 3730 | BAYLES | €4 | Old product ID absent |
| Retire | 3849 | KYRA | €6 | Old product ID absent |
| Retire | 3850 | MARZEN | €6 | Old product ID absent |
| Add | 3419 | MOSQUITO KILLER | €6 | BIRRE ALLA SPINA; popup Dimensione `PINTA 0,4` |
| Add | 3448 | KING OF FOOLS | €6 | BIRRE ALLA SPINA; popup Dimensione `CALICE 0,33` |
| Add | 3893 | WODAN | €6 | BIRRE ALLA SPINA; popup Dimensione `WILLY 0,5` |
| Add | 3615 | PECORINO DOC BIOLOGICO | €6 | BIANCHI card `6€ / 20€`; popup explicitly pairs `Calice: 6€` |
| Add | 3615 | PECORINO DOC BIOLOGICO | €20 | Same card; popup explicitly pairs `Bottiglia: 20€` |

These retirements identify exact old product cards, not a blanket deletion by name. KYRA and MARZEN also appear elsewhere as differently priced bottled beers and remain untouched. The draft beer dimension numbers lack a printed unit; their millilitres remain null. The wine glass/bottle labels have no printed volume. All five amounts are EUR menu-item prices. The owner menu does not establish complete fee coverage, so no no-fee claim is made.

## Required approval and guarded application

The candidate JSON is `mobile-apps/data/mobile-menu-v2-refreshes/birrifugio-roma-20261120.json`. Its baseline ID digest is SHA-256 of the sorted UTF-8 active offer IDs joined by LF with a final LF. Its status is `independent_review_required`. An independent reviewer must check all twelve affected row facts, both wine price pairings, source/venue identity, and current source hash. The source page may change again; an exact production recheck is mandatory.

A future guarded workflow must require the current source digest and OSM identity, prove the 266 expected active IDs and seven expected active row fields, preserve the 259 unchanged offers, and check customer/moderation state. It may only insert one immutable app-only source and five new app-only offers, then mark exactly the seven reviewed app-only offers `removed` transactionally. It must abort on any mismatch, never touch legacy/customer data, and verify exactly 264 active public offers afterward. No existing importer or live database was changed in this PR.
