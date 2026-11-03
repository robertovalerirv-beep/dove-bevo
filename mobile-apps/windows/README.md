# Dove Bevo for Windows

This is the Windows desktop client for Roberto's existing Dove Bevo service. It uses
WebView2 at `https://www.dovebevo.com/` with the normal website session. The
Windows shell adds browser navigation, search access, foreground location
consent, an external-link handoff, sharing by copying the current link,
support email handoff to the default mail app,
Scopri access to the app-only Europe map, shared drink recommendations for
supported Italian venues, and private favourite drinks saved with the venue's
existing name. A favourite stores a validated app link that reopens the venue
with that drink and time band selected. Regular and happy-hour offers can both
be kept for the same drink and venue. Each favourite stays in this PC's local application
data and requires internet to see current prices. Saving a price for everyone remains the site's
orange contribution action; saving a private favourite does not publish a
price.

The website origin and venue route are validated before a native favourite is
saved or reopened. The read-only venue capture requires a visible venue sheet
and exactly one selected drink; it supports the existing Italian check boxes
and the app-only Europe drink selector. It never accepts a name typed into the app.
Browser cookies and favourites stay under Windows LocalAppData, outside source
and OneDrive. Recommendations use a separate random installation voter ID in
LocalAppData, without sharing WebView2 cookies or login credentials with the
vote client. No authentication token or page script bridge is copied into
native storage.

## Build and checks

Requires Windows 10 version 2004 or newer, .NET SDK 10, Windows SDK MakeAppx,
and Microsoft Edge WebView2 Runtime for running the app.

```powershell
dotnet run --project mobile-apps/windows/tests/PolicySmoke/PolicySmoke.csproj -c Release
node --check mobile-apps/windows/VenueCapture.js
node --test mobile-apps/windows/tests/search-click.test.mjs
node --test mobile-apps/windows/tests/venue-capture.test.mjs
& mobile-apps/windows/tests/PackageVersionSmoke.ps1
dotnet build mobile-apps/windows/DoveBevo.Windows.csproj -c Release
& mobile-apps/windows/build-msix.ps1 -IdentityName 'SVGASSOCIATESLTD.DoveBevo' -Publisher 'CN=6662F5A9-CE4F-4B02-8FEF-E7EDB0927757' -PublisherDisplayName 'SVG ASSOCIATES LTD' -Version '1.0.8.0'
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

This first Windows build reuses the live website for shared prices and venues.
Private favourites are local to this PC and have no account sync. Scopri opens
the app-only catalogue and its city/drink filters inside WebView2; the phone's
separate native ranking screen is not yet replicated. Shared recommendations
work for the existing Italian venue route supported by that API; other
catalogue venues show an unavailable state. The identity-aligned package still
needs a genuine Desktop screenshot, Store submission, certification and installed-client testing before a
public release can be claimed.
