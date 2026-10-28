# Native favourites and comparable prices

The owner requests selecting one drink across private favourites and an interface that feels native. The owner has already opted out of routine design questions. The coordinator selects the following design using the existing Java Android and UIKit iOS applications, without dependencies or changes to the website interface.

## User behaviour

Use native bottom destinations **Mappa** and **Preferiti**. Keep a single live browser instance and its history when switching destinations. Opening a favourite returns to Mappa and opens its validated URL. System Back from Preferiti returns to Mappa; it must not navigate the hidden browser. Browser history, share and stop/reload remain secondary native controls; preserve their existing recovery and safety behaviour.

When an existing venue is open and its context is usable, expose **Salva nei preferiti** and **Drink consigliati** visibly. Saving uses its actual displayed name, with no name form. Disable context actions during invalid/loading/background/stale contexts. Preserve the existing capture-generation and save/removal race guards. Context-specific recommendations retain their current shared public counts and write safety.

Preferiti is a full native list, not nested dialogs. Display one selector for the nine existing drink categories and a separate **Normale / Happy hour** selection. Default to Birra media and Normale. Never mix happy hour into normal prices or silently switch serving categories. Each row shows the real venue name, selected price in EUR, observed date and confirmation count. Sort available active prices ascending, then names; put missing/unavailable entries afterwards. Do not describe a lowest price as universally cheapest: it is only the recorded category and band among these favourites. Keep a remove action and clear empty-list instructions.

All saved names remain readable offline. Prices are fetched when the user opens Preferiti or explicitly refreshes; there is no background polling, startup prefetch or account sync. An unavailable request is different from a successful response with no price. Quarantined prices are excluded. More than ninety days old is labelled old, and every price shows its date. Cancellation, removal, destination change and backgrounding retire pending results. A late result must not resurrect a removed venue or overwrite a newer refresh. Re-entering refreshes current information. No persistent cached price is represented as current.

## Existing read-only data route

Group the at-most-fifty canonical saved URLs by their validated five-character c geohash. Fetch the current data version from the existing public health response, then the versioned static cell file and GET /api/prices/<cell> once per unique cell. Resolve each OSM key against the current cell file, use its actual name, reject hidden keys from h, and resolve user keys only from the approved u list. Missing current venue metadata makes it unavailable rather than asserting an old name is current. Local saved labels remain an offline fallback; do not rewrite the persisted store from network results.

Cell file: {c:[[cityId,name]],v:[[key,name,kind,lat,lon,address,cityIndex]]}. Price file: {p:[[key,drink,hh,cents,observed_on,confirmations,q]],u:[[key,name,kind,lat,lon]],pend:[],h:[hiddenKey],g?:[]}. Only the expected cell and canonical keys are accepted. For p, validate exact row shape, known catalog, integral bounded cents/confirmations, real ISO calendar date, hh in 0/1, q in 0/1, and uniqueness per key/drink/band. Do not coerce fractions, booleans or malformed numbers. An error body, malformed data, duplicate pair or oversized response must not become an empty success. Bounds and metadata constraints are finalised against actual existing responses before coding.

Use fixed-origin HTTPS GET only, ordinary TLS, no redirects, cookies, WebView authentication, installation voter identifier, precise position or POST. Maximum three in-flight requests; finite deadlines/body bounds; cancel on deactivation/dismissal. Share data for equal cells and parse all drink categories once so choosing another drink does not trigger a request storm. Tests inject owned fixtures and transports; never add public votes, prices or venues.

## Storage and privacy

Favourites persist in private app storage on this phone, excluded from backup for newly written current stores. There is no login or cross-device sync; deleting app data can remove them. Comparison requests reveal the relevant coarse venue cells to the service; there is no single upload of the saved list. Update the bundled public privacy text to disclose this explicitly. Keep existing privacy manifest claims and identifiers unless a new actual API use requires a reason.

## Alternatives and boundary

A website redesign would also affect Roberto's existing work and is outside this task. A second native map/data service would duplicate the current app and is unnecessary for this increment. Reusing the browser map with real native navigation, favourites and comparison provides the requested improvement while preserving the live website.

Menu research is separate from consumer contributions. Existing storage uses implicit EUR and manual observations without a menu-source field; never send menu quotes through the consumer confirmation flow. Existing Italy-only venue data does not establish existing venues in London, Paris, Madrid or Berlin. More than one hundred Google reviews is a required eligibility gate, not an assumed property. Prepare a factual source ledger and identify the supported import contract before any public data write. No new venue creation is authorised by the final existing-venues-only restriction.

## Evidence and coordination

Android and iOS writers own separate existing OneDrive worktrees and only their platform files. Root owns contracts, shared disclosures, integration, menu evidence and final checks. A third independent lane researches data/source constraints and later reviews native changes. Runtime capacity is four including root; all four are used for non-duplicative work. No capability-isolated hardened-swarm claim is made.

Acceptance: correct same-drink/band prices for multiple fixture venues, shared-cell request deduplication, current name/visibility resolution, safe sorting and real dates; missing/error/offline/hidden/quarantined states; refresh/removal/background races; unchanged bookmark files; accessible native navigation at large text and safe areas; retained browser/recommendation safety; root fresh integrated checks and independent review before a gated native beta. Public release remains a separate store decision.
