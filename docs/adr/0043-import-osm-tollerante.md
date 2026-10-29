# 0043 · Import OSM tollerante: una voce non valida non ferma il deploy

- **Stato:** decisa da Roberto il 29/10/2026 in chat · **Data:** 2026-10-29 · SPEC 1.14 (5.1, 5.3); nessuna modifica a schema, API, interfaccia, scritture o feature list (la guardia resta sul tag `spec-approved-14`)

## Contesto
A ogni deploy la CI scarica l'estratto italiano di OpenStreetMap e ne ricava i file statici dei bar (SPEC 5.1). `validate()` lanciava un errore per un nome di più di 120 caratteri o per coordinate fuori dal riquadro Italia, e l'errore fermava l'intero import. OpenStreetMap lo modifica chiunque: un solo nodo con un nome lungo, per errore o per dispetto, bastava a bloccare il deploy. Poiché il deploy include l'import, restava bloccato anche un aggiornamento di sicurezza, finché OSM non veniva corretto. Provato nell'audit del 28/10/2026 con la funzione reale: un nome di 121 caratteri fa fallire l'import. Oggi le voci non valide sono 0 (l'import passa).

## Decisione
- Una voce (bar o città) che non valida è **saltata e segnalata**: `buildDataset` chiama il callback opzionale `onSkip({ kind, key, reason })`; `build.mjs` scrive su stderr `OSM import: skipped bar n123: name longer than 120`, che finisce nel log del deploy, e chiude con `N skipped`.
- Se le voci saltate sono **più di 25** (`maxSkipped`, in `DEFAULT_LIMITS`, sovrascrivibile) l'import fallisce con `ImportError`: tanti scarti non sono un nodo sbagliato ma un file rotto o un filtro cambiato, e non si pubblica una mappa mutilata. Con 0 voci saltate oggi, il comportamento normale non cambia.
- Restano **bloccanti** i limiti di 15.000 file, 1 MB per file e 40 KB gzip per frammento, e il fallimento del deploy se l'import fallisce (SPEC 5.3).
- **Non incluso:** la pulizia dei caratteri invisibili (bidi, controllo) nei nomi OSM e il riuso dell'ultimo dataset buono quando l'import fallisce. Non sono stati approvati; restano proposte.

## Compromessi
- Chi vuole ancora bloccare i rilasci può farlo con 26 nodi non validi invece di uno: molto più costoso, non impossibile.
- Un bar saltato non compare sulla mappa finché OSM non è corretto; il log lo dice, ma nessuno è avvisato da solo. Si legge nel log del deploy.
- Il vecchio test «fails on a bar outside Italy or with an overlong name» è stato sostituito perché il requisito è cambiato (dichiarato nella PR).

## Verifica
`tests/unit/osm-import.test.ts` (7 casi nuovi): nome lungo saltato con chiave e motivo, fuori Italia, città non valida, nessun callback, 25 saltate ok e 26 falliscono, soglia da `limits`, limiti di file e dimensione ancora bloccanti. Prova da riga di comando con `build.mjs` e `check-output.mjs` su un file GeoJSON-seq con un nome di 130 caratteri. Il job `OSM import on a test PBF` della CI resta verde.
