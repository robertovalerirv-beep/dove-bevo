# Dove Bevo for Windows

This Windows client opens Roberto's separate app interface at
`https://www.dovebevo.com/mobile/` inside WebView2. The bottom bar has Home,
Mappa, Preferiti and Consigliati. Search is on the map. Home opens Scopri prezzi; the overflow
menu has Reload, Share and Privacy. The app keeps the normal HTTPS website session,
location permission prompt, and external-link confirmation.
Mappa returns from a venue to the last selected city map, including city changes
made within the app. Home starts Scopri in that city when its map is unavailable.

An exact drink row in an open venue offers **Salva** and a public 👍 count.
Salva stores the venue, drink and original serving locally on this PC without
asking for a new name; it does not publish a price or a vote. Preferiti refreshes
each saved drink's current public price through read-only routes and says when
that price cannot be verified. It never converts GBP to EUR. Consigliati is a
read-only list of the public drink votes in the selected map area. To cast or
remove a vote, use the 👍 beside that drink in its venue sheet. The native
Windows client itself sends no vote POST.
For European favourites, opening the venue highlights only the saved drink's
exact currency and serving. If that live row is gone, it says so instead of
focusing another serving. Moderated or legacy-overridden European venues do
not reveal a price in Preferiti.

The native Save action requires a visible link in the active venue sheet and
checks its exact venue, drink, time band, currency and serving before storage.
The app advertises native Save only after the trusted `/mobile/` shell marker
appears. Browser cookies and private favourites stay under Windows
LocalAppData, outside source and OneDrive. Old local favourites are preserved;
their live price is shown on the venue page until an exact row is saved anew.

Scopri combines current public Italian customer reports and reviewed menu
offers with the app-only European catalogue and price cells near the selected
city or zoomed-in map. Prices are grouped and sorted numerically within their
original currency; EUR and GBP are never converted or ranked against each
other. An Italian menu's serving is shown when specified, and Birra media
excludes small, large, pint, conflicting and unknown servings. The app-only
European source follows the same size rule. Menu rows show their source and
check date; customer rows are labelled as reports. A visible notice explains
that menu samples are incomplete and that servings, currencies and possible
cover charges need checking. Hidden and legacy-overridden venues stay out of
the European source. A failed source is reported as unavailable, without
inventing a price. Selecting a European row opens its venue without an
ambiguous drink-only focus. Full menu details and fees remain in the venue
sheet.

The Scopri city selector reads the current Italian places and app venue
catalogue. It previews major Italian cities before European choices; typing
searches every loaded city. A partial or failed city source offers Retry, and
the current map area remains available without inventing a location.

## Build and checks

Requires Windows 10 version 2004 or newer, .NET SDK 10, Windows SDK MakeAppx,
and Microsoft Edge WebView2 Runtime for running the app.

```powershell
dotnet run --project mobile-apps/windows/tests/PolicySmoke/PolicySmoke.csproj -c Release
node --check mobile-apps/windows/SaveLinkCapture.js
node --test mobile-apps/windows/tests/save-link-capture.test.mjs
node --test mobile-apps/windows/tests/exact-favourite-focus.test.mjs
node --test mobile-apps/windows/tests/shell-contract.test.mjs
node --test mobile-apps/windows/tests/map-area-reader.test.mjs
& mobile-apps/windows/tests/PackageVersionSmoke.ps1
dotnet build mobile-apps/windows/DoveBevo.Windows.csproj -c Release
& mobile-apps/windows/build-msix.ps1 -IdentityName 'SVGASSOCIATESLTD.DoveBevo' -Publisher 'CN=6662F5A9-CE4F-4B02-8FEF-E7EDB0927757' -PublisherDisplayName 'SVG ASSOCIATES LTD' -Version '1.0.12.0'
```

The example uses the reserved Partner Center product **9P6XDNNQJ74N**, with
its exact Package/Identity/Name and Publisher values. Use a fresh four-part
version for subsequent submissions with a **zero fourth component**, reserved
for the Microsoft Store. The script produces an **unsigned** x64
MSIX inside `mobile-apps/windows/out/`; it does not sign or submit it.
Microsoft signs the accepted Store package. Test the actual Store package on
a Windows PC before claiming public availability.

Microsoft's [manual MSIX package guide](https://learn.microsoft.com/windows/msix/desktop/desktop-to-uwp-manual-conversion)
documents the desktop manifest and MakeAppx flow. [MakeAppx documentation](https://learn.microsoft.com/windows/msix/package/create-app-package-with-makeappx-tool)
notes that a bare MSIX is not the preferred `.msixupload` bundle for Partner
Center; the final submission route and identity must be verified there.

The packaged WPF desktop executable runs at medium integrity with
`packagedClassicApp` and therefore declares `runFullTrust`. Microsoft lists
this as a restricted capability requiring a [Submission options explanation](https://learn.microsoft.com/windows/apps/package-and-deploy/app-capability-declarations#restricted-capabilities):
the app needs it to run its native Windows UI, WebView2 host, and private local
favourite storage. The [Store package version rules](https://learn.microsoft.com/windows/apps/publish/publish-your-app/package-version-numbering?pivots=store-installer-msix)
reserve the revision component for Store use.

## Current limits

The current public Store build predates the four-tab interface in this source.
This update needs a new Store submission and an installed-client check before
the new behaviour can be claimed public. Private favourites are local to this
PC and have no account sync. Scopri shows
verified sample menu offers near the selected city centre or current zoomed-in
map, with a drink filter. It is a bounded local discovery view, rather than a
complete city-wide inventory. Area totals across Italian and European venues
require the server deployment that accepts `include_europe=1`; if that route is
unavailable, the app reports it instead of showing an empty list.
