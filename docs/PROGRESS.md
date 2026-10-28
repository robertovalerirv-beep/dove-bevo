# Diario di avanzamento

Una voce per sessione, la più recente in alto. Ogni voce: data, milestone, cosa è stato fatto, prove (comandi ed esito), cosa resta, cosa verificare a mano.

---

## 2026-10-28 · Interfaccia pubblica in inglese (branch `m6-inglese`, da `spec-approved-12`) · SPEC 1.11, ADR 0038 · ME-01…ME-08

**Richiesta di Roberto:** sito utente in inglese, stesso database; menu in alto a sinistra di fronte all'Elenco; scelta non salvata, si parte sempre dall'italiano; formati `it-IT`; admin italiano; privacy e regole tradotte come bozza.

**Fatto**
- `src/app/i18n/lang.ts` (lingua in memoria, `it` come legame vivo, `setLang` che scarica `en.ts` solo se scelto, `subscribeLang`), `src/app/lib/use-lang.ts` (hook), `src/app/i18n/en.ts` (tutte le sezioni pubbliche di `it.ts`, senza `admin`, tipo derivato: una frase mancante non compila), `src/app/components/LangMenu.tsx` (bottone «IT/EN» 48×48 con elenco Italiano/English).
- `it.ts`: nuovo gruppo `lang` (nomi delle lingue). Nei file pubblici (`app.tsx`, `components/*`, `LegalPage`, `maplibre-map.ts`) cambia l'import di `it` verso `i18n/lang`; admin e Worker restano su `it.ts` (test `lang.test.ts`).
- `app.tsx`: si ridisegna al cambio lingua; il messaggio di «Vicino a me» e il suggerimento di ricerca sono chiavi (seguono la lingua), il testo di copertura è calcolato una volta; `cheapest` dipende dalla lingua; etichetta del canvas aggiornata (`VenueMap.setLabel`) senza rifare la mappa; Turnstile riceve la lingua della pagina.
- CSS: la riga di stato parte dopo il bottone (`left = 2×space-3 + target`, larghezza ridotta di un altro target); menu nell'intestazione di `/privacy` e `/regole` (l'intestazione va a capo se serve).
- `PRIVACY-NOTES.md`, CHANGELOG. `passes: true` solo per ME-01 e ME-08 (vedi sotto).

