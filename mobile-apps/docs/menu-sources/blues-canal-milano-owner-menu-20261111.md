# Blues Canal, Milano: current owner PDF drink prices

Checked 11 November 2026. This is a **source-only candidate** for the apps' named menu. It does not create a venue, change Roberto's website, write live prices, or claim a customer observation.

## Exact existing venue

- Roberto's public app-v2 venue route identifies `n2774913913`, cell `u0nd8`, city ID `62505581`, `Blues Canal`, kind `2`, `Via Casale 7`, latitude `45.45158`, longitude `9.17087`, and **zero current v2 offers**.
- [OSM node 2774913913](https://www.openstreetmap.org/node/2774913913) gives the same name and address, phone `+39028360799`, owner site `https://www.bluescanalmilano.com/`, and coordinates `45.4515830, 9.1708748` before the app's normal rounding.
- The [owner home page](https://www.bluescanalmilano.com/) explicitly says Blues Canal is a pub in Milano/Navigli at `Via Casale, 7` and prints the same phone. This is one already-published Roberto venue, not a proposed new location.

## Pinned current menu

- The [owner menu page](https://www.bluescanalmilano.com/menu) returned HTTP 200 and links `/s/ITA.pdf`. That short owner URL returns HTTP 302 to [this direct Squarespace PDF asset](https://static1.squarespace.com/static/6087cf6678c9ac6e30950502/t/6a64fb55ef2b920f894a9ebf/1785002837178/ITA.pdf). The protected importer refuses redirects, so the manifest pins the direct HTTPS asset and records the owner page as its provenance. The direct URL returned HTTP 200 `application/pdf` without a redirect, with 2,892,321 bytes, below the 8 MiB source limit.
- Raw PDF SHA-256: `9c36e60de8bb30e4497033e84c6ac698011222cf591175ef3254137cdeccc167`. Importer `pdf_text_v1` whitespace-normalized `pdftotext -layout` SHA-256: `5095d3cfc8cd439534bf241ffe1c3959fd53596a85c8cb0b61d37ccf8e02afa7`. Independent fetch and source re-hashing are required again at the protected audit.
- The PDF has seven pages; its metadata says created 22 May 2026 and modified 25 July 2026. The owner page still links the exact file on 11 November. Page 1 visibly prints the drink prices transcribed here. The page uses euro signs in the event-price banner and the service-price note; the per-item numeric prices use that menu currency.
- Owner `robots.txt` for `User-agent: *` disallows `/search` and `/static/`, not `/menu` or `/s/ITA.pdf`. No PDF, image or descriptive ingredient copy is committed. Only item names, factual amounts, printed size/soft-drink context and concise row pointers appear in the manifest. No general menu republication right is inferred from public availability.

## Staged rows, all on PDF page 1

| Section | Printed named items and prices | App treatment |
| --- | --- | --- |
| Draft beers (`0,4L/1L`) | Guinness 7/15; Ichnusa 7/15; Bulldog 7/15; Birra Moretti 7/15; Murphy’s Red 7/15; Ipa Moretti 7/15; Heineken 7/15; Weizen Erdinger 7/15; Cristal Pils 6,5/14; Hoppy Lager 7/15 | Two offers for each of ten named beers, 400 ml and 1,000 ml: **20 rows**. The PDF explicitly pairs the two sizes with the two prices. |
| Cocktails | Spritz 7; Pornstar Martini 10; Negroni 9; DiSaronno Sour 11; Skinny Bitch 10; Paloma 10; Sbagliato 8,5; Irish Coffe 10; Hugo 8,5; Moskow Mule 9; Old Fashioned 10; Espresso Vanilla Martini 10; Sex on the Beach 9; Mojito 9,5 | **14 rows**. Only explicitly named Spritz, Negroni and Sbagliato receive those app categories; the other cocktails remain uncategorized. Owner spellings, including `Coffe` and `Moskow`, are preserved. |
| Premium gin, rum and whiskey | Gin: Roku 13, Tanqueray 10, Bombay 12, Hendrick’s 12, Portobello Road 11, Malfy (Italy) 13, Gin Mare 13. Rum: Brugal Anejo 10, Zacapa23yo 15, Havana7 11, Matusalem 12, Barcelò 10, Diplomatico 13. Whiskey: Black Label 12, Bulleit Bourbon 10, Bushmill’s 10, Laphroig 12, Lagavoulin8y 13, Jameson 10, Oban14yo 14, Jim Beam 10. | **21 rows**, uncategorized; none is assumed to be a gin tonic. Each starred section points to the printed `*Soft drink incluso` footnote, retained as serving context. No spirit measure is invented. |
| Bibite | Acqua 0.5L 2; Coca Cola 4.5; Fanta 4.5; Sprite 4.5; Succo di frutta 4.5; Lemon/Tonic 4.5 | **6 rows**. Water retains the explicit 500 ml size; the other printed names remain as the owner writes them. No unstated bottle/glass volume is inferred. |

Total: **61** source-backed named/size drink offers, original EUR amounts and no fabricated customer confirmation or visit date.

## Explicit exclusions and fee uncertainty

- `Italian Craft 9/16` is a generic rotating craft line, not a stable named beer; no specific drink is invented. The event banner `ANY DRINK 10€ / PREMIUM 13€ / PINT 7€` is event-conditioned and not applied to ordinary venue prices.
- `NO ALCOHOL 7,5` heads four named mixes but prints one group price; this batch does not assume a per-item price. Wine `7/25` and similar pairs do not state the serving units, while single wine values may be bottles; this batch does not label any as a glass or bottle. Food and aperitivo combos are excluded.
- Page 2 prints `*COPERTO E SERVIZIO 1€*` near the food menu. Its basis and whether a drink-only order incurs it are not established. No fee or fee-coverage row is staged, so the app must treat total fee coverage as **unknown**, never as free or already included.

Next gates: an independent reviewer must visually compare every staged row, context, the fee exclusion and the existing venue against this exact pinned PDF and owner page. After exact-head hosted checks, merge the source-only PR; run a separate protected no-write audit, guarded seed and public all-row readback before calling any price live.
