# Existing-venue menu research and app feature boundary

Checked 28 October 2026 UTC. This is a bounded source review, not a published price dataset or an import receipt. Roberto's plan, website, backend, schema, consumer price flow and existing catalogue remain unchanged. The owner's final clarification treats drink-based location comparison as a feature of the apps.

## What existing data supports

Live public health reports data_version 20261027. Its existing city index includes Milano (682 venues), Roma (547), Torino (359) and Firenze (256). London, Paris, Madrid and Berlin are absent from that index. These are indexed venue counts, not counts with current drink prices or Google review qualifications. The source importer currently uses the Italy Geofabrik extract and Italy validation. No new venue has been created.

The existing catalogue has nine categories, no serving-size variants, implicit euro cents and separate normal/happy-hour bands. Consumer and admin writes store source manual; the public API has no menu URL, currency or serving-context field. The consumer route may confirm an equal existing price. An automated menu reader must not masquerade as a consumer confirmation, change category limits to force acceptance or silently replace a consumer observation.

Native favourites comparison can use existing public reads, with current venue-name/visibility resolution and no new API or schema. Its comparison is between recorded prices for the selected category and band; it does not assert identical brands, quantities or packages.

## First-party source pilot

Only three already indexed venues were researched. All are in cell u0nd9. Their opaque keys identify the existing app destinations; the factual menu descriptions below come from the linked first-party sources. Source checks do not establish that an undated document is effective today.

| Existing venue | First-party facts | Representation limits |
| --- | --- | --- |
| Camparino in Galleria, n13001337602 | The [official menu page](https://www.camparino.com/it/menu/) links the [Bar di Passo PDF](https://www.camparino.com/app/uploads/sites/2/2026/07/Men%C3%B9_Bar-di-Passo_111_ITA.pdf). Its original page 6 was visually checked: mineral water 5, bottled Menabrea 10 and bottled Ichnusa 10. | The drink block omits volume and currency symbol; the document uses euro symbols elsewhere and says VAT/service included. Preserve Bar di Passo context. Bottled beer must not become beer_draft. July in the URL is not a price-validity guarantee. |
| The Dome, n10781209907 | The [official cocktail PDF](https://thedomemilano.com/wp-content/uploads/2025/12/MENU-Cocktail-The-Dome-2025-IT.pdf) lists still/sparkling water 75 cl at EUR 4, bottled beer 33 cl at EUR 8 and Spritz at EUR 18, with a stated 11:45–00:30 service period. | Spritz exceeds the current EUR 15 category ceiling. No limit changed. Bottled beer is not draft beer. The filename's 2025/12 does not establish a current validity date. |
| Terrazza Duomo 21, n7953838530 | Its [official wine-glass item page](https://www.terrazzaduomo21.it/menu-item/calice-di-vino/) lists four wine choices and Price 10. Its [bar page](https://www.terrazzaduomo21.it/bar-lounge/) separately describes aperitivo at EUR 20 per consumazione, 18:00–21:30. | The item page lacks currency symbol, serving volume and effective date. The aperitivo package is not a replacement per-drink quote. |

## Required Google review gate

The requested condition is strictly more than one hundred Google reviews, not at least one hundred. Roberto's existing data has no Google review-count or place-ID field. Eligibility is **unknown for all three** pilot venues; none qualifies for automated publication on this evidence.

[Google Maps Platform terms](https://cloud.google.com/maps-platform/terms), section 3.2.3, restrict scraping/exporting Google Maps content and creating content from it. [Places policies](https://developers.google.com/maps/documentation/places/web-service/policies) restrict storage and specify attribution/map requirements; [service-specific terms](https://cloud.google.com/maps-platform/terms/maps-service-terms), section 14, also address use with non-Google maps. A Places key alone is not evidence that persisting a review-derived eligibility list for the existing OpenFreeMap interface is permitted. EEA terms differ and the relevant billing jurisdiction has not been established for a proposed Google integration. No paid API, scraper or Google-derived dataset has been configured.

A supported source/licensing route for that eligibility criterion, factual serving/currency/context representation and a distinct menu-source publication path must be settled before a public import. This does not block the app-only drink selector, favourites comparison or native navigation. Do not infer authority to change Roberto's regional strategy, website or price semantics from this research.

## Outcome

Three existing venues have a bounded source review. Zero new venues, public prices, confirmations or votes were submitted. No review count is claimed. Menu imports and European catalogue expansion remain separate, unimplemented work; the current implementation uses the existing public dataset only.
