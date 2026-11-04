# Luppolo12 Roma: reviewed app-only spirits-menu candidate

The immutable manifest `mobile-apps/data/mobile-menu-v2-seeds/d0ef354cccf24f66d67ab5eee964706e717c4ce988c21e00b0e2aeaea417bccf.json` contains **70 EUR offers** for **35 named drinks**, each with the separately printed **Shot** and **Bicchiere** price. This is a staged candidate, not a public import or a customer observation. Source check date is 2026-11-04; the pages have no publication date, so it is not a claim that every price is still charged today.

## Existing venue identity

- Roberto's published static venue is `n11999789369`, cell `sr2yk`, city ID `72959652`, kind `1`, at `41.89946, 12.51453`, named **Luppolo12** with address **Via dei Marrucini 12**. The app-only public menu route returned `stored_offer_count: 0` for this venue on 2026-11-04.
- The [current OSM node](https://www.openstreetmap.org/node/11999789369) is a bar named Luppolo12, at `41.8994613, 12.5145305`, with the same street and house number and owner website `https://luppolo12.it`. The [owner's info page](https://www.luppolo12.it/info/) also states Via dei Marrucini 12, Roma and lists the pub as open daily. No new venue is created.

## Owner menu and price evidence

The [owner's QR menu](https://www.luppolo12.it/qr/) links its [vino, amari and distillati menu](https://www.luppolo12.it/menu-vinoamari/), which links the four detail pages below. All four returned HTTP 200 HTML on 2026-11-04; a second fetch produced the same importer `html_text_v1` hash for each page. The manifest pins normalized HTML text, not changing WordPress wrapper bytes. The table headers explicitly separate Shot and Bicchiere; no pour volume is printed.

| Owner detail page | Named drinks | Offers | `html_text_v1` SHA-256 |
| --- | ---: | ---: | --- |
| [Amari & Liquori](https://www.luppolo12.it/menu-vinoamari/amari/) | 11 | 22 | `43dba9de3d08b13fbaab7a624b37441c6be76357e94217f17dd4893087e49861` |
| [Whisky](https://www.luppolo12.it/menu-vinoamari/whisky/) | 9 | 18 | `7a5624e6a04c434ffee0b793d0758e46b2a531a307eecb300cf4baea12b01415` |
| [Rum & Mezcal](https://www.luppolo12.it/menu-vinoamari/rum-mezcal/) | 7 | 14 | `1500180f7439aec5f877b0c369dbf09f18500021ab09f3d112181f17b1c8b046` |
| [Grappa](https://www.luppolo12.it/menu-vinoamari/grappa/) | 8 | 16 | `c12f2d0c1bbce35f0b4b46b744c429193389e275151248ac389729b027b8d944` |

Every staged row was checked against one priced owner table row, including its euro symbol and serving column. Product names now retain the owner table's producer heading and printed variant where present, for example **Elements of Islay Peat**, **Tullamore D.E.W. Irish Whiskey**, **Maker’s Mark Kentucky Bourbon**, **Brugal Extra Viejo**, and **Capovilla Grappa di Amarone legno**. The producer and product are combined only when both appear in the same owner table section or cell; generic **Rum** and **Mezcal** headings are treated as drink sections, not producers. The printed spelling **Coal Ila** is preserved rather than silently corrected. Generic category filters are left null for spirits because v2 has no whisky, rum, amaro or grappa category; this does not classify them as beer, wine or cocktails. No drink image, menu description, product volume, food price, starting-from amount, rotating beer list or Tuesday draft-beer promotion was copied. The owner QR menu states counter service; no separate mandatory fee statement was found. Empty `fees` and `fee_coverage` mean fee coverage is unknown, not free.

The manifest validator and focused local tests passed. Independent source review and the protected production dry-run audit are still required before any guarded seed tag. A reviewed source, a merged PR, or a passing local test alone does not make these offers live. This candidate changes no website UI, legacy customer prices, backend code, schema or native apps.
