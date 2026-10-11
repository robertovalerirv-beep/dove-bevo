# 0008 · Dipendenze di configurazione del lint e versioni vincolate

- **Stato:** accettata (M0, approvata da Roberto con il piano di M0-01) · **Data:** 2026-10-11

## Contesto
SPEC 4.1 ammette `eslint` e `typescript` ma chiede di motivare ogni pacchetto di configurazione. ESLint non sa analizzare TypeScript da solo e, dalla versione 10, non include più le regole `recommended` di base.

## Decisione
- Aggiunti come dipendenze di sviluppo `typescript-eslint` (parser e regole TS, tra cui `no-explicit-any`; ~3,5 MB installati) e `@eslint/js` (regole di base; 16 KB). Peso nel bundle: 0 KB.
- Configurazione `strictTypeChecked` più una regola che vieta `dangerouslySetInnerHTML` (SPEC 13.4).
- Versioni esatte vincolate dalla compatibilità: `typescript` 6.0.3 (non 7.x: `typescript-eslint` 8 richiede `<6.1`) e `vitest` 4.1.11 (non 5.x: `@cloudflare/vitest-pool-workers` 0.23 richiede `^4.1`).
- `tests/unit/dependencies.test.ts` fa rispettare l'elenco di SPEC 4.1 più questi due pacchetti e le versioni esatte; `.npmrc` imposta `save-exact=true`.

## Conseguenze
Nessuna dipendenza nuova senza modificare il test e un ADR. Il passaggio a TypeScript 7 o Vitest 5 si valuta quando `typescript-eslint` e il pool Workers li supporteranno (Dependabot li proporrà: vanno respinti finché i peer non combaciano).
