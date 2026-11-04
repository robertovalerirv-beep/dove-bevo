# Ripasso Bologna: owner menu source review (2026-11-04)

This source-only batch stages **101 exact EUR drink offers** for the already
published OSM venue `n11207521692` in cell `srbj4` (Bologna city ID
`667350399`). The live static file `data/20261102/v/srbj4.json` names the node
Ripasso at `44.49309, 11.35193`; its legacy address is blank. The owner's
[homepage](https://www.ripasso.bo.it/) names Ripasso at Piazza Aldrovandi
5/C, Bologna and directly links the three menu pages below. The live app-only
venue endpoint returned `stored_offer_count: 0` before this manifest was
prepared. No new venue or price is published by this pull request.

| Owner page | Last-Modified observed | Importer `html_text_v1` SHA-256 | Staged offers |
| --- | --- | --- | ---: |
| [Drink List](https://www.ripasso.bo.it/drink/) | 2026-05-08 | `f4f27120d944ea21855f469fa4e1ee43a6adb088a6a2f377a9a3d0ffd96c1be2` | 73 |
| [Birra](https://www.ripasso.bo.it/birra/) | 2026-05-16 | `52ab71fb667ee20ee47e9098300626b6d37d6799b62b9fa96c0a58079caed0db` | 17 |
| [Vino](https://www.ripasso.bo.it/wine-and-beer/) | 2026-10-29 | `58eac534abc76c3bd96fd8b886aa0952931ac810ef1ee5eb10fcafe51c111756` | 11 |

The drink page contributes its printed Spritz, aperitivo, gin tonic, classic
cocktail and alcohol-free prices. Its three entries explicitly under “Gli
stagionali” are excluded because availability is seasonal. The beer page
contributes four tap beers at both the printed Piccola and Media prices plus
nine named bottled beers; it does **not** invent millilitre measures from the
ambiguous “Media cl” text. The wine page contributes only eleven entries in
the owner’s “OGGI AL CALICE” block, with `price_context: conditional` and the
on-page availability condition. Its bottle lists are excluded pending a
separate serving and freshness review. EUR is explicit on the beer page and
is the currency of the same Bologna owner's euro-denominated menus. No fee is
claimed; fee coverage remains unknown.

Each staged offer contains the page, section and exact printed price in its
evidence reference. The canonical importer text hashes were independently
reproduced with the importer's `DoveBevoMenuAudit/1` HTTP user agent. The
protected dry-run must re-fetch all three pages and fail closed on changed
text. A later public seed requires an independent review of daily wine-glass
availability and beer-list freshness, a complete protected receipt, current
zero-offer and preservation checks, and verified production binding. The
owner's live menu can change; this review does not assert that a customer paid
these prices on 2026-11-04.
