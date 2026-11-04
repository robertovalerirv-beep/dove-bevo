# Santeria Toscana 31, Milano: app menu source review

This is a **source-only candidate** for the guarded mobile menu v2 import. It
does not add public prices, change Roberto's website, or alter customer prices.

## Identity and source

- Roberto's published `20261102` cell `u0nd9` lists `n11545591134`,
  `Santeria Toscana 31`, kind `2`, `45.44564, 9.18835`, `Viale Toscana 31`,
  Milano (`62505581`). The mobile v2 menu route returned zero stored offers on
  4 November 2026. The OpenStreetMap node has the same name and its more
  precise coordinates round to Roberto's static coordinates.
- [The venue's own page](https://www.santeria.milano.it/toscana-31/) names
  Santeria Toscana 31 at Viale Toscana 31 and links its
  [T31 digital menu](https://www.santeria.milano.it/lista-digitale-t31/).
  That page labels the drink list and shows a 14 October 2026 page revision.
  It was fetched and checked on 4 November 2026. Its normalized HTML text
  SHA-256 is `fb1b31928c833797aa1a5c6a00d184801931beee74a0a8e6f9ee0e0aebf73dfe`.
- The source is a public first-party menu. This manifest records only factual
  item names, explicitly shown prices and servings, and the fee statement.
  It copies no photographs, recipes, descriptions or reviews. The site's
  `robots.txt` returned `Disallow:` with no path on 4 November 2026.

## Offer interpretation

The manifest has **76 EUR offers**: 11 signature cocktails, 4 individually
priced classics, 5 spritz, 19 wine glass/bottle prices, 3 kombuchas, 6 draft
beer servings, 2 bottled beers, 7 coffees/teas, and 19 soft drinks/waters.
Group header prices are attached only to item names in that group. For the
wine and beer entries, a listed serving/size is preserved exactly; no volume
is inferred for `media`, `piccola`, a wine glass or a wine bottle.

The page appears to display the `SUPERLOW Alcoholic drinks` and `NON ALCOHOLIC
DRINKS` sections in adjacent layout columns, while a plain HTML text read
places both headings before their nine names. Those nine drinks are held out
of this candidate because source order alone cannot unambiguously assign the
groups. The €10 printed beside each heading has therefore **not** been
assigned to an individual drink here.

The menu footer says `Servizio, coperto e acqua del sindaco 2 euro`. The
manifest records this as a separate €2 fixed fee with unspecified basis and
unknown applicability. It does not add the fee to any drink price or claim
that the fee applies to every order. Fee coverage is `documented_partial`.

All menu prices are owner-published facts checked on the source date, not
customer payments or confirmations. A changed source text hash, venue data
version, hidden/reported venue or protected audit failure must stop the seed.
The source-only PR must be independently reviewed and merged before the
separate protected dry-run and seed tags described in the importer's README.
