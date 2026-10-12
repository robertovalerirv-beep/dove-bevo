# 0016 · Chiavi giornaliere cancellate entro 48 ore

- **Stato:** accettata (Roberto, 12/10/2026) · **Data:** 2026-10-12

## Contesto
SPEC 14 promette che il legame tra contributi della stessa sessione, in `counters` e `dedup`, è "cancellato entro 48 ore". SPEC 8 descrive un cron giornaliero che elimina le righe con `day` più vecchio di 2 giorni: con l'esecuzione alle 02:30 UTC, una chiave creata alle 00:00 di un giorno restava fino a circa 76 ore.

## Decisione
Prevale la promessa di privacy (SPEC 2, ordine di priorità). Si tengono solo le chiavi di **oggi e ieri** (`KEEP_DAYS = 1`, giorno `Europe/Rome`) e il cron gira **ogni ora allo scoccare dell'ora** (`0 * * * *`). La mezzanotte di Roma cade sempre su un'ora intera UTC, quindi le chiavi dell'altro ieri spariscono pochi secondi dopo la mezzanotte: età massima 48 ore.

## Conseguenze
- Il riconoscimento dell'autore (oggi e ieri) e le quote giornaliere non cambiano.
- 24 esecuzioni al giorno per ambiente, ciascuna con due `DELETE` indicizzati: costo trascurabile, nessun limite del piano gratuito toccato.
- Dopo 48 ore l'autore di un prezzo in quarantena non è più riconosciuto (rischio già accettato in `SECURITY.md`).
- Test: `tests/worker/reports-cron.test.ts` (M2-15).
