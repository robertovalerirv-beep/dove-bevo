# 0050 · La copertura non apre più un file per ogni cella

- **Stato:** decisa da Roberto il 23/11/2026 in chat · **Data:** 2026-11-23 · modifica l'ADR 0022 (calcolo della copertura). Non cambia SPEC, schema, API, D1, interfaccia e feature list.

## Contesto
Il 23/11/2026 «Aggiorna» della dashboard di copertura in `/admin` rispondeva sempre «Aggiornamento non riuscito, riprova.»: `GET /api/admin/coverage` → **500** in circa 300 ms, a ogni tentativo. Le altre sezioni di `/admin` (metriche) funzionavano.

`buildCoverage` leggeva con `env.ASSETS.fetch` il file statico di **ogni** cella con almeno un bar OSM pubblico con prezzo, più `places.json`. Ogni lettura è una sottorichiesta e il piano gratuito ne ammette 50 per richiesta. Sul D1 vivo (query di Roberto): **58 celle**, 231 bar → 59 letture → la 51ª lancia un'eccezione, che `onError` risponde come `internal`. Il costo cresceva con le zone coperte: più la mappa si riempie, prima si rompe. L'ADR 0025 aveva già limitato a 3 i file aperti per pagina, ma la copertura era rimasta fuori.

## Decisione
1. Il file di una cella si apre **solo per i bar OSM senza città salvata** in `prices_current.city` (la città si salva a ogni inserimento quando il file ne ha una entro 15 km): servono la posizione per trovare il luogo più vicino.
2. Al massimo `COVERAGE_CELL_READS = 40` file per calcolo (`src/worker/config.ts`), più `places.json`: sempre sotto le 50. I bar senza città delle celle oltre il tetto vanno in «Senza città», mai in errore.
3. Il controllo «bar sparito da OSM» resta per i bar senza città di una cella letta.

## Conseguenze
- Nel caso normale (tutti i bar hanno la città) il calcolo non apre nessun file: meno CPU e nessuna sottorichiesta.
- **Accettato:** un bar con città salvata che una nuova importazione toglie da OSM continua a contare nella copertura (e nell'elenco della città) finché l'admin non lo nasconde con «Togli dalla mappa». Prima veniva escluso.
- Test: `tests/worker/coverage.test.ts`, «prices spread over many cells (ADR 0050)»: 58 celle → 200 senza letture; 60 celle senza città → al massimo 41 letture.
- Rollback con `git revert`: nessun dato toccato.
