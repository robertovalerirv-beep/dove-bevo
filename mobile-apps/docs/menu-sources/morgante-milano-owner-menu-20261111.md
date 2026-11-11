# Morgante Cocktail & Soul, Milano: owner menu source review

Checked 11 November 2026. This is a **source-only candidate** for the apps' named menu; no customer observation, public write, venue creation or website price is claimed.

## Exact existing venue

- Roberto's public app v2 venue route identifies `n6357751985`, cell `u0nd8`, city ID `62505581`, name `Morgante cocktail & soul`, kind `1`, address `Vicolo Lavandai 2a`, latitude `45.4522`, longitude `9.17497`, with **zero stored v2 offers** when checked.
- The live [OSM node](https://www.openstreetmap.org/node/6357751985) gives the same name, `Vicolo Lavandai 2a`, phone `+390235940879`, website `https://www.morgantecocktail.com/`, and coordinates `45.4522005, 9.1749661` (the published app coordinates are rounded).
- The [owner home page](https://www.morgantecocktail.com/) names Morgante Cocktail & Soul, links its menu, and prints `Vicolo Privato Lavandai, 2/A` with the same phone. The extra `Privato` wording is not used to invent a new venue; the independent OSM/app identity and phone agree.

## Pinned menu

The current [owner MENU DRINK page](https://www.morgantecocktail.com/menu-drink/) returned HTTP 200 with `text/html; charset=UTF-8` and no redirect. Two independent fetches using the guarded importer's `DoveBevoMenuAudit/1` agent produced the same `html_text_v1` normalized SHA-256:

`340b88e91a3dd36ecd3aa8b0238ad7032a84fed3eebe1c3c195fdf6d4e46e2a7`

The manifest pins 17 individually priced drinks from the `Special Drink` and `GIn Tonic (WITH FEVER TREE INDIAN)` sections. `Venetian Spritz` is categorized `spritz`. The gin-tonic section is categorized `gin_tonic`, except `TANQUERAY 00`, which the owner explicitly calls alcohol-free and is categorized `alcohol_free`. No serving size is inferred.

| Owner section | Printed item | Printed price |
| --- | --- | --- |
| Special Drink | Su de doss | 15,00 Eur |
| Special Drink | Espresso Martini | 14,00 Eur |
| Special Drink | SuperJACK | 14,00 Eur |
| Special Drink | PALOMA casamigos | 14,00 Eur |
| Special Drink | Venetian Spritz | 12,00 Eur |
| Special Drink | Punk Rabbit | 10,00 Eur |
| Special Drink | Orange Lapse | 12 Eur |
| Special Drink | Diana | 14,00 Eur |
| Special Drink | Nami | 12€ |
| Special Drink | chopper | 12 € |
| Special Drink | Vecchia piazza | 14 € |
| GIn Tonic | TANQUERAY 00 | 12,00 Eur |
| GIn Tonic | TANQUERAY TEN | 15,00 Eur |
| GIn Tonic | Edgar Sopper | 15,00 Eur |
| GIn Tonic | MALFY | 15,00 Eur |
| GIn Tonic | MONKEY 47 | 16,00 Eur |
| GIn Tonic | PLYMOUTH | 15,00 Eur |

Excluded five special/tonic rows where the owner page prints a bare numeral without a currency marker (`Speedcola`, `The Kraken`, `The Negroni`, `casamigos old fashioned`, `KINOBI`). Also excluded food, bottle prices, generic `da`/from prices, and the general Bistrot beverages. The page prints a Bistrot service charge and a different restaurant service charge; whether either applies to a drink-only order is not established. Fee coverage therefore remains **unknown**, with no fee row or all-in-price claim. The owner page shows no menu publication date, so the protected audit must re-fetch its exact normalized text before any import.

Next gate: independent comparison of every row against the pinned live owner page, full hosted checks, then source-only merge. A separate protected audit and guarded seed are required for public app data; this review is not evidence that prices are live.
