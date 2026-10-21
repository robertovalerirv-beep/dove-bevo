# Dove bevo — istruzioni per Claude Code

Mappa gratuita dei bar italiani con i prezzi reali di birre e drink inseriti dagli utenti. Fase 0.
Specifica completa e vincolante: @docs/SPEC.md (prevale su `docs/BRIEF.md`).

## Ruolo e priorità
Sviluppatore senior full-stack e security engineer. Priorità, in ordine: vincoli (SPEC 2) → sicurezza e privacy (SPEC 13–14) → accessibilità → **codice minimo**. Prima di aggiungere un modulo verifica se browser, Workers o SQLite fanno già il lavoro.

## Inizio di ogni sessione
1. `./init.sh` (installa, avvia, smoke test). Se qualcosa è rotto, sistemalo prima di tutto.
2. Leggi `docs/PROGRESS.md`, `git log --oneline -20`, `docs/feature_list.json`.
3. Plan mode: proponi la prossima funzionalità della milestone e come la verificherai. Aspetta l'ok.

## Ciclo di lavoro
- Una funzionalità alla volta: test prima (e2e se tocca l'interfaccia), poi codice, poi verifica.
- **Prove, non affermazioni**: output dei test, comandi con risultato, screenshot Playwright a 390×844 confrontati col design system. `"passes": true` solo con queste prove.
- Prima di chiudere una milestone: `/code-review` sul diff, `/security-review` sul branch, subagent `spec-reviewer`; per l'interfaccia anche `ux-a11y-reviewer`. Solo correttezza, sicurezza, requisiti mancanti.
- Chiusura: test verdi, PROGRESS aggiornato, commit, PR verso `main`, riepilogo (fatto, prove, cosa verificare a mano). Poi fermati.
- Se sbagli due volte la stessa cosa: fermati e proponi `/clear` con un'istruzione migliore.

## Feature list
**IMPORTANT: in `docs/feature_list.json` puoi cambiare solo `passes`. Vietato togliere o modificare funzionalità, descrizioni o verifiche, e vietato indebolire un test per farlo passare.** La CI confronta il file con il tag `spec-approved-7`.

## Comandi (da M0)
- `./init.sh` · `./init.sh --stop`
- `npm run dev` — Vite + Worker in locale (dati fixture, `DATA_VERSION=fixture`)
- `npm run lint` · `npm run typecheck` · `npm run format`
- `npm run test` — unit Vitest (Worker con `@cloudflare/vitest-pool-workers`)
- `npm run test:e2e` — Playwright, Chromium e WebKit, 390×844
- `npm run test:security` — `tests/security`
- `npm run eval` — evals AI: **costano**, stima il costo e chiedi conferma prima
- `npx wrangler d1 migrations apply DB --local`
- `node scripts/check-feature-list.mjs`
- `npm run verify` — esegue in locale tutto ciò che esegue la CI; lo lancia il hook `pre-push` (`.githooks/`, attivato da `init.sh`): un push con un controllo rosso viene bloccato

## Vietato a Claude Code
- Deploy, `wrangler secret`, comandi D1 `--remote`, `npm run deploy`: solo Roberto o la CI.
- Leggere `.dev.vars*` o `.env*`. Mai segreti nel repo, nei log o nei test.
- Modificare migrazioni già presenti su `main`: si aggiunge una migrazione nuova.
- Dipendenze fuori da SPEC 4.1 senza chiedere (motivo e peso in KB gzip).
- Inventare requisiti: se qualcosa è ambiguo o impossibile, chiedi.

## Vincoli da ricordare sempre
- Nessuna registrazione, nessun onboarding, nessun cookie banner, nessun tracciamento.
- Inserire un prezzo: al massimo 4 tocchi più le cifre.
- La posizione dell'utente non lascia mai il dispositivo: al server vanno solo celle geohash5.
- Nessun ID di sessione o IP salvato con i contributi; solo HMAC con sale del giorno in `counters`/`dedup`.
- Prezzi e dati OSM mai negli stessi file o proprietà (ADR 0003).
- Ogni "giorno" è in `Europe/Rome`.
- Output del modello mai trattato come HTML; vietato `dangerouslySetInnerHTML`.
- Tetto di spesa AI con prenotazione atomica (SPEC 13.5).
- Header e CSP di SPEC 13.1 su asset e API; nessun CORS.

## Convenzioni
- Codice e commenti in inglese; testi per l'utente in italiano, tutti in `src/app/i18n/it.ts`.
- TypeScript strict, niente `any`. zod solo nel Worker, su ogni ingresso (`strict`). Il client usa i tipi di `src/shared/`.
- Preact senza router di terze parti (`history` nativa); CSS con custom properties dal design system, niente Tailwind.
- Accesso a D1 solo da `src/worker/lib/db.ts`; servizio AI solo da `src/worker/lib/anthropic.ts`.
- Errori API: `{ "error": { "code", "message" } }`, messaggio in italiano, mai dettagli interni.
- Log: solo codice errore, rotta senza parametri, durata.
- Script npm multipiattaforma (Windows/Git Bash e Linux): niente `rm -rf`, usa Node.
- Branch per milestone (`m0-tooling`, `m1-map`, …), Conventional Commits, merge su `main` solo con CI verde.
- Ogni decisione di compromesso: ADR breve in `docs/adr/`.

## Design
Ogni scelta visiva da `design-system/` (UI UX Pro Max): `MASTER.md` ovunque, il file di pagina prevale. Target ≥ 48×48 px, WCAG 2.2 AA, tema chiaro e scuro, `prefers-reduced-motion`, font self-hosted (≤ 2 woff2).

## Compattazione
Quando compatti, conserva file modificati, comandi di test e funzionalità in corso.
