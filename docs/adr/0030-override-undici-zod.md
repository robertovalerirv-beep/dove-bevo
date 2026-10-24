# 0030 · `undici` e `zod` aggiornati con `overrides`

- **Stato:** proposta a Roberto · **Data:** 2026-10-24 · tocca SPEC 13.7; nessuna modifica a codice, schema, API, interfaccia o testi

## Contesto
Il 23/10/2026 il GitHub Advisory Database ha pubblicato e revisionato quattro avvisi che `npm audit` legge da lì: da quel giorno il passo `npm audit --audit-level=high` della CI fallisce su qualsiasi ramo, `main` compreso, senza che sia cambiato il lockfile.

- `undici` < 7.30.1: GHSA-xjj6-f33q-929c (high, errore non gestito con più di cinque content-coding), GHSA-4qv8-2p9j-2685 e GHSA-f72v-6w45-q472 (moderate). Arriva da `miniflare`, sotto `wrangler`, `@cloudflare/vite-plugin` e `@cloudflare/vitest-plugin`.
- `zod` < 4.6.6: GHSA-mrhx-c7xc-m3w5 (high, memoria esaurita con array grandi senza limite di lunghezza). Solo la copia annidata in `@cloudflare/vitest-plugin`, che la fissa a 4.6.5; lo `zod` del Worker era già 4.6.7.

Tutte e due sono dipendenze di sviluppo e test: in produzione il Worker gira su workerd e non le carica. `npm audit --omit=dev` era già pulito.

Le ultime versioni di Cloudflare (`wrangler` 4.152.0, `@cloudflare/vite-plugin` 1.65.0, `@cloudflare/vitest-plugin` 1.4.7) fissano ancora `undici` 7.29.1 e `zod` 4.6.5: aggiornarle non basta.

## Decisione
`overrides` in `package.json` porta le due librerie alle versioni corrette: `undici` 7.30.1 e `zod` 4.6.7. Sono patch della stessa versione minore (7.29 → 7.30, 4.6.5 → 4.6.7), quindi compatibili con ciò che chiedono i pacchetti di Cloudflare. Nessuna dipendenza nuova; la soglia dell'audit in CI resta quella di prima.

## Conseguenze
- `npm audit` e `npm audit --omit=dev --audit-level=low`: 0 vulnerabilità.
- Gli `overrides` vanno tolti quando `miniflare` e `@cloudflare/vitest-plugin` dipenderanno da versioni corrette: lo si vede quando un loro aggiornamento di Dependabot porta `undici` ≥ 7.30.1 e `zod` ≥ 4.6.6 senza bisogno di forzarle.
