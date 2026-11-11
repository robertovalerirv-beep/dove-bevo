# Spiller Bologna: owner menu review (11 November 2026)

This is a source-only proposal for the apps-only menu catalogue. It does not add a venue, change Roberto's website, or publish any price. The [manifest](../../data/mobile-menu-v2-seeds/819d15dc59ea04986229dc06d6cb9e54c6314c806e3ebe4972f9eb91b8e155f4.json) contains 16 individually reviewable EUR drink offers from two current, openly accessible menu pages.

## Venue and owner binding

- Roberto's public `20261108` static catalogue in `srbj4` contains `n3606867932`, Spiller, Via Zamboni 26, Bologna, at 44.49612, 11.35014. The current [OSM node](https://www.openstreetmap.org/node/3606867932) gives the same name, address and phone (last edited 1 June 2026). The [app v2 read endpoint](https://www.dovebevo.com/api/mobile/v2/menu/venues/n3606867932?cell=srbj4) returned `stored_offer_count: 0` on 11 November 2026.
- [Spiller's official contact page](https://spillerbirrerie.it/contatti/) lists the Bologna location at Via Zamboni 26 with phone 051 001 1191 and `bologna@birreriespiller.it`. The [Spiller Bologna Linktree](https://linktr.ee/spiller.bologna) identifies the same location, links back to `spillerbirrerie.it`, and links to its JMENU. The JMENU footer repeats the same address, phone, email and Spiller VAT number. This cross-link and contact match is the owner basis for treating the JMENU as operator-managed.

## Priced source pages

| Page | Importer text digest (SHA-256) | Included offers |
| --- | --- | ---: |
| [Spiller Bologna beers](https://www.jmenu.it/spiller-bologna-birreria-con-cucina/) | `9b20a1c86722308c3f69e4ab6983cc84e597f8ef2f9b958b36ab440866cb9f88` | 8 |
| [Spiller Bologna drinks](https://www.jmenu.it/spiller-bologna-birreria-con-cucina/drink-e-caffe/) | `e2c4296a2572c67e4906ced9d9d74f55c573976004c6c36439623ecc5b878a38` | 8 |

Both pages returned HTTP 200 with HTML and stable importer-normalized text digests on consecutive fetches using the importer user agent on 11 November 2026. The pages show an active order menu but no menu publication or update date. The beer menu still mentions an October Festbier, which is deliberately excluded as seasonal. The Linktree's 16:00–19:30 beer promotion is also excluded; it is conditional and its displayed serving unit is inconsistent. The manifest includes only standard menu prices with clear named drinks and, for draft beer, explicit sizes. It does not infer spritz volume, cover charges, or completeness of the venue's menu. Recheck the exact source digests and offer text before any import.

The beer rows cover Forst Kronen, VIP and Sixtus, plus Weihenstephan Weissbier in two explicitly priced serving sizes each. The drinks rows cover the six explicitly grouped EUR 6 spritz variants, EUR 7 Negroni with Bombay gin, and EUR 7 Negroni Sbagliato. The Negroni variant is named so it cannot be mistaken for the EUR 10 Tanqueray or Bull Dog variants.

## Release boundary

This branch is for source review only. No audit receipt, protected database write, seed, public contribution, or store build has been run. The final importer must reverify current public catalogue identity, source content and protected database state before any future application.
