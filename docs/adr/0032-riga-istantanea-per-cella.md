# 0032 · Riga istantanea per cella

- **Stato:** accettata · **Data:** 2026-10-24 · realizza la proposta dell'ADR 0020 (M3-20); nessuna modifica a SPEC e a `feature_list.json`

## Contesto
`GET /api/prices/:cell` leggeva da D1 circa 2 righe per prezzo (indice e chiave primaria): 603 righe con 300 prezzi nella cella, contro le 5.000.000 di letture al giorno del piano gratuito (ADR 0020). Con il dominio la Cache API terrà una copia di un minuto per punto di presenza, ma ogni rigenerazione costava ancora tanto nelle celle del centro.

## Decisione
Tabella `cell_snapshot (cell PRIMARY KEY, v, at, body)` (migrazione `0007_cell_snapshot.sql`, `WITHOUT ROWID`).
- **Lettura:** una riga per chiave primaria. Se `body` c'è ed è più giovane di 5 minuti, la rotta risponde con quel testo JSON così com'è. Altrimenti calcola la risposta come prima (`getCellPrices`) e la salva, ma solo se la cella non è vuota: le celle vuote costano già quasi niente e non devono riempire la tabella.
- **Scrittura:** ogni scrittura che cambia una cella (prezzo, conferma contata, bar mandato in revisione, bar proposto o confermato da un altro, tutte le azioni dell'admin) chiama `forgetCellCache` o `forgetCell` (`src/worker/lib/cell-cache.ts`), che porta `v` a `v + 1`, svuota `body` e solo dopo toglie la copia dalla Cache API. Costo: una riga scritta in più per contributo.
- **Corse tra lettore e scrittore:** il lettore salva il corpo con `... WHERE cell_snapshot.v = <v letto>`: se nel frattempo è arrivata una modifica, il salvataggio non avviene e non può rimettere una risposta vecchia.
- **Rete di sicurezza:** `at` limita a 5 minuti la vita di un corpo anche se una modifica dimenticasse di svuotarlo.

## Alternative scartate
Un endpoint con più celle (abbassa le richieste, non le letture); un indice coprente (dimezza soltanto); un contatore di versione solo in memoria del Worker (non condiviso tra le istanze).

## Conseguenze
- Una cella con 300 prezzi si legge con 1 riga (misurato in `tests/worker/cell-snapshot.test.ts`, soglia 5) e la capacità stimata non è più limitata dalle letture ma dalle richieste (~11.600 utenti al giorno, ADR 0020).
- Una proposta di bar compare ora nella scelta del bar subito, non dopo la copia da un minuto (prima la rotta `POST /api/venues` non toglieva la cella dalla cache).
- Chi scrive su D1 fuori dal Worker (migrazioni, comandi manuali) deve svuotare la cella o aspettare i 5 minuti. Le migrazioni future che toccano `prices_current`, `venues_user` o `venues_hidden` lo devono ricordare: `DELETE FROM cell_snapshot`.
- La Cache API resta come primo livello; sul dominio di produzione si somma al secondo.
