# 0012 · `@cloudflare/vitest-plugin` al posto di `@cloudflare/vitest-pool-workers`

- **Stato:** accettata (M1-08), approvata da Roberto il 12/10/2026 (dipendenza rinominata rispetto a SPEC 4.1) · **Data:** 2026-10-11

## Contesto
SPEC 4.1 ammette `@cloudflare/vitest-pool-workers`. La versione 0.23.0 si dichiara deprecata ("renamed to `@cloudflare/vitest-plugin`, will not receive future updates") e porta con sé copie vecchie di wrangler e miniflare con vulnerabilità alte (`sharp`, `undici`): `npm audit --audit-level=high` fallirebbe.

## Decisione
Si usa il successore ufficiale `@cloudflare/vitest-plugin` 1.4.0 (stesso autore e stesso scopo; dipende dallo stesso `wrangler` 4.149.0 del progetto; `npm audit` pulito). `tests/unit/dependencies.test.ts` lo ammette al posto del vecchio nome. Configurazione in `vitest.config.ts`: progetto `unit` (Node) e progetto `worker` (workerd con D1 locale migrato da `readD1Migrations`/`applyD1Migrations`).

## Conseguenze
Nessun peso nel bundle (solo test). Il plugin supporta anche Vitest 5: il vincolo di ADR 0008 su Vitest 4 resta solo per `typescript-eslint`/TypeScript, da rivedere.
