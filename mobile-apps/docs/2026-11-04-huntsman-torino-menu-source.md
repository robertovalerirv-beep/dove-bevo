# Huntsman Pub, Torino: owner menu evidence for an app-only seed

Checked on 4 November 2026. This is a proposed menu seed, not a public import or a customer-observed price. It leaves Roberto's website, legacy EUR prices, and customer contributions unchanged.

## Venue identity

- Roberto's live app-only venue `n6740149513` in cell `u0j2q` is **Huntsman Pub**, Torino, kind `1`, at `45.06161, 7.68126`; its v2 menu route returned zero stored offers when checked.
- [OpenStreetMap node 6740149513](https://www.openstreetmap.org/node/6740149513) is named Huntsman Pub, tagged `amenity=bar`, at `45.0616146, 7.6812638`.
- The [venue-owned site](https://www.thehuntsmanpub.it/) and every menu page identify the location as `C.so Vittorio Emanuele II, 43, 10125 Torino (TO)`. Roberto's static venue has no address field, so the manifest preserves `address: null` and adds no new venue.

## Checked owner sources

The immutable manifest is `mobile-apps/data/mobile-menu-v2-seeds/b0a50093c16fbffecd6e866a3241a24fef79812569faf4c15619f3badafafaeb.json`. Each digest below is the importer's `html_text_v1` normalized visible-text SHA-256, fetched with its audit user agent. The same digests were observed on repeated fetches. The site displays copyright 2025 but no explicit menu revision date; these are source-check dates, not menu-publication dates.

| Owner menu page | Imported offers | Visible-text SHA-256 |
| --- | ---: | --- |
| [Birre alla spina](https://www.thehuntsmanpub.it/birre) | 24 | `3cfff7fc4d3807deb2777b60a278fe2b9bbe7a8f70ea501cc305e28a52d7088d` |
| [Bibite](https://www.thehuntsmanpub.it/menu) | 33 | `a811c39047f7f212e3d4bb6c95c6cd3664b743d1626c375a7ed01e71e8ecdd9d` |
| [Vini](https://www.thehuntsmanpub.it/menu?location=Corso+Vittorio+Emanuele+II&menu=vini) | 46 | `679e695460a38a95590fef47a82251fce47ae9561ed92cf7271ea3419a446f08` |
| [Cocktails](https://www.thehuntsmanpub.it/menu?location=Corso+Vittorio+Emanuele+II&menu=cocktails) | 47 | `f170e4cb8482fbb5ac3283891f20a6c2ec61522032ebbab278c8d2d872a8de7e` |
| [Whiskies](https://www.thehuntsmanpub.it/menu?location=Corso+Vittorio+Emanuele+II&menu=whiskies) | 31 | `699a0d977cf5a1d63cac10c0dff11dec850f3878db75c1ae5d66a083f1d12de4` |
| [Distillati](https://www.thehuntsmanpub.it/menu?location=Corso+Vittorio+Emanuele+II&menu=distillati) | 67 | `422823aaeb210bc689b82e2a8e9d4ab63e959f375898084380f5159c728d8105` |
| [Dolci e caffè](https://www.thehuntsmanpub.it/menu?location=Corso+Vittorio+Emanuele+II&menu=dolci-caffe) | 9 drinks | `91a0ef1d67c3c46681c088eacb27fc2c1e90a59a7f7c59c93bc7c6fb9461e089` |

The 257 offers retain the menu's names, EUR prices, explicitly named variants and quantities. Examples include Carlsberg Pilsner `Piccola` EUR 4.00 / `Media` EUR 6.00 on the draft list, Negroni EUR 9.00 on the cocktail list, and Dogliani DOCG Dolcetto `Calice` EUR 5.00 / `Bottiglia` EUR 20.00 on the wine list. No ml quantity was inferred for `Piccola`, `Media`, `Calice` or unlabelled pours. The bottled beer quantity comes from its menu description, e.g. `33 cl`.

Eight food desserts were excluded. The whisky page repeats the exact name `BLUSHMILLS` with different prices and no clearly paired item-name distinction; both lines are held. `GLENMORANGIE ORIGINAL MIRROR` is held because the owner label does not clearly identify a separate product. These three whisky lines are not in the seed. No service or cover charge is asserted by these drink pages; fee coverage therefore remains unknown rather than being declared free. The seed contains no Google review claims, menu descriptions, photos, or fabricated customer confirmations.

## Guarded next step

Independent review must compare every offer with the pinned owner pages and inspect hidden, reported, moderated and existing customer price state. After merging a reviewed manifest to Roberto's `main`, the protected audit tag must run first; only a successful reviewed audit can support a separate guarded seed tag. A merged file alone does not populate the app.
