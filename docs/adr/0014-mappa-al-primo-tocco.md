# 0014 · Mappa interattiva al primo tocco

- **Stato:** accettata — decisione di Roberto del 12/10/2026 (modifica SPEC 4 "import dinamico avviato subito" e SPEC 7.1) · **Data:** 2026-10-12

## Contesto
Con MapLibre avviato all'apertura, Lighthouse mobile dava Performance 0,70–0,73 contro il budget bloccante di SPEC 15 (≥ 0,90): il TBT di circa 1,7 s è l'esecuzione del chunk di MapLibre (≈ 1 MB) con CPU simulata 4× più lenta. LCP, FCP, CLS e le altre categorie erano già nei budget dopo aver portato le attribuzioni nella shell.

## Decisione
- All'apertura la mappa è un'immagine statica della stessa vista iniziale (`public/map-italia.jpg`, 67 KB, catturata dalla nostra mappa OpenFreeMap con etichette italiane, precaricata), dentro un pulsante "Esplora la mappa" a tutta area.
- MapLibre si scarica e si avvia al primo gesto sulla mappa, all'apertura della ricerca, con "Vicino a me", con una scheda bar o con qualunque spostamento richiesto; lo spostamento chiesto prima che la mappa sia pronta viene applicato appena lo è.
- Le attribuzioni (OpenFreeMap, © OpenMapTiles, © OpenStreetMap contributors) sono testo della shell: visibili sempre, anche sull'immagine statica (SPEC 2.8).

## Misure
Lighthouse mobile in locale: Performance **0,99**, LCP 1,95 s, TBT 37 ms, CLS 0, Accessibility, Best Practices e SEO 1. Shell 15.700 B gzip.

## Conseguenze
- Il primo gesto sulla mappa avvia il caricamento invece di spostare la mappa; lo stato mostra "Carico la mappa…".
- L'immagine va rigenerata se cambia lo stile o la vista iniziale (stessa procedura: cattura del canvas a 390 px, densità 2, JPEG 70, sovrapposizioni nascoste).
