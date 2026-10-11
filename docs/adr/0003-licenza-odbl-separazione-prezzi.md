# 0003 · Licenza ODbL e separazione dei prezzi

- **Stato:** accettata (M-1, approvata con SPEC 1.0) · **Data:** 2026-10-11 · **Riferimenti:** SPEC 5.2

## Contesto
I file dei bar sono un database derivato da OpenStreetMap (ODbL 1.0, share-alike). I prezzi sono dati raccolti da noi e collegati ai bar tramite ID OSM.

## Decisione
- I file in `public/data/<DATA_VERSION>/` sono distribuiti sotto ODbL con `LICENSE.txt` e attribuzione; le attribuzioni sono sempre visibili sulla mappa.
- I prezzi non vengono **mai** scritti negli stessi file né nelle stesse proprietà dei dati OSM: stanno in D1 e arrivano al client da un'API separata. Il collegamento avviene solo per ID, nel client.
- Secondo le linee guida OSMF sui *collective database*, questa separazione tiene i prezzi fuori dallo share-alike.

## Conseguenze
- Vietato in futuro "arricchire" i file OSM con prezzi o generare un unico file combinato senza rivalutare la licenza.
- Il fixture dei test, estratto da OSM, porta il proprio `LICENSE.txt`.
- Da far rivedere a Roberto prima del lancio pubblico (non è una consulenza legale).
