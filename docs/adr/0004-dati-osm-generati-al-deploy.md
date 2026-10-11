# 0004 · Dati OSM generati a ogni deploy

- **Stato:** accettata (M-1, approvata con SPEC 1.0) · **Data:** 2026-10-11 · **Riferimenti:** SPEC D-03, 5.3

## Contesto
`public/data/` è fuori da git e `osmium` non è disponibile sul PC di sviluppo (Windows). Roberto ha scelto la generazione a ogni deploy rispetto a una Release mensile.

## Decisione
Il job di deploy (Linux) scarica `italy-latest.osm.pbf` da Geofabrik, esegue l'import e pubblica i file insieme al Worker. Il PBF è messo in cache di Actions con chiave = data del file, così più deploy nello stesso giorno non lo riscaricano. `DATA_VERSION` = data del PBF. Se l'import fallisce, il deploy fallisce. In locale e negli e2e si usa un fixture versionato (`tests/fixtures/data/`).

## Conseguenze
- Dati sempre freschi; deploy più lenti (download ~2 GB + import).
- I client scaricano i dati nuovi a ogni cambio di `DATA_VERSION`.
- Gli e2e non dipendono da Geofabrik.
- Se la durata del deploy supera 15 minuti, si valuta la cache dell'output per data del PBF.
