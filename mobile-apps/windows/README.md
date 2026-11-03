# Dove Bevo for Windows

This is the Windows desktop client for Roberto's existing Dove Bevo service. It uses
WebView2 at `https://www.dovebevo.com/` with the normal website session. The
Windows shell adds browser navigation, search access, foreground location
consent, an external-link handoff, sharing by copying the current link, and
private favourite drinks saved with the venue's existing name. A favourite
stays in this PC's local application data and requires internet to reopen the
venue and see current prices. Saving a price for everyone remains the site's
orange contribution action; saving a private favourite does not publish a
price.

The website origin and venue route are validated before a native favourite is
saved or reopened. The read-only venue capture requires a visible venue sheet
and exactly one selected drink. It never accepts a name typed into the app.
Browser cookies and favourites stay under Windows LocalAppData, outside source
and OneDrive. No authentication token or page script bridge is copied into
native storage.

## Build and checks

Requires Windows 10 version 2004 or newer, .NET SDK 10, Windows SDK MakeAppx,
and Microsoft Edge WebView2 Runtime for running the app.

```powershell
dotnet run --project mobile-apps/windows/tests/PolicySmoke/PolicySmoke.csproj -c Release
node --check mobile-apps/windows/VenueCapture.js
dotnet build mobile-apps/windows/DoveBevo.Windows.csproj -c Release
& mobile-apps/windows/build-msix.ps1 -IdentityName 'DoveBevo.Development' -Publisher 'CN=DoveBevo Development' -Version '1.0.0.1'
```

The example package identity is for **local packaging validation only**. The
script produces an unsigned x64 MSIX inside `mobile-apps/windows/out/`; it does
not sign or submit it. For a Microsoft Store candidate, reserve Dove Bevo in
Partner Center and pass that product's exact Package/Identity/Name and Publisher
values to the script, with a fresh four-part version. Microsoft signs the
accepted Store package. Test the actual Store package on a Windows PC before
claiming public availability.

Microsoft's [manual MSIX package guide](https://learn.microsoft.com/windows/msix/desktop/desktop-to-uwp-manual-conversion)
documents the desktop manifest and MakeAppx flow. [MakeAppx documentation](https://learn.microsoft.com/windows/msix/package/create-app-package-with-makeappx-tool)
notes that a bare MSIX is not the preferred `.msixupload` bundle for Partner
Center; the final submission route and identity must be verified there.

## Current limits

This first Windows build reuses the live website for shared prices and venues.
Private favourites are local to this PC and have no account sync. The native
phone-only recommendations and discovery views have not yet been ported to
Windows. The packaged app needs Store identity alignment and installed-client
testing before submission.
