# Diario di avanzamento

Una voce per sessione, la più recente in alto. Ogni voce: data, milestone, cosa è stato fatto, prove (comandi ed esito), cosa resta, cosa verificare a mano.

Qui stanno solo le voci del mese in corso. Quando un mese si chiude, le sue voci passano intere, senza tagli, in `docs/progress/AAAA-MM.md`, che fa parte del diario: le prove e le misure citate da SPEC, ADR e feature list «in PROGRESS» si cercano anche lì.

- **Ottobre 2026** (11/10–29/10, 49 voci, da M-1 alla SPEC 1.15): `docs/progress/2026-10.md`, con l'indice in testa.

## Punti aperti ripresi dalle voci archiviate

Copiati dalle voci indicate perché non finiscano dimenticati nell'archivio; lo stato non è stato riverificato il 10/11/2026. Una riga si toglie solo quando una voce nuova ne scrive la chiusura.

- **M6-01…M6-05** `false`, a carico di Roberto: segreti dell'ambiente vivo, prova del rollback, tag `v0.1.0`, smoke test sul dominio (`docs/release-checklist.md`; voce del 02/11).
- **Sicurezza, app:** segnalazione sull'identificativo del votante in `src/worker/routes/mobile-recommendations.ts` (ADR 0041), lasciata «fuori ambito» (voce del 29/10, SPEC 1.15).
- **Sicurezza, Cloudflare (Roberto):** HSTS sulla zona, «Always Use HTTPS», redirect `dovebevo.com → www` solo su HTTPS, poi hstspreload.org; regola WAF di rate limiting dell'ADR 0021; Turnstile con le chiavi vere e console senza «Refused to…» (voci del 29/10 e del 27/10; `docs/release-checklist.md`, sezioni A ed E).
- **Cloudflare Queues (Roberto):** controllare che il Worker `dovebevo-staging` non sia più consumatore di `dovebevo-tasks` (voce del 29/10, ADR 0042).
- **Legale (Roberto):** `/privacy` senza titolare del trattamento; privacy e regole in inglese sono una bozza da rileggere (`docs/release-checklist.md`, sezione F; voce del 28/10, ME-05).
- **iPhone Safari:** l'effetto del download anticipato della mappa resta da misurare (voci dell'01/11 e del 02/11).
- **Sicurezza, decisioni di SPEC (Roberto):** i quattro punti del pen test del 22/10 che cambiano la SPEC restano da decidere: prezzo in quarantena attivato dalla conferma di una seconda identità (D-10), rimozione con 4 segnalazioni distinte, prezzo «ultimo vince» sotto i 5 prezzi in cella, quote per IP aggirabili con molti prefissi IPv6 (`SECURITY.md`, «Rischi accettati»; ADR 0029; voci del 22/10 e del 24/10).
- **Sicurezza, GitHub (Roberto):** Environment `staging` con i segreti Cloudflare (poi `environment: staging` nel deploy: il 10/11 `deploy-staging.yml` non lo ha), scope del token Cloudflare, email privata su GitHub (voce del 22/10).
- **Accessibilità, admin:** in `/admin`, «Trova un bar sulla mappa», il messaggio della ricerca non era in una regione `aria-live` (voce del 25/10, «Gestore verificato»).
- **Controlli dopo il deploy mai registrati come fatti:** riga `OSM import <versione>: … , 0 skipped` nel log del deploy (29/10, ADR 0043); sezioni di `/admin` che si caricano senza far scattare il limite sulle GET (29/10, ADR 0044).
- **Prove a mano su telefono mai registrate come fatte:** Timbro e vibrazione su Android, invito all'installazione, offline dopo l'installazione, Fuori orario di notte, ricerca con rete mobile (17/10); pallino fermo camminando (24/10); spunta e orari di un gestore verificato, campo orario a 24 ore (25/10).

## Limiti noti scritti solo nel diario

Non stanno in SPEC né negli ADR: chi tocca queste parti li legga prima.

