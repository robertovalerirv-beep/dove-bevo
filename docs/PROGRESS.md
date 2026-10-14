# Diario di avanzamento

Una voce per sessione, la più recente in alto. Ogni voce: data, milestone, cosa è stato fatto, prove (comandi ed esito), cosa resta, cosa verificare a mano.

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
- Identità git del solo repository: Roberto Valeri <roberto.valeri.rv@gmail.com>.
- Commit iniziale su `main` e tag `spec-approved` (base della guardia della feature list, D-21).

**Prossimo passo**
`/clear`, poi il prompt di ripresa (BRIEF sezione 17) con milestone **M0**. Prerequisiti M0 per Roberto: SPEC sezione 21.
