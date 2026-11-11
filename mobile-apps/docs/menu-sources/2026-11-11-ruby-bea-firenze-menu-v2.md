# Ruby Bea Bar, Firenze — owner Aperitivo Hour

Checked on 2026-11-11. This is a source-only candidate for independent review. No public import, customer price or website change is part of this branch.

## Venue identity

- Roberto's current static Firenze cell: `https://www.dovebevo.com/data/20261108/v/srb10.json`, `n750017299`, `Ruby BEA`, bar kind `1`, coordinates `43.78349, 11.26294`, Firenze city ID `61753360`. The current app-v2 menu cell `https://www.dovebevo.com/api/mobile/v2/menu/cells/srb10` has no offer for this key.
- Live OSM node: `https://www.openstreetmap.org/node/750017299`; the OSM API reports `amenity=bar`, `name=Ruby BEA`, coordinates `43.7834949, 11.2629417`.
- The [owner's hotel page](https://www.ruby-hotels.com/en/destinations/florence/ruby-bea) and [owner's bar page](https://www.ruby-hotels.com/en/bars/florence/ruby-bea-bar) identify Ruby Bea Hotel & Bar at Piazza della Libertà 16, Firenze. An OSM Nominatim address search returned `43.7834008, 11.2629465`, about 10 m from the OSM bar node. The static row does not itself supply a street address, so the manifest retains `address: null`.

## Source and rows

The venue-owned [Ruby Bea Bar page](https://www.ruby-hotels.com/en/bars/florence/ruby-bea-bar) returned HTTP 200 with no redirect to the importer's `DoveBevoMenuAudit/1` user agent. Two fetches returned the same `html_text_v1` digest: `9cb5c7f54d3546acb73990cad6c9dc21c7065ac9de6adc27067531a63c343bec` (301,790 response bytes at review). The page's Aperitivo Hour section explicitly prices the following choices at EUR 8 **each**, daily from 4–7 pm, served with olives, grissini and crisps:

| Offer ID suffix | Drink | App category | Price | Context |
| --- | --- | --- | --- | --- |
| `001` | Aperol Spritz | `spritz` | EUR 8 | daily 16:00–19:00 Aperitivo Hour, snacks included |
| `002` | Limoncello Spritz | `spritz` | EUR 8 | daily 16:00–19:00 Aperitivo Hour, snacks included |
| `003` | Negroni Sbagliato | `sbagliato` | EUR 8 | daily 16:00–19:00 Aperitivo Hour, snacks included |

No serving size is stated. No regular price, other named drink price, fee or delivery price is inferred. The conditional price must remain visibly conditional in the app. Facts alone are transcribed; no owner photos, recipes or prose are copied.

## Review and import boundary

The manifest passes the local importer schema validator and the pinned source is reachable by the allowed no-redirect fetch. Before any seed, an independent reviewer must confirm current OSM identity, offer wording, source digest, and visible time/snack conditions, then run the protected read-only audit. A changed owner page requires a fresh reviewed digest. Do not merge or import from this note alone.

Other researched Firenze sources were excluded: Finnegan's linked `leggimenu.it` menu uses a blocked import domain; Mayday's owner site lacks priced drinks; Vineria Sonora's owner prices are online bottle-sales prices, not bar servings; Moonshine's linked PDF dates to 2022; an Alibi drinks result belonged to a Milan venue; I Portici's current owner prices were for a venue absent from Roberto's static catalogue. None of those prices were added.
