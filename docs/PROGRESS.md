# Diario di avanzamento

Una voce per sessione, la più recente in alto. Ogni voce: data, milestone, cosa è stato fatto, prove (comandi ed esito), cosa resta, cosa verificare a mano.

---

## 2026-10-11 · Sessione 2 · M0 · M0-03 Header di sicurezza

**Fatto**
- Repo pubblico https://github.com/robertovalerirv-beep/dove-bevo creato con `gh` su richiesta di Roberto (scansione segreti sulla storia prima del push: nulla). Pushati `main`, tag `spec-approved`, `m0-tooling`.
- Roberto ha creato il token Cloudflare (solo Workers Scripts: Edit, D1: Edit, Account Settings: Read, solo il suo account) e i secret di Actions `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (verificati con `gh secret list`, solo i nomi).
- Header di SPEC 13.1: `public/_headers` (`/*`) per asset e fallback SPA; middleware `src/worker/lib/security-headers.ts` su tutte le risposte del Worker, errori compresi.
- `tests/security/headers.spec.ts`: valori esatti su `/`, `/bar/n1`, un asset JS, `/api/health`, `/api/nonesiste` (con `Origin` estraneo); nessun `Access-Control-*`. Progetto Playwright `security` (solo HTTP), script `test:security`.
- **Scoperta**: con `upgrade-insecure-requests` WebKit chiede gli script di `http://localhost` in `https://` e la shell non parte (prova: richiesta a `https://localhost:4173/assets/…` fallita con "SSL connect error"). La direttiva resta; e2e e test di sicurezza girano in HTTPS con `wrangler dev --local-protocol https` sulla configurazione di build `dist/dovebevo/wrangler.json` (la stessa del deploy; certificato locale generato da wrangler, nessuna dipendenza). `npm run preview` ora è questo comando.
- `vite dev` (init.sh, http) non applica `_headers` all'HTML: lo sviluppo locale non è toccato dalla CSP; l'API ha comunque gli header.

**Prove**
- Test prima: `test:security` 5 falliti ("Received: undefined"), poi 5 verdi.
- e2e WebKit rossi con la CSP via http (2 falliti), verdi dopo il passaggio a HTTPS.
- `npm ci && lint && typecheck && test && test:e2e && test:security` → exit 0 (unit 5, e2e 8, sicurezza 5). `format:check` verde. `./init.sh` exit 0.

---

## 2026-10-11 · Sessione 2 · M0 (branch `m0-tooling`) · M0-02 Worker con assets

**Fatto**
- Dipendenze (versioni esatte, SPEC 4.1): hono 4.13.13, preact 11.0.1; dev vite 8.3.4, @preact/preset-vite 2.10.6, @cloudflare/vite-plugin 1.63.1, wrangler 4.149.0, @playwright/test 1.64.0. Install script di `esbuild` e `workerd` negati con `allowScripts` (i binari arrivano dai pacchetti di piattaforma; tutto funziona senza).
- `wrangler.jsonc` come SPEC 4 (assets, `not_found_handling: single-page-application`, `run_worker_first: ["/api/*"]`, observability senza log di invocazione), `DATA_VERSION=fixture`, `compatibility_date` 2026-10-01 (workerd locale 1.20261006).
- `src/worker/index.ts` (Hono): `GET /api/health` → `{status, version (da package.json), data_version}`; 404 JSON `not_found` e 500 `internal` con il formato di SPEC 9.1 (`src/worker/lib/errors.ts`, messaggi in `src/app/i18n/it.ts`). Log di errore: solo codice e pattern di rotta.
- Shell minima: `index.html` (lang `it`, `<title>` da `APP_NAME` via plugin Vite), `src/app/main.tsx` (Preact, `<h1>`). L'aspetto arriva con il design system (M0-10).
- TypeScript diviso in progetti `app` (DOM, JSX Preact), `worker` (tipi runtime da `wrangler types`, `worker-configuration.d.ts` versionato; `typecheck` fallisce se non aggiornato) e `node` (test e config), `tsc -b`.
- Playwright: Chromium e WebKit a 390×844 contro la build di produzione servita da `vite preview` (Worker in workerd). Script `dev`, `build`, `preview`, `types`, `test:e2e`.
- `init.sh`: migrazioni D1 solo se esiste `migrations/`, smoke della cella solo con il fixture (M1); dev server avviato con `node` diretto così `--stop` lo ferma davvero su Windows.

**Prove**
- `npm ci && lint && typecheck && test && test:e2e` → exit 0; e2e `8 passed` (4 test × Chromium, WebKit).
- Mutazione: tolto `app.notFound` → test `not_found` rosso su entrambi i browser ("Received: text/plain"); file ripristinato, di nuovo verde.
- `./init.sh` → exit 0: `{"status":"ok","version":"0.0.0","data_version":"fixture"}`, `shell: HTTP 200`; `/bar/n1` 200 `text/html`; `/api/nonesiste` → `{"error":{"code":"not_found","message":"Risorsa non trovata."}}`. `./init.sh --stop` → server fermo (verificato con curl).
- Bundle del Worker senza il resto di `package.json` (solo `version`). `format:check` verde, `npm audit` 0 vulnerabilità.
- Nessuno screenshot significativo: la shell è un segnaposto senza design system (M0-10).

---

## 2026-10-11 · Sessione 2 · M0 (branch `m0-tooling`) · M0-01 Tooling

**Fatto**
- `./init.sh` pre-M0 verde (0/77). Piano M0-01 approvato da Roberto, incluse le dipendenze `typescript-eslint` e `@eslint/js` (ADR 0008).
- `package.json` (ESM, Node ≥ 24, script `lint`, `typecheck`, `test`, `format`, `format:check`), `.npmrc` `save-exact=true`, lockfile da `npm install`.
- Versioni esatte: typescript 6.0.3, vitest 4.1.11, eslint 10.12.0, prettier 3.9.10, typescript-eslint 8.71.1, @eslint/js 10.0.1. TS 7 e Vitest 5 esclusi per compatibilità (ADR 0008).
- `tsconfig.json` strict (+ `noUncheckedIndexedAccess`, `verbatimModuleSyntax`), nessun `@types/node` (non in SPEC 4.1: il test legge `package.json` con import JSON).
- `eslint.config.js`: `recommended` + `strictTypeChecked`, divieto di `dangerouslySetInnerHTML`. Prettier esclude `*.md` (tabelle di SPEC/ADR scritte a mano).
- `src/shared/config.ts` (`APP_NAME`, `APP_DOMAIN`), test `tests/unit/config.test.ts` e guardia `tests/unit/dependencies.test.ts` (solo SPEC 4.1 + ADR 0008, versioni esatte).
- `init.sh`: senza `wrangler.jsonc` esegue `npm ci` + lint, typecheck, test ed esce (stato intermedio fino a M0-02).
- Hook `format-and-lint.sh`: tolto `--format unix` (non più in ESLint 10, dava errore). `.claude/settings.json` riformattato da Prettier (nessun cambio di contenuto).

**Prove**
- Test prima: `vitest run` rosso su `config.test.ts` (modulo mancante), poi verde.
- `npm ci && npm run lint && npm run typecheck && npm run test` → exit 0; Vitest `2 passed (2)`, `5 passed (5)`.
- Guardiano: con `"left-pad": "^1.3.0"` aggiunto → 2 test rossi ("dev dependencies outside SPEC 4.1 / ADR 0008", "versions must be exact"); `package.json` ripristinato (verificato con `cmp`).
- Lint: file con `const x: any` → `@typescript-eslint/no-explicit-any`, exit 1; rimosso.
- `npm run format:check` → "All matched files use Prettier code style!", exit 0. `npm audit --audit-level=high` → 0 vulnerabilità.
- `./init.sh` → lint, typecheck, test verdi, exit 0. Hook su un `.ts` con `any`: restituisce l'errore ESLint come `additionalContext`.
- `docs/feature_list.json`: cambiato solo `passes` di M0-01 (diff di una riga).

**Resta in M0**: M0-02…M0-11. Nessun remote GitHub ancora: serve per M0-05, M0-07, M0-08, M0-09 (prerequisito di Roberto, SPEC 21).

**Da verificare a mano**: niente di specifico; `npm ci` su una macchina pulita.

---

## 2026-10-11 · Sessione 1 · M-1 (specifica)

**Fatto**
- Letto `docs/BRIEF.md` v2 (spostato da radice a `docs/`), intervista su 9 punti ambigui; decisioni D-01…D-26 in `docs/SPEC.md` sezione 3.
- Scritti `docs/SPEC.md` (77 funzionalità con verifica, sezione 18) e `docs/feature_list.json` generato dalle stesse tabelle (tutte `passes: false`).
- ADR 0001–0007 in `docs/adr/` (stato: proposta).
- `init.sh`, `CLAUDE.md`, subagent `spec-reviewer`, `security-reviewer`, `ux-a11y-reviewer`, hook `protect-files.sh` e `format-and-lint.sh`, `.claude/claude-security-guidance.md`.
- Configurazione proposta in `.claude/settings.proposed.json` (non ancora attiva, D-20).
- `git init` con branch `main`; nessun commit (in attesa di approvazione).

**Prove**
- Vettore di test geohash verificato: (45.4642, 9.19) → `u0nd9`.
- `docs/feature_list.json`: 77 voci (M0 11, M1 15, M2 16, M3 10, M4 10, M5 10, M6 5).
- `protect-files.sh` (input JSON come lo invia Claude Code, percorsi Windows assoluti): exit 2 su `.dev.vars`, `.dev.vars.staging`, `.env`, `package-lock.json`, migrazione presente su `main` (repo temporaneo); exit 0 su `.dev.vars.example`, `src/app/main.ts`, migrazione nuova.
- `format-and-lint.sh`: exit 0 senza tooling installato (prima di M0).
- `bash init.sh`: riconosce lo stato pre-M0, documenti presenti, `features: 0/77 passing`.
- `CLAUDE.md`: 68 righe. Script `.sh` con terminatori LF; `.gitattributes` forza LF.
- Aggiunti `.gitignore` (segreti, `public/data/`, foto evals) e `.gitattributes`.
- Aggiunta rispetto al BRIEF: quota di 20 segnalazioni al giorno (SPEC 13.3) e rotta `POST /api/venues/confirm` (necessaria per D-05).

**Ambiente rilevato**
- Windows 11, Git Bash, Node 24.18, npm 11.16, Python 3.13, git 2.54, `gh` autenticato. Mancano `jq` (gli hook usano Node) e `osmium` (import solo in CI, D-24). UI UX Pro Max 2.13 installato come plugin.

**Chiusura M-1**
- Roberto ha approvato SPEC 1.0 e chiesto a Claude di attivare la configurazione.
- `.claude/settings.proposed.json` → `.claude/settings.json` (attiva). Prova: un `Write` su `.dev.vars.hooktest` è stato respinto dalla regola deny.
- SPEC e ADR 0001–0007 segnati come approvati/accettati.
- Identità git del solo repository: Roberto Valeri <roberto.valeri.rv@gmail.com>.
- Commit iniziale su `main` e tag `spec-approved` (base della guardia della feature list, D-21).

**Prossimo passo**
`/clear`, poi il prompt di ripresa (BRIEF sezione 17) con milestone **M0**. Prerequisiti M0 per Roberto: SPEC sezione 21.
