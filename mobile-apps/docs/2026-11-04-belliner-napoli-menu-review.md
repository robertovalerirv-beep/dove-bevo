# The Belliner Napoli drink-menu review, 4 November 2026

This is a source-only proposal for the existing Dove Bevo venue `n13226434723` in cell `sr60k`. No customer contribution or public menu record was written during research. The live v2 venue endpoint returned zero stored offers before this proposal.

## Venue and price source

- [OSM node](https://www.openstreetmap.org/node/13226434723) names The Belliner at 40.8509979, 14.2508368. Its `website:menu` tag links to MyCIA menu slug `k3dTDOXeY`. The published Dove Bevo static tuple is The Belliner, kind 1, 40.851, 14.25084, Napoli. OSM reverse lookup places the node on Via Conte di Ruvo.
- [Teatro Bellini's own page](https://www.teatrobellini.it/gli-spazi/) identifies The Belliner Cafè as its foyer café. The [venue's MyCIA menu](https://www.mycia.it/menu/napoli/the-belliner-cafe-k3dTDOXeY) names it at Via Conte di Ruvo 14. [MyCIA's merchant documentation](https://www.mycia.it/how-to-merchant) says partner venues directly manage menu prices.
- The menu's `html_text_v1` SHA-256 on 4 November was `ce2cf346fb315f1a4103f460a1d3109b513676e3ae3e666bc42fc551e3109b08`, stable across repeated fetches. It exposes EUR for its displayed prices. The menu does not expose a per-item update date, so this is an observation date rather than a claim that every price was changed today.

The proposed 72 offers cover 15 individually priced cocktails, 18 aperitivi/soft-drink rows, five bottled beers, 16 fixed-price caffetteria rows, four explicit Orzo/Ginseng size prices, and 14 individually priced wines or sparkling wines. Menu sections, labels and cents were checked against the page's structured venue-menu data. No price or review count was invented. No fee or fee-coverage claim is made.

The five beer rows show `0,33` under **BIRRE IN BOTTIGLIA**. Their serving label combines that source section with its `0,33` text; `serving_ml` stays null because the item line does not spell out a unit. The 14 wines are in **BOLLICINE**, **VINI BIANCHI**, **VINI ROSSI** or **VINI ROSATI**, separate from the **VINI E BOLLICINE AL CALICE** section. They are marked `bottiglia`, with no assumed millilitre volume. For Caffè brasiliano, Caffè schiumato, Succhi di frutta and The / tisane / infusi, options or flavours share one displayed row price; the exact row label is retained without creating separate option prices. Orzo and Ginseng each explicitly price `singolo` at €2.50 and `doppio` at €4.00, so each has two serving-specific offers.

## Source rows excluded

| Source row | Visible price text | Reason |
| --- | --- | --- |
| COCKTAILS INTERNAZIONALI | BASIC €8.00; PREMIUM €10.00; ELITE €13.00 | Tiers are stated without a named drink or a rule tying a particular drink to one tier. |
| VINI AL CALICE | Variable €6.00–€10.00 per glass | No named wine has an exact glass price. |
| BOLLICINE AL CALICE | Variable €6.00–€10.00 per glass | No named sparkling wine has an exact glass price. |

The page may change after the recorded observation. Recheck the source hash and price facts before the protected import. The draft PR does not itself publish these prices.
