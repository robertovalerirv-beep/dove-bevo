# 0042 · Pulizia dopo l'audit del 28/10/2026

- **Stato:** decisa da Roberto il 29/10/2026 in chat · **Data:** 2026-10-29 · nessuna modifica a SPEC, schema, API, interfaccia, testi o feature list

## Contesto
L'audit del 28/10/2026 (codice letto per intero, attacchi simulati in workerd) ha trovato poche debolezze e alcune incoerenze di pulizia. Questo ADR copre solo la pulizia; l'import e la sicurezza hanno ADR e PR a parte.

## Decisione
- **Una sola definizione** di cella, chiave bar e mediana, in `src/shared`. Prima c'erano 6 copie della regex di cella (`prices`, `reports`, `admin`, `mobile-recommendations`, `app.tsx`, più `admin-find`), 5 della chiave bar e 3 identiche di `median`. Ora: `CELL_PATTERN`, `VENUE_KEY_PATTERN`, `OSM_KEY_PATTERN` in `src/shared/venue.ts` e `medianOf` in `src/shared/prices.ts` (`tiers.ts` la riesporta, così `tiers.test.ts` non cambia). Una regola cambiata in un posto solo non può più divergere dalle altre. `src/app/lib/admin-find.ts` resta com'è: la sua regex non è ancorata e ha gruppi di cattura (scopo diverso).
- **Coda `TASKS_QUEUE` tolta dal codice** (consumatore, tipo `QueueTask`, binding di `env.staging`, tipi). Nessuna riga di codice vi inviava messaggi e nessuno scopo era documentato: il commento originale diceva «nessuna forma di compito è ancora definita». La coda `dovebevo-tasks` su Cloudflare **non è stata cancellata**: è inoffensiva e si ricollega in poche righe quando c'è un compito vero. Da controllare a mano dopo il deploy: se la dashboard mostra ancora il Worker come consumatore, va staccato da lì.
- **Commento del cron** in `wrangler.jsonc` corretto: gira ogni ora (ADR 0016), non alle 02:30.
- **`allowScripts` verificato, non modificato.** Con npm 11.21.1, in una cartella isolata, senza il campo gli script di installazione di `esbuild` e `workerd` girano (3 pacchetti, con avviso `install-scripts`); con il campo non girano. Il campo quindi funziona nell'npm di CI. Con npm 10 (quello di questo ambiente locale) è ignorato. Non si sa quale npm abbia il runner con Node 24: se fosse più vecchio di 11.x il campo non avrebbe effetto.

## Conseguenze
- Nessun cambiamento visibile per gli utenti.
- Meno codice: −1 handler, −1 dipendenza di import (`zod` in `index.ts`), −14 righe di regex e mediana duplicate.
- Test nuovi: `tests/unit/patterns.test.ts`. Nessun test esistente modificato.
