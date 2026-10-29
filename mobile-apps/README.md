# Dove bevo mobile apps

The canonical project is [Roberto's GitHub repository](https://github.com/robertovalerirv-beep/dove-bevo). This directory contains independent Android and iOS applications. They use the existing production service at https://www.dovebevo.com with its normal browser session and add native phone integration. The website interface and price contributions retain their existing behavior. The owner's apps-only recommendation request separately authorizes one additive Worker API and D1 table, delivered through the existing deployment pipeline.

- Android: `android/`, package `com.dovebevo.app`.
- iOS: `ios/`, bundle identifier `com.dovebevo.app`.
- Functional checks and retained build evidence: the **Mobile apps** workflow for pull requests and release tags.

See [release status](RELEASE_STATUS.md) for verified build, store and submission progress.

The [bottom-navigation candidate](docs/2026-10-29-bottom-navigation-status.md), source `9a3e5cf79500ea3d53cc232cb899eaf6158dc05c`, puts **Home, Mappa, Preferiti, Salva and Consigliati** together at the bottom, with **Condividi / Ricarica** in the top three-dot menu. Saving uses the venue's existing name and stays on the map. Local Android checks and live browsing passed; the corrected iOS native/UI gate, [build 38](https://github.com/robertovalerirv-beep/dove-bevo/actions/runs/40944405886), is pending. Build 37 failed real native/UI checks and produced no signed release. This candidate has not been verified as available to testers or publicly launched.

The latest verified available testing release remains the [native favourites comparison update](docs/2026-10-28-favourites-comparison-status.md), build **36**: **Available to internal testers** on Android and **Testing** in TestFlight for the existing owner and Roberto groups. In Preferiti, select a drink and Normale or Happy hour to compare recorded prices across saved venues, with dates and confirmations. Missing prices remain explicit. Bookmarks use existing venue names and stay on the phone without account synchronization; live maps and prices require internet. Private bookmarks do not publish prices. The existing orange **Aggiungi un prezzo qui** action contributes a price for everyone through Roberto's website. The latest observed public submissions remain Android 20 in review and iOS 26 Waiting for Review; testing availability does not establish public approval or availability.

The earlier [public drink recommendation update](docs/2026-10-28-drink-recommendations-status.md), introduced in build **34**, remains included. Its native **Drink consigliati** screen lets customers recommend a drink, see public totals and undo their own choice. This is separate from saving a private bookmark, adding a price or confirming its accuracy. [Build 32's usability record](docs/2026-10-28-native-update-status.md) is retained as dated history; its More-menu navigation is superseded by the visible native tabs and actions.

The native browser owns cookies and website authentication. The recommendation client uses a separate private random installation identifier and bounded HTTPS requests; it does not copy browser cookies or credentials. The apps have no token exchange, generic privileged JavaScript bridge, preview host or release fixture dependency. Location is requested in the foreground for the existing nearby search. Sharing and external maps use operating-system controls.

Debug APKs, simulator apps and unsigned archives are build evidence. A store release additionally needs release signing, completed store information, functional device verification and provider approval. Keep signing material and account credentials in platform or protected build secret stores, outside Git and OneDrive. Do not put credentials in this directory.

Project working copies, worktrees and build outputs belong in the user-selected OneDrive workspace. GitHub remains canonical; local OneDrive presence alone is not cloud synchronization evidence.

iOS compilation requires temporary GitHub-hosted Macs because the selected workstation runs Windows. Android CI uses temporary GitHub-hosted Linux runners. These disposable CI checkouts are a necessary build-host exception; retained results are downloaded to the selected OneDrive workspace. Persistent signing credentials stay in the approved protected stores.
