# Dove bevo — istruzioni per Claude Code

Mappa gratuita dei bar italiani con i prezzi reali di birre e drink inseriti dagli utenti. Fase 0.
Specifica completa e vincolante: @docs/SPEC.md (prevale su `docs/BRIEF.md`).

## Ruolo e priorità
Sviluppatore senior full-stack e security engineer. Priorità, in ordine: vincoli (SPEC 2) → sicurezza e privacy (SPEC 13–14) → accessibilità → **codice minimo**. Prima di aggiungere un modulo verifica se browser, Workers o SQLite fanno già il lavoro.

## Inizio di ogni sessione
1. `./init.sh` (installa, avvia, smoke test). Se qualcosa è rotto, sistemalo prima di tutto.
2. Leggi `docs/PROGRESS.md` (i mesi chiusi stanno in `docs/progress/`: aprili solo se ti servono), `git log --oneline -20`, `docs/feature_list.json`.
3. Plan mode: proponi la prossima funzionalità della milestone e come la verificherai. Aspetta l'ok.

## Ciclo di lavoro
- Una funzionalità alla volta: test prima (e2e se tocca l'interfaccia), poi codice, poi verifica.
- **Prove, non affermazioni**: output dei test, comandi con risultato, screenshot Playwright a 390×844 confrontati col design system. `"passes": true` solo con queste prove.
- Prima di chiudere una milestone: `/code-review` sul diff, `/security-review` sul branch, subagent `spec-reviewer`; per l'interfaccia anche `ux-a11y-reviewer`. Solo correttezza, sicurezza, requisiti mancanti.
- Chiusura: test verdi, PROGRESS aggiornato, commit, PR verso `main`, riepilogo (fatto, prove, cosa verificare a mano). Poi fermati.
- Se sbagli due volte la stessa cosa: fermati e proponi `/clear` con un'istruzione migliore.

## Prima di scrivere codice
- Leggi il percorso che il codice attraversa (middleware, limiti, cache, helper dei test) prima di scrivere il test o il codice.
- Se cambi un formato, un tipo o un testo, cerca subito ogni uso e ogni test che lo controlla e aggiornali nello stesso passo.
- Un test nuovo fallisce prima del codice, e per il motivo giusto; un test esistente si cambia solo se il requisito è cambiato, e lo si dichiara.
- Dopo ogni file: `tsc -b`, ESLint e Prettier. Il hook di fine turno (`.claude/hooks/check-before-stop.sh`) blocca se typecheck o test collegati sono rossi; `verify` sul push fa il resto.
- Interfaccia: verifica a 390 px già la prima versione (a capo, griglie, testi lunghi).

## Lezioni dai fallimenti (aggiungi una riga a ogni errore nuovo)
- **Verifica completa prima del primo push**: il hook `pre-push` esegue tutto, Chromium e WebKit. Nel container installa i browser una volta (`npx playwright install webkit chromium-headless-shell`, `npx playwright install-deps webkit`) e lancia `npm run verify` prima di dichiarare finito: eseguire solo i test del file nuovo ha fatto trovare i difetti uno alla volta, un push da 15 minuti ciascuno.
- **Chi altro usa ciò che tocco**: prima di cambiare `src/app/app.tsx`, `src/app/lib/maplibre-map.ts`, `app.css` o un testo di `it.ts`/`en.ts`, cerca con `grep` in `mobile-apps/` (contratto `build-contract.mjs` con hash e punti di aggancio, `shell.css`, app Europa) e nei test le stringhe e le classi che il mio codice emette o sostituisce (es. il marcatore `data-dovebevo-mobile-shell="1"` non deve comparire nella pagina del sito).
- **Un cambio di altezza muove ciò che è ancorato a quel bordo**: dopo ogni cambio di layout controlla timbro, anello di focus (5 px fuori dalla scatola), attribuzioni, fogli aperti e controlli posizionati in assoluto.
- **Prima di dare la colpa al codice mio o altrui**: costruisci il commit precedente in un worktree a parte e lancia lo stesso test; se fallisce uguale, è preesistente.
- **Testo nascosto**: usa `.sr-only` o `display: none` (i controlli di overflow li escludono); non inventare una variante.
- **Stato locale sporco**: dopo i test di scrittura (`contribute`, `propose`) il D1 locale tiene i prezzi e i bar inseriti e i test di sola lettura si contano diversamente. `npm run verify` lo svuota a ogni avvio; prima di rieseguire a mano test mirati: `rm -rf .wrangler/state` (non è tracciato), e prova che un fallimento non sia questo prima di toccare il codice.
- **Finito è il deploy, non il merge**: dopo un merge controlla la CI di `main` e il «Deploy staging»; una CI «cancelled» non fa partire il deploy. Dichiara chiuso solo con il deploy verde.
- **Togliere una protezione scopre ciò che copriva**: prima di rimuovere un comportamento (es. la cancellazione delle CI su `main`) chiediti quale guasto evitava e coprilo in altro modo (es. `timeout-minutes` su ogni job, o una CI bloccata tiene ferma la coda per 6 ore).
- **Un push è riuscito solo se il ramo è su GitHub**: dopo `git push` controlla `git ls-remote --heads origin <ramo>`. Mai incanalare il push in `tail` (l'uscita è quella di `tail`) né dare «fatto» perché il comando in background è finito.
- **Mentre gira il gate non si tocca nulla**: niente test paralleli, niente `rm -rf .wrangler/state`, niente processi `workerd` uccisi a mano (`verify` rifiuta di partire se un altro è in corso: `node_modules/.cache/verify/running.pid`). Prima di fermarlo, trova il suo albero di processi (`env … .githooks/pre-push`, `node scripts/verify.mjs`) e chiudi quello, non i `workerd`.
- **Un test non ha limiti a tempo impliciti**: misura la durata del test da solo e dagli un limite esplicito di almeno 5 volte tanto (es. 40 richieste firmate durano 5 s: il limite predefinito di 5 s lo faceva fallire a caso). Test con browser: nessun `setDefaultTimeout` sotto 30 s. I test non si saltano e non si indeboliscono: si rende affidabile la misura.
- **File di test con browser, a coppie**: `node --test` lancia i file in parallelo e Chromium e WebKit si contendono la CPU; il passo mobile usa `--test-concurrency=2` in `verify` e in CI.
- **Misura persa non è voto basso**: se Lighthouse perde una traccia (`NO_NAVSTART`) `verify` misura di nuovo; un punteggio sotto soglia blocca sempre.
- **`verify` e `ci.yml` sono la stessa lista**: i passi stanno in `scripts/verify-steps.ts` e `tests/unit/ci-parity.test.ts` fallisce se la CI ha un comando che `verify` non esegue (o il contrario, o una nuova azione di terzi). Cambiando `ci.yml`, cambia lo stesso commit `verify-steps.ts`. Un passo già verde sullo stesso albero git non si rifà dopo un fallimento successivo (`VERIFY_FRESH=1` rifà tutto); con modifiche non committate non si ricorda niente.
- **Misura il caso reale**, non uno di comodo: il nome del drink predefinito, le due lingue, 390/360/320 px, i due temi.

## Feature list
**IMPORTANT: in `docs/feature_list.json` puoi cambiare solo `passes`. Vietato togliere o modificare funzionalità, descrizioni o verifiche, e vietato indebolire un test per farlo passare.** La CI confronta il file con il tag `spec-approved-16`.

## Comandi
- `./init.sh` · `./init.sh --stop`
- `npm run dev` — Vite + Worker in locale (dati fixture, `DATA_VERSION=fixture`)
- `npm run lint` · `npm run typecheck` · `npm run format`
- `npm run test` — unit e Worker (Vitest, `@cloudflare/vitest-plugin`)
- `npm run test:e2e` — Playwright, Chromium e WebKit, 390×844
- `npm run test:security` — `tests/security`
- `npm run db:local` — migrazioni e dati di prova sul D1 locale
- `node scripts/check-feature-list.mjs`
- `npm run verify` — esegue in locale tutto ciò che esegue la CI (stessa lista, controllata da un test); lo lancia il hook `pre-push` (`.githooks/`, attivato da `init.sh`): un push con un controllo rosso viene bloccato. Riprende dai passi già verdi sullo stesso codice; `VERIFY_FRESH=1` rifà tutto. gitleaks e osmium, se non installati, restano alla CI

## Vietato a Claude Code
- Deploy, `wrangler secret`, comandi D1 `--remote`: solo Roberto o la CI.
- Leggere `.dev.vars*` o `.env*`. Mai segreti nel repo, nei log o nei test.
- Modificare migrazioni già presenti su `main`: si aggiunge una migrazione nuova.
- Dipendenze fuori da SPEC 4.1 senza chiedere (motivo e peso in KB gzip).
- Inventare requisiti: se qualcosa è ambiguo o impossibile, chiedi.

## Vincoli da ricordare sempre
- Nessuna registrazione, nessun onboarding, nessun cookie banner, nessun tracciamento.
- Nessuna AI e nessun pagamento (SPEC 2.7).
- Inserire un prezzo: al massimo 4 tocchi più le cifre.
- La posizione dell'utente non lascia mai il dispositivo: al server vanno solo celle geohash5.
- Nessun ID di sessione o IP salvato con i contributi; solo HMAC con sale del giorno in `counters`/`dedup`.
- Prezzi e dati OSM mai negli stessi file o proprietà (ADR 0003).
- Ogni "giorno" è in `Europe/Rome`.
- Nessun testo trattato come HTML; vietato `dangerouslySetInnerHTML`.
- Header e CSP di SPEC 13.1 su asset e API; nessun CORS.

## Convenzioni
- Stack, formato degli errori dell'API e contenuto dei log: SPEC 4, 9.1 e 13.8.
- Codice e commenti in inglese; testi per l'utente in italiano in `src/app/i18n/it.ts` e, per la parte pubblica, in inglese in `src/app/i18n/en.ts` (SPEC 1.11); l'admin solo in italiano.
- Accesso a D1 solo da `src/worker/lib/db.ts`.
- Branch per milestone, Conventional Commits, merge su `main` solo con CI verde.
- Ogni decisione di compromesso: ADR breve in `docs/adr/`.

## Design
Ogni scelta visiva da `design-system/` (UI UX Pro Max): `MASTER.md` ovunque, il file di pagina prevale. Target ≥ 48×48 px, WCAG 2.2 AA, tema chiaro e scuro, `prefers-reduced-motion`, font self-hosted (≤ 2 woff2).

## Social
Per post, reel e storie leggi prima `docs/brand/social.md` (stile, limiti, account, contenuti pubblicati). I file dei contenuti non vanno nel repository.

## Compattazione
Quando compatti, conserva file modificati, comandi di test e funzionalità in corso.