- **Prezzo cambiato (21/10):** la Cache API si svuota solo nella sede Cloudflare che serve la richiesta (accettato: è quella di chi ha appena salvato); nessun test e2e della parte client (`cache: "reload"` in `src/app/lib/data.ts`).
- **`/api/ai/cerca` (19/10):** il nome del bar c'è solo per le 3 celle con più righe di ogni pagina (CPU del piano gratuito); altrove `nome: null` e l'`url` apre la scheda.
- **Pagine per i motori di ricerca (19/10):** `/copertura` e le pagine di città sono viste per i crawler: un utente che ci arriva vede la mappa.
- **Indici D1 (19/10):** nessuna migrazione di indici; da rivalutare con le misure reali del sito vivo.

---

## 2026-11-11 · Sotto zoom 13 la mappa non disegna più i bar (ramo `claude/gracious-fermi-tnhqxu`) · SPEC 5.4, M1-07

**Problema visto da Roberto su iPhone Safari:** dopo aver caricato una zona, allontanando la mappa sotto zoom 13 il messaggio diceva «Avvicinati per vedere i prezzi, o cerca una città.» ma i pin dei prezzi e i cerchi numerati restavano disegnati.

**Causa:** i bar delle celle già scaricate restano in memoria (SPEC 5.4) e i layer della mappa non avevano uno zoom minimo; Elenco, copertura, legenda e «I più economici qui» sotto zoom 13 erano già vuoti: solo il disegno contraddiceva il messaggio.

**Scelta di Roberto (11/11, in chat):** via (a), sotto zoom 13 i bar non si disegnano. È l'unica conforme a SPEC 5.4 («Sotto zoom 13: solo tessere e invito») e a M1-07 («a zoom 12 … invito visibile»); la via (b), pin visibili senza messaggio, avrebbe richiesto di cambiare SPEC e feature list. Nessuna modifica a SPEC, feature list, testi (`it.ts`, `en.ts`), API e D1.

**Fatto**
1. `MIN_ZOOM_CELLS = 13` in `src/shared/config.ts`: una sola soglia per caricamento delle celle, messaggio e layer.
2. `src/app/lib/maplibre-map.ts`: `minzoom` su prezzi, pallini, cerchi numerati, tappo del bar selezionato e sulle tre aree di tocco invisibili. Il pallino della posizione (D-33) non è un bar e resta a ogni zoom. Nessun `setData` e nessuna richiesta in più: tornando a zoom 13 i bar ricompaiono dalla memoria.
3. Gancio di test `data-marks-shown` accanto a `data-prices-shown` (pallini, cerchi e tappo disegnati).
4. App native (`mobile-apps/web/build-contract.mjs`): la build delle app riusa i due file del sito e si ferma se cambiano. Pin aggiornati e una riga in più perché **l'app resti com'era** (prezzi da zoom 12, pallini e cerchi a ogni zoom); test in `routes-and-build.test.mjs`. Se l'app debba seguire la regola del sito è una decisione di Roberto.

**Test nuovi:** `tests/e2e/map.spec.ts`, «M1-07 light/dark: under zoom 13 no pin is drawn, and they are back without requests» (nessun prezzo né segno disegnato, un tocco al centro non apre nulla, altezza della mappa identica, ritorno allo zoom di prima con zero richieste a `/api/*` e `/data/*`). Nessun test esistente cambiato.

**Prove**
- Il test fallisce senza la correzione e per il motivo giusto: sotto zoom 13 `{"marks": 55, "prices": "12,00 €"}` invece di `{"marks": 0, "prices": ""}`, nei due temi (prova fatta con la soglia dei layer a 0, cioè il comportamento di prima).
- Con la correzione: Playwright su Chromium, sei file della mappa (`map`, `map-stability`, `map-start`, `position-dot`, `brand-map`, `brand-tiers`): 54 passati, 0 falliti, compresi M1-07 e M1-16. Suite completa su Chromium (`chromium`, `-writes`, `-proposals`, `security`): 245 passati, 0 falliti.
- Lint, Prettier, `tsc -b` verdi; Vitest 878/878; `routes-and-build.test.mjs` 13/13.
- Screenshot 390×844 nei due temi, sopra e sotto zoom 13: prodotti dal test (`m1-07-zoom-vicino-*.png`, `m1-07-zoom-lontano-*.png` in `test-results/`); nei test le tessere sono finte, quindi sotto zoom 13 si vede il fondo senza alcun pin.
- `spec-reviewer` sul diff: OK to close; le sue richieste (tocco sotto zoom 13, test del contratto delle app) sono state aggiunte.

