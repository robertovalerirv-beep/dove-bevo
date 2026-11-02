# Dove bevo mobile apps

The canonical project is [Roberto's GitHub repository](https://github.com/robertovalerirv-beep/dove-bevo). This directory contains independent Android and iOS applications. They use the existing production service at https://www.dovebevo.com with its normal browser session and add native phone integration. The website interface and price contributions retain their existing behavior. The owner's apps-only recommendation request separately authorizes one additive Worker API and D1 table, delivered through the existing deployment pipeline.

- Android: `android/`, package `com.dovebevo.app`.
- iOS: `ios/`, bundle identifier `com.dovebevo.app`.
- Functional checks and retained build evidence: the **Mobile apps** workflow for pull requests and release tags.

See [release status](RELEASE_STATUS.md) for verified build, store and submission progress.

The [bottom-navigation update](docs/2026-10-29-bottom-navigation-status.md), signed source `c24c7be2a67039ac80385e809f5f68d0614307e4`, puts **Home, Mappa, Preferiti, Salva and Consigliati** together at the bottom, with **Condividi / Ricarica** in the top three-dot menu. Saving uses the venue's existing name and stays on the map. [Build 41](https://github.com/robertovalerirv-beep/dove-bevo/actions/runs/40952554881) passed both platform checks and signers, including 81 native iOS tests and four phone UI cases. Its verified signed packages are **Available to internal testers** on Android and **Testing** for the existing owner and Roberto TestFlight groups. Physical acceptance and public release remain unverified. Failed builds 37–39 remain recorded separately.

Build 41 retains the [native favourites comparison](docs/2026-10-28-favourites-comparison-status.md) introduced in build **36**. In Preferiti, select a drink and Normale or Happy hour to compare recorded prices across saved venues, with dates and confirmations. Missing prices remain explicit. Bookmarks use existing venue names and stay on the phone without account synchronization; live maps and prices require internet. Private bookmarks do not publish prices. The existing orange **Aggiungi un prezzo qui** action contributes a price for everyone through Roberto's website. Updated production submissions are now Android **41 in review** and iOS **1.0.0 (41) Waiting for Review**, with current descriptions/screenshots and automatic release after approval. Public approval, availability and store-installed acceptance remain unverified.

The earlier [public drink recommendation update](docs/2026-10-28-drink-recommendations-status.md), introduced in build **34**, remains included. Its native **Drink consigliati** screen lets customers recommend a drink, see public totals and undo their own choice. This is separate from saving a private bookmark, adding a price or confirming its accuracy. [Build 32's usability record](docs/2026-10-28-native-update-status.md) is retained as dated history; its More-menu navigation is superseded by the visible native tabs and actions.

The native browser owns cookies and website authentication. The recommendation client uses a separate private random installation identifier and bounded HTTPS requests; it does not copy browser cookies or credentials. The apps have no token exchange, generic privileged JavaScript bridge, preview host or release fixture dependency. Location is requested in the foreground for the existing nearby search. Sharing and external maps use operating-system controls.

Debug APKs, simulator apps and unsigned archives are build evidence. A store release additionally needs release signing, completed store information, functional device verification and provider approval. Keep signing material and account credentials in platform or protected build secret stores, outside Git and OneDrive. Do not put credentials in this directory.

Project working copies, worktrees and build outputs belong in the user-selected OneDrive workspace. GitHub remains canonical; local OneDrive presence alone is not cloud synchronization evidence.

iOS compilation requires temporary GitHub-hosted Macs because the selected workstation runs Windows. Android CI uses temporary GitHub-hosted Linux runners. These disposable CI checkouts are a necessary build-host exception; retained results are downloaded to the selected OneDrive workspace. Persistent signing credentials stay in the approved protected stores.
