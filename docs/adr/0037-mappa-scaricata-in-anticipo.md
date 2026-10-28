# 0037 · Mappa scaricata in anticipo, avviata al primo gesto

- **Stato:** decisa da Roberto il 28/10/2026 in chat · **Data:** 2026-10-28 · SPEC 1.11 (tag `spec-approved-12`); completa l'ADR 0014 (non lo sostituisce)

## Contesto
Dall'ADR 0014 la mappa è una foto statica finché non si tocca; il primo tocco scarica e avvia MapLibre (circa 1 MB). Su rete lenta l'attesa si sente e chi tocca una volta sola pensa che il sito non risponda. La scelta dell'ADR 0014 era giusta per Lighthouse (Performance 0,70 con la mappa avviata all'apertura, 0,99 con la mappa al tocco), quindi non si torna indietro.

## Decisione
- Dopo `load` e a telefono libero (`requestIdleCallback`), nella sola pagina della mappa, il browser scarica in anticipo il file di MapLibre, il suo CSS e il suo worker con `<link rel="prefetch">`. Non si usa `import()` né `modulepreload`: nulla viene eseguito, quindi il tempo di blocco non cresce.
- MapLibre parte comunque al primo gesto (D-35). Il tocco non aspetta più il download.
- I percorsi dei file (che hanno un nome con hash) li scrive la build in un `<meta>` di `index.html`; il codice dell'app li legge solo nella pagina della mappa. `/privacy`, `/regole`, `/admin` non scaricano nulla.
- Nessun banner. Service worker invariato: il file della mappa resta fuori dalla sua cache (SPEC 7.7).

## Conseguenze
- Un visitatore che apre il sito e non tocca la mappa scarica circa 1 MB che non usa (su reti a consumo è un costo suo). Mitigazione: parte a pagina caricata e telefono libero, e solo nella pagina della mappa.
- Rischio Lighthouse: sotto la simulazione un download partito troppo presto può rallentare il caricamento. Si misura prima e dopo (3 giri); se peggiora, si ritarda ancora o si scarica solo il file principale.
- Il test M1-06 (`tests/e2e/map.spec.ts`) oggi pretende zero richieste a MapLibre prima del tocco: il requisito cambia, quindi il test cambia (richieste ammesse solo come prefetch, nessuna esecuzione).
- Nessun cambio a D1, API, CSP e dati.
