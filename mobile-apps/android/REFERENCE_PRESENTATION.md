# Android reference presentation

App-only changes retain the five owner-selected bottom controls, orange accents,
normal browser security/history, private favourites and existing contribution
handlers. Scopri uses the existing validated loader and all nine categories plus
normal/happy-hour filters. Illustrated category cards show actual loaded counts;
compact result ordering restarts within each currency/serving group. The category rail is the drink selector; only the price-band control remains in the compact header. Exact currency/serving, source/check-or-report day and stale state remain visible; the labelled disclosure opens full address, source conditions and confirmations. Unknown
legacy serving sizes remain explicitly labelled. No deal badge, menu price,
venue photo or customer confirmation is invented.

The nine offline JPEGs in `app/src/main/assets/reference-drinks` are generic
AI-generated category/community illustrations supplied for this task. The existing first-party BrandMark is reused on the share poster. Their
byte hashes are in the adjacent provenance file. Gin Lemon uses the lemon-garnish
Gin Tonic illustration. They are explicitly not photographs of the listed venue.

Overflow Share reads only the fixed version-1 visible mobile DOM contract. The
current trusted route, selected venue key, visible venue heading and visible
price marker must agree. Exact fields and bounds are validated, and callbacks
are fenced by document epoch, foreground state and request generation. Invalid,
missing or unavailable price metadata keeps the previous URL-sharing behaviour.
It never introduces a general JavaScript/native mutation bridge.

A valid snapshot opens a full-screen dark branded image preview with original currency, serving,
price band, source text, confirmations and any actual comparison tier/location.
The drink illustration is labelled. Only the user's explicit Share image action
creates a PNG under the app's private `cache/price-share` directory. A non-exported
FileProvider exposes only that subdirectory through a temporary read grant;
bookmarks and other private storage are outside its paths. Sharing includes the
canonical public venue URL. Stale preview actions are refused. Old generated
images are opportunistically removed after 24 hours on a later share.

Altro is a full-screen local information menu for the existing map-area, guidance, bundled rules,
privacy, contact and actual installed-version information. No account, report
history, fake functionality or new permission is added.

Local gates (existing SDK/JDK/cache; no signing):

```powershell
.\gradlew.bat --offline --no-daemon :app:testDebugUnitTest :app:lintDebug :app:assembleDebug :app:assembleDebugAndroidTest
```

Owned runtime suites use `NativeFixtureRunner` and its isolated WebView profile:
NativeUsability, Recommendations, Favorites, Discovery, EuropePrices and
PriceShareRuntimeTest. The latter uses network-blocked local HTML, tests the real
WebView reader, poster, provider scope, stale cancellation and information menu.
It does not open an external chooser. Opt-in `-e captureReference true` retains
original debug fixture screenshots under the app-specific external files
`reference-fixtures` directory. These contain explicitly synthetic owned fixture
rows; they are not public venue-price, physical-device or signed-release proof.
Normal production browsing and any store screenshots require separate read-only
verification after integration and deployment.
