# EDIT Porto Urbano Torino owner menu source, 20 November 2026

This source-only batch proposes **119 owner-menu drink offers** and one separately disclosed EUR 2 cover/service charge for Roberto's existing Torino venue. It does not publish prices or change the website, backend, schema, or customer contributions.

## Venue identity and live baseline

- Roberto's existing static venue is n11049343309, EDIT Porto Urbano, bar kind 1, cell u0j2r, Torino city ID 63621589, coordinates 45.0627, 7.69511. The static address is blank, so the manifest keeps it null. The [OSM node](https://www.openstreetmap.org/node/11049343309) agrees on name and location.
- The first-party [EDIT Porto Urbano hub](https://editspace.com/hubs/edit-porto-urbano) identifies the venue at Murazzi del Po Gipo Farassino 15, Torino, and directly links its current [menu](https://editspace.com/menu-edit-porto-urbano). This corroborates the venue despite the blank static address.
- The old OSM website tag portourbanotorino.it now resolves to casino content. It is **not** used as a menu, identity, or price source; the official EDIT hub and its linked menu are the source.
- The public [v2 venue endpoint](https://www.dovebevo.com/api/mobile/v2/menu/venues/n11049343309?cell=u0j2r) returned zero stored menu offers before this draft. That does not establish the absence of legacy customer-submitted prices. The protected import must recheck live data and preserve all customer contributions.

## Menu evidence and interpretation

- Checked on 2026-11-20. The owner HTML metadata says dateModified=2026-11-05T13:20:42+00:00. The html_text_v1 normalized source and text SHA-256 are both c89ab56baf2961013bad4f65e6ff402c28e952d626a0c0a7436012ed3e8fa337. Only factual names, printed serving labels, amounts, the fee text, and short evidence references are staged; no menu descriptions, photos, or artwork.
- The 119 offers comprise 15 named canned beers, 23 wine servings (11 glasses and 12 bottles), 18 cocktails or alcohol-free drinks, 17 gin selections, 15 whiskeys, five rums, 12 amari, two coffees, and 12 soft drinks. Bottle and can volumes are not printed and remain null. Gin selection prices are not represented as gin-and-tonic prices.
- All 15 fixed-price cans are conditional: the owner says the beer references can change daily and customers should ask for that day's selection. They must not be presented as guaranteed regular map prices. The draft beer EUR 4-6 range has no stated serving size and is excluded. The duplicate Rot Prism draft listing has no duplicate can offer.
- The food sections repeat COPERTO, PANE E SERVIZIO EUR 2. The menu does not say whether this applies to drinks-only visits or state the charge basis. It is staged as a **separate** fee with applicability unknown, basis unspecified, and partial fee coverage. It is not added to any drink amount.
- The earlier food-menu coffee section lists different banco/tavolo prices. This batch uses the later **DRINK LIST CAFFETTERIA** prices only, without conflating the two sections. Food, unpriced drinks, ambiguous draft ranges, and any inferred serving volumes are excluded.
- The public [robots.txt](https://editspace.com/robots.txt) allows the menu path. The source review is limited to the owner's published factual price information.

## Review and import boundary

The content-addressed manifest is [the 119-offer candidate](../../data/mobile-menu-v2-seeds/e1d6f71ab81e15554158fe089d977f036abe0ee5c1304013603ace7464526799.json). The SHA-256 of its exact JSON bytes is its filename. Local import_v2.validate passed for this file.

An independent reviewer must compare **every** named drink, serving, amount, and conditional label against the live owner menu, including the cover fee's unresolved scope. Recheck the source digest, venue identity, catalogue version, live duplicates, and customer preservation in a protected dry run before any one-off seed. This draft does not authorize a public write.
## HOLD: source hash volatility

Eight fresh owner-menu requests on 2026-11-20 produced eight different whole-page html_text_v1 normalized digests. A comparison showed the drink menu unchanged but variable newsletter-form text order near the footer. The pinned digest above identifies the reviewed capture, not a reliably reproducible live-page hash. The current importer verifies the full fetched page and therefore cannot safely audit or seed this batch as-is. Keep this source-only PR in draft and **do not run protected audit, seed, or public publication** until a separate, reviewed source-normalization change can bind the stable menu section and every row has passed independent comparison. The source use-review status records first-party factual-use review only; it is not import authorization.
A second eight-request check produced seven distinct whole-page hashes but exactly one SHA-256 for the normalized text from BEER SELECTION to the allergen footnote: 303c45bfdcb5ab18f4cdd010bced11656411ddead736a0eebe8b31672f030256. This is diagnostic evidence for a separate stable-menu source-basis design, not a substitute for review or an importer change in this PR.
