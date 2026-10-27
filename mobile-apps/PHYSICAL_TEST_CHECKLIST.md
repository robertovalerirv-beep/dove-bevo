# Physical-device functional checks

Run on real iOS and Android devices. Android CI human verification and iOS simulator GPU resets leave physical-device behavior unproven; they establish neither a phone fault nor a fix. An internal build is a testing artifact, not a public launch. Mark a step passed only after performing it on the recorded device.

## Record the tested build

| Field | Actual value |
| --- | --- |
| Platform and device model | |
| OS version | |
| App version and build number | |
| Full source commit SHA | |
| Installation channel and test date | |
| Overall result: PASS / FAIL / BLOCKED | |
| Crash, renderer reset, human-verification challenge | Record each observed event, or none |
| Evidence files and original screenshot dimensions | Filename and width × height in pixels |

Use a dedicated test installation for the first-launch checks. Keep notes and screenshots free of private contacts, precise personal location, session logs and credentials. Keep original device screenshots and record their actual dimensions. Do not submit prices, venues, corrections, ratings or reviews, or create other public contributions.

## Maintainer steps

Record PASS, FAIL or BLOCKED for each step; leave unperformed steps untested.

1. **Offline first launch.** Disable Wi-Fi and mobile data before opening a fresh installation. Confirm the native rules appear and Privacy opens, scrolls and closes offline. Confirm no live website or location prompt appears before acceptance.
2. **Decline.** Choose the decline action. Android should exit; iOS should remain on the welcome screen. Reopen the app while still offline and confirm the rules remain: declining must not save acceptance.
3. **Explicit adult acceptance.** Restore connectivity. An adult tester taps **Ho almeno 18 anni e accetto**. Confirm the live service opens. Record any challenge, blank page, loading failure, reset or crash; a loading screen alone is not a pass.
4. **Location denied, manual search.** Tap **Vicino a me** and deny location requests if prompted. Confirm the app remains usable. Open **Cerca città o bar**, enter **Milano**, and select the actual Milano city result. Confirm an initialized map and the list of existing venues load; open **Esplora la mappa** if offered. Pan the map and inspect an existing venue without contributing data.
5. **Native navigation and state.** Open native **Privacy** from the more-options menu, then return with Back/Close. Confirm Milano and the current map/list state remain. Exercise native Back from a venue/page with history and confirm the expected previous screen. Check Home returns to the service home and Reload loads it again.
6. **Share and directions.** Open the native share sheet and inspect the expected HTTPS link, then cancel without sending. Avoid capturing private share suggestions. Open directions for an existing venue, confirm the system maps/browser handoff, and return to the app. Do not record the device's current location.
7. **Background and cold launch.** Background and resume the app. For a cold launch, swipe it away in the iOS app switcher; on Android, use Settings → Apps → Dove bevo → Force stop. Reopen without clearing app data. Confirm it remains usable and does not ask again for the accepted rules version. Repeat a short Milano search to verify live browsing after restart.
8. **Optional connectivity/recovery.** After loading content, disconnect the network and observe the offline/failure behavior. Restore connectivity and use the normal Reload/Retry action once. Confirm usable content returns, or record the failure. Record any observed renderer reset/crash and whether normal reopening recovers. Restore the device's original connectivity and permission settings when finished.

Also check the successful location path separately. After the denial check, an adult tester who agrees to share location with the existing service can enable foreground location in system settings and tap **Vicino a me**. Confirm the map centers on the obtained position and shows nearby results or an honest empty state; record any error. Do not retain coordinates or screenshots of personal location; record only the permission choice and functional result. Leave this check BLOCKED if the tester declines, and restore the original permission afterward. A manual city-search pass does not establish that nearby location works.

For each failed or blocked step, record the step number, expected versus observed behavior, and a safe screenshot if useful. Record a challenge separately even if a human tester completes it and continues. Do not bypass verification or infer a pass from another platform, simulator, upload receipt or earlier build.

## Italian “What to Test” copy

Prova Dove bevo sul tuo telefono. Al primo avvio, anche offline, leggi Regole e Privacy e verifica il rifiuto; poi, se sei maggiorenne, accetta esplicitamente. Nega la posizione e cerca Milano a mano: controlla mappa, elenco e un locale esistente. Se acconsenti a condividere la posizione con il servizio, verifica separatamente **Vicino a me** con il permesso in primo piano attivo: la mappa deve centrarsi sulla posizione ottenuta e mostrare i risultati vicini o un elenco correttamente vuoto. Non registrare coordinate o immagini della posizione personale; se rifiuti il permesso, segna questa prova come BLOCCATA. Ripristina il permesso originale dopo la prova. Prova Indietro, Privacy, Home, Ricarica, Condividi senza inviare e le indicazioni, quindi torna all'app. Verifica ripresa e riapertura senza una nuova richiesta delle regole già accettate. Segnala blocchi, verifiche umane, schermate vuote, riavvii o arresti con modello, versione OS e numero build. Non inserire prezzi, locali o recensioni e non includere dati personali nelle immagini.
