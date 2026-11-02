# Android European price reads and comparison

Android now has a separate app-only `EuropePrices` model and
`EuropePricesClient` reader. A new response is never cast to a legacy EUR tuple.
The original Italy-only parser and its geographic validation remain intact.

The reader accepts only the exact public HTTPS catalogue, cell-price and
venue-price URLs on `www.dovebevo.com`. It shares the original GET transport's
no-redirect, no-cookie-handler, content-type, response-size, deadline and
cancellation controls. No browser credentials, installation voter, session,
location permission or write method is used. Catalogue and mobile price bodies
are capped at 2 MiB. JSON is strict UTF-8 with duplicate/unknown field, numeric,
date and row-count validation.

The catalogue's actual OSM identity, name, country, currency, coordinates and
geohash cell are validated against the supported country bounds. Google URL,
review threshold and checked date are metadata validation, not a fresh Google
review lookup. Every price response must match the captured catalogue version,
venue cell and currency. Source provenance, nullable observation/confirmation
dates, revision UUID, integer native amount and the exact serving variant are
retained. Active rows alone are comparable; quarantine stays excluded. Hidden
arrays suppress both old and new rows. `legacy_venues` excludes mobile rows and
permits only independently verified legacy data; it cannot re-label a mobile row
as a legacy price.

## Favourites and Scopri

Both native screens retain every actual variant for the selected drink and time
band. Prices sort by currency/serving group first and by native amount only
inside that same group. Cards repeat the group label, including explicit ml or
an unspecified wine glass. GBP uses the pound formatter; EUR uses the euro
formatter. There is no FX conversion or cross-size cheapest-price comparison.
The generic beer label is “Birra alla spina”; a 250 ml beer is not described as
“media”. Legacy tuples have their own `EUR/legacy_unknown` group and explicitly
show “formato non indicato (dati precedenti)”.

Online-menu rows say “Dal menu online” and show the real source-check date and
menu item. Their observation date remains null; a source check is never shown as
a customer visit/payment. Customer rows retain their actual reported date,
confirmation count and stale-observation warning. Menu age uses its source-check
day and says “Menu da ricontrollare (oltre 90 giorni)”; its observation date stays
null. No prices or venues are
invented for an empty response, source failure or unavailable catalogue.

Each refresh loads at most one catalogue snapshot and one legacy health version.
Cells shared by bookmarks are still read once. Cells outside the original
legacy Italian geographic envelope use only
the new mobile price endpoint. Legacy cells use the original metadata/price
reader; a mixed Italian cell may additionally read the mobile endpoint, while
its missing legacy metadata remains explicitly partial. The existing 50-bookmark,
nine-discovery-cell, three-worker and 60-second overall refresh limits remain.
There is one additional startup GET. Worst-case mixed-cell reads are bounded by
`2 + 3 * cellCount`; current foreign-only cells need one price GET each.
Changing selectors uses the parsed memory snapshot without network reads.

Scopri accepts finite map centres inside the supported European envelope
(27.5–61 latitude, -18.5–19 longitude), retains the same zoom limits and at most
nine neighbouring cells, and never requests device location. Country/cell
validation remains on each actual catalogue venue. Missing foreign catalogue
data is unavailable, not a fallback to legacy EUR. Empty neighbouring cells
outside the legacy Italian area can be established from a successfully validated
catalogue without fetching nonexistent Italian files.
Neighbour-cell intersection with the original Italian bounds is checked per
cell, so moving a map centre just across that boundary cannot suppress a legacy
neighbour cell.

Generation tokens, foreground checks, cancellation, immutable batch delivery and
private bookmark storage remain unchanged. Network data and catalogue snapshots
are memory-only. Removing a bookmark removes all displayed variants for that
bookmark and cannot be undone by an older response.

## Verification boundary

Pure JVM fixtures cover GBP/EUR, wine 175/250 ml, beer 250/500 ml, happy-hour
variants, menu null observations, real customer dates, catalogue drift,
hidden/legacy precedence, strict serving/country/cell/provenance validation,
grouped sorting and shared catalogue loading. Existing cancellation/deadline,
concurrency and legacy metadata tests remain in the same suite.

`EuropePricesRuntimeTest` uses owned local responses and real native widgets to
check pound values, wine sizes, provenance labels, hidden refresh and unchanged
saved labels in Favourites and Scopri. Its APK can be compiled without launching
an emulator. Compilation is not evidence that instrumentation executed, nor a
signed/public mobile release.

The coordinator owns independent review, integrated checks and any later
targeted owned-fixture instrumentation run. No emulator, store, public price,
public vote, signing or deployment action belongs to this implementation lane.
