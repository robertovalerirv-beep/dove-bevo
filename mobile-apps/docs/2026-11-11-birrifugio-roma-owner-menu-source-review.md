# Birrifugio Trastevere, Roma: owner menu source review candidate

This is a source-only candidate for the already mapped venue `n3631760159` in cell `sr2y5`. It creates no venue, public price, customer observation, vote, or website change. Protected production audit, independent all-row source review, guarded seed, and public readback are still required.

## Venue and source identity

- The published `20261108` Italian static cell contains exactly `n3631760159`, `Birrifugio`, pub kind `2`, coordinates `41.87757, 12.46608`, `Via Federico Rosazza 4`, Roma city ID `72959652`.
- The live OSM node `https://www.openstreetmap.org/node/3631760159` (version 3 on 11 November 2026) names Birrifugio at Via Federico Rosazza 4, coordinates `41.8775735, 12.4660827`, and links `https://www.birrifugio.com/`.
- The current venue menu `https://www.birrifugiotrastevere.com/menu/` labels itself Birrifugio Trastevere. Its built-in contact overlay states `Via Federico Rosazza 4-6, 00153, Roma` and `trastevere@birrifugio.com`. That links the newer menu domain to the mapped venue and its older OSM website domain; 4 is within the owner's 4-6 entrance range. The source page was fetched with the protected importer's `DoveBevoMenuAudit/1` user agent on 11 November 2026, HTTP 200 with no redirect, 1,799,927 bytes. Its raw SHA-256 was `9787d7566cce4d1222587c16a9bbfb079bb56f7775955dcb48b2874401c73ba1`; the importer's `html_text_v1` visible-markup-text SHA-256, pinned by the manifest, was `041684462ee8d119f404c3e5267c6382d723e2f94827dcd0d05612ff29a31a3a`. A second current GET returned the same normalized hash.

## Offer extraction and conservative exclusions

The menu HTML has 712 rendered product-card copies representing 361 unique `data-prodotto-id` values. For each ID, the repeated cards agree on exact title, displayed price and Italian detail fields. The 266 staged offers are the unique cards in drink sections that have one individually paired amount containing a euro sign. Each manifest `evidence_ref` names the owner product ID, section, title, amount and any usable printed `Dimensione`. All card amounts also agree with their detail popup's price field.

- 80 food products are excluded using the menu's food branches, including the parent `CIBO` and its named subcategories.
- 15 non-food products are excluded because their amount has either multiple unpaired prices (for example a wine glass/bottle string) or no printed euro symbol. No price range is split or assumed.
- Ten `BIRRE ALLA SPINA` items are categorized as draft beer; five explicit Spritz items, one Negroni and one Negroni Sbagliato receive only their exact categories. Eighteen nonalcoholic menu items are categorized as such. The other 231 priced drinks remain uncategorized rather than guessing cocktail, beer-bottle, wine-glass or spirit semantics.
- Only explicit `ml`, `cl`, or `L` units produce `serving_ml`. The menu's bare `0,5`, `0,33`, and `37,5` numbers do not establish a volume. One printed `Boccale 0.5 cl` is implausible: the drink price is staged, while that serving label and any inferred millilitres are withheld. Other unitless glass labels remain verbatim with `serving_ml: null`. This intentionally avoids making them medium-beer comparison prices without evidence.
- The page contains no explicit mandatory fee amount or no-fee declaration. `fees` and `fee_coverage` are empty, meaning unknown coverage, not zero fees.

The candidate manifest is `mobile-apps/data/mobile-menu-v2-seeds/60bf65995177d7d00b098833518a6280b2089041ae9711bde6056979e91d14b7.json`. It must be independently compared with the current owner page before any main merge or protected audit. Because the importer pins the complete normalized page, any subsequent owner menu change stops the guarded run until a new source review.