**Non verificato qui**
- **WebKit:** non c'è nel container, il test nuovo gira su WebKit solo in CI.
- I 100 test delle app che aprono un browser (`mobile-apps/web/tests`) non partono nel container (manca il Chromium 1248 che Playwright 1.64 chiede): li esegue la CI.
- `node scripts/check-feature-list.mjs`: il tag `spec-approved-14` non è in questo clone; `docs/feature_list.json` non è nel diff.

**Da verificare a mano (Roberto)**
- Su iPhone Safari dopo il deploy: carica Milano, allontana sotto zoom 13 → nessun pin né cerchio, messaggio «Avvicinati…»; riavvicina → i prezzi tornano subito.
- Nell'app nativa nulla deve essere cambiato.

---

## 2026-11-10 · «Gin lemon» diventa «Americano» (ramo `claude/gin-lemon-americano-rename-e63888`) · SPEC 1.17 · ADR 0047

**Richiesta di Roberto:** sostituire Gin lemon con Americano nella scelta dei drink, senza rompere il sito vivo. Scelte sue in chat: il codice `gin_lemon` resta, i prezzi già salvati restano e si leggono come Americano, vale per tutto il sito web (non per le app native), icona nuova e limiti 4–20 €.

**Fatto**
- `src/app/i18n/it.ts` e `en.ts`: `gin_lemon` → «Americano». `src/worker/seo-texts.ts`: «americano» nell'elenco dei drink.
- `src/app/components/Icon.tsx`: disegno nuovo per `gin_lemon` (tumbler basso, mezza fetta d'arancia, ghiaccio).
- SPEC 1.17 (intestazione, registro, tabella 6) e ADR 0047. `docs/feature_list.json` non cambia: nessun tag nuovo.
- Test cambiati perché è cambiato il requisito (il nome): `tests/unit/catalog.test.ts`, `tests/e2e/helpers.ts`, `english.spec.ts`, `brand-tiers.spec.ts`.
- Non toccati: `catalog.ts`, migrazioni, `seed.sql`, rotte del Worker, `mobile-apps/`.

**Prove**
- Test prima del codice: `tests/unit/catalog.test.ts` rosso con `- "Americano" + "Gin lemon"`, poi verde.
- `npm run typecheck`, `npm run lint`, Prettier: verdi. `npm run test`: 67 file, 846 test verdi. `node scripts/check-feature-list.mjs`: ok.
- e2e `brand-tiers`, `english`, `drink-menu` su Chromium e WebKit: 83 verdi e 1 rosso su WebKit in `goToMilano` (MC-02, passo «cerca Milano»); ripetuto 2 volte su WebKit: 16 su 16 verdi (intermittenza già nota).
- Screenshot 390×844: `docs/screenshots/mc/menu-aperto-390.png`, `menu-scuro-due-drink-390.png`, `docs/screenshots/americano/` (griglia e scheda, due temi).

**Da sapere**
- `GET` dei voti sul drink esatto per le app (`src/worker/routes/mobile-exact-drink-votes.ts`) prende il nome da `it.ts`: per un prezzo `gin_lemon` ora risponde «Americano», mentre le etichette scritte nelle app dicono «Gin lemon».
- `mobile-apps/tools/menu-seed/` classifica come `gin_lemon` le voci «Gin Lemon» dei listini e le scrive in `prices_current`: sul sito quei prezzi, già importati e futuri, compaiono come Americano finché lo strumento non viene allineato.
- La frase «piè di pagina della mappa» di SPEC 7.8 (decisione del 10/11 qui sotto) non è stata allineata in questa versione: resta da fare.

---

## 2026-11-10 · `CLAUDE.md` e diario più corti (ramo `claude/happy-feynman-hfktn3`)

**Richiesta di Roberto:** togliere da `CLAUDE.md` le righe morte e ridurlo il più possibile senza perdere regole; ridurre molto `docs/PROGRESS.md` senza perdere dettagli e senza rischi per la sicurezza.

**Fatto** (solo documenti: nessuna modifica a codice, test, SPEC, feature list, hook)
- `CLAUDE.md`: tolte le righe che contraddicono la SPEC 2.7 e l'ADR 0018 (tetto di spesa AI, `src/worker/lib/anthropic.ts`, `npm run eval`, «output del modello») e `npm run deploy`, script che non esiste (il divieto di deploy resta); tolte le convenzioni copiate parola per parola dalla SPEC, che è caricata insieme al file (stack del frontend, formato degli errori, log, script multipiattaforma), con un rimando alle sezioni; corretti il pacchetto dei test del Worker (`@cloudflare/vitest-plugin`, ADR 0012) e il comando delle migrazioni locali (`npm run db:local`). Restano tutte le regole di lavoro, i divieti, i vincoli di privacy e sicurezza e le regole citate dal codice (`it.ts`, `db.ts`, test delle migrazioni, hook di fine turno).
- `docs/PROGRESS.md`: le 49 voci di ottobre spostate intere in `docs/progress/2026-10.md` con un indice; qui restano novembre e i punti aperti.

**Prove**
- Archivio identico all'originale: le righe 85–1115 del vecchio `PROGRESS.md` confrontate con `cmp` con il corpo di `docs/progress/2026-10.md`: nessuna differenza; 49 titoli nell'indice, 49 voci.
- Le voci di novembre qui sotto sono le righe 7–81 del vecchio file, invariate (`cmp`).
- Nessun test o script legge il contenuto dei due file: `grep` su `tests/`, `scripts/`, `.claude/`, `.githooks/`, `init.sh` (solo `init.sh` controlla che i due file esistano).
- Seconda passata, chiesta da Roberto prima dell'unione: riletti tutti i blocchi «Da verificare», «Da fare», «Non fatto», «Non risolto», «Limiti», «Resta» delle 49 voci archiviate e confrontati con codice, `SECURITY.md`, ADR e `docs/release-checklist.md`; ciò che è ancora aperto o è scritto solo nel diario è riportato nelle due sezioni in cima.
- Non eseguiti: `npm run verify` e i test (nessun file di codice toccato, `node_modules` assente nel container): li esegue la CI sulla PR.

**Decisione di Roberto (10/11/2026, in chat):** i link a `/privacy` e `/regole` restano dove sono, nella scheda bar e nel foglio di ricerca; nessun link sulla mappa. Il punto aperto del 24/10 è chiuso. La frase «piè di pagina della mappa» di SPEC 7.8 e M5-04 si allinea alla prossima versione della SPEC, non con una modifica a parte.

**Da verificare (Roberto):** che il nuovo `CLAUDE.md` non abbia tolto nulla che ti serve; l'elenco dei punti aperti qui sopra.

---

## 2026-11-09 · Segnalazioni di indicizzazione di Google (ramo `claude/dovebevo-indexing-issues-26e3cb`) · ADR 0046

**Richiesta di Roberto:** Search Console segnala 3 «Pagina con reindirizzamento» e 92 bar «Rilevata, attualmente non indicizzata»; normalizzare e aiutare l'indicizzazione, senza peggiorare il sito in produzione.

**Fatto:** sitemap con `<lastmod>` (giorno dell'ultimo prezzo) per i bar e senza `changefreq`/`priority`; le pagine città elencano nel testo per i motori di ricerca ogni bar con nome già risolto (sezione «Tutti i bar con un prezzo»). Nessuna modifica a UI, SPEC, schema, API, `feature_list.json`. I redirect sono 301 voluti: nessuna modifica nel codice (il salto doppio di `http://dovebevo.com` si toglie con una Redirect Rule Cloudflare, a carico di Roberto).

**Prove**
- Test scritti prima: 2 falliti per il motivo giusto (sitemap con `changefreq`/`priority` e senza `lastmod`; sezione «Tutti i bar con un prezzo» assente).
- `npx vitest run --project worker tests/worker/seo.test.ts`: 40 su 40 verdi. `tsc -b` e ESLint senza errori.

**Da verificare a mano dopo il deploy:** `curl -sS https://www.dovebevo.com/sitemap.xml | head -40` (lastmod presente), `curl -sS https://www.dovebevo.com/milano | grep -c 'href="/bar/'` (più dei 15 di oggi), poi i passi su Cloudflare e Search Console.

---

## 2026-11-02 · MF-02 a `passes: true` (ramo `docs/mf-02-passes`)

**Richiesta di Roberto:** registrare la verifica a mano di MF-02 e chiudere la voce in una PR unica.

**Fatto:** in `docs/feature_list.json` cambia solo `passes` di MF-02, da `false` a `true`. Nessuna modifica a SPEC, codice o test.

**Prove**
- Parte automatica della verifica (indirizzi scaricati, `Cache-Control` lungo `immutable`, nessuna richiesta nuova al tocco, CSP senza violazioni): `tests/e2e/map-warmup.spec.ts`, già in CI verde su `main`. Dopo la PR #101 l'e2e su Chromium e WebKit è verde.
- Parte a mano (che il tocco non riscarichi nulla, con cache vera e rete lenta, su telefono): **Roberto conferma in chat il 02/11/2026 che è ok.** Non ha detto quale telefono né con quale rete: non lo scrivo.
- `node scripts/check-feature-list.mjs`: ok, cambia solo `passes` (129 su 134).

**Attenzione:** questa voce corregge quanto scritto il 28/10 («resta `false`: su iPhone il download in anticipo non migliora il primo tocco», ADR 0040). Se la prova di Roberto non riguarda un iPhone, quel limite su Safari non è smentito: il ripiego dopo 3 s della PR #101 ora fa partire il download anche dove manca l'LCP, ma l'effetto su Safari resta da misurare. Se Roberto indica il contrario, si rimette a `false`.

**Restano `false`:** M6-01…M6-05 (a carico di Roberto: segreti dell'ambiente vivo, rollback, v0.1.0, smoke test sul dominio vivo).

---

## 2026-11-01 · SPEC 1.16 e correzioni dalla revisione della 1.15 (ramo `fix/review-1-15`)

**Richiesta di Roberto:** una PR unica con tutto ciò che i tre revisori aggiornati hanno trovato sul commit `1272b30` (SPEC 1.15). SPEC 1.16 decisa da Roberto il 01/11/2026 in chat («tutto dentro»).

**Fatto**
1. Download anticipato della mappa (`map-warmup.ts`): il supporto all'LCP si legge da `PerformanceObserver.supportedEntryTypes`; prima `observe()` con un tipo sconosciuto non dava errore e sui browser senza LCP (WebKit più vecchi) il download non partiva mai (MF-01, ADR 0045 §3).
2. Nonce messo su `index.html` appena esce dagli asset, prima che `seoPages` aggiunga i suoi tag: il JSON-LD e gli altri tag del Worker restano senza nonce (SPEC 13.1, 1.16). Header e CSP identici.
3. `csp.spec.ts`: anche `/privacy`, `/regole`, `/admin` e l'inserimento di un prezzo con Turnstile (stub, nessuna scrittura in D1), con i messaggi Trusted Types.
4. SPEC 1.16 (riga di versione, registro, 13.1); ADR 0045: stato «decisa», file CSS emesso vuoto, punto 1 e ripiego dell'LCP.
5. Stile scuro: il pallino delle città chiede `circle_11` (lo sprite non ha `circle-11`); test su ogni immagine dello stile. Lo stile chiaro rigenerato riprende un controllo di tipo di OpenFreeMap sul filtro `boundary_3`.
6. Campo di ricerca: `text-align: start`; a 320 px il testo va a capo partendo dall'icona invece che centrato.

**Test cambiati e perché:** `tests/worker/seo.test.ts` e `tests/security/csp-nonce.spec.ts` (requisito cambiato con la 1.16: nonce sui tag di `index.html`, mai sul JSON-LD); `tests/unit/map-warmup.test.ts` (nuovo caso del comportamento reale; lo stub ha `supportedEntryTypes`). Gli altri test sono nuovi.

**Prove**
- Ogni test nuovo fallisce prima della correzione e per il motivo giusto (LCP: nessun download dopo 3 s; nonce: JSON-LD con nonce; sprite: `circle-11` non nello sprite; ricerca: testo a 20 px dall'icona invece di ≤ 12).
- Contro-prova dello sprite nel browser: con gli stili vecchi la console mostra `Image "circle-11" could not be loaded`, con i nuovi nessun avviso, nei due temi.
- Lint, formattazione, typecheck, workflow, configurazione verdi; Vitest 749/749; `npm audit` 0; feature list ok (tag `spec-approved-14`, 128/134); shell 40.066 B su 51.200.
- Playwright su Chromium (`chromium`, `-writes`, `-proposals`, `security`): 242 passati, 0 falliti. Chromium del container (1243) tramite una configurazione locale non salvata; **WebKit non c'è nel container: lo verifica la CI**.
- Revisori sul diff: `security-reviewer` OK (13 casi con il Worker vero: HEAD, 304, `Range`, errori SEO, 10 percorsi di pagina), `spec-reviewer` OK to close, `ux-a11y-reviewer` OK (390/360/320, due temi, due lingue, axe senza violazioni).

**Da verificare a mano (Roberto)**
- Su iPhone Safari, dopo il deploy: il download anticipato della mappa ora parte (prova con rete lenta, MF-02).
- Sorgente di una pagina città o bar su www.dovebevo.com: il JSON-LD senza `nonce`, gli script della pagina con.
- Turnstile con le chiavi vere: nessun «Refused to…» in console al primo prezzo (SPEC 22).
- Di sera (Fuori orario): i pallini delle città sulla mappa scura.

**Notati dal revisore UX, fuori da questa PR:** a 320 px «Aggiungi prezzo» va a capo nella barra; le attribuzioni hanno un fondo chiaro sulla mappa scura; lo stile scuro mostra meno città a zoom basso.

---

## 2026-11-01 · Revisori allineati alla SPEC 1.15 (ramo `claude/reviewers-update`)

**Richiesta di Roberto:** tenere il ruolo dei tre revisori e portarli al livello del progetto di oggi.

**Fatto** (solo `.claude/`, nessuna modifica a codice, test, SPEC o feature list)
- `security-reviewer`: tolte le voci AI/LLM e il token di estrazione (rimossi in 1.1); aggiunti nonce, `strict-dynamic`, Trusted Types, HSTS `preload`, `/.well-known` (1.15), gestori verificati, API delle app (ADR 0041), HTML delle pagine SEO, regressioni degli audit (ADR 0021, 0029, 0044); mappa delle superfici con i file; metodo dalla security-audit-skill di Cloudflare (MIT): prova locale, tentativo di smentita, esiti `confirmed` / `needs_validation` / scartati, gravità solo sui confermati.
- `spec-reviewer`: niente più «D-01…D-26» né tag scritti a mano: legge versione, decisioni e tag dal repository; tabella file → funzionalità → decisioni; ogni clausola della verifica legata a un test; inglese, budget, ADR 0003, migrazioni congelate.
- `ux-a11y-reviewer`: tolta l'etichetta AI e il tag `@screenshot` inesistente; tema per ora (`atHour`), inglese (`chooseEnglish`, `expectNoItalian`), larghezze 390/360/320, invarianti della mappa, controlli di qualità da Impeccable (Apache-2.0) con le eccezioni del brand approvato (fondo crema, Geist Mono, ombra stampa: ADR 0023), conto dei caratteri dei titoli da taste-skill (MIT).
- `claude-security-guidance.md`: header della 1.15, HTML lato server, gestori verificati, API delle app, JWT di Access.

**Prove:** `npx prettier --check .claude/` verde; ogni percorso e helper citato verificato con `ls`/`grep` (corretto `scripts/sw.ts`; il controllo `kid` descritto come nel codice, `src/worker/lib/access.ts:20-70`).

**Da verificare:** alla prossima chiusura di milestone, che i tre revisori diano esiti utili (prova consigliata: farli girare sul diff della 1.15, commit `1272b30`).
