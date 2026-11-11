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

## 2026-11-11 · Più mappa sul telefono (ramo `claude/kind-gates-e6ahqz`) · SPEC 1.18 · ADR 0048

**Richiesta di Roberto:** su iPhone in Safari la mappa ha troppo poco spazio. Ricerca, «Scegli cosa bere» e «Vicino a me» su una riga, pulsanti più bassi, tasto «Aggiungi locale», prezzi un po' più piccoli per coprirsi meno, logo tenuto, SPEC aggiornata nello stesso commit. Mockup e piano approvati in chat l'11/11/2026.

**Fatto**
1. Intestazione su una riga (`app.tsx`, `DrinkMenu.tsx`): «Cerca» (nome «Cerca città o bar», solo icona sotto 420 px: con la parola il nome del drink si troncava), margine di 5 px sopra e sotto per l'anello di focus, menu dei drink col solo drink scelto («Scegli cosa bere» resta il nome accessibile), «Vicino a me».
2. Controlli «slim» (`app.css`, solo sito): bersaglio 48 px, disegno 40 px con bordo, fondo e ombra su `::before`.
3. Barra in basso: «Aggiungi prezzo» e «Aggiungi locale» (inglese «Add a place») su una riga fino a 320 px.
4. Pin 28 px con cifre da 14 px, cerchi dei gruppi di raggio 14/17/20 (`maplibre-map.ts`).
5. Frase della copertura su una riga da 375 px (pillola più vicina alle icone, barretta nascosta sotto 480 px); attribuzioni scure in Fuori orario.
6. Il timbro «Prezzo salvato» mantiene la quota dal fondo dello schermo (`translate` di 16 px), altrimenti coprirebbe le bevande del foglio di «Aggiungi un altro drink qui» (M3-16).
7. App native: nuovi hash in `build-contract.mjs`, classe del tasto di ricerca, `shell.css` per il menu dei drink nella riga; regole nuove solo con `:root:not([data-dovebevo-mobile-shell])`.
8. SPEC 1.18, ADR 0048, MB-13 (solo il testo), guardia sul tag `spec-approved-15`, CHANGELOG, design-system, user-test.

**Test cambiati e perché:** nome del tasto in `brand-map`, `brand-controls`, `a11y-views`, `english`, `bundle.test.mjs` (requisito cambiato); MB-04 legge il disegno (`::before`) dei controlli della mappa; il test della ricerca di `brand-search.spec.ts` diventa due (testo «Cerca» a 390 px, sola icona a 320 px, requisito cambiato). Nuovo `tests/e2e/map-space.spec.ts` (14 test, rossi prima del codice per il motivo giusto).

**Prove**
- Misure prima → dopo a 390×844: intestazione 125 → 54 px, barra 65 → 54 px, mappa 654 → 736 px (+82, +13%); a 402×713 (iPhone di Roberto): 523 → 605 px (+16%).
- Vitest 879/879; Playwright su Chromium (`chromium`, `-writes`, `-proposals`, `security`) 257/257; `eslint`, `prettier`, `tsc -b` e `tsc -p mobile-apps/web` verdi; `node scripts/check-feature-list.mjs` ok con il tag `spec-approved-15`.
- Test nativi `mobile-apps/web`: 120/122; i due che falliscono («Tutti reveals…», «app map actions reclaim the footer…», layout a 320 px) falliscono uguali, con gli stessi numeri, sulla versione precedente `089f529` costruita a parte: preesistenti, non li ho toccati.
- Screenshot 390×844 e 320×568, tema chiaro e scuro, con Spritz su Milano controllati a mano.
- Revisori: `spec-reviewer` OK to close; `ux-a11y-reviewer` OK con tre note: anello di focus tagliato in alto e in basso e nome del drink troncato («Birra m…») corretti (margine di 5 px, ricerca a sola icona sotto 420 px, test nuovi); il messaggio «Avvicinati…» su due righe è accettato e scritto nell'ADR 0048. WebKit e Chromium 1248 installati nel container solo per l'hook `pre-push`.
- Due errori miei trovati dai test e corretti: `position: relative` della regola «slim» spostava «Elenco» di 16 px; il selettore con `="1"` metteva il marcatore dell'app nella pagina del sito (test `headers.spec.ts`).

**Da verificare a mano (Roberto)**
- Su iPhone Safari dopo il deploy: riga unica, tocco dei pulsanti, leggibilità dei pin a 28 px con poca luce, barra in basso con la barra di Safari.
- WebKit non è nel container: lo verifica la CI.
- Le due prove native preesistenti e la versione di Chromium del container (1243, non quella attesa da Playwright 1.64) meritano uno sguardo in CI.
- Sotto i 480 px la barretta della copertura non si vede più (scelta dichiarata nell'ADR 0048).

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
