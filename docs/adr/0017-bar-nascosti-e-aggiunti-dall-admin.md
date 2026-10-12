# 0017 · Bar nascosti e aggiunti dall'admin

- **Stato:** accettata (richiesta di Roberto, 12/10/2026) · **Data:** 2026-10-12

## Contesto
I bar vengono da OpenStreetMap e i file statici si rigenerano a ogni deploy (D-03). Roberto deve poter
togliere dalla mappa le voci che non sono bar e aggiungere quelli mancanti, senza aspettare una correzione
su OSM. SPEC 7.9 prevede `/admin` con approvazione dei bar `pending` e revisione dei prezzi.

## Decisione
- Nuova tabella `venues_hidden (venue_key, cell, name, day)` (migrazione `0002`). La decisione vive in D1
  perché i file statici sono rigenerati.
- `GET /api/prices/:cell` aggiunge `h`: le chiavi OSM nascoste della cella. Il client le toglie dalla mappa,
  dall'elenco, dalla ricerca e dalla scelta del bar. I file statici restano identici (ADR 0003: nessun dato
  nostro nei file OSM).
- `POST /api/prices` su un bar nascosto → 400, come un bar inesistente.
- I bar aggiunti dall'admin vanno in `venues_user` direttamente `approved` (chiave `u<id>`).
- Rotte `/api/admin/*` dietro Cloudflare Access con verifica del JWT nel Worker (D-19). Access protegge solo
  i percorsi `/admin` e `/api/admin/*` dell'host `workers.dev`, quindi serve un dominio proprio solo in M6.

## Conseguenze
- Una lettura indicizzata in più per cella (in genere 0 righe).
- `h` è un campo in più nel formato compatto di SPEC 9.2.
- La moderazione dei bar è anticipata da M4/M5; `POST /api/venues` (bar proposti dagli utenti) resta in M4.
