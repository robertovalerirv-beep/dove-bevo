# 0002 · Bar come file statici per cella geohash5

- **Stato:** accettata (M-1, approvata con SPEC 1.0) · **Data:** 2026-10-11 · **Riferimenti:** SPEC 4, 5

## Contesto
In Italia ci sono circa 100–150 mila bar in OSM. Caricarli in D1 supererebbe le 100.000 righe scritte al giorno del piano gratuito (ogni indice è una scrittura in più) e ogni apertura della mappa consumerebbe letture e CPU del Worker.

## Decisione
I bar sono file JSON statici, uno per cella geohash5 (~5 × 5 km), serviti come static assets del Worker (gratuiti, illimitati, senza esecuzione del Worker) con cache immutabile per `DATA_VERSION`. D1 contiene solo i dati che cambiano spesso: prezzi, conferme, segnalazioni, bar aggiunti dagli utenti, contatori. Il Worker verifica l'esistenza di un bar leggendo il file della cella dal binding `ASSETS`. Formato del file: D-11 (tabella città per file, `cityId` = ID OSM del luogo, stabile tra versioni).

## Conseguenze
- Costo di lettura dei bar zero; la mappa scarica al massimo 12 file per vista.
- Limite di 20.000 file per versione: lo script fallisce oltre 15.000.
- La ricerca dei bar è solo tra le celle caricate (nessuna ricerca nazionale lato server in Fase 0).
- La stima delle quote D1 con misure reali va aggiunta in M1 in un ADR dedicato.
