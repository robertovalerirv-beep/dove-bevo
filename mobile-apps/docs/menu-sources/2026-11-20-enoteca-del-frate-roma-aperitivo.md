# Enoteca del Frate Roma: owner aperitivo menu candidate, 20 November 2026

This is a **source-only, unimported** menu candidate for an existing Roberto venue. It changes no website page, backend, database, public price, customer contribution, vote or venue catalogue.

## Identity and coverage

- Roberto's published [static cell `sr2y7`](https://www.dovebevo.com/data/20261119/v/sr2y7.json) contains `n7775360886`, **Enoteca del Frate**, kind `1`, at `41.90888, 12.46005`, Via degli Scipioni 118, Roma, city ID `72959652`.
- The live [app-only v2 venue route](https://www.dovebevo.com/api/mobile/v2/menu/venues/n7775360886?cell=sr2y7&limit=1) returned the same name, coordinates and address, with `stored_offer_count: 0` on 20 November. This count can change before any later import.
- The [owner homepage](https://ristorante.enotecadelfrate.it/) and [menu page](https://ristorante.enotecadelfrate.it/menu/) both name Via degli Scipioni 118 and link the aperitivo PDF under the owner's `enotecadelfrate-ristorante.b-cdn.net` CDN. The owner's page labels this menu as aperitivo from 18:00 to 20:00.

## Source and reviewed facts

- The current owner-linked [September 2026 aperitivo PDF](https://enotecadelfrate-ristorante.b-cdn.net/wp-content/uploads/2026/09/APERITIVO-SETTEMBRE-2026.pdf) returned HTTP 200, `application/pdf`, 3,719,182 bytes, `%PDF-1.4`. Raw SHA-256: `6bd8e49aec68776ce5e38ae849216a9c12add7eabe28ef3eb4748ae64ad3e5ee`. The importer `pdf_text_v1` text SHA-256 is `00bc8945a35d56123941adecfb105902a436372e6c8771f40b34418d1dbd1f73`; a second fetch returned both same pins.
- Both PDF pages were visually reviewed. Page 1 supplies **35 fixed-price EUR beverage records**: 6 cocktails, 20 wines/sparkling wines, 4 bottled-beer varieties and 5 soft-drink groups. These are the priced drink groups with unambiguous fixed amounts. The Baladin 33 cl row lists three named varieties at one shared €7 price; all three are retained with that shared price and explicit evidence. The soft-drink groups retain their printed alternatives in evidence rather than inventing separate tariffs.
- Page 2 says **`Lun-Sab 18.00 - 20.00`**. Every candidate offer therefore has `price_context: conditional` and carries the aperitivo time restriction. Its user-visible `condition_text` is `Aperitivo, Lun-Sab 18:00-20:00.`; the PDF-page citation is retained here as evidence rather than shown beside every price. A current PDF link is evidence of an owner-published menu, not proof of an in-person price paid today.
- The PDF does not label the wine prices as glasses or bottles. The 20 wine offers have no asserted serving or `wine_glass` filter category. Bottled beers retain the printed 33 cl; soft drinks retain the printed 20/33 cl. Other app filter categories are assigned only where the printed drink name itself supports them.
- The printed **Gin Tonic €10/12** has an unresolved price range depending on selection and is **held**, not converted to a single price. Food, art, images, the older 2022 distillate PDF, and non-fixed or unprinted prices are excluded. No fee or minimum-spend statement was found in this aperitivo PDF; empty fee rows mean **unknown**, never no fee. The source is publicly linked by its owner; no license to republish the artwork or menu layout was found, and neither is copied here.

## Publication gate

- Candidate manifest: `mobile-apps/data/mobile-menu-v2-seeds/3566a56352f76078defed13513db405a7e1e120570eb10ea8d08d5e628a00f1c.json`. The exact UTF-8 LF bytes hash to that filename. Structural validation passed with 35 offers, one venue and one source; the live owner PDF was fetched twice and the importer source pins matched.
- This source-only commit has **not** run a protected D1 audit, imported rows or deployed anything. Re-fetch the owner menu, verify that Roberto's venue is still the same and that customer/legacy and v2 prices have not changed, and independently review conditional price display before any guarded seed. Preserve customer contributions.
