# Dove bevo mobile apps

The canonical project is [Roberto's GitHub repository](https://github.com/robertovalerirv-beep/dove-bevo). This directory contains independent Android and iOS applications. They use the existing production service at https://www.dovebevo.com with its normal browser session and add native phone integration. The website interface and price contributions retain their existing behavior. The owner's apps-only recommendation request separately authorizes one additive Worker API and D1 table, delivered through the existing deployment pipeline.

- Android: `android/`, package `com.dovebevo.app`.
- iOS: `ios/`, bundle identifier `com.dovebevo.app`.
- Functional checks and retained build evidence: the **Mobile apps** workflow for pull requests and release tags.

See [release status](RELEASE_STATUS.md) for verified build, store and submission progress.

The separate [native usability update](docs/2026-10-28-native-update-status.md), corrected build **32**, is available in Android internal testing for the existing owner list, and **Testing** in TestFlight for the existing owner and Roberto groups. On an open venue, tap **⋯ at the top right → Salva nei preferiti** to save its existing name automatically, then **Preferiti** to reopen or remove it. No naming or rename form is required. Private bookmarks do not publish prices. The existing orange **Aggiungi un prezzo qui** action contributes a price for everyone through Roberto's website. Opening maps and live prices still requires internet. Stop/Reload recovery and Android Forward/location-help controls remain. These testing releases do not replace the Android 20/iOS 26 public submissions under review.

The [public drink recommendation update](docs/2026-10-28-drink-recommendations-status.md) adds a native **Drink consigliati** screen for the open venue. Customers can recommend a drink, see public totals and undo their own choice. This is separate from saving a private bookmark, adding a price or confirming its accuracy. See that status record for actual verification and release availability.

The native browser owns cookies and website authentication. The recommendation client uses a separate private random installation identifier and bounded HTTPS requests; it does not copy browser cookies or credentials. The apps have no token exchange, generic privileged JavaScript bridge, preview host or release fixture dependency. Location is requested in the foreground for the existing nearby search. Sharing and external maps use operating-system controls.

Debug APKs, simulator apps and unsigned archives are build evidence. A store release additionally needs release signing, completed store information, functional device verification and provider approval. Keep signing material and account credentials in platform or protected build secret stores, outside Git and OneDrive. Do not put credentials in this directory.

Project working copies, worktrees and build outputs belong in the user-selected OneDrive workspace. GitHub remains canonical; local OneDrive presence alone is not cloud synchronization evidence.

iOS compilation requires temporary GitHub-hosted Macs because the selected workstation runs Windows. Android CI uses temporary GitHub-hosted Linux runners. These disposable CI checkouts are a necessary build-host exception; retained results are downloaded to the selected OneDrive workspace. Persistent signing credentials stay in the approved protected stores.
