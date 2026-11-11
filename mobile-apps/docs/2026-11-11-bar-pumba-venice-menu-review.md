# Bar Pumba, Venezia: source-only app menu candidate

Checked 11 November 2026. No public menu seed or customer contribution was made.

## Venue and source

- Existing Roberto venue: OpenStreetMap [node 13897541203](https://www.openstreetmap.org/node/13897541203), Bar Pumba, Fondamenta dei Ormesini 2798, Venezia; app cell `u20f8`, static city `64778090`.
- The venue-named [Bar Pumba menu](https://barpumba.com/en/menu) shows the same address and gives individual drink prices in EUR. Its [home page](https://barpumba.com/) links to the menu. An independent [Tripadvisor venue profile](https://www.tripadvisor.com/Restaurant_Review-g187870-d34481380-Reviews-Bar_Pumba-Venice_Veneto.html) matches the address and phone, and a [Venice bar directory](https://leadralia.com/directory/it/venezia/bar/) lists the venue and domain. These listings support identity; they are not price sources.
- The menu returned HTTPS 200 with the importer's declared `DoveBevoMenuAudit/1` client. Its `html_text_v1` SHA-256 is `fb413333eedf5cc1125733585959fce789a8886084f17c3ed4f5ec828b2c9d66`, matching the already published five-price legacy source digest. The raw HTML fetch on this check was 100,778 bytes with SHA-256 `499431c74bb96640b0e58c94ff922f909a16c99f1cc32e714c3ad4f28a51a2cc`.

## Scope and limits

- The page has **28** named priced drinks: five aperitivi, six white wines, five red wines and 12 cocktails. Its own summary says 11 wines by the glass. One earlier rough count of 29 was corrected against the actual menu lines. The food item and an unpriced mozzarella item are excluded.
- All rows preserve the menu's EUR amount. The wine entries say “by the glass” but provide no millilitres. Other serving sizes, transaction dates and discounts are not inferred.
- The menu says service is included. It does not establish that every possible fee is absent, so the candidate has no fee or fee-coverage assertion. The page gives no publication date; this is a checked source snapshot, not a promise that prices will remain current.
- Five named prices overlap the older legacy import (Aperol spritz, standard gin tonic, standard gin lemon, Negroni and Prosecco). The candidate records the full 28-item menu in separate, app-only v2 storage. It leaves those older rows and customer reports untouched. Display duplication across legacy and v2 should be checked during live-client verification.

The source-only manifest must pass independent review, exact-head checks, a protected no-write production audit, a separately authorized guarded seed and public API readback before any of these offers can be described as live.
