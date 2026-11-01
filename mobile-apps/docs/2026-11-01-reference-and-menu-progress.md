# Reference layout and menu import progress

Build52 did not deliver the requested six-screen design. The app-only follow-up now includes native discovery, compact controls and a safer source-backed menu import. Website code, backend routes/configuration and database schema remain unchanged.

## Live prices

Two actual guarded batches have inserted 21 menu prices at six existing venues in Torino, Roma, Milano and Firenze. All amounts were verified through the public API, with zero customer confirmations. These are curated menu transcriptions, not customer visits. The exact manifests and preservation/audit/apply receipts are documented on the separate menu-import branch in `mobile-apps/data/MENU_BATCHES.md` and PR84. This does not establish complete European coverage. The current price contract is EUR and its published catalogue is Italy-oriented.

## App changes

Home now opens native Scopri with real nearby prices, a drink filter and normal/happy-hour bands. Mappa retains browser history; Preferiti stays private local storage. Public read loads use at most nine geohash5 cells around an explicitly captured map centre, three concurrent requests and a 60-second deadline. Metadata, moderation, dates and price bounds are validated. Cross-cell identity conflicts are excluded and remain marked partial. Prices are neutral; no artificial deal rank is invented.

The shared presentation keeps the real website controls and handlers. Selected drink chips now use readable dark fill and white text. The price form has a compact action heading with the original venue name beneath it; original back/close accessible names remain. A generic Spritz illustration is embedded locally only for that drink, with no venue-photo claim or remote image request. Core script bounds remain32 KiB on iOS and128 KiB on Android; the optional artwork has a separate256 KiB bound and fails back to the original functional form.

## Verified phase evidence

- Corrected source0369bb4: iOS run41355267643 passed89 native cases and4 live UI cases. Actual artifact17,784,012 bytes, SHA256 `8324f356577a5796ebf66103659800755ae03fd0dc6fac081afbe6dacefac96c`. Originals remain under the project evidence directory. That source predates Scopri and artwork.
- Current integrated source:83 Android JVM cases, zero lint errors, Debug/test APK compilation and32 installed fixture cases passed, including actual native discovery filtering/empty/error behaviour. The fixture runner uses an isolated browser profile and owned response bytes; no public price or vote was submitted.
- Current shared presentation:40 cases pass with zero skips, including actual browser CSP, image decode, original input/focus/selection and accessible form actions. All115 iOS script/release guards pass. New Swift/UIImage/runtime checks still require the hosted Mac gate.
- APK SHA256 `1532b6386526ad8fe22a85f15792b0a675d50dd10dd47d13e165a8186e31d2a0`; test APK SHA256 `fa1f586b467a5ba5df0c55daea2a80e85f8b3ef2a7265f2a6384e9c4c6e7a677`. All three bundled script resources match source byte-for-byte; original PNG/JPEG source files are not redundantly packaged.

## Remaining work

Visual QA remains blocked. Actual reference comparisons still show substantial map pin/basemap and venue-detail differences. Native discovery, artwork and the compact form need new genuine iOS captures and comparison. Receipt photographs, historical paid-date entry and image-sharing are functional product work, not decorative controls. A native map/venue-card seam is being assessed without altering Roberto's frontend/backend.

The signed-in browser tool still reports local use disabled despite user authorization. Automatic approval review separately rejected direct Android launch/screen capture; normal isolated SDK instrumentation testing succeeded. Current store review decisions and any public launch must be checked independently. No updated binary has been signed or distributed by this phase yet.
