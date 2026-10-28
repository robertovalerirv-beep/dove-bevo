# Dove bevo mobile apps

The canonical project is [Roberto's GitHub repository](https://github.com/robertovalerirv-beep/dove-bevo). This directory contains independent Android and iOS applications. They use the existing production service at https://www.dovebevo.com with its normal browser session and add native phone integration. The website, Worker, database schema and deployment configuration are unchanged.

- Android: `android/`, package `com.dovebevo.app`.
- iOS: `ios/`, bundle identifier `com.dovebevo.app`.
- Functional checks and retained build evidence: the **Mobile apps** workflow for pull requests and release tags.

See [release status](RELEASE_STATUS.md) for verified build, store and submission progress.

The separate [native usability update](docs/2026-10-28-native-update-status.md) adds explicit local saved venues, Stop/Reload recovery and Android Forward/location-help controls. Use **Altre opzioni → Salva locale** on an open venue, then **Locali salvati** to reopen or remove it. Saved links and names are available locally; opening the map or live prices still needs internet. These additions do not replace the Android 20/iOS 26 binaries already submitted for review.

The native browser owns cookies and website authentication. The apps have no native API proxy, token exchange, generic privileged JavaScript bridge, preview host or fixture dependency. Location is requested in the foreground for the existing nearby search. Sharing and external maps use operating-system controls.

Debug APKs, simulator apps and unsigned archives are build evidence. A store release additionally needs release signing, completed store information, functional device verification and provider approval. Keep signing material and account credentials in platform or protected build secret stores, outside Git and OneDrive. Do not put credentials in this directory.

Project working copies, worktrees and build outputs belong in the user-selected OneDrive workspace. GitHub remains canonical; local OneDrive presence alone is not cloud synchronization evidence.

iOS compilation requires temporary GitHub-hosted Macs because the selected workstation runs Windows. Android CI uses temporary GitHub-hosted Linux runners. These disposable CI checkouts are a necessary build-host exception; retained results are downloaded to the selected OneDrive workspace. Persistent signing credentials stay in the approved protected stores.
