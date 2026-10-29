# App visual direction — owner reference, 29 October 2026

The owner's six-screen image is the visual target for the phone apps: white surfaces, clear dark typography, prominent recorded prices, restrained borders, rounded cards and controls, and readable deal colours. This is an adaptation to Dove Bevo's existing product, rather than a specification for new public data or backend features.

## First implementation

| Surface | App presentation |
| --- | --- |
| Map and search | White controls, soft search/drink panels, system typography and quieter overlays. Existing actual map, attribution, selection and coverage remain functional. |
| Venue details | Clean white card instead of the torn receipt treatment; existing name/address; dominant recorded drink prices; distinct date, confirmations, old-price warning and public correction/report actions. |
| Add a price | Compact complete title, large unified price/currency field and dark primary action; existing drink and happy-hour flow. |
| Favourites | Native cards with the real saved name, selected drink/band, recorded price/date/confirmations, explicit missing-price states, opening and removal. |
| Recommendations | Native cards with the venue's actual shared per-drink totals and the existing recommendation/undo states. |
| Navigation | Existing Home, Mappa, Preferiti, Salva and Consigliati bottom controls. Share and Reload/Stop stay in the top menu; browser Back/Forward remain available. |

The reference's venue photography, receipt upload, observation-date picker, personalised discovery feed, own-contribution history, illustrated sharing image and rating smileys are not existing app contracts. This pass does not add decorative nonfunctional versions of those controls or invent photographs, venue prices, availability or user history. Private bookmarks still use the existing venue name without asking the person to name it.

Affare/Giusto/Salato continue to mean the existing cell-median price comparison, including neutral sparse-data cases. They do not become user ratings or recommendations. Native favourite price data has no comparable tier, so its price chips remain neutral. Shared thumbs-up totals remain separate from both private favourites and public price contributions.

## App-only boundary

The shared static `presentation/app-theme.js` styles existing visitor-page DOM inside the app. Android and iOS package the same resource; the public website, Worker, schema and resources are unchanged. The app deliberately uses a light palette for this visual direction.

The installer accepts only the genuine visitor shell, exact existing HTTPS hosts and root/canonical venue paths in the main frame. It uses the current document's existing nonce for one owned stylesheet, verifies a computed-style sentinel and fails back to the original website if eligibility, nonce or style admission fails. It adds no network requests, incoming bridge, message handler, credentials, storage, public data writes or changed event/form handlers. Existing CSP, authentication, cookies, user agent, Turnstile and legal/admin documents remain outside the enhancement.

The existing map's markers are canvas images cached by price tier, freshness and website theme. This CSS does not replace map rendering or guarantee the reference's teardrop geometry/recolouring of previously cached pins. The map implementation remains an explicit follow-up if closer pin geometry is desired.

## Acceptance and verification

- Verify all five actual native controls, destination retention, automatic-name save, private comparison and public recommendation lifecycles.
- Verify actual price-form markup, complete narrow titles, modal focus/close/scroll and keyboard reachability. Keep errors, missing prices, dates, stale warnings, consent and reporting visible.
- Verify exact-origin/route/frame fences, missing nonce, CSP rejection, collision and duplicate installation; no persistent observer or general bridge.
- Compare original runtime captures with the owner's reference. Label synthetic local fixtures as such; distinguish those from real service screenshots and physical/store-delivered app tests.
- Run fresh integrated Android build/JVM/lint/runtime checks and hosted iOS compile/native/UI checks before distributing this update.

The loopback-only `presentation/preview.py` is a CSS fixture using unchanged website styles and corresponding component markup. Its synthetic amounts and names are never public contributions, and it cannot contact the public service. Start it with `python -B mobile-apps/presentation/preview.py`; open `http://127.0.0.1:4186/`. The preview is evidence of DOM/CSS presentation and local interactions only, not of native injection, a live map, iOS rendering, signing or store availability.

## Release separation

Keep build 41 and its existing store submissions intact while developing and testing this visual update. Source changes, test captures and a draft pull request do not establish a new TestFlight/Play release or public launch. The one-off Europe menu importer is separate and is not resumed by this visual work.