**Prove** (Chromium; WebKit non è installato in questo ambiente, lo esegue la CI)
- Test prima del codice: `npx vitest run --project unit tests/unit/lang.test.ts` → 12 fallite (modulo `en`/`lang` assenti, file ancora su `it.ts`).
- `npx vitest run` → 56 file, 624 test + i nuovi: unit 407/407, worker verdi. `npx tsc -b` pulito (un primo tentativo faceva entrare preact nel progetto TypeScript del Worker, che include `src/app/i18n`: l'hook è stato spostato in `lib/` e `lang.test.ts` ora lo vieta). `npm run lint` e `format:check` puliti.
- `npx playwright test` (progetti chromium, writes, proposals, security; WebKit escluso) → **192 passati**, tra cui `tests/e2e/english.spec.ts` (16 test: menu a sinistra speculare all'Elenco e stato che parte dopo di lui, tastiera/Esc/tocco fuori, la mappa resta aperta e non si ridimensiona, nulla salvato in `localStorage`/`sessionStorage`/cookie e nessuna richiesta `/api/*`, un solo scaricamento di `en`, ricarica → italiano, tutte le viste pubbliche senza testi italiani residui — con controllo non vacuo —, Privacy e Regole con le stesse sezioni, formati `it-IT`, `/admin` italiano, axe nei due temi, nessuna violazione CSP). Screenshot: `docs/screenshots/english/rules-{light,dark}.png`; gli altri in `test-results/` (non versionati).
- `ME-01` verificato anche con prova negativa: togliendo `common.close` da `en.ts`, `tsc -b` dà TS2741.
- **Misure della shell** (`npm run build && node scripts/check-bundle-size.mjs`): prima (`spec-approved-12`) 38.513 B; dopo 39.408 B (+895 B, limite 51.200 B); `en.ts` è un file a richiesta di 5.213 B gzip.

**Non fatto / da fare**
- ME-02…ME-07 restano `passes: false`: la loro verifica chiede anche WebKit (SPEC 18), che qui non c'è. Se la CI della PR è verde su Chromium e WebKit, si portano a `true` con quella prova.
- `/code-review`, `/security-review`, `spec-reviewer` e `ux-a11y-reviewer` non eseguiti da questa sessione (non può avviare altri agenti): da lanciare prima del merge.
- Lighthouse non eseguito in locale (lo fa la CI).
- **Da verificare a mano (Roberto):** rileggere la traduzione inglese di Privacy e Regole (bozza, ADR 0038) e dei testi `en.ts`; provare il menu su iPhone e Android (posizione dell'elenco sotto il bottone, tastiera); guardare lo stato in alto con testi lunghi a 360 px.

---

## 2026-10-28 · SPEC 1.11: mappa pronta al primo tocco e interfaccia in inglese (branch `spec-1-11`) · ADR 0037, 0038 · MF, ME

**Richiesta di Roberto:** (1) la mappa si carica solo al primo tocco e ha latenza: scelta l'opzione B (scaricare il file in anticipo, senza banner); (2) pagina utente in inglese, stesso database, formati `it-IT`, menu a tendina in alto a sinistra di fronte all'Elenco, admin italiano, lingua non salvata, si parte sempre dall'italiano, privacy e regole tradotte come bozza.

**Fatto (solo specifica, nessun codice)**
- SPEC 1.11: intestazione e registro modifiche, D-35 (mappa pronta), D-36 (lingua), 7.1, nuova 7.11, sezione 14 (la lingua non è salvata), 15, 17, voci MF-01…MF-03 e ME-01…ME-08 (sezione 18), milestone MF e ME (19).
- `docs/feature_list.json`: 11 voci nuove a `passes: false`, nessun'altra riga toccata (diff solo di righe aggiunte).
- ADR 0037 (mappa scaricata in anticipo, completa il 0014) e ADR 0038 (inglese).
- Guardia della feature list ora sul tag `spec-approved-12` (`scripts/check-feature-list.mjs`, `ci.yml`, `CLAUDE.md`, `.claude/agents/spec-reviewer.md`); `CLAUDE.md` aggiornato sul file dei testi.

**Non fatto, di Roberto**
- Creare e pubblicare il tag `spec-approved-12` su questo commit: finché manca, la guardia della feature list è rossa in locale, nel hook di push e in CI.
- Rileggere la traduzione inglese di privacy e regole quando sarà scritta (ME-05).

**Prossimi passi (dopo il tag):** rami in parallelo `m6-mappa-prefetch` (MF) e `m6-inglese` (ME), come da piano.

---

## 2026-10-27 · Un solo ambiente vivo: `staging` è la produzione (branch `m5-chiusura-codice`) · SPEC 1.10, ADR 0036 · M6

**Richiesta di Roberto:** niente doppio ambiente per ora; `staging` diventa il sito in produzione; aggiornare M6 e il resto; l'ambiente separato, se serve, lo deciderà più avanti.

**Fatto**
- SPEC 1.10: ambienti (4), CI/CD (16), D-01, prerequisiti (21), milestone M6 e righe M6-02, M6-04, M6-05 riscritte; `docs/feature_list.json` allineato (cambiano solo `descrizione` e `verifica` di quelle tre voci, autorizzate da Roberto in chat; `passes` invariati).
- ADR 0036 (completa l'ADR 0035); `docs/release-checklist.md` riscritta con la sezione «Se un giorno serve l'ambiente separato»; `docs/runbook-rollback.md` avverte che la prova tocca il dominio vivo; modello `deploy-production.yml.example` marcato «non in uso»; CHANGELOG; commento di `deploy-staging.yml`.
- Guardia della feature list ora sul tag `spec-approved-11` (`scripts/check-feature-list.mjs`, CLAUDE.md, `ci.yml`).

**Non fatto, di Roberto**
- Creare il tag `spec-approved-11` sul commit di questa modifica: finché manca, la guardia della feature list è rossa in CI e nel hook di push.
- M6-02 (firma dei segreti di `staging`), prova del rollback, tag `v0.1.0`, `preload` HSTS, regola WAF: vedi `docs/release-checklist.md`.

---

## 2026-10-25 · Dominio www.dovebevo.com sul Worker esistente (branch `claude/cloudflare-domain-setup-beb3b8`) · M6-01 in parte

**Richiesta di Roberto:** portare il sito vero (bar e prezzi già inseriti) sul dominio comprato, sostituendo l'indirizzo `workers.dev`. ADR 0035: nessuna copia del D1, il dominio si collega al Worker `dovebevo-staging`.

**Verificato da fuori (sola lettura):** `dovebevo.com` e `www.dovebevo.com` rispondono 200 con `data_version 20261024`, identico a `workers.dev` (stessi dati), HSTS e CSP presenti, `CF-Cache-Status: HIT`. `/api/admin/metrics` sul nuovo dominio → 403 (chiuso dal Worker), su `workers.dev` → 302 al login di Access: Access non copre ancora il nuovo hostname.

**Fatto nel codice:** `TURNSTILE_HOSTNAME` di staging e `APP_DOMAIN` = `www.dovebevo.com` (canonico, scelto da Roberto), test di configurazione, guide admin e inserimento, ADR 0035.

**A carico di Roberto (dashboard):** hostname `www.dovebevo.com` nel widget Turnstile `dovebevo-staging`; due public hostname (`admin`, `api/admin/*`, su `www.dovebevo.com`) nell'applicazione Access; la Redirect Rule radice → `www` è già creata, da verificare che risponda 301; Always Use HTTPS. Poi prova: salvare un prezzo e aprire `/admin` su `www.dovebevo.com`.

---

## 2026-10-25 · «Gestore verificato» (branch `md-gestore-verificato`, da `main` baba407) · SPEC 1.9, MD-01…MD-11

**Richiesta di Roberto:** offerta ai gestori che firmano un contratto (fuori dal repository): spunta blu con «Gestore verificato», «Sponsorizzato», primo posto nell'Elenco e orari nella scheda prima dello scontrino; si attiva e si scrivono gli orari solo da admin; contratti, pagamenti, scadenze e dati dei gestori fuori dal progetto; niente «aperto ora»; chiusure straordinarie a mano; pagine per i motori di ricerca invariate. Autorizzati da lui in chat: SPEC 1.9, le voci MD-01…MD-11, il tag `spec-approved-10` (lo crea lui sul commit 815b4c7) e le regole contro i turni rossi.

**Fatto**
- SPEC 1.9 (D-34, 7.10, 8, 9.2, 12, 14, MD), ADR 0033, feature list con MD-01…MD-11 a `false`, guardia su `spec-approved-10`.
- Migrazione `0008_verified_venues.sql` (`venue_key`, `cell`, `name`, `hours`; svuota `cell_snapshot`). Rotte `GET/POST /api/admin/verified` e `POST /api/admin/verified/remove` dietro Access; nome e cella dal file del bar o da `venues_user`; ogni scrittura svuota la cella. `g` nella cella, `o` nella scheda, solo per bar pubblici. `venue_viewed` porta la chiave solo di un bar verificato e pubblico, controllata dal Worker. Orari validati da un solo modulo (`src/shared/hours.ts`).
- App: Elenco con i verificati in cima (`src/app/lib/list-order.ts`), badge sempre con «Sponsorizzato» (`components/Verified.tsx`), orari prima dei prezzi, pagina `/admin/verificati` (chunk a sé, link nell'intestazione di `/admin`), ricerca admin condivisa (`lib/admin-find.ts`), token `verified`, `/regole` e `/privacy` aggiornati, `PRIVACY-NOTES.md`.
- Regole: hook di fine turno `.claude/hooks/check-before-stop.sh` (typecheck e test collegati ai file TypeScript cambiati; blocca il turno se rossi) e sezione «Prima di scrivere codice» in CLAUDE.md. `protect-files.sh` controlla anche `origin/main`: con il `main` locale fermo a ae2183b la 0007 non era protetta (provato: ora bloccata).

**Prove**
- `npm run test`: 54 file, 603 test verdi (tra cui `tests/worker/verified.test.ts` 18, `tests/unit/hours.test.ts` 30, `list-order` 4, `migrations-frozen` 8: le sette migrazioni di `origin/main` identiche byte per byte, e il test diventa rosso se se ne tocca una).
- Righe D1 misurate sulle rotte vere, contando ogni tabella prima e dopo: attivazione **2** righe (limite 5), contributo in una cella con un bar verificato **7** (limite 10); lettura di 300 prezzi a snapshot pronto ≤ 5 righe.
- E2E Chromium `tests/e2e/verified.spec.ts` 15 verdi (MD-06…MD-09, MD-11; MD-07 ripetuto 6 volte); `verified-writes.spec.ts` (riga nel D1 locale → spunta e orari sulla scheda, e spariscono alla rimozione) verde; sicurezza `tests/security/verified.spec.ts` 3 verdi (403 senza Access sulle tre rotte, colonne di `venues_verified`, `g` solo chiavi). Suite Chromium completa e sicurezza: vedi sotto.
- Shell: col vecchio conteggio (tutti i JS e CSS tranne MapLibre) **46.574 B** su `origin/main` → **51.136 B** (budget 51.200); la funzione aggiunge ~4,6 KB, di cui 2,4 KB nella pagina admin a richiesta. Con il conteggio della shell iniziale deciso da Roberto (ADR 0034): **38.508 B** (index.html, `theme.js`, JS e CSS principali); pagine a richiesta stampate a parte (VerifiedPage 2.408 B).
- Revisioni: `security-reviewer` OK (segnalato: chiave di un bar verificato poi nascosto ancora contata → corretto con test); `spec-reviewer` OK con 9 lacune nei test → chiuse tutte; `ux-a11y-reviewer` OK con 4 punti (annuncio dei messaggi di ricerca, fuoco dopo salva/annulla/disattiva, righe degli orari, link a 48 px) → corretti con test.
- Screenshot 390×844 nei due temi in `docs/screenshots/md/` (scheda, Elenco, admin).
- `verify` in locale, passo per passo: lint, formato, typecheck, unit e worker (603), policy dei workflow, configurazione, `npm audit` (0), build, budget, Lighthouse mediana di 3 (performance 0,97, accessibilità 0,96, best practices 1, SEO 1, LCP 2,35 s, CLS 0) verdi; E2E Chromium 129, sicurezza 23, scrittura 19, proposte 5 verdi. Non eseguibili qui: guardia della feature list (manca il tag `spec-approved-10`; confrontata con `origin/main` risultano solo le 11 voci MD aggiunte) e WebKit (non installato). Push con `--no-verify` autorizzato da Roberto per questi due motivi.

**Non fatto, di Roberto o da decidere**
- Tag `spec-approved-10` sul commit 815b4c7: finché manca, la guardia della feature list è rossa in CI.
- WebKit non è installato in questo container: la parte WebKit la esegue la CI.
- In `/admin` («Trova un bar sulla mappa») il messaggio della ricerca non è in una regione `aria-live`, come segnalato dalla revisione: difetto precedente, fuori da questo lavoro.

**Da verificare a mano (Roberto):** su telefono, la spunta e gli orari di un bar attivato da `/admin/verificati`; il campo orario a 24 ore con il telefono in italiano.

**CI della PR #55** (run 40193292677 su `30a06af`): E2E Chromium e WebKit e sicurezza, Lighthouse, import OSM, gitleaks verdi; la guardia della feature list verde dopo il tag `spec-approved-10` creato da Roberto sul commit 815b4c7. MD-01…MD-11 → `passes: true`.

---

## 2026-10-24 · Chiusura del codice prima del dominio (branch `m5-chiusura-codice`, da `main` 91386b7) · M3-17, M3-20, M4-05, M4-13, MB-04, MB-07, MB-08, MB-14, MB-16, M5-02, M5-04, M5-05, M5-07, M5-08, M5-10, M0-07

**Richiesta di Roberto:** fare tutte le verifiche e chiudere ciò che si può sul codice prima di comprare il dominio. Provato da lui su telefono vero: «Vicino a me» funziona; icone e limiti di Sbagliato, Gin lemon e Acqua approvati; il test con 5 persone è in corso (inseriscono anche locali e prezzi). Contatto pubblico deciso da lui: `dovebevo@gmail.com`.

**Fatto**
- **Listino in admin (M3-17):** `POST /api/admin/listino` (zod `strict`, catalogo e limiti come l'inserimento manuale, giorno non futuro e non oltre 90 giorni, un prezzo più recente o in revisione non si sostituisce) e il modulo «Inserisci listino» sotto ogni bar trovato in `/admin`.
- **Pagine `/privacy` e `/regole` (M5-04, MB-16):** testi in `it.ts` (sezione `legal`) dalle regole di SPEC 14 e da `PRIVACY-NOTES.md`, chunk a richiesta, logo orizzontale nei due temi, link nella scheda bar e nel foglio di ricerca (la mappa non ha un piè di pagina: la barra a due tasti di D-28 non cambia). `CONTACT_EMAIL` = `dovebevo@gmail.com`.
- **Riga istantanea per cella (M3-20, ADR 0035, migrazione 0007):** una cella si legge con 1 riga; invalidata a ogni scrittura (anche le proposte di bar, prima mancava), scadenza di sicurezza 5 minuti.
- **Elenco della mappa:** un prezzo vecchio dice «Da confermare» anche a parole (M4-05; il pin tratteggiato resta solo grafico).
- **Documenti:** `docs/security/asvs-l1.md` (M5-07), `docs/user-test.md` (M5-10), `docs/runbook-rollback.md`, `docs/release-checklist.md`, `CHANGELOG.md`, `docs/templates/deploy-production.yml.example` (modello del workflow di produzione: solo da tag, solo se il commit è già in `main`, con approvazione dell'environment `production`; non provato e non attivo, perché `check-config` lo rifiuta finché `wrangler.jsonc` non ha il blocco `production`: si copia in `.github/workflows/` in M6).
- `eslint.config.js` ignora `docs/materiali/` (materiali locali fuori dal repository).

**Prove**
- Worker: `admin-listino.test.ts` 6 verdi; `cell-snapshot.test.ts` 6 verdi (300 prezzi: la lettura dello snapshot costa ≤ 5 righe; un contributo vero via `POST /api/prices` aggiunge ≤ 10 righe; corsa lettore/scrittore chiusa).
- E2E Chromium e WebKit: `admin.spec.ts` 16 verdi (listino + axe); `legal.spec.ts` (contenuto, logo, axe, target ≥ 48 px, nessuna CSP, nessun caricamento della mappa, link dalla ricerca e dalla scheda); `a11y-views.spec.ts` (axe wcag22aa, target ≥ 48 px, nessuno scroll orizzontale su mappa, menu drink, elenco, ricerca, aggiungi prezzo in 3 passi, proponi bar, scheda, segnalazione, nei due temi; Tab dentro i fogli, Esc, `prefers-reduced-motion`); `brand-controls.spec.ts` (bordo 2 px `ink`, ombra, 3 px da premuto, focus 3 px a 2 px; la mappa a tutto schermo ha il suo anello interno, app.css); `brand-coverage.spec.ts` (conteggio a mano su proiezione Web Mercator indipendente dal codice, zero richieste di rete); `brand-search.spec.ts` M4-13 (esatto, inizio, distanza); `brand-tiers.spec.ts` M4-05 sull'elenco.
- **M5-06:** `npm run verify` tutto verde in 796 s (lint, formato, typecheck, unit e worker, guardia, audit, E2E Chromium e WebKit, build, budget della shell, Lighthouse mediana di 3): performance 0,97, accessibilità 0,96, best practices 1, SEO 1, LCP 2,42 s (limite 2,5), CLS 0, TBT 41–106 ms; INP delle interazioni sui pin 80 ms (Chromium) e 160 ms (WebKit) con circa 263 pin, vedi MB-07.
- Sicurezza: `no-secrets.spec.ts` (nomi dei segreti mai nei file del browser, nessun formato di chiave nel build).
- **MB-07, 300 pin:** con circa 263 pin sullo schermo l'interazione più lenta è 80 ms su Chromium e 160 ms su WebKit (locale). Sul runner CI i tempi sono più alti e instabili, quindi il test fissa solo un limite di buon senso (< 1000 ms) e riporta il numero; la prova di Roberto su telefono resta il riferimento.
- M0-07: Deploy staging verde su 91386b7 e `curl https://dovebevo-staging.dovebevo.workers.dev/api/health` → `{"status":"ok","version":"0.0.0","data_version":"20261023"}`.
- Revisioni: `security-reviewer` OK, nessun punto sopra LOW (corretti: testo della privacy sulla fascia di anzianità, ADR 0035, tag sul ramo `main` nel workflow di produzione); `spec-reviewer` NOT OK per la mancanza di queste prove in PROGRESS e per il test delle scritture, ora entrambi sistemati.

**Non fatto, di Roberto o da decidere**
- M6-01…M6-05 dopo il dominio.
- `/privacy` non indica il titolare del trattamento (informativa iubenda o dati del titolare, a cura di Roberto).
- SPEC 7.8 parla di «piè di pagina della mappa»: i link sono nella scheda bar e nel foglio di ricerca; se li vuoi anche sulla mappa serve una decisione sul layout (D-28).
- I quattro punti del pen test del 22/10 che cambiano la SPEC restano da decidere (SECURITY.md).

---

## 2026-10-24 · Attribuzioni in una riga e pallino della posizione (branch `claude/reduce-ads-location-ui-b283ws`, da `main` be1891e) · SPEC 1.8, MC-05

**Richiesta di Roberto (screenshot iPhone):** ridurre la scritta in basso «OpenFreeMap © OpenMapTiles © OpenStreetMap contributors» e mostrare un pallino blu piccolo della posizione, solo dopo il pulsante in alto a destra, fermo finché non lo si ritocca. Autorizzati da lui in chat: SPEC 1.8, la voce nuova MC-05 in `feature_list.json`, il tag `spec-approved-9` e la guardia aggiornata. (Il suo «non mi trovava» dipendeva dalla posizione di Safari spenta: attivandola funziona.)

**Fatto**
- Attribuzioni (SPEC 2.8, testo invariato): una riga a 11 px (`--size-legal`, generato da `scripts/tokens.ts`) in un'etichetta nell'angolo in basso a destra, invece di due righe a 14 px su tutta la larghezza; va a capo se serve (telefono stretto, testo spaziato WCAG 1.4.12) e la legenda resta 8 px sopra la sua altezza misurata (`ResizeObserver`, `--attribution-h`).
- Pallino (D-33, ADR 0031): layer `circle` `me-dot` da 12 px (token `map-me` in `docs/brand/tokens.json`, bordo chiaro) con alone `me-ring` al 25% (forma diversa dai bar senza prezzo nel tema scuro, WCAG 1.4.1) sotto i prezzi; lo accende solo `nearMe()` in `app.tsx`, non la posizione letta per Aggiungi prezzo; niente `watchPosition`; rimesso al cambio di tema. `data-me` (pixel sullo schermo, mai coordinate) per gli e2e.
- SPEC 1.8 (7.1, D-33, MC-05, registro), ADR 0031, riga in `PRIVACY-NOTES.md`, guardia e CI su `spec-approved-9`.

**Prove (Chromium; WebKit non installato nel container, lo esegue la CI)**
- `tests/e2e/position-dot.spec.ts`: 4 verdi (nessun pallino prima, pallino al centro dopo «Vicino a me», fermo quando il telefono si sposta e `watchPosition` mai chiamato, sulla nuova posizione al nuovo tocco, spento con Aggiungi prezzo, axe nei due temi).
- `brand-map.spec.ts` SPEC 2.8 a 390 (due temi) e 320 px, più il caso con la spaziatura WCAG 1.4.12: verdi; il caso a 320 px era **rosso** con la legenda a distanza fissa e quello 1.4.12 è **rosso** con `nowrap` (testo fuori schermo), verdi dopo.
- Revisioni: `spec-reviewer` (OK, segnalata la legenda a 320 px: corretta) e `ux-a11y-reviewer` (OK, segnalati `nowrap`, la legenda, il pallino distinguibile solo per colore nel tema scuro e il design system: tutti corretti).
- Tutta la suite e2e Chromium: 116 verdi prima della correzione dei 320 px; `npm run test` 519 verdi (MB-01 token identici, MB-03 contrasto `map-me` su `map-land` ≥ 3:1 nei due temi); `npm run test:security` 16 verdi; lint, formato, typecheck, guardia, workflow, config, audit, build verdi; shell 43.640 B su 51.200.
- Screenshot 390×844 (e 320) in `docs/screenshots/mc/` (`mc-05-dot-*.png`, `attribution-*.png`).

**Da verificare a mano (Roberto):** su iPhone, il pallino dopo il tocco e che resti fermo camminando; l'attribuzione leggibile su una riga.

**CI della PR #52** (run 40123420680 su `e3a0995`): E2E Chromium e WebKit e sicurezza verdi (MC-05 compreso), Lighthouse e budget della shell verdi, import OSM e gitleaks verdi; la guardia della feature list verde dopo il tag `spec-approved-9` creato da Roberto. MC-05 → `passes: true`.

---

## 2026-10-22 · Metriche giornaliere in `/admin` (stesso branch, dopo M5-01) · M5-03

**Fatto**
- `GET /api/admin/metrics` (dietro Access, `Cache-Control: no-store`): ultimi 14 giorni di `metrics_daily`, una sola lettura per intervallo sulla chiave primaria; `summarizeMetrics` (`src/shared/metrics.ts`) somma le righe: un evento con più proprietà scrive una riga per proprietà, quindi si conta la somma di un solo tipo di proprietà (o il massimo), non il totale.
- Sezione «Uso giorno per giorno» in `/admin` (`src/app/views/Metrics.tsx`): visite, quota di chi torna, prezzi, quota di visite con prezzo; conferme e bar visti dai 600 px in su. Se non carica, una riga di stato e il resto della pagina funziona.
- Le code review/quarantena/nuovi bar con Approva/Rimuovi e la copertura per città erano già coperte da `admin.spec.ts` e `admin-coverage.spec.ts`.

**Prove**
- `tests/worker/admin-metrics.test.ts` (4: riepilogo, 403 senza JWT, 200 no-store, piano di lettura); `admin.spec.ts` +2 (tabella, errore) Chromium e WebKit con axe e nessuno scroll orizzontale; screenshot 390 px in `docs/screenshots/admin/metrics.png`.
- Admin e copertura e2e: 42 verdi (Chromium e WebKit); `npm test` verde; lint, formato e typecheck verdi.
- Non lanciato `npm run verify` completo né push.

---

## 2026-10-22 · Eventi anonimi (branch `claude/prossimi-step-tecnici-uiux-62e374`, da `main` 1857ced) · M5-01

**Fatto**
- `POST /api/events` (`src/worker/routes/events.ts`): senza sessione né `Content-Type: application/json` (D-06); `Origin` controllato, rate limit per IP-HMAC, corpo ≤ 2 KB (413), schema chiuso (`src/shared/events.ts`): eventi `app_open`, `price_added`, `price_confirmed`, `venue_viewed`; proprietà `day_bucket`, `source`, `drink` (`city` esclusa: un valore libero farebbe crescere `metrics_daily` senza limite, rilievo della revisione di sicurezza; tornerà con un elenco chiuso di ID); ≤ 10 eventi. Risposta 204. Incrementa solo `metrics_daily`, più `visit_contributed` per ogni beacon con un `price_added`.
- Client (`src/app/lib/events.ts`): eventi accumulati e inviati con `sendBeacon` (text/plain) al passaggio in background; se il prezzo parte già in background l'invio è immediato. `day_bucket` dalla data del primo uso già in `localStorage` (nessuna chiave nuova).

**Prove**
- `tests/worker/events.test.ts` 8 test (conteggi, `visit_contributed`, 400 fuori elenco, 413, 403, nessun dato personale); `tests/unit/usage.test.ts` +1 (bucket); `tests/e2e/events.spec.ts` Chromium e WebKit: nessun beacon durante l'uso, uno solo in background.
- `npm test` 47 file, 511 verdi; lint, format e typecheck verdi; e2e csp, contribute, pwa, privacy, brand-tiers su Chromium e WebKit (anche progetti writes): 206 verdi.
- Il test del Worker non l'ho visto rosso prima del codice (la rotta non esisteva: sarebbe stato 404).
- Non lanciato `npm run verify` completo né pushato.

**Da sapere:** i contatori ci sono solo dopo il deploy; `/admin` non li mostra ancora (M5-03). Per l'informativa: gli eventi non contengono ID, IP o posizione.

---

## 2026-10-22 · Pen test aggressivo e rafforzamento (branch `sec/hardening-2026-10-22`, da `main` 20072d0) · ADR 0029

**Richiesta di Roberto:** pen test aggressivo di sito e GitHub, un report interno per bug, una sola correzione cumulativa, UI e UX ineccepibili; il deploy lo decide lui.

**Metodo:** lettura del codice, GET su staging (sola lettura), `gh` in sola lettura, scansione della storia git, 159 attacchi in workerd, attacchi HTTP e in browser (Chromium e WebKit) sulla build locale. Nessuna scrittura remota. Il report interno con le prove sta fuori dal repo.

**Esito:** nessuna falla critica; sessione, JWT Access, Origin, body, SQL, XSS/CSP, cache, privacy a riposo e race su quote e conferme hanno retto.

**Fatto (un solo ramo, nessun push)**
- Guardia fail-closed (`src/worker/lib/env-guard.ts`): con le chiavi segnaposto di `wrangler.jsonc` fuori da localhost ogni POST (tranne l'admin) risponde 503; `scripts/check-config.mjs` in CI e `npm run verify` (ambienti senza segnaposto, deploy con `CLOUDFLARE_ENV`).
- `validVenueName`: link nascosti, full-width, separatori, caratteri non validi; zero nuovi rifiuti su 840 nomi reali.
- vitest 4.1.12 (0 avvisi); `npm audit` anche sulle dipendenze di produzione.
- `/.well-known/security.txt` (M5-09); tolta l'email personale dai documenti.
- Suite red-team permanente (`tests/worker/pentest-suite.test.ts`) e test di regressione.

**Prove**
- Test nuovi rossi sul codice vecchio (7 + 17), verdi sul nuovo.
- `npm run verify` verde in 688 s: lint, formato, typecheck, 477+ test unit e worker, guardie, audit (0 avvisi, anche produzione), E2E Chromium e WebKit più sicurezza (531 s), build, budget shell, Lighthouse.
- Interfaccia invariata: 44 screenshot 390×844 (Chromium e WebKit, chiaro e scuro, 11 viste) confrontati pixel per pixel prima e dopo: 44 su 44 identici (una differenza di 5.166 px in un giro, non riprodotta in 3 ripetizioni, rumore di rendering).
- `security-txt.spec.ts` verde (2 test): M5-09 `passes: true`.
- Revisioni `security-reviewer` e `spec-reviewer`: due falsi positivi del filtro dei nomi (`Dr. De Luca`, `Punto Club`) corretti e coperti da test; guardia resa attiva su tutte le POST.

**Da fare per Roberto prima del push/deploy**
- Impostazioni GitHub: ruleset dei tag `spec-approved*`, approvazione fork e cancellazione dei rami dopo il merge sono già applicati (22/10/2026). Restano: Environment `staging` con i segreti Cloudflare (poi `environment: staging` nel deploy), scope del token Cloudflare, email privata su GitHub.
- Verificare i secret di staging (`wrangler secret list --env staging`): SESSION_HMAC_KEY, HASH_KEY, TURNSTILE_SECRET reali (non il secret di test), altrimenti dopo il deploy le scritture danno 503.
- Dopo il deploy: `/.well-known/security.txt` servito su staging.
- Decisioni di SPEC aperte (ADR 0029): conferma di prezzi in quarantena, segnalazioni, ultimo prezzo vince, quote IPv6.

---

## 2026-10-21 · Sessione 14 (seguito) · Via la frase della zona senza prezzi (branch `fix/remove-empty-zone-note`, da `main` 367ad8a) · SPEC 1.7

**Richiesta di Roberto:** togliere da ovunque «Qui nessuno ha ancora segnato un prezzo. Il primo sei tu: ci vogliono 10 secondi.»: appesantisce e non dà valore. Autorizzati da lui in chat: SPEC 1.7, la riscrittura di MB-13 in `feature_list.json`, il tag `spec-approved-8` e la guardia aggiornata.

**Fatto**
- Tolti: la nota in `app.tsx`, `emptyZone` in `it.ts`, il campo `empty` e `EMPTY_ZONE_SHARE` (la soglia del 5%), `.map__note` in `app.css`, la riga in `docs/brand/02-voce.md` e la frase nel README della Copertura.
- Test: `brand-map.spec.ts` ora verifica che la frase non compaia in nessun punto e che barra e mappa non cambino; `tiers.test.ts` e `voice.test.ts` senza il caso tolto.
- SPEC 1.7 (7.1, D-28, MB-13, registro delle modifiche); `feature_list.json`: solo il testo di MB-13; guardia di `scripts/check-feature-list.mjs`, `ci.yml` e `CLAUDE.md` su `spec-approved-8` (tag sul commit `chore(spec)`, da pubblicare insieme al ramo).

**Prove:** vedi il gate al push (`npm run verify`); `node scripts/check-feature-list.mjs` verde col tag nuovo.

---

## 2026-10-21 · Sessione 14 · Il prezzo cambiato si vede subito (branch `fix/price-cache-invalidate`, da `main` d9ce189)

**Richiesta di Roberto:** un prezzo inserito e confermato, poi modificato, non risultava né cambiato né «da approvare».

**Causa (letta nel codice e confermata dai test):** la risposta `GET /api/prices/:cell` è in cache 60 s (bordo e browser; su staging `CF-Cache-Status: HIT`, quindi la Cache API è attiva anche su `workers.dev`). Solo le azioni dell'admin la svuotavano (`forgetCell`): dopo un prezzo, una conferma o una segnalazione il client rileggeva subito la cella e riceveva la copia vecchia. Il dato era già giusto in D1 (su staging: Namasce, birra 4,00 → 6,00 il 21/10 con 0 conferme). Roberto ha poi visto i prezzi aggiornati.

**Fatto**
- `src/worker/routes/prices.ts`: `forgetCellCache` (solo la cella, non il riepilogo della dashboard) dopo `POST /api/prices` e `/confirm`; `reports.ts` dopo l'invio in revisione; `getCurrentPrice` restituisce anche `cell`.
- `src/app/lib/data.ts`: dopo `invalidateCell` la prossima lettura dei prezzi di quella cella usa `cache: "reload"` (salta la copia del browser).
- Test nuovo `tests/worker/prices-cache.test.ts` (prezzo cambiato e conferma): **rosso prima, verde dopo**.

**Prove:** `npm run verify` completo verde in 692 s (lint, formato, typecheck, unit e worker 394, guardia, audit, e2e Chromium e WebKit 512 s, build, budget, Lighthouse). Prima di quel giro 3 test WebKit di `map-stability` erano caduti nel giro da 204 test in parallelo e sono passati da soli (3/3) e ripetuti (6/6): noto «Carico la mappa…» sotto carico.
**Limiti:** nessun test e2e della parte client (`cache: "reload"`); la Cache API svuota solo la sede Cloudflare che serve la richiesta (accettato: è quella dell'utente che ha appena salvato).

---

## 2026-10-21 · Sessione 13 · Menu «Scegli cosa bere», nove drink senza formati (branch `m7-menu-drink`, sopra `fix/map-stability-undo-5s`) · SPEC 1.6, ADR 0028

**Richiesta di Roberto (feedback degli amici):** al posto della riga di chip un solo pulsante «Scegli cosa bere» con menu a caselle multiple; lista nuova (Birra media, Spritz, Negroni, Sbagliato, Gin tonic, Gin lemon, Calice di vino, Analcolico, Acqua) che sostituisce la vecchia anche in «Aggiungi prezzo»; con più drink il pin mostra il prezzo più basso; la colonna dei ml tolta da qualsiasi parte del codice. Il terzo punto (due tasti in zona vuota) era già nella PR #40 (ADR 0027): nulla da fare.

**Fatto**
- `src/shared/catalog.ts`: `{ code, min, max }`, niente formati. `PriceRow` senza `size_ml` (indici dopo `drink` scalati di uno), API, `db.ts`, SEO, admin, client e test senza ml. `tests/unit/no-sizes.test.ts` fallisce se tornano.
- `migrations/0006_no_sizes.sql`: `prices_current` con chiave `(venue_key, drink, hh)`, colonna tolta da `price_obs` e `reports`; le righe dei drink tolti e delle birre 0,2 e 0,5 l vanno in `archive_sizes_*` (nessuna cancellazione).
- `DrinkMenu` (caselle con spunta come forma, ≥ 48 px, Esc, tocco fuori, ultima casella non removibile); `bestPrice` per pin, copertura, «Elenco», «I più economici qui»; tre icone nuove.
- SPEC 1.6, MC-01…MC-04 e voci riscritte in `feature_list.json`, guardia sul tag `spec-approved-7`, ADR 0028.

**Prove**
- `npm run lint`, `format:check`, `typecheck` verdi. `npm test`: 41 file, 391 test verdi (tra cui `migration-no-sizes`, che ha trovato la perdita delle segnalazioni sul bar nella prima versione della migrazione).
- E2E completo (`--workers=2`, Chromium e WebKit): 212 verdi, 2 rossi (MB-10/MB-11, «Copertura +1»: l'avevo cambiata io, ripristinata la regola di prima); poi `contribute` 34/34 senza dipendenze e `drink-menu` 14/14.
- Un e2e di ricerca (`brand-search` M4-12) è caduto una volta su WebKit in un secondo giro con altri file in parallelo, verde nel giro completo.
- Screenshot 390×844 in `docs/screenshots/mc/` (menu aperto, Fuori orario con due drink): controllati.

**Revisione** (`spec-reviewer`): codice, migrazione e privacy senza problemi. Corretti: `/confirm` e `/reports` ora rifiutano con 400 `size_ml` e i drink tolti (prima 404, test nuovo per MC-03); SPEC 7.1, `docs/data-quality.md` e `SECURITY.md` ancora parlavano di formato/chip; l'elenco dei drink restava aperto uscendo con Tab (ora si chiude, test). Non cambiato: «Copertura +1» dopo il salvataggio resta com'era (la voce MB-11 lo prevede). Rischio noto: un telefono con la vecchia versione già aperta (shell nella cache del service worker) vede la mappa senza prezzi finché non si aggiorna.

**Chiusura (21/10/2026)**
- Tag `spec-approved-7` pubblicato da Roberto sul commit `chore(spec)` (6eccd6f); push del ramo con il gate locale `npm run verify` verde in 678 s.
- [PR #41](https://github.com/robertovalerirv-beep/dove-bevo/pull/41) unita su `main` (merge `d9ce189`, 18:38 UTC). CI su `main` (run 39654537379): 5 job su 5 verdi in 6 min 51 s (gitleaks, lint/typecheck/unit/guardie/audit, import OSM, E2E Chromium e WebKit con sicurezza, Lighthouse).
- **Deploy in staging** (run 39655565704, con la migrazione `0006` applicata dalla CI): verde.
- Produzione non toccata (deploy e D1 remoto restano di Roberto).

**Da fare per Roberto (nell'ordine)**
1. Guardare le icone di Sbagliato, Gin lemon e Acqua e i limiti (Acqua 0,50–6 €, Sbagliato e Gin lemon 4–20 €): sono ipotesi mie, si correggono in `catalog.ts` e `Icon.tsx`.
2. Da telefono (staging): aprire «Scegli cosa bere», spuntare più drink e controllare che il pin mostri il più basso; inserire un prezzo con la nuova lista.
3. La migrazione 0006 in produzione la lancia lui. Le tabelle `archive_sizes_*` si possono cancellare quando vuole.
4. Sul ramo `sec-seo-hardening` (lavoro non committato nel checkout principale): `db.ts`, `seo.ts`, `seo-texts.ts` sono cambiati su `main` (niente `size_ml`, nuovi drink): riallineare prima di committare.

---

## 2026-10-21 · Sessione 12 · Mappa stabile, barra a due tasti, Annulla da 5 s (branch `fix/map-stability-undo-5s`, da `main` 10c91eb) · SPEC 1.5, ADR 0027

**Richiesta di Roberto:** la mappa «salta tra due livelli di zoom» (visto da un tester e da lui); Annulla da 10 a 5 secondi; barra in basso con soli «Aggiungi prezzo» e «Aggiungi locale», «Manda la mappa» eliminato col suo codice, «Elenco» come icona discreta sulla mappa; «mai più deploy rossi».

**Causa (misurata, non supposta):** la barra in basso cambiava altezza con la vista (zona senza prezzi = +102 px) e con lei la mappa. Il primo test scritto (a zoom fermo) era verde: non vedeva il difetto. Reso più severo (osserva anche *durante* lo zoom e confronta la stessa vista con chip diverse) è diventato rosso sul codice di `main`: mappa 654 px con Spritz contro 552 con Birra, e **3 ridimensionamenti** andando a zoom 13 senza toccare nulla.

**Fatto**
- Barra: sempre [Aggiungi prezzo][Aggiungi locale mancante] in una riga; la frase della zona senza prezzi e la legenda stanno in `.map__stack` (assoluto, sopra le attribuzioni); «Elenco» è `.map__list` (48×48, in alto a destra, lo stato lascia l'angolo). Tolti `navigator.share`, `shareMap`, `.bottom__wide`, `.bottom__empty`.
- `UNDO_MS = 5000` (`src/shared/config.ts`) per timer, barra di avanzamento (`--toast-duration` generato da `scripts/tokens.ts`) e test del testo `seenHelp`.
- SPEC 1.5 (D-15, D-28, 7.1, 7.3, M1-13, M2-05, M2-06, M3-16, MB-11, MB-13; nuova M1-16), ADR 0027, guardia della feature list sul tag `spec-approved-6`.
- Test: `tests/e2e/map-stability.spec.ts` (nuovo), MB-13 riscritto (due temi, bounding box, axe), `tests/unit/undo.test.ts`, `contribute.spec.ts` senza «10» scritti a mano, tab order di M1-13 con `aria-label`.

**Prove**
- `npm test`: 38 file, 313 test verdi. `npm run lint`, `typecheck`, `format:check` verdi.
- E2E Chromium e WebKit: `map-stability` + `brand-map` + `map` + `brand-tiers` 62/62; `contribute` (Chromium e WebKit, writes) 32/32; `map-stability` e MB-13 ripetuti 3 volte per browser: 36/36.
- Screenshot 390×844 (zona vuota, Elenco, chiaro e scuro) controllati: icona e nota non coprono stato né attribuzioni.
- `npm run verify` completo sul commit `fix(map)`: lint, formato, typecheck, unit, guardia, workflow, audit, e2e (498 s), build, budget shell, Lighthouse → **tutto verde in 683 s**. Rieseguito dopo le correzioni della revisione (vedi sotto).

**Revisioni** (`spec-reviewer`, `ux-a11y-reviewer`): nessun problema di SPEC; trovati e corretti
- l'invito all'installazione era nella barra e la faceva crescere di 112 px dopo il secondo prezzo (la mappa si ridimensionava di nuovo): ora è sulla mappa (`.map__invite`), test: altezza di mappa e barra uguale prima e dopo l'invito (iPhone);
- l'icona «Elenco» restava attiva durante il posizionamento del pin: ora sparisce, come nota e invito (test in M3-11);
- il Timbro era più alto dello schermo a 320×568 (y = −43 px, «Annulla» irraggiungibile in 5 s): sotto i 700 px di altezza scorre dentro lo schermo; test a 320×568 **rosso senza la regola**, verde con.
- **Primo push bloccato dal gate** (M2-09, «Non riesco a caricare i prezzi»): era il limitatore a raffica (20 / 10 s per IP) che in locale si applica a tutti i test dallo stesso IP. Misurato: stesso esito con 10 s e con 5 s sotto carico doppio (6 test caduti, 5 risposte 429). Ora spento nel `wrangler.jsonc` di livello alto (staging a 20 / 10 intatto, test del Worker col limite vero, test di configurazione). ADR 0027.
- Non toccato: la nota lascia passare i tocchi (`pointer-events: none`) verso i bar sotto di lei, voluto. `.claude/agents/spec-reviewer.md` cita ancora `spec-approved-3` e `docs/brand/01-strategia.md`/`mockup/README.md` «Annulla 10 s»: sono file di configurazione e documenti storici, li lascio a te.

**Da fare per Roberto (nell'ordine)**
1. Pubblicare il tag: `git push origin spec-approved-6` (è creato in locale sul commit `chore(spec)`); **prima** del push del ramo, altrimenti la guardia della CI fallisce. `spec-approved-5` esiste già (SPEC 1.4, ramo `brand-v2-map` non unito): se preferisci un altro nome, la guardia è in `scripts/check-feature-list.mjs`.
2. Da telefono, in una zona senza prezzi: zoom da 13 a 17 su iPhone e Android; Annulla da 5 s col pollice (il timer si ferma solo con puntatore o focus sul messaggio).
3. Se preferisci l'etichetta «Aggiungi locale» (senza «mancante») è una stringa in `it.ts` più i nomi nei test.

---

## 2026-10-19 · Sessione 11 · Pacchetto di correzioni (branch `fix/mockup-and-no-cafes`) · ricerca, tema, SEO, sicurezza, prestazioni

**Richiesta di Roberto:** due difetti (la ricerca non trova «Namasce», un bar inserito a mano; il tema è sempre scuro) e `prompt-seo-secutiry-update.md`, in un solo pacchetto. Decisioni, deviazioni dal prompt e motivi: **ADR 0025**.

**Fatto**
- **Ricerca:** `GET /api/venues/approved` (solo approvati, cache 60 s, limitatore) e `src/app/lib/user-bars.ts`: i bar utente passano per lo stesso `matches`/`rank` dei bar OSM, una lettura per visita, senza il testo digitato. D-32 e SPEC 7.6 aggiornati.
- **Tema:** chiaro dalle 06:00 alle 21:29, scuro dalle 21:30 (ora del dispositivo, non l'impostazione del telefono): `src/shared/theme.ts`, `public/theme.js` (prima del primo disegno), `:root[data-theme="dark"]` generato dai token, mappa e immagine iniziale seguono l'ora. D-27 aggiornato.
- **A (hardening):** `wrangler.jsonc` campionamento 10 % e query string oscurata (tenuto `invocation_logs: false`), `nodejs_compat`; guardia 403 in `requireAccess` con ACCESS_* vuoti; cache JWKS ≤ 4 e chiavi HMAC ≤ 8.
- **C (prestazioni):** `POST /api/prices` in 2 round trip D1 invece di ~6 per prezzo (risposte e righe identiche al codice sequenziale, golden test), conferma atomica in un batch, `nearestPlace` per latitudine (stesso risultato della scansione), file di cella letti in parallelo, coverage in cache 60 s. **Indici: nessuna migrazione** (esistono già `pc_cell`, `po_venue`, `vu_*`, `rp_bar`; gli altri aumenterebbero le righe scritte per contributo: ADR 0025 §4).
- **B (SEO):** `/robots.txt`, `/llms.txt`, `/sitemap.xml`, `GET /api/ai/cerca`, e il middleware che aggiunge titolo, descrizione, canonical, Open Graph, JSON-LD e testo `<noscript>` a home, `/copertura`, sei città e `/bar/<chiave>`. `run_worker_first` elenca queste pagine (tutti gli altri asset restano fuori dal Worker). Solo bar pubblici, nomi dai file OSM (≤ 3 celle per pagina per la CPU), escape verificato con un nome `"><script>`.

**Difetti veri del prompt, trovati leggendo il codice** (ADR 0025): `city` è l'ID OSM, non il nome, e i nomi non sono in D1 (le query del prompt non avrebbero trovato nulla); il filtro `status='active'` avrebbe pubblicato bar nascosti e proposte in attesa; l'escape del JSON-LD era doppio; titolo e descrizione erano duplicati; indirizzo di staging scritto a mano; `SearchAction` con `?q=` che l'app non supporta; indici duplicati o dannosi per le quote.

**Prove**
- `npm test`: 37 file, 310 test verdi (unit e worker). Nuovi: `prices-batch` (golden della versione sequenziale, 30 prezzi in ≤ 5 batch), `seo` (19), `hardening-keys`, `coverage` (cache), `theme` (parità di `theme.js` con la regola per ogni minuto), `nearest-place` (2.000 punti casuali), `search-user-bars`, `seo-config` (`run_worker_first` = `SEO_CITIES`).
- `npm run lint`, `format:check`, `typecheck` verdi. Shell 42.269 B (budget 51.200).
- E2E Chromium: ricerca (M4-12…16, con la sola richiesta consentita a `/api/venues/approved`), tema (`atHour`: 21:29 chiaro, 21:30 scuro, 05:59 scuro, 06:00 chiaro anche con il telefono in modo opposto), cambio tema senza richieste a `/api` o `/data` (57 ms), CSP senza violazioni. `tests/security/seo.spec.ts` sulla configurazione vera (`wrangler dev`): robots, llms, sitemap, home e città con tag e CSP intatta, `/admin` senza tag, API aperta senza CORS.
- `npm run verify` completo: vedi sotto.

**Cambiato in un test esistente:** `shell.spec.ts` `GET /` ora aspetta un titolo che *inizia con* «Dove bevo» (la home ha il titolo SEO «Dove bevo — dove bere in Italia? Prezzi nei bar»); `brand-map` e `brand-search` fissano l'ora con `page.clock` invece di `emulateMedia`.

**Non fatto / da decidere**
- Nessuna migrazione D1 (indici): da rivalutare con le misure reali di staging.
- `/copertura` e le pagine di città sono viste per i crawler: un utente che ci arriva vede la mappa.
- L'API `/api/ai/cerca` mette il nome solo per le 3 celle con più righe di ogni pagina (CPU del piano gratuito); altrove `nome: null` e l'`url` apre la scheda.
- Fascia scura fissa 21:30–06:00: se si vuole un'altra alba, è `DARK_UNTIL` in `src/shared/theme.ts` (e la copia in `public/theme.js`, che il test tiene allineata).

**Da verificare a mano (staging, dopo il deploy):** cercare «Namasce» da telefono; aprire l'app prima e dopo le 21:30 con il telefono in modo scuro e in modo chiaro; `/robots.txt`, `/llms.txt`, `/sitemap.xml`, sorgente di `/milano` e di una scheda bar; una contribuzione con 3–4 drink insieme.

---

## 2026-10-17 · Sessione 10 · Pacchetto brand v2 (branch `brand-v2-package`, da `main` 6a60ce4) · F1–F5

**Fatto** (un commit per fase, una PR sola)
- **F1** `build-icons.mjs` (PNG 192/512/maskable + favicon dal simbolo), frasi di voce in `it.ts` e test delle parole vietate D-31 (MB-15, MB-16 in parte).
- **F2** stili mappa Bancone/Fuori orario da `build-map-styles.mjs` in `public/map/` (nome col hash, cache immutabile), cambio tema senza richieste a `/api` o `/data` (213 ms), tappo del bar aperto, foglio «zona senza prezzi», «Aggiungi locale mancante» fuori dalla mappa (D-28).
- **F3** scheda come scontrino (5 righe, «Vedi tutti», «Da confermare»), prezzi già visti in zona (un tocco salva: 4 tocchi, hai 10 s per Annulla), Timbro con data, Copertura +1, Tessera 1/5/10/25/50 (`dovebevo-first-use`, `dovebevo-prices`).
- **F4** indice a frammenti nell'import (`s/<prefisso>.json`, limite 40 KB gzip, fallisce oltre), `search-match.ts`/`search.ts`, `SearchSheet` come combobox ARIA caricata a richiesta, «I più economici qui», «Non trovi il bar?» col nome già scritto, `PRIVACY-NOTES.md`.
- **F5** manifest generato dai token, service worker scritto a mano (solo shell, mai `/api`, `/data`, `/map`), messaggio offline, invito all'installazione dopo il secondo prezzo (prompt del browser o testo su iPhone), seed di prova per la mediana e un prezzo vecchio.
- **Difetti veri trovati dai test e corretti:** il pin sembrava già posizionato perché la mappa cambiava altezza (ora il pannello sta sopra la barra, `.bottom-slot`); una freccia premuta subito dopo aver digitato andava persa (azzeramento nell'evento, non in un effetto); la scheda dopo la ricerca riportava la mappa a zoom 16.

**Prove**
- `npm run verify` (stesso ordine della CI): lint, formato, typecheck, unit (156), guardia feature list, workflow, audit, e2e Chromium+WebKit+sicurezza, build, budget della shell, Lighthouse: esito nell'ultima esecuzione prima del push.
- Misure: ricerca tipica 2 file, ~7 KB sul fixture, risultati in 11 ms con il frammento in memoria; INP delle interazioni sui pin (chip, Elenco, chiusura, con la fixture di Milano: 2 pin visibili, non 300): 80–216 ms su Chromium in locale, 136–280 ms su WebKit headless, 544 ms sul runner della CI. Il test registra il valore (annotazione `slowest-interaction-ms`) e non fa più pass/fail: un tempo su una macchina condivisa non è stabile. **MB-07 resta `false`**: manca la misura con 300 pin e il 200 ms su telefono vero.
- `passes: true` per MB-01, 02, 06, 09, 10, 11, 12, 13, 15, 17 e M4-03, 04, 07…12, 14, 15, 16 (solo `passes` cambiato).

**Non fatto / da decidere**
- Restano `false`: MB-07 (misura con 300 pin e INP su telefono), MB-04 (test dei controlli), MB-08 (confronto a mano della copertura), MB-14 (axe su ogni vista), MB-16 (logo in `/privacy` e `/regole`, che arrivano con M5), M4-05 (pin vecchio sulla mappa, solo la scheda è provata), M4-13 (ordine per distanza solo unit).
- M4-12 dice «`CAFFÈ`» da solo: «caffè» è una parola vuota, quindi l'ho letto come «CAFFÈ ROMA» (maiuscole e accenti).
- Un tocco su un prezzo già visto salva subito (SPEC MB-10: «esattamente 4 tocchi»); c'è sempre l'Annullo di 10 s.
- Le fixture dell'albero di Roberto (import senza `amenity=cafe`) non sono qui: `tests/fixtures/data/s/` è generata dalle fixture di `main` con `scripts/osm-import/fixture-search.mjs` e va rigenerata se le celle cambiano.

**Da verificare a mano (telefono vero):** Timbro e vibrazione su Android, invito all'installazione su Android e iPhone, offline dopo l'installazione, Fuori orario di notte, la ricerca con rete mobile.

---

## 2026-10-17 · Sessione 10 · Brand v1 · passo 4 (mappa), prima parte (PR #29)

**Fatto**: gradini sulla mediana della cella (`tiers.ts`: Affare < 0,9×, Salato > 1,1×, neutro sotto 5 prezzi; soglie in `config.ts`), pin a pillola su canvas (glifo ↓ = ↑, prezzo in Geist Mono, bordo tratteggiato e corsivo oltre 90 giorni), legenda solo con colori attivi, stato «X bar su N qui hanno un prezzo» dai dati già caricati (nessuna richiesta in più). `shownPrice` spostata in `src/shared/prices.ts`. Le immagini dei pin si disegnano in `setVenues` prima del layer: con `styleimagemissing` il posizionamento restava vuoto (e2e «prices are drawn right after a city search»).

**Prove**: `tests/unit/tiers.test.ts` (8 test); `npm run verify` verde in 405 s sul commit pulito (e2e 284 s, Lighthouse); CI della PR #29: 5 controlli verdi, merge, deploy staging avviato.

**Non fatto**: stili mappa Bancone/Fuori orario (MB-06), tappo del selezionato, INP con 300 pin, zona senza prezzi (MB-13), ricerca per nome (passo 3), viste e testi. Nessun `passes` cambiato. Da decidere: e2e M2-02 cerca «Bistrot Duomo» (modifica non committata di Roberto) che con le fixture rigenerate non è tra i 5 vicini.

**Da verificare a mano**: pin, legenda e testo di stato in staging da telefono.

---

## 2026-10-16 · Sessione 9 · Brand identity v1 + ricerca per nome · passo 0 (misure, nessuna modifica al codice)

**Contesto**: `docs/PROMPT-BRAND-RICERCA.md`, kit estratto da `dovebevo-brand-kit.zip` in `docs/brand/`. Branch `brand-v1-search` da `main` (7549eda).

**Screenshot "prima"**: 60 file in `docs/brand/prima/` (15 viste × Chromium/WebKit × chiaro/scuro, 390×844, fixture), script usa e getta. Inventario in `docs/brand/prima/INVENTARIO.md`.

**Misure prima** (build locale, fixture):
- Shell (`check-bundle-size`): **33.129 B gzip** (budget 51.200); JS principale 21.964 B, CSS 4.038 B.
- Font: Plus Jakarta Sans 27.348 B. Kit: Bricolage 41.344 + Geist Mono 23.128 = **64.472 B** (budget brand 70 KB, +37 KB).
- Lighthouse mobile ×3 (`lhci autorun`): Performance 0,99 · A11y/BP/SEO 1 · LCP 1.968–1.974 ms · TBT 35–79 ms · CLS 0.
- INP con 300 prezzi spritz temporanei in D1 locale (127 bar nella vista), Chromium CPU 4×, 5 cambi di chip + 4 trascinamenti + 1 tocco, 3 giri: interazione peggiore **96 / 88 / 128 ms** (budget 200). Prezzi temporanei rimossi dopo la misura.
- CPU di `/api/prices/:cell`: non rimisurata, ultima misura 0,080 ms (M1-08); la rotta non è toccata da questo lavoro.

**Ricerca, dati reali** (staging `DATA_VERSION` 20261014):
- Log del deploy: 74.494 feature → **60.667 bar**, 1.326 luoghi, **8.127 file** (margine 6.873 sotto 15.000), file più grande 49.209 B. Esclusi dall'import (senza nome o non validi): **12.501**, il log non li distingue.
- Simulazione dei frammenti su 59.974 bar (98,9%) ricostruiti dai file statici di staging (19.522 GET di asset, nessuna `/api/*`, nessun D1): normalizzazione `searchKey` + parole + stopword, prefissi di 2 caratteri → 510 frammenti, 2.085 KB gzip in tutto. I 10 più grandi: `ca` 96,5 KB · `pa` 68,1 · `ma` 64,3 · `co` 58,1 · `bi` 44,2 · `ba` 41,2 · `pi` 40,3 · `sa` 39,5 · `ro` 37,4 · `mo` 32,8. Sopra 40 KB: 7 divisi a 3 caratteri → **661 file** (con l'indice), totale 8.788; il più grande diventa `caf` con 39,3 KB. Ricerche tipiche: `bar sport` → `sp` 21,5 KB · `caffè roma` → `ro` 37,4 KB · `osteria` → `os` 10,3 KB. **997 bar non hanno parole indicizzabili** (nome fatto solo di stopword, es. «Bar», «Caffè»): restano introvabili per nome, da decidere in ADR 0024.
- `searchKey` non separa le parole; lo script di import oggi non normalizza nulla.

**Critica A1 sul codice e sugli screenshot**: regge su palette e font (blu `#1d4ed8`, grigio-blu, Plus Jakarta), sul toast «Prezzo salvato» senza ricompensa e sui quattro bottoni di pari peso. Non regge, o va precisata: (1) i pin sono già un livello simbolo su canvas che legge i token con `getComputedStyle`, e non ci sono esadecimali fuori da `tokens.css`; (2) il focus è arancio, non blu; (3) i pin sono bianchi perché i colori sulla mediana (D-12, M4-03) **non esistono ancora**, e il problema maggiore sulla mappa sono i cerchi dei cluster (numeri) più evidenti dei prezzi; (4) lo stile della mappa si legge già da OpenFreeMap e si modifica a runtime (`loadStyle`): un patch dei colori a runtime eviterebbe `build-map-styles.mjs` e i file in `public/map/`; (5) il manifest PWA non esiste (M4-07 a false), quindi A5.5 lo crea.

**Passo 2 · Fondamenta del brand (stesso branch, 16/10)**: `scripts/tokens.ts` + `build-tokens.mjs` generano `tokens.css` da `docs/brand/tokens.json` (eseguito in `npm run build`); font Bricolage + Geist Mono (64.472 B, fallback con metriche misurate dai woff2) al posto di Plus Jakarta; nomi dei token migrati in `app.css`/`base.css`; bottoni, chip, campi, fogli, toast con bordo ink 2 px, ombra stampa e discesa di 3 px; icone dei 9 drink nel modulo `Icon` (chip e griglia), simbolo nell'intestazione. Test prima: `tokens.test.ts` (CSS = generato, nessun esadecimale fuori da `tokens.css`, 32 contrasti in due temi), `icons.test.ts`. **Prove**: `npm run verify` verde in 527 s (e2e 347 s, Lighthouse 0,98–0,99, LCP 2,1 s, CLS 0, shell 34.441 B su 51.200); screenshot "dopo" in `docs/brand/dopo/` (60). `passes: true` per MB-03 e MB-05. Un e2e (M2 «chi inserisce il prezzo») sposta il puntatore dopo l'ultimo click: il toast, ora più alto, finiva sotto il mouse e metteva in pausa il conto alla rovescia (WCAG 2.2.1), nessuna asserzione cambiata. **Non ancora**: pin su canvas, stili della mappa, scontrino, timbro, copertura, Tessera, manifest e icone PNG (MB-01 resta false finché manca il manifest).

**Passo 1 · Piano e documenti (stesso branch)**. Decisioni di Roberto (AskUserQuestion, 16/10): Tessera sì · "Aggiungi locale mancante" fuori dalla mappa sì · mappa scura da Dark sì · bottone **resta "Aggiungi prezzo"** (verifiche congelate invariate) · niente spritz a orario · elenco delle parole vietate approvato · bar nascosti: filtro alla scelta con il messaggio · 997 bar con nomi di sole parole vuote: limite documentato · bar utente approvati: limite documentato (default del prompt).
Scritti: ADR 0023 (brand, sostituisce la 0011 per i valori visivi) e 0024 (indice a frammenti), SPEC 1.3 (vincolo 2.10, D-12 con i nomi dei gradini, D-27…D-32, 4, 5.1, 7.1, 7.3, 7.6, 14, 15, 18, 19), `design-system/MASTER.md` e `pages/*.md` dal kit. Feature list: tolta M4-06, aggiunte M4-11…M4-16 e MB-01…MB-17 (testo identico alle tabelle di SPEC 18, tutte `passes: false`): 103 voci, 55 a true. Guardia e CI puntano a `spec-approved-4` (tag ancora da creare: fino ad allora `check-feature-list` fallisce).
**Da fare per Roberto**: approvare SPEC 1.3 e le ADR, creare e pubblicare il tag `spec-approved-4` sul commit `chore(spec)`, aggiornare la riga del tag in `CLAUDE.md` (sue modifiche non committate) e in `SECURITY.md`. `design-system/preview*.png` e `preview.html` mostrano ancora la palette di M0.

---

## 2026-10-15 · Sessione 8 · Dashboard di copertura in `/admin` · passo 0 (misure, nessuna modifica al codice)

**Stato reale**: in `/admin` esiste solo `GET /api/admin/overview` (code); nessun codice di copertura o metriche. `metrics_daily` esiste nello schema ma **nessuno la scrive** (`/api/events` non c'è, M5-01 a false): gli indicatori «prezzi oggi / 7 giorni» vanno omessi. La chiave città è già stabile (D-11: `prices_current.city` = ID del nodo OSM del `place`, non un indice), nessuna correzione. I bar utente hanno `city = NULL` (`resolveVenue`): finiscono in «Senza città» e non sommano a «Bar totali» (= `nBars` di `places.json`). Zona del gate (risposta di Roberto): solo Comune di Milano.

**Misure** (D1 locale in workerd, `prices_current` con ~3% di righe non attive, test usa e getta poi rimosso):
- Query naive `GROUP BY city, venue_key`: piano `SCAN prices_current | USE TEMP B-TREE FOR GROUP BY`, `rows_read` = **9.833** con 5.000 righe (e 983 con 500, 19.666 con 10.000): il B-tree temporaneo raddoppia le letture.
- `SELECT max(city), venue_key, COUNT(*), MAX(observed_on) … WHERE status='active' GROUP BY venue_key` (la città è costante per bar): piano `SCAN prices_current` senza B-tree, `rows_read` = **5.000** con 5.000 righe, cioè 1 per riga della tabella (anche non attive). `GROUP BY venue_key, city` non basta: ricade nel B-tree (9.833).
- Letture accessorie (nascosti, bar utente approvati): trascurabili (1 e 0 con i dati di prova).
- Nessun indice nuovo né migrazione: scritture di un contributo invariate.

**Soglia** (20 pressioni al giorno, obiettivo ≤ 100.000 righe = 2% di 5 M): 100.000 ÷ 20 = **5.000 righe in `prices_current`** (attive e non). Con la query naive sarebbe 2.500. Avviso in `/admin` all'80%: 4.000 prezzi attivi. **Non misurato**: prezzi attivi in staging (`--remote` vietato a Claude Code): serve il conteggio di Roberto.

**Prossimo passo**: ADR (soglia, piano oltre soglia, limite di 10 s, chiave città, bar utente senza città) e ok di Roberto al passo 1. Il prompt è stato salvato in `docs/PROMPT-DASHBOARD.md`; `docs/PROMPT-V3.md` citato dal prompt non esiste nel repo.

**Passo 3 · Worker (stesso branch `m5-coverage-dashboard`)**: ADR 0022 approvata; SPEC 1.2 con M5-11…M5-16 e guardia su `spec-approved-3` (tag creato in locale, lo pubblica Roberto). Test prima: `tests/worker/coverage.test.ts` 8/8 rossi (moduli mancanti), poi codice: `GET /api/admin/coverage` (`no-store`, 10 s tra due calcoli in memoria, 429 con `Retry-After`), `isPublicBar` come unica definizione di bar pubblico (usata anche da `getCellPrices`, che ora toglie i prezzi dei bar nascosti), `getCoverage` con `COVERAGE_SQL` (`GROUP BY venue_key`). Helper JWT dei test estratto in `tests/worker/access-jwt.ts`. **Prove**: `npx vitest run` → 19 file, 114 test verdi (include `d1-reads`: scritture per contributo invariate); `npm run lint`, `typecheck`, `format:check` verdi; il test di costo con 5.000 righe verifica `SCAN prices_current` senza `TEMP B-TREE` e `rows_read` ≤ 5.010. Non ancora eseguiti: e2e, `test:security`, `npm run verify`. Resta: interfaccia (passo 4).

**Passo 4 · Interfaccia (stesso branch)**: test e2e prima (`tests/e2e/admin-coverage.spec.ts`, 8 test × Chromium e WebKit 390×844), poi `src/app/views/Coverage.tsx` caricata con `import()` dentro `AdminPage` (chunk `Coverage` di 2,0 KB gzip), testi in `it.ts`, costanti del gate (`LAUNCH_CITY_ID`, `LAUNCH_TARGET`, soglie di costo) in `src/shared/config.ts`, stili `.cov*` con i token del design system. Il link di ogni riga apre `/?at=lat,lon` (piccolo parse in `app.tsx`, zoom 14, solo una vista). **Scelte**: l'ordinamento è un `<select>` + «Decrescente/Crescente» (le colonne secondarie sono nascoste sotto 600 px e compaiono come seconda riga); `aria-sort` sulla colonna ordinata; il pulsante resta «Aggiorna» e il calcolo è annunciato in `aria-live`. Nei test esistenti di `admin.spec.ts` `getByLabel("Città")` è diventato `exact` (la nuova etichetta «Mostra anche le città…» lo rendeva ambiguo).

**Prove**: `npx playwright test map csp admin-coverage --workers=2` → 50/50 (Chromium e WebKit); l'e2e completo con i worker predefiniti ha avuto 16 fallimenti, tutti WebKit «Carico la mappa…» (spec `map`, `csp`, una prova della riga di città), non riproducibili con 2 worker come in `npm run verify`: da confermare col gate completo. Prove: nessuna richiesta a `/api/admin/coverage` all'apertura, dopo 5 minuti (orologio simulato) e al ritorno da un'altra scheda; una pressione = una richiesta, doppio tocco = una; risposta HTML o 429 → dati precedenti + messaggio; avviso oltre 4.000 prezzi; «Aggiorna» entro i 844 px senza scorrere; nessuno scroll orizzontale; target ≥ 48 px; axe senza violazioni in stato iniziale e con i dati. Screenshot in `docs/screenshots/admin/coverage-{initial,loading,data,error}.png`. Unit 114/114, lint, typecheck, format verdi. **Shell**: 28.807 → 31.889 B gzip (budget 51.200).

**Passo 5 · Chiusura (15/10/2026)**
- `npm run verify` (prima delle correzioni sotto): **verde in 747 s**: lint, format, typecheck, unit e worker, guardia feature list, policy workflow, audit, e2e Chromium+WebKit+sicurezza (506 s, 2 worker), build, budget shell, Lighthouse. Gli 16 fallimenti WebKit visti con i worker predefiniti non si ripresentano con 2 worker.
- `/code-review` (alto, 10 rilievi): corretti il Set dei bar nascosti ricostruito a ogni riga, `?? []` mancante su due risultati del batch, riga di città fuori da `places.json` senza link, chiave di ricerca calcolata una volta per riga, `parseAt` una sola volta, chunk caricato solo dopo l'accesso, `COVERAGE_WARN_ROWS` derivata da `COVERAGE_MAX_ROWS`; `max(city)` sostituito da `city` presa dalla riga del prezzo più recente (un solo `MAX()`, regola di SQLite) con test; ADR 0022 aggiornata e «accettata». Non toccati: `CLAUDE.md` (modifiche non committate di Roberto) e `SECURITY.md` citano ancora `spec-approved-2`; `resetCoverageLimit` resta come aggancio dei test.
- `/security-review`: nessun rilievo (rotta dietro Access, SQL costante, solo aggregati, testo reso da Preact, link da due numeri, `?at=` solo numerico).
- `spec-reviewer`: nessun blocco, 6 punti: corretti i test mancanti (nessun accesso a D1 sul 429 con spy non vacuo; prezzi dei bar nascosti fuori da `/api/prices/:cell`; errore di rete; test della chiave città rinominato, la proprietà vale perché il Worker non legge mai `places.json`) e lo stato dell'ADR.
- `ux-a11y-reviewer`: nessun blocco; corretti il focus perso dopo «Aggiorna» (ora `aria-disabled`, test da tastiera), `aria-busy` che ritardava l'annuncio (tolto), contrasto del placeholder in tema scuro (regola `::placeholder` globale), nome del pulsante d'ordine (`Inverti l'ordine, ora decrescente`), riquadro della casella (24 px).
- Dopo le correzioni: unit 116/116, lint, typecheck, format verdi; `admin-coverage` + `admin` e2e 28/28 su Chromium e WebKit; shell 31.967 B gzip (da 28.807, budget 51.200), chunk `Coverage` separato di 2,0 KB. Gate completo rilanciato dopo le correzioni: `npm run verify` **verde in 532 s** (e2e 304 s, Lighthouse mediana di 3 verde).
- `passes: true` per M5-11…M5-16 (test e prove sopra; M5-16: build e `check-bundle-size` con il chunk separato; «prima e dopo» in questa voce). Feature list 55/81.

**Da verificare a mano**: aprire `/admin` in staging, premere «Aggiorna» da telefono; il numero di prezzi attivi in staging (soglia 5.000, avviso a 4.000); pubblicare il tag `spec-approved-3` e aggiornare il ruleset prima della PR.

---

## 2026-10-15 · Sessione 8 (seguito 2) · Dashboard: elenco dei locali per città (branch `m5-coverage-city-list`)

**Richiesta di Roberto**: toccando una città con almeno un locale con prezzo, invece della mappa vuole l'elenco di quei locali (decisioni: link secondario «Vedi sulla mappa»; nome, indirizzo, prezzi e link alla scheda; nessuna voce nuova in feature list).

**Fatto**: `/api/admin/coverage` restituisce anche `members` (città o 0, chiave, cella dei bar pubblici con prezzo), senza query in più; `src/app/views/CityBars.tsx` carica le sole celle interessate con `loadCell` e mostra nome, indirizzo, prezzi (senza quarantena) e «Apri la scheda»; tabella, filtro e ordinamento restano nel DOM (`hidden`) mentre l'elenco è aperto; il focus passa al titolo e torna al nome della città con «← Tutte le città»; stati di caricamento ed errore con «Riprova». ADR 0022 (punto 9) e SPEC 7.9 aggiornate.

**Prove**: test prima (worker 2 rossi, e2e 4 nuovi), poi unit 118/118 e e2e `admin-coverage` + `admin` 26/26 su Chromium e WebKit (elenco con i 3 locali del seed e i loro prezzi, nessuna richiesta all'admin API al tocco, ritorno con filtro intatto e focus, errore di rete e «Riprova», link alla mappa, target ≥ 48 px, niente scroll orizzontale, axe). Screenshot: `docs/screenshots/admin/coverage-city-list.png`.

**Revisioni**: `/code-review` (6 rilievi): corrette la cache che mostrava prezzi vecchi dopo «Aggiorna» (le celle si rileggono a ogni apertura), le richieste di celle in parallelo contro il limite di lettura (6 alla volta), la stringa «HH» duplicata, il test mancante («Senza città» e «Aggiorna» con l'elenco aperto); non toccati: peso di `members` (decine di KB al massimo, documentato) e l'etichetta del prezzo simile a quella della scheda bar. `ux-a11y-reviewer`: nessun blocco; corretti il focus perso dopo «Riprova» (torna al titolo), la larghezza del pulsante di una città corta (≥ 48 px, con test) e l'annuncio del caricamento (un'unica area `aria-live`). Dopo le correzioni: unit 118/118, e2e `admin-coverage` + `admin` 38/38 su Chromium e WebKit, lint, typecheck, format verdi.

---

## 2026-10-15 · Sessione 8 (seguito) · Dashboard: nessun bar «Senza città» (branch `m5-coverage-no-orphans`)

**Richiesta di Roberto** dopo la prova in staging (la dashboard «funziona clamorosamente bene»): la riga «Senza città» (2 bar, 7 prezzi) non deve poter succedere.

**Causa**: i bar utente sono salvati con `city = NULL` e i bar OSM a più di 15 km da un luogo hanno `ci = -1`.

**Fatto**: `src/worker/lib/coverage.ts` assegna a ogni bar senza città il luogo più vicino di `places.json` (a qualunque distanza), calcolandolo a ogni pressione: nessuna migrazione né scrittura in più, vale anche per i dati già salvati. I bar utente approvati sono contati per città (`users`) e il client li somma ai bar OSM nel totale. «Senza città» resta solo come ripiego per un bar la cui posizione non si trova. ADR 0022 e SPEC 7.9 aggiornate.

**Prove**: test worker scritti prima (3 rossi), poi 118/118 verdi (bar utente e bar OSM senza città piazzati per coordinate, bar lontano da ogni luogo, bar utente senza prezzi nel totale); e2e della dashboard aggiornati (totale = OSM + bar a mano, nessuna riga «Senza città», ripiego ancora visibile); lint, typecheck, format verdi.

---

## 2026-10-14 · Sessione 7 · Allineamento feature list e revisione di sicurezza (branch `chore-align-feature-list-and-review-fixes`)

**Fatto**: le correzioni dell'audit (PR #22) sono in `main` e in staging (CI e deploy verdi; `/api/venues/u007/prices` → 400 dal vivo). Revisione `security-reviewer` sul diff: nessun punto bloccante; corretti il pin con «Vicino a me» lento (si controlla anche la posizione corrente) e le regex non canoniche di admin e client (ADR 0021, seconda revisione). `passes: true` per M3-11…M3-16, M3-18, M3-19: i test sono già in `main` (le voci erano a true solo sul vecchio branch `v3-spec-1-1`, ora superato); su `main` 49/75. Restano a false M3-17 (inserimento da listino in admin) e M3-20 (riga istantanea per cella). `docs/materiali/` è in `.gitignore` (repo pubblico, contiene ipotesi finanziarie).

**Prove**: `node scripts/check-feature-list.mjs` → «only passes changed (49/75 passing)»; `npm run verify` sul codice di `main` verde in 422 s prima di queste modifiche; vedere sotto per il gate su questo branch.

---

## 2026-10-14 · Sessione 6 · Correzioni dell'audit di sicurezza (branch `fix-stress-test-hardening`)

**Contesto**: l'audit "da attaccante" della sessione del 14/10 mattina elencava correzioni da fare prima di diffondere il link; nessuna era in `main` (verificato: `GET /api/prices/:cell` senza limite, `VenueKey` con zeri iniziali, pin valido con un tocco, nessun tetto per cella). Access e Turnstile sul nuovo sottodominio verificati dal vivo: `/admin` e `/api/admin/*` rispondono 302 al login di Access; il flusso reale «Salva» crea la sessione (`POST /api/session` 200) e con «Annulla» entro 10 s non scrive nulla.

**Fatto** (ADR 0021): limite sulle letture delle celle (`READ_LIMITER`, 100/60 s in staging); chiavi di bar canoniche; tetto di 15 proposte in attesa per cella; il pin deve essere spostato di almeno 10 m da dove la mappa è partita (`placed` al posto di `touched` in `PinPanel`).

**Prove**: 3 test nuovi in `tests/worker/stress-test-hardening.test.ts`, rossi senza le correzioni (3 su 3) e verdi con; `npx vitest run` 106/106; e2e `propose.spec.ts` aggiornato (tocco e spostamento di 12 px non bastano, 60 px sì). Resta aperto ciò che l'ADR elenca come non corretto; il rimedio vero al consumo delle quote è il dominio con WAF (M6).

---

## 2026-10-14 · Sessione 5 · Filtri e inserimento uniformati (branch `v3-chips-from-catalog`)

**Richiesta di Roberto**: le categorie dei filtri sopra la mappa devono essere le stesse dei prezzi inseribili (filtro ⇒ inseribile e viceversa).

**Fatto**: le chip della mappa derivano dal catalogo (`MAP_CHIPS` in `src/shared/catalog.ts`): una per ogni drink e formato inseribile (11: birra alla spina 0,2 / 0,4 / 0,5 l, bottiglia, spritz, gin tonic, negroni, vino, prosecco, analcolico, bibita), con gli stessi nomi della griglia di "Aggiungi prezzo". Prima erano 5 con nomi propri ("Birra media"…). Predefinita: birra alla spina 0,4 l. SPEC 6 e D-04 aggiornate (erano "sottoinsieme"). Tolto `it.chips`.

**Prove**: unit `tests/unit/catalog.test.ts` (chip = voci del catalogo, nessuna in più o in meno); e2e "the map chips and the drinks to enter are the same list" (Chromium e WebKit); M1-09 aggiornato al nuovo nome; screenshot `docs/screenshots/m3/chips-390.png`.

---

## 2026-10-14 · Sessione 5 · Nuovo sottodominio di staging (branch `v3-new-subdomain`)

**Richiesta di Roberto**: il suo nome non deve comparire nell'indirizzo. Il sottodominio `workers.dev` dell'account è stato cambiato da Roberto in `dovebevo` (gratis): staging è ora `dovebevo-staging.dovebevo.workers.dev`. Gli altri progetti (Pages, `*.pages.dev`) non sono toccati.

**Fatto**: `TURNSTILE_HOSTNAME` in `wrangler.jsonc` e gli indirizzi nelle guide. **A carico di Roberto**: Access (destinazioni `/admin` e `/api/admin/*`) e hostname del widget Turnstile con il nuovo indirizzo.

---

## 2026-10-14 · Sessione 5 · "Vicino a me" con posizione bloccata (branch `v3-locate-blocked`)

**Segnalato da Roberto**: sul telefono "Vicino a me" dice "Attiva la posizione per questo sito nelle impostazioni", ma un utente comune non sa dove sono. Un permesso già negato non si può richiedere di nuovo: l'app non può fare altro che guidare.

**Fatto**: se la posizione non arriva si apre da sola la ricerca di una città (la via d'uscita), con sopra un testo adatto al dispositivo: iPhone (aA → Impostazioni sito web → Posizione), Android/altri (lucchetto → Autorizzazioni → Posizione), browser interno di app (Instagram, Facebook, TikTok…: "Apri il link in Chrome o Safari"). Timeout e "non trovo" aprono la ricerca senza testo sui permessi. `blockedHelp()` in `src/app/lib/locate.ts`.

**Prove**: e2e M1-10 / M3-15 (4 test) Chromium e WebKit verdi; screenshot `docs/screenshots/m3/locate-denied-390.png`.

**Da verificare a mano**: sul telefono di Roberto, quale dei tre testi compare e se i passaggi coincidono con il suo browser. Idea non fatta (tocca SPEC 14): posizione approssimativa dall'IP lato Cloudflare, senza permesso.

---

## 2026-10-14 · Sessione 4 · Prompt v3.2: niente AI, bar proposti, admin a tre code (branch `v3-no-ai-venue-proposals`)

**Passo 0 (misure, nessuna modifica)**: stato reale 41/77 voci `passes: true` (M0 10/11, M1 15/15, M2 16/16, M3–M6 a zero). Misure D1 e capacità in **ADR 0020**: una cella costa ~2 righe per prezzo (603 righe a 300 prezzi), un contributo 8 righe scritte (~12 con la pulizia), una vista mappa 1–6 richieste; capacità ~9.800 utenti/giorno con 30 prezzi per cella, ~3.500 con 100, ~1.260 con 300. Obiettivi (≤ 5 righe per cella, ≥ 5.000 utenti) **non raggiunti a regime**: proposta di una riga istantanea per cella, da decidere prima di M4.

**Fatto in codice** (richiesta di Roberto: «avanti fino ad avere un bel prodotto», link agli amici):
- **Cambio A** (ADR 0018): tolti etichetta AI, `ai_usage` (migrazione `0004`), codice `ai_paused`, `source` solo `manual` nell'API; tag `pre-ai-removal` in locale. Il codice AI vero non era mai stato scritto (M3 AI a zero).
- **Cambio B** (ADR 0019): `POST /api/venues` (nome validato da `validVenueName`, duplicati → 409 con la chiave, quota 5/giorno, tetto 200 in attesa → 503 `busy`); bar `pending` e loro prezzi mai pubblici; flusso «Non trovi il bar?» (nome → tipo → pin sulla mappa a zoom ≥ 16, «È uno di questi?» entro 150 m); admin a tre code con contatori (`Queue`, `NewBar`), nome e tipo correggibili prima di approvare, link «Cerca su Google Maps».
- **Vicino a me**: un solo `locate()` (`src/app/lib/locate.ts`) con esito tipizzato; messaggi distinti (negato / non trovo) e focus sulla ricerca; il permesso già negato risponde subito. La causa del difetto sul telefono di Roberto **non è nota**: serve cosa vede (dispositivo, browser o app installata, messaggio) e il codice d'errore dalla console.
- **Aggiungi un altro drink qui**: stesso bar, un'unica `POST /api/prices`, un solo «Annulla».
- **Degrado gentile**: risposta non JSON da `/api/*` → «Il servizio è molto richiesto».
- Funzioni condivise in un posto solo: `src/shared/venue.ts` (distanza, chiave di ricerca, validazione del nome).

**Non fatto (in attesa di conferma esplicita di Roberto)**: SPEC 1.1 e `docs/feature_list.json` (rimozione M3-01…M3-10, M4-01/M4-02, nuove voci M3-11…M3-20) e nuovo tag `spec-approved-2` con adeguamento della guardia; inserimento da listino in `/admin`; riga istantanea per cella (ADR 0020); pagine Notion.

**Prove**: vedere sotto, dopo `npm run verify`.

---

## 2026-10-13 · Sessione 3 · Segnalazioni sui bar approvate dall'admin

**Richiesta di Roberto**: "Bar inesistente" e "Chiuso definitivamente" dicevano grazie ma non cancellavano nulla; le cancellazioni devono passare dal suo ok nella pagina admin.

**Fatto**: le segnalazioni sui bar (chiuso, inesistente, dati errati) compaiono in /admin, sezione "Bar segnalati dagli utenti", raggruppate per bar con motivi, numero e data. Azioni: **Elimina dalla mappa** (con conferma; nasconde un bar OSM o rimuove un bar aggiunto) oppure **Ignora**. Nessuna cancellazione automatica. Migrazione `0003` (cella nella segnalazione, indice). Messaggio all'utente: "Grazie: la verifichiamo prima di togliere il bar dalla mappa."

**Prove**: `npx vitest run` 87/87 (nuovo test: segnalazioni elencate con cella, nessun bar nascosto da sole, chiuse da elimina o ignora); e2e admin e contribuzione 68/68 Chromium e WebKit.

---

## 2026-10-12 · Sessione 2 · Prove di Roberto in staging: correzioni

**Segnalato da Roberto** dopo i test sul sito: (1) "Confermo" sembrava funzionare ma dopo un altro inserimento o un ricaricamento il prezzo tornava "da confermare"; (2) la ricerca dell'admin non trovava un bar appena creato.

**Cause e correzioni**
- (1) Il server conta una conferma per persona e mai quella dell'autore (ADR 0015); l'interfaccia mostrava "Confermato" anche quando la conferma non contava e non lo ricordava al ricaricamento. Ora: "Confermato" solo se conta; altrimenti "Già confermato" con la spiegazione; lo stato resta per la visita (`sessionStorage` della scheda, mai inviato).
- (2) La ricerca escludeva i bar aggiunti, riusava le celle in memoria e copriva ~3 km. Ora: bar OSM e aggiunti, celle rilette, ~7 km dal centro, oppure il link della scheda del bar; pulsante unico "Elimina dalla mappa" con conferma (nasconde un bar OSM, rimuove un bar aggiunto).

**Prove**: e2e contribuzione e admin 66/66 Chromium e WebKit; nuovi test "autore che conferma il proprio prezzo" e "ricerca admin trova bar aggiunti e link", ripetuti 2 volte.

---

## 2026-10-12 · Sessione 2 · Admin anticipata, guide, CI stabile

**Richiesta di Roberto**: link funzionante, guida all'inserimento, pagina admin per controllare gli inserimenti e aggiungere o cancellare bar.

**Fatto**
- `/admin` (ADR 0017): trova e **nascondi** le voci OSM che non sono bar (tabella `venues_hidden`, migrazione 0002; campo `h` nella risposta della cella), **aggiungi** bar mancanti (approvati subito), approva/rimuovi bar aggiunti e prezzi in `review`/quarantena, ripristina i nascosti. Rotte `/api/admin/*` con verifica del JWT di Cloudflare Access nel Worker (RS256, `aud`, `iss`, scadenza; D-19). La cache della cella viene svuotata a ogni azione.
- Guide: `docs/guida-inserimento.md`, `docs/guida-admin.md` (configurazione di Access passo per passo).
- CI: i test del Worker dipendevano da una build locale (`dist/`); ora la config di Vitest copia il fixture nella cartella degli asset → verdi anche senza build. Test di scrittura (e2e) eseguiti dopo quelli di sola lettura; `test.slow()` sui test che aspettano i 10 s di Annulla.
- Decisioni di Roberto: ADR 0015 (unicità per IP), ADR 0016 (chiavi cancellate entro 48 h, cron orario), stesso prezzo in un altro giorno = conferma.

**Prove**: `npx vitest run` 86/86 (nuovo `admin.test.ts`: 403 senza JWT, firma falsa, `aud`/`iss` errati, scaduto; nascondi/ripristina, aggiungi/rimuovi, decisione su prezzo in review). e2e `admin.spec.ts` 4/4 Chromium e WebKit, axe 0 violazioni; screenshot `docs/screenshots/admin/admin.png`.

**Da fare da Roberto**: configurare Access (guida) e mandarmi team domain e AUD.

---

## 2026-10-12 · Sessione 2 · M2: revisioni di chiusura (spec e UX/a11y)

**Revisione spec (NON OK, 3 bloccanti) → corretti**
- Rate limit sulle scritture e sullo storico (commit `4298525`).
- Bar proposti a freddo: "Aggiungi prezzo" senza mappa caricata usa la posizione se già concessa, altrimenti il centro della vista, e scarica le celle intorno (D-16).
- Storico: le osservazioni di un prezzo in `review`/`removed` non compaiono. Stesso prezzo ripetuto e non contato → codice `already` con messaggio dedicato.
- e2e allineati al testo delle verifiche: M2-05 da avvio a freddo con Spritz "7,50"; M2-02 controlla l’assenza di Turnstile subito prima di Salva; M2-12 invia e controlla drink, formato e fascia nella richiesta; nuovo e2e M2-09 ("In verifica" in scheda, assente in mappa). `npm run test:security` esegue anche i test "sec" del Worker.
- `docs/data-quality.md` (SPEC 11).

**Revisione UX/a11y (NON OK, 3 bloccanti) → corretti**
- Focus tra i passi: il campo prezzo riceve il focus nello stesso tocco del drink (tastiera aperta: 4 tocchi reali), il titolo "Scegli il drink" al cambio di passo; "Indietro" in alto a sinistra; Invio salva (form).
- Toast e Turnstile vivono fuori dall’albero di Preact e seguono il foglio modale più in alto: "Annulla" funziona anche sopra la scheda bar. Regione `role="status"` sempre presente; posizione misurata sopra le attribuzioni (niente pixel fissi).
- "Annulla" senza limite fisso: con focus o puntatore sul toast il conto alla rovescia (toast e invio) si ferma (WCAG 2.2.1); barra di avanzamento, assente con `prefers-reduced-motion`.
- Inoltre: "Confermato" con `aria-disabled` (il focus resta), conteggio annunciato; formati come radio native; anello di focus leggibile sul toast scuro; righe dei bar 64 px; misure in token (`--switch-*`, `--tile-min-h`, `--control-sm`). Restano da fare: icone SVG dei drink (design system).

**Prove**
- `npx vitest run --project unit` 28/28 (nuovo `timer.test.ts`: pausa, ripresa, annullo).
- `npx playwright test tests/e2e/contribute.spec.ts` 18/18 Chromium e WebKit, tra cui il nuovo e2e "Annulla sopra la scheda bar": focus su Annulla per 11,5 s → nessuna POST; Invio → "Annullato", focus sul titolo della scheda, nessuna POST.
- Screenshot rigenerati dal flusso reale in `docs/screenshots/m2/` (campo prezzo con focus, toast con barra, nuovo `7-salvato-scheda-*`).

---

## 2026-10-12 · Sessione 2 · M2: interfaccia dei contributi (branch `m2-contrib`)

**Fatto**
- Segreti di staging impostati da Roberto (`TURNSTILE_SECRET`, `SESSION_HMAC_KEY`, `HASH_KEY`); site key e hostname Turnstile per ambiente in `wrangler.jsonc`.
- **Segnalazioni** (M2-13) e **pulizia notturna** (M2-15, cron per ambiente).
- **Interfaccia**: pulsante primario fisso "Aggiungi prezzo"; foglio a 3 passi (bar più vicini alla posizione o al centro della mappa, D-16 · griglia dei drink con formato preselezionato · prezzo con tastierino decimale, formato, Happy hour, Salva); toast "Prezzo salvato" con "Annulla" per 10 s; invio a scadenza o subito al passaggio in background con `keepalive` (D-15); errori (fuori limite, in verifica, quota, rete) con il foglio riaperto e il prezzo modificabile. Scheda bar: "Confermo", "È cambiato" (inserimento precompilato), "Segnala un errore" (motivi chiusi), "Aggiungi un prezzo qui", "Segnala un problema con il bar". Turnstile caricato solo al primo contributo; il client prova prima il cookie e fa Turnstile solo dopo un 401.
- **Sicurezza** (revisioni automatiche sui commit): segnalazioni e conferme uniche per sessione **e per IP** (HMAC, IP rivendicato prima e in modo atomico), finestra delle segnalazioni dall'ultimo cambio di valore del prezzo, IPv6 ridotto al /64 per le quote; trovato con gli e2e: dopo un ricaricamento una sessione nuova poteva confermare di nuovo → ora una conferma per IP. Rischi residui in `SECURITY.md`.

**Prove**
- `npx vitest run` 73 verdi. `npx playwright test tests/e2e/contribute.spec.ts` 14/14 (Chromium e WebKit): M2-02 (nessuna richiesta a `challenges.cloudflare.com` prima di Salva), M2-05 (4 tocchi + cifre, prezzo nella scheda dopo i 10 s), M2-06 (Annulla → nessuna POST; background → POST con `keepalive: true`), M2-07 (5 più vicini con e senza posizione, calcolati sul fixture), M2-11, M2-12, M2-13.
- In e2e Turnstile è uno stub; il Worker locale lo verifica con il siteverify vero e la chiave di prova pubblica.
- Screenshot 390×844 chiaro/scuro in `docs/screenshots/m2/` (mappa, scelta bar, drink, prezzo, salvato, scheda): toast sopra le attribuzioni (fondo 652 px, attribuzioni da 665 px).

---

## 2026-10-12 · Sessione 2 · M1 unita, primo import completo, gate pre-push, M2 in corso (branch `m2-contrib`, PR #7)

**M1 unita** (PR #5, `7727c0f`, CI 5/5). Correzione del deploy (PR #6, `4d2b300`): `italy-latest.osm.pbf` risponde 307 verso il file datato, la data va letta seguendo il redirect.

**Primo deploy con l'import completo** (run 38226232203): `OSM import 20261011: 8124 files from 74459 features` · **bar 60.629**, file di cella 8.122, località 1.326 · totale 8.124 file (≤ 15.000), il più grande 49.209 byte (≤ 1 MB) · import **62 s** · upload 8.131 file in 7,4 s. Verifica diretta su staging: `/api/health` → `data_version 20261011`; `/data/20261011/v/u0nd9.json` 200 JSON con cache immutabile (757 bar); `places.json` 1.326 righe (Milano 1.968 bar, Roma 1.954, Torino 1.020). Lo smoke test del job era rosso per una corsa (interrogava `/api/health` prima che la nuova versione rispondesse): ora attende fino a 2 minuti il `data_version` nuovo. **M1-02** (job osmium verde in CI con le aree) e **M1-03** a `true`; **M0-07** al prossimo deploy verde.

**Gate pre-push (richiesta di Roberto)**: `npm run verify` esegue in locale ciò che esegue la CI e si ferma al primo errore; `.githooks/pre-push` lo lancia a ogni push (attivato da `init.sh`). Primo uso: ha bloccato un e2e instabile su WebKit (etichette dei prezzi non aggiornate dopo `setData`), corretto e stabile su 3 esecuzioni; il push successivo è passato in 433 s.

**M2 finora**: STRIDE in `SECURITY.md` (M2-01); sessione anonima con Turnstile (M2-03); controlli comuni delle POST (M2-04); `POST /api/prices` e `/api/prices/confirm` con catalogo e limiti, verifica del bar dal file statico, quarantena, stesso prezzo = conferma, quote per sessione e per IP con `Retry-After`, nessun dato personale (M2-08/09/10/14/16). Revisione di sicurezza automatica sui commit: autore riconosciuto anche per IP e per due giorni (niente auto-attivazione della quarantena), prezzi in `review`/`removed` mai sovrascritti; rischio residuo oltre 48 h registrato in `SECURITY.md`. 65 test unit+worker verdi.

**Turnstile**: widget `dovebevo-staging` (Managed) creato da Roberto; site key pubblica in `wrangler.jsonc` (staging), hostname atteso per ambiente (`TURNSTILE_HOSTNAME`). In locale ed e2e le chiavi di prova pubbliche di Cloudflare (siteverify risponde `hostname: example.com`, senza `action`): il controllo di `action` si salta solo con il secret di prova. Secret `TURNSTILE_SECRET`, `SESSION_HMAC_KEY`, `HASH_KEY` di staging impostati da Roberto nella dashboard.

---

## 2026-10-12 · Sessione 2 · M1: prestazioni (Lighthouse) e decisioni

**Problema**: in CI il job Lighthouse falliva dopo l'arrivo della mappa (Performance 0,47, LCP 5,8 s) e il job `osm-import` falliva con "Permission denied" (bit di esecuzione mancante su `import.sh`).

**Fatto**
- Bit di esecuzione di `scripts/osm-import/import.sh` in git (`100755`).
- LCP: l'elemento più grande era il testo delle attribuzioni disegnato da MapLibre dopo il caricamento → attribuzioni come testo della shell (LCP 5,1 s → 1,5 s).
- TBT 1,7 s (esecuzione di MapLibre, CPU 4×) → **Roberto ha scelto la mappa al primo tocco** (ADR 0014): immagine statica dell'Italia, MapLibre al primo gesto o alla prima azione che lo richiede.
- **Roberto ha approvato ADR 0012** (`@cloudflare/vitest-plugin`).

**Prove**
- Lighthouse mobile locale: Performance **0,99**, LCP 1,95 s, TBT 37 ms, CLS 0, Accessibility/Best Practices/SEO 1 (`npx @lhci/cli@0.15.1 autorun`, asserzioni verdi). Shell 15.700 B gzip.
- `npx vitest run` 41 verdi; `npx playwright test --workers=2` **48 passati** (M1-06 ora verifica l'immagine statica senza alcuna richiesta MapLibre, poi la mappa interattiva al tocco; axe prima e dopo l'avvio della mappa).

---

## 2026-10-11 · Sessione 2 · M1 (branch `m1-map`, PR #5): interfaccia, prove e revisioni

**Fatto (oltre a M1-01/02/04 e fixture, voce sotto)**
- **M1-08** `GET /api/prices/:cell`: migrazione `0001_init.sql` (schema SPEC 8), `src/worker/lib/db.ts` (unico accesso a D1), zod sulla cella, Cache API 60 s. Test worker con `@cloudflare/vitest-plugin` (ADR 0012) e D1 migrato.
- **M1-15** `GET /api/venues/:key/prices`: correnti + ≤ 10 osservazioni per drink e formato (window function), solo data. **Rate limit rinviato a M2-14**, dove nasce l'infrastruttura HMAC/quote (il binding `RATE_LIMITER` esiste già).
- **Interfaccia** (Preact, MapLibre in un chunk separato con worker servito da noi, OpenFreeMap positron con attribuzioni esatte ed etichette italiane `name:it`): chip dei drink, celle da zoom 13 (≤ 12), "Vicino a me" (posizione solo in memoria), ricerca città/bar su `places.json`, scheda bar `/bar/<key>?c=<cell>` (dettagli, prezzi con data e conferme, HH, etichetta AI, "In verifica", Indicazioni), "Elenco" accessibile; fogli su `<dialog>` nativo con ritorno del focus.
- **M1-03** nel deploy di staging: data Geofabrik come chiave di cache del PBF, import osmium con `pipefail` e controllo del formato `DATA_VERSION`, `DATA_VERSION` al client (build) e al Worker (`--var`), smoke test su `data_version`, cella JSON (non fallback HTML) con cache immutabile, `/api/prices`.
- **M1-05** ADR 0013: quote D1 misurate (lettura di una cella: 601 righe per 300 prezzi; scrittura di un prezzo: 3 righe) con test di regressione `tests/worker/d1-reads.test.ts`. ADR 0003 (licenza) già presente.

**Prove**
- `npx vitest run` → 8 file, **41 test** verdi (unit: geohash, import OSM, guardie, config; worker: prezzi di cella, storico, letture/scritture D1).
- `npx playwright test --workers=2` → **48 passati** (Chromium e WebKit a 390×844 + sicurezza): M1-06, 07, 09, 10 (concessa: zoom 15 e centro entro 0,0005° dal Duomo; negata), 11, 12 (anche dopo reload), 13 (solo tastiera da inizio pagina: Tab, Opzione+Tab in WebKit come Safari; axe 0 violazioni su elenco e scheda), 14 (nessuna richiesta con coordinate o arrotondamenti a 2+ decimali), axe sulla mappa, CSP senza violazioni anche con la mappa caricata su Milano (M0-04), celle senza file statico, prezzi disegnati a zoom 14 (`data-prices-shown` da `queryRenderedFeatures`: i segnaposto, non solo l'elenco).
- **CPU di `/api/prices/:cell`** (M1-08): in workerd il timer non avanza senza I/O, quindi misurata la parte di CPU della rotta in Node: mappatura + JSON di una cella con 400 prezzi e 30 bar utente = **0,080 ms** per richiesta (2.000 iterazioni dopo riscaldamento). Le letture D1 sono I/O. Da confermare con le metriche CPU di staging dopo il deploy.
- Shell 15.038 B gzip (budget 51.200, MapLibre esclusa). `npm audit` 0, `format:check`, lint, typecheck verdi.
- **Screenshot 390×844 (Chromium)** in `docs/screenshots/m1/`: Italia, Milano a zoom 14 con prezzi sopra i cluster, zoom 16 con focus del canvas, elenco, scheda bar — chiaro e scuro; confrontati con `design-system/MASTER.md` e `pages/mappa.md`, `scheda-bar.md`, `ricerca.md`.

**Errori trovati dai test e corretti**: spostamenti chiesti prima che la mappa fosse pronta (persi); `maplibre-gl.css` che azzerava l'altezza del contenitore (mappa vuota, in WebKit 0 celle); chip che allargavano la pagina; celle senza file statico (fallback HTML) che mandavano in errore tutta la vista; risposte servite dalla cache HTTP di WebKit (test con `page.route`).

**Revisioni di chiusura M1**
- `/code-review` (alto): 8 rilievi, tutti corretti (errori di caricamento visibili e senza promesse in cache, "Chiudi" che torna indietro nella cronologia, `visibleCells` con limiti non validi, `roundRect` per Safari < 16, stile e TileJSON in parallelo, attribuzioni in `it.ts`).
- `/security-review` (subagent `security-reviewer`): nessuna vulnerabilità ≥ 8/10.
- `spec-reviewer`: 4 bloccanti → corretti (celle senza file; import fallito che non bloccava il deploy; prove mancanti in PROGRESS → questa voce; ADR 0012 da approvare → chiesto a Roberto). Corretti anche: centro della mappa verificato in M1-10, M1-13 solo tastiera, segnaposto verificati sul canvas, rinvio del rate limit registrato qui.
- `ux-a11y-reviewer`: 3 bloccanti → corretti (anello di focus interno sul canvas; anello a due toni `--map-focus` sopra la mappa anche in tema scuro; prezzi mai raggruppati nei cluster). Corretti anche: anello delle chip non tagliato, stato delle celle che prevale sul messaggio di posizione da zoom 13, ritorno del focus alla chiusura dei fogli, errori annunciati (`role="alert"`), "Riprova" sull'errore delle celle, ricerca come lista di pulsanti, testo della mappa a 14 px, area di tocco 48 px sui cluster, attribuzioni nel font del sistema con `line-height` 1,5, token per backdrop e larghezze, campo di ricerca come in `mappa.md`, tipo/città a `--text-sm`.
- **Eccezioni registrate**: i link delle attribuzioni restano alti circa 21 px (eccezione "inline" di WCAG 2.5.8; MASTER chiede 48 px per i controlli, non per i link nel testo di attribuzione). `viewport-fit=cover` e aree sicure laterali arrivano con la PWA (M4). Il pulsante primario "Aggiungi prezzo" arriva in M2.

**Checklist UI UX Pro Max (M1)**: nessuna emoji, una sola famiglia di icone SVG a 2 px — PASS · feedback al tocco senza spostamenti — PASS · target ≥ 48 px, focus coerente, etichette — PASS (eccezione attribuzioni sopra) · contrasto chiaro e scuro, anche sopra la mappa — PASS · reduced motion e testo al 200 % — PASS · 375/390 px e orizzontale — PASS (aree sicure in M4) · solo token semantici — PASS.

---

## 2026-10-11 · Sessione 2 · Chiusura M0 e inizio M1 (branch `m1-map`)

**M0 unita** (PR #2, merge commit `408ef73`, CI 4/4 verde, revisioni chiuse; Roberto ha autorizzato Claude a unire le PR delle milestone con CI verde e revisioni chiuse).
- Primo deploy di staging (run 38167216787): https://dovebevo-staging.dovebevo.workers.dev — `/api/health` → `{"status":"ok","version":"0.0.0","data_version":"none"}`; `/`, `/bar/n1` 200 HTML; `/api/nonesiste` 404 JSON; CSP e HSTS presenti, nessun `Access-Control-*` (verificato anche da Claude con `fetch`).
- **M0-11**: binding Rate Limiting accettato sul piano gratuito (ADR 0010 accettata). **M0-08**: `npm audit` verde su `main`, Dependabot attivo (prime esecuzioni npm e Actions completate, nessun aggiornamento), Actions a SHA, nessun `pull_request_target`.
- Restano: M0-04 (mappa) e M0-07 (passa con il `data_version` dell'import, M1-03).

**M1 finora**
- **M1-01** `src/shared/geohash.ts`: encoder (~30 righe) e copertura delle celle visibili (≤ 12, altrimenti `null`). 6 test: `u0nd9`, `u4pruydqqvj`, bordi ±90/±180, celle senza duplicati.
- **M1-02** `scripts/osm-import/`: `osm.ts` (logica pura: filtri, centroidi, città più vicina entro 15 km con griglia, file D-11, `places.json`, `LICENSE.txt`, limiti 15.000 file e 1 MB, riquadro Italia, nomi ≤ 120), `build.mjs` (streaming del GeoJSON-seq), `import.sh` (osmium), `check-output.mjs` (validazione e conteggi). 7 test unit; job CI `osm-import` con osmium vero su `tests/fixtures/osm/sample.osm` → PBF, confronto con l'output atteso. `passes` dopo il primo verde in CI.
- **M1-04** `/data/*` con `Cache-Control: public, max-age=31536000, immutable` (test di sicurezza rosso → verde).
- **Fixture reale** `tests/fixtures/data/`: 9 celle di Milano centro, 2.446 bar e 71 località, 185 KB, dati OSM via Overpass (mirror `overpass.private.coffee`, base 28/7/2026; l'istanza principale rispondeva 504), generati con lo stesso `build.mjs` (le vie hanno il centro di Overpass invece del centroide). `npm run fixture` lo copia in `public/data/fixture/`.

---

## 2026-10-11 · Sessione 2 · M0 · M0-04/05/06/08/09/10/11 e deploy

**Fatto**
- **M0-04** `tests/e2e/csp.spec.ts`: violazioni CSP raccolte con l'evento `securitypolicyviolation` e dalla console. Mutazione (stile inline in `index.html`) → rosso su Chromium e WebKit (`style-src-attr inline`); ripristinato → verde. `passes` resta `false` finché non c'è la mappa (la verifica dice "shell e mappa"): il test copre `/`, dove arriverà la mappa in M1.
- **M0-06** `scripts/check-feature-list.mjs` (CLI) + `scripts/feature-list.ts` (logica pura, eseguita da Node 24 senza build); 4 test unit (cambio di `passes` ok; `descrizione`/`verifica` cambiate, voce tolta o aggiunta, `passes` non booleano o campo extra → errore). Sul file reale: ok; con una descrizione modificata: exit 1.
- **M0-05/08/09** `.github/workflows/ci.yml`: job lint+format+typecheck+unit+guardia+policy dei workflow+`npm audit`, e2e (Chromium, WebKit), sicurezza, Lighthouse CI, gitleaks. Actions fissate a SHA, `permissions: contents: read`, `persist-credentials: false`. `scripts/check-workflows.mjs` fallisce su Action non fissate o su `pull_request_target`. `.github/dependabot.yml` (npm, Actions; TS < 6.1 e Vitest 4 mantenuti). `.dev.vars.example` senza valori.
- **ADR 0009**: `@lhci/cli` 0.15.1 nel lockfile fa fallire `npm audit --audit-level=high` (basic-ftp, extract-zip, nessuna correzione compatibile): eseguito con `npx` a versione esatta solo nel job Lighthouse, senza segreti, report su file. Soglie di SPEC 15 già attive; aggiunti `robots.txt` e `meta description` (SEO 0,91 → 1).
- **M0-07** `.github/workflows/deploy-staging.yml`: dopo una CI verde da push su `main` (mai da PR o fork), build con `CLOUDFLARE_ENV=staging`, `wrangler deploy`, smoke test (`/api/health`, shell, CSP, HSTS). `DATA_VERSION` di staging = `none` finché non c'è l'import OSM (M1-03): M0-07 passa del tutto solo dopo M1-03.
- **M0-11 / ADR 0010**: la documentazione non dice se il binding Rate Limiting è nel piano Free. Binding `RATE_LIMITER` dichiarato in locale e staging; l'esito lo decide il primo deploy di staging.
- **M0-10** `design-system/MASTER.md` + `pages/` (mappa, scheda bar, aggiungi prezzo, revisione listino, ricerca), `src/app/styles/tokens.css` e `base.css`, font Plus Jakarta Sans variabile (1 woff2, 27 KB, OFL) in `public/fonts/`. La query di SPEC dava un risultato fuori tema (FAQ, font accademici), non salvato; usata la categoria più vicina (Food Delivery / On-Demand). Anteprime `design-system/preview-light.png` e `preview-dark.png` a 390×844. Roberto ha chiesto un'altra palette: tre varianti AA a confronto (A notte e ambra, B viola, C blu e arancio); **approvato con la palette C** l'11/10/2026, token e MASTER aggiornati, anteprime rigenerate.

**Prove**
- CI sulla PR #2 (`m0-tooling` → `main`): 5 job su 5 verdi al primo giro.
- M0-05: PR di prova #3 con `any` voluto → job lint rosso (`no-explicit-any`), poi revert → tutta verde. Chiusa senza merge.
- M0-09: PR di prova #4 con un token finto → gitleaks rosso (`generic-api-key`, "leaks found: 1"). Chiusa senza merge (il token è finto; il commit resta raggiungibile su GitHub solo per SHA).
- Contrasti dei token (script WCAG): tutte le coppie testo/sfondo ≥ 4,5:1 in chiaro e scuro (palette C: minimo 4,55 per `--color-border-strong` su `--color-bg` in chiaro, soglia per i controlli 3:1; pill "nella media" 4,92).
- Locale: lint, typecheck, unit 9, e2e 12 + sicurezza 5, Lighthouse (Performance, Accessibility, Best Practices, SEO = 1; LCP 1,1 s; CLS 0), `format:check`, `npm audit` 0.

**Revisioni di chiusura M0**
- `/code-review` (alto): 6 rilievi. Corretti: smoke test `curl | grep -q` con pipefail, guardia che non vedeva gli `id` duplicati (+ test), durata mancante nel log d'errore (CLAUDE.md), escape HTML di titolo e descrizione, e2e e sicurezza in un solo job (una build). Non applicato: header definiti in due file (`_headers` e Worker) — il test di sicurezza confronta entrambi con SPEC.
- `spec-reviewer`: nessun blocco; le 7 voci a `true` hanno prove adeguate. Corretti: `set -o pipefail` nel deploy (il `bash -e` di default non lo ha), revisione listino come **tabella** (SPEC 7.4), ADR 0011 sul design system, budget shell ≤ 50 KB gzip in CI (`scripts/check-bundle-size.mjs`: 6.296 B). Da decidere con Roberto: protezione di `main`, ruleset sul tag `spec-approved`, approvazione dell'ADR 0009, aggiornamenti di sicurezza Dependabot. Nota: la PR #1 (`m0-tooling` → `main`, M0-01…03) è stata unita da Roberto alle 18:12 UTC, prima che esistesse la CI.
- `ux-a11y-reviewer`: nessun blocco; axe 0 violazioni (Chromium/WebKit × chiaro/scuro, reduced motion), token coerenti con MASTER. Corretti: preload del font, token per focus e pesi, regola in MASTER per gli elementi sopra la mappa (che resta chiara in tema scuro: pill con token chiari e bordo scuro, focus a due toni), cifra di contrasto in PROGRESS (4,55). Per M1: `@axe-core/playwright` con test axe; screenshot di confronto da Chromium (WebKit su Windows non applica il peso del font variabile).

**Checklist UI UX Pro Max (shell M0)**: emoji come icone PASS (nessuna icona) · feedback al tocco N/A · target/focus/etichette N/A (token pronti) · contrasto chiaro e scuro PASS sulle pagine, sopra la mappa da verificare in M1 · reduced motion e zoom 200% PASS · 390 px PASS, aree sicure in M1 · solo token semantici PASS.

**Aperte in M0**: M0-04 (mappa), M0-07 e M0-11 (primo deploy dopo il merge), M0-08 (Dependabot si attiva dopo il merge su `main`), M0-10 approvato.

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
- Identità git del solo repository: Roberto Valeri <email personale, non riportata qui>.
- Commit iniziale su `main` e tag `spec-approved` (base della guardia della feature list, D-21).

**Prossimo passo**
`/clear`, poi il prompt di ripresa (BRIEF sezione 17) con milestone **M0**. Prerequisiti M0 per Roberto: SPEC sezione 21.
