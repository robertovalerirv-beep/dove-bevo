# Dove bevo — Specifica della Fase 0

> **Versione 1.7 · 21/10/2026 · la 1.7 toglie dalla mappa la frase della zona senza prezzi («Qui nessuno ha ancora segnato un prezzo…»): appesantisce la schermata e non dà valore (7.1, D-28, MB-13); è decisa da Roberto il 21/10/2026 in chat, e vale con il tag `spec-approved-8`. Storico: versione 1.6 · 21/10/2026 · la 1.6 sostituisce la lista dei drink con i nove voluti da Roberto, senza formati né millilitri in nessun punto (ADR 0028), e al posto della riga di chip mette un solo menu «Scegli cosa bere» a caselle multiple, con il prezzo più basso tra i drink scelti sul segnaposto (7.1, 6, D-04, M1-09, MC-01…MC-04); è decisa da Roberto il 21/10/2026 in chat, e valeva con il tag `spec-approved-7`. Storico: versione 1.5 · 21/10/2026 · la 1.5 porta l'Annulla da 10 a 5 secondi, riduce la barra della mappa ai soli due tasti "Aggiungi prezzo" e "Aggiungi locale mancante" ("Elenco" diventa un'icona sulla mappa, "Manda la mappa a un amico" sparisce) e fissa che la mappa non cambia mai altezza (ADR 0027, D-15, D-28, M1-16); è decisa da Roberto il 21/10/2026 in chat, e vale con il tag `spec-approved-6` (la 1.4 e il tag `spec-approved-5` stanno sul ramo `brand-v2-map`, non unito a `main`). Storico: versione 1.3 · 16/10/2026 · la 1.3 aggiunge la brand identity v1 (ADR 0023) e la ricerca dei bar per nome in tutta Italia (ADR 0024); è approvata da Roberto il 16/10/2026 in chat, e vale con il tag `spec-approved-4`. Storico: versione 1.2 · 15/10/2026 · la 1.2 aggiunge la dashboard di copertura in `/admin` (ADR 0022, M5-11…M5-16) ed è autorizzata da Roberto il 15/10/2026 in chat, e valeva con il tag `spec-approved-3`; versione 1.1 · 14/10/2026 · la 1.0 è approvata da Roberto l'11/10/2026 (tag `spec-approved`); la 1.1 è autorizzata da Roberto il 13/10/2026 (prompt v3.2) e il 14/10/2026 in chat, e valeva con il tag `spec-approved-2`.**
>
> **Registro delle modifiche 1.7:** la frase "Qui nessuno ha ancora segnato un prezzo. Il primo sei tu: ci vogliono 10 secondi." (zona con copertura sotto il 5%) non compare più in nessun punto; la zona senza prezzi è la stessa schermata delle altre, con la stessa barra a due tasti, la legenda e l'invito all'installazione dove previsti; voce MB-13 riscritta, soglia del 5% eliminata dal codice. Nessuna modifica a schema, API e scritture.
>
> **Registro delle modifiche 1.6:** (1) catalogo di 9 drink (Birra media, Spritz, Negroni, Sbagliato, Gin tonic, Gin lemon, Calice di vino, Analcolico, Acqua) che sostituisce il vecchio: tolti birra 0,2 e 0,5 l, bottiglia, prosecco e bibita (6, D-04); (2) il concetto di formato sparisce: un prezzo per bar, drink e fascia, `size_ml` esce da schema, API, formato compatto e interfaccia (8, 9.2, D-12, D-26, 11); migrazione `0006_no_sizes.sql`, che archivia in `archive_sizes_*` le righe dei drink tolti; (3) la riga di chip della mappa diventa il menu «Scegli cosa bere» a caselle multiple; con più drink il segnaposto mostra il prezzo più basso e la copertura conta i bar con almeno uno dei drink (7.1); (4) voci M1-09, M1-15, M1-16, M2-08, M2-12, MB-05, MB-10 riscritte, nuove MC-01…MC-04. Il bottone primario resta «Aggiungi prezzo»; la barra a due tasti della 1.5 non cambia.
>
> **Registro delle modifiche 1.3:** (1) brand identity v1 da `docs/brand/` (ADR 0023, sostituisce l'ADR 0011 per i valori visivi): temi Bancone e Fuori orario, token generati da `docs/brand/tokens.json`, Bricolage Grotesque e Geist Mono, gradini Affare/Giusto/Salato con glifo, pin su canvas, scontrino, timbro, copertura e Tessera, nuovo vincolo 2.10; (2) mappa scura in Fuori orario (D-27, deroga a 4 e al MASTER di M0); (3) "Aggiungi locale mancante" esce dalla mappa (D-28); (4) Tessera (D-29); (5) ricerca dei bar per nome in tutta Italia con indice statico a frammenti, senza server (D-30, ADR 0024): M4-06 sostituita da M4-11…M4-16; (6) parole vietate nei testi (D-31); (7) limiti della ricerca (D-32); (8) budget font ≤ 70 KB (15); (9) nuove voci MB-01…MB-17 (sezione 18) e milestone MB (19). Il bottone primario resta "Aggiungi prezzo"; nessuna modifica a schema, migrazioni, API e scritture.
>
> **Registro delle modifiche 1.2:** nuova dashboard di copertura in `/admin` (7.9), calcolata solo con il pulsante «Aggiorna»: bar con almeno un prezzo pubblico per città e avanzamento verso il gate (150 bar nel Comune di Milano); sei nuove voci M5-11…M5-16 nella sezione 18; nessuna modifica a schema, migrazioni e scritture.
>
> **Registro delle modifiche 1.1:** (1) tolta la lettura dei listini con AI: sezioni 7.4, 10, 13.4–13.5, D-09, D-17, D-25 e M3-01…M3-10 (ADR 0018); (2) bar proposti dagli utenti, li rende pubblici solo l'admin: 7.5, 7.9, D-05, M4-01/M4-02 sostituite da M3-11…M3-14 (ADR 0019); (3) nuovi vincoli: l'utente non paga mai, nessuna AI (2.7); (4) nuove funzionalità M3-15…M3-20: "Vicino a me" diagnosticabile, "Aggiungi un altro drink qui", inserimento da listino, degrado gentile, lettura delle celle a costo costante (ADR 0020); (5) codici di errore: aggiunti `conflict` 409 e `busy` 503, tolto `ai_paused`.
> Fonte: `docs/BRIEF.md` v2 più l'intervista dell'11/10/2026 (decisioni in sezione 3). Questo documento è autosufficiente: in caso di conflitto **prevale SPEC sul BRIEF**. Le funzionalità e le loro verifiche (sezione 18) sono copiate in `docs/feature_list.json`; dopo l'approvazione cambia solo il campo `passes`.

---

## 1. Prodotto

**Dove bevo** è una mappa gratuita dei bar italiani con i prezzi reali di birre e drink, inseriti dagli utenti. Entro in un bar, ordino uno spritz, apro l'app e in pochi secondi registro quanto l'ho pagato. Chiunque vede dove si beve a quale prezzo, vicino a sé o in qualsiasi città.

- Nome in una sola costante: `APP_NAME = "Dove bevo"` in `src/shared/config.ts`.
- Dominio in una sola costante: `APP_DOMAIN = "dovebevo.example"` (segnaposto fino a M6). Staging su `*.workers.dev`.
- Utente tipo: 20–45 anni, telefono in mano, poco tempo. Servizio destinato a maggiorenni.
- Rischio principale: **mappa vuota**. Ogni scelta riduce il costo di un contributo (pochi tocchi, più drink per bar, inserimento da listino dell'admin) e mostra valore anche con pochi prezzi (bar sempre visibili, freschezza chiara).

## 2. Vincoli non negoziabili

1. **Nessuna registrazione**, né per consultare né per contribuire.
2. **Inserire un prezzo richiede al massimo 4 tocchi più le cifre**: `Aggiungi prezzo` → bar (proposto per vicinanza) → drink → cifre → `Salva`.
3. **Nessun onboarding, nessun cookie banner**: solo il cookie tecnico di sessione (13.2), nessun tracciamento.
4. **Costo fisso zero**: piani gratuiti Cloudflare, mappe OpenFreeMap, GitHub pubblico. Nessuna spesa variabile; mai passare a un piano a pagamento per far funzionare l'app.
5. **Privacy per costruzione**: le regole della sezione 14 sono vincolanti come questa lista.
6. **Accessibilità WCAG 2.2 AA** e reattività da app nativa su un telefono di fascia media.
7. **Nessuna AI e nessun pagamento** (v1.1, ADR 0018): l'app non usa modelli linguistici (AI Act art. 50 non applicabile) e l'utente non paga mai, in nessuna forma: niente abbonamenti, paywall, donazioni obbligatorie, account, pubblicità profilata, codice di pagamento.
8. **Attribuzioni sempre visibili** sulla mappa: OpenFreeMap, © OpenMapTiles, © OpenStreetMap contributors (ODbL).
9. **Codice minimo**: meno codice e meno dipendenze sono un requisito. Prima di aggiungere un modulo si verifica se browser, Workers o SQLite fanno già il lavoro.
10. **Identità visiva da una sola fonte** (v1.3, ADR 0023): colori, tipografia, spazi, raggi, ombre e bordi vengono solo da `docs/brand/tokens.json`, che genera `src/app/styles/tokens.css` e i colori del manifest; nessun esadecimale fuori dai file generati. Il colore non è mai l'unico segnale (glifo, numero e bordo `ink`). Movimento solo con CSS e Web Animations API, spento da `prefers-reduced-motion`. Nessun dato nuovo: copertura, prezzi suggeriti e Tessera si calcolano sul dispositivo da dati già scaricati o già conservati (12), senza richieste a `/api/*`, righe D1 o chiavi `localStorage` in più. CSP invariata.

Ordine di priorità in caso di conflitto: vincoli → sicurezza e privacy → accessibilità → codice minimo → design system.

## 3. Decisioni dell'intervista e chiarimenti

| ID | Tema | Decisione |
|---|---|---|
| D-01 | Dominio | Segnaposto `dovebevo.example` in `APP_DOMAIN`; il dominio vero arriva in M6. Cache API inattiva su `workers.dev` (accettato). |
| D-02 | Repository | GitHub **pubblico**: Actions, Dependabot e secret scanning gratuiti. |
| D-03 | Dati OSM | I file dei bar sono **generati a ogni deploy** dal job CI (sezione 5.3). Il PBF scaricato è messo in cache di Actions con chiave = data del file Geofabrik, così più deploy nello stesso giorno non lo riscaricano. In locale e negli e2e si usa un **fixture versionato** (alcune celle di Milano) in `tests/fixtures/data/`. |
| D-04 | Catalogo | 9 drink e limiti della sezione 6, senza formati. Le voci del menu «Scegli cosa bere» della mappa sono le stesse che si possono inserire (sezione 6). |
| D-05 | Bar pending | Visibili **solo nella scelta del bar di "Aggiungi prezzo"**, con etichetta "Nuovo, da confermare". Mai sulla mappa finché l'admin non li approva (v1.1: conferme e prezzi non approvano più, ADR 0019). |
| D-06 | Eventi | `POST /api/events` è **esente da sessione e da `Content-Type: application/json`** (`sendBeacon` invia `text/plain`). Protezioni: `Origin`, body ≤ 2 KB, schema chiuso zod, ≤ 10 eventi, rate limit per IP-HMAC. Scrive solo contatori aggregati. |
| D-07 | Segnalazioni | Solo motivi a scelta chiusa, nessun testo libero (sezione 7.2). |
| D-08 | Ricerca città | `places.json` contiene solo `place=city` e `place=town`. |
| D-09 | Quota foto | Rimosso in 1.1 (ADR 0018). |
| D-10 | Prezzi in quarantena | Non compaiono sulla mappa; nella scheda bar compaiono nella sezione "In verifica" con "Confermo". Una conferma da un'altra sessione (o lo stesso prezzo inserito da un'altra sessione) li attiva. |
| D-11 | Formato dei file cella | Oggetto `{ "c": [[cityId, "Nome"]], "v": [[key, name, kind, lat, lon, addr, ci]] }`: `ci` indicizza la tabella città **del file**, `cityId` è l'ID del nodo OSM del luogo. Motivo: i dati si rigenerano a ogni deploy, quindi un indice in `places.json` non sarebbe stabile tra versioni. |
| D-12 | Colori sulla mediana | Solo con ≥ 5 prezzi attivi dello stesso drink nella cella, fascia normale. Più economico (**Affare**, `↓`) < 0,9 × mediana, più caro (**Salato**, `↑`) > 1,1 × mediana, altrimenti nella media (**Giusto**, `=`; nomi e glifi dalla v1.3). Sotto 5 prezzi: colore neutro. Soglie in configurazione. Il valore è sempre scritto. |
| D-13 | Happy hour | La mappa mostra il prezzo normale; se esiste solo quello in happy hour lo mostra con l'etichetta "HH". La scheda bar mostra entrambi. |
| D-14 | Fuso orario | Ogni "giorno" (data del prezzo, quote, sale giornaliero, budget AI) è calcolato in `Europe/Rome`. |
| D-15 | Annulla | Il prezzo parte allo scadere dei 5 s (`UNDO_MS` in `src/shared/config.ts`: una sola costante per timer, barra di avanzamento e testi) **oppure** quando la pagina passa in background (`visibilitychange` → `hidden`), con `fetch(..., { keepalive: true })`: chiudere l'app non è un annullamento. |
| D-16 | Bar più vicini | Calcolati sul dispositivo dalla posizione se concessa, altrimenti dal centro della mappa. |
| D-17 | Tetto AI per ambiente | Rimosso in 1.1 (ADR 0018). |
| D-18 | Fonte del prezzo | `prices_current` ha la colonna `source` (fonte dell'ultima osservazione). In 1.1 l'API accetta solo `manual`. |
| D-19 | Admin | Cloudflare Access protegge `/admin*` e `/api/admin/*`; il Worker verifica comunque il JWT `Cf-Access-Jwt-Assertion` (firma RS256 con WebCrypto, `aud` e scadenza). Rotte admin aggiunte alla tabella API. |
| D-20 | Configurazione Claude Code | Proposta in `.claude/settings.proposed.json`; diventa `.claude/settings.json` solo dopo approvazione. Gli hook usano `node` per leggere il JSON (niente `jq` su Windows); "migrazione già applicata" = file presente sul branch `main`. |
| D-21 | Guardia della feature list | All'approvazione si crea il tag git `spec-approved`. La CI confronta `docs/feature_list.json` con la versione del tag ignorando solo `passes`. |
| D-22 | Rate Limiting binding | Disponibilità sul piano gratuito da verificare in M0; se manca si usano solo le quote D1 e Roberto viene avvisato. |
| D-23 | Età | Nessuna verifica dell'età (vietato l'onboarding): "servizio per maggiorenni" in `/regole` e nel piè di pagina. |
| D-24 | Ambiente di sviluppo | Windows con Git Bash: script npm multipiattaforma (niente `rm -rf`, si usa Node), `init.sh` eseguito con Git Bash. L'import OSM completo gira solo in CI (Linux); in locale opzionale via WSL. |
| D-25 | Foto per le evals | Rimosso in 1.1 (ADR 0018). |
| D-26 | Storico di un bar | `GET /api/venues/:key/prices` restituisce al massimo le ultime 10 osservazioni per drink, solo data. |
| D-27 | Mappa scura (v1.3) | In Fuori orario la mappa usa uno stile derivato da OpenFreeMap Dark; in Bancone uno derivato da Positron. Entrambi generati da `scripts/build-map-styles.mjs` con i token `map-*` e serviti da `public/map/` con cache immutabile; tessere, glifi e sprite restano su `tiles.openfreemap.org`. Decisione di Roberto del 16/10/2026 (deroga a 4 e al MASTER di M0). **Dal 19/10/2026 (ADR 0025) il tema si sceglie dall'ora del dispositivo, non dall'impostazione del sistema:** Bancone dalle 06:00 alle 21:29, Fuori orario dalle 21:30 alle 05:59. |
| D-28 | Barra della mappa (v1.3, rivista in 1.5) | La barra in basso ha sempre e solo due tasti: "Aggiungi prezzo" e "Aggiungi locale mancante" (7.5). Ciò che la vista mostra non ne cambia mai l'altezza, altrimenti la mappa si ridimensiona, ricarica le celle e salta (M1-16): la legenda e l'invito all'installazione (7.7) sono scritti sulla mappa, "Elenco" è un'icona sulla mappa. "Manda la mappa a un amico" non esiste più (basta copiare l'indirizzo del sito). Il bar mancante si raggiunge anche dal passo Bar di "Aggiungi prezzo" e dalla ricerca senza risultati. |
| D-29 | Tessera (v1.3) | Timbri a 1, 5, 10, 25 e 50 prezzi inseriti, dal contatore già in `localStorage` (12). Nessun dato sul server, nessuna chiave nuova, nessuna classifica. |
| D-30 | Ricerca per nome (v1.3) | Qualunque bar OSM d'Italia si trova per nome dalla casella di ricerca, con un indice statico a frammenti per prefisso di parola generato all'import (5.1, ADR 0024). Zero richieste a `/api/*` e zero letture D1 per ricerca. Nessuna ricerca per quartiere. |
| D-31 | Parole vietate (v1.3) | Un test fallisce se `it.ts` contiene, senza accenti e per radice: «sbronz», «ubriac», «sballo», «shot», «chupito», «brindis», «brinda», «bevi di più», «bere di più», «a volontà», «open bar», «senza limiti», «tracanna», «alcolic» (escluso «analcolico»). Elenco approvato da Roberto il 16/10/2026; si aggiorna solo con il suo ok. Si parla di prezzi e posti, mai di bere tanto (L. 125/2001, art. 13). |
| D-32 | Limiti della ricerca (v1.3) | Non si trovano per nome i 997 bar con nomi fatti solo di parole vuote («Bar», «Caffè»). **Dal 19/10/2026 (ADR 0025) i bar utente approvati si trovano per nome**, da `GET /api/venues/approved` (una lettura per visita, senza il testo digitato). I bar nascosti dall'admin restano nei frammenti: dopo la scelta la cella li segnala (`h`, ADR 0017) e compare «Questo locale non è più sulla mappa». Decisioni di Roberto del 16/10/2026. |

## 4. Stack e architettura

**Principio:** ciò che cambia una volta al mese (i bar) è **statico**; ciò che cambia ogni minuto (i prezzi) sta in **D1**. Il Worker esegue solo `/api/*`.

- **Hosting:** un solo Cloudflare Worker con static assets. In `wrangler.jsonc` (Wrangler ≥ 4.20):
  ```jsonc
  "assets": { "directory": "./dist/client", "binding": "ASSETS",
              "not_found_handling": "single-page-application", "run_worker_first": ["/api/*"] },
  "observability": { "enabled": true, "logs": { "invocation_logs": false } }
  ```
  Le richieste agli asset non eseguono il Worker. I log di invocazione sono spenti: si logga solo ciò che scriviamo noi (13.8).
- **Ambienti:** `staging` e `production`, ciascuno con Worker, D1 e segreti propri. Un Cron Trigger giornaliero per ambiente.
- **Binding e variabili:** `ASSETS`, `DB` (D1), `RATE_LIMITER` (se disponibile), vars `DATA_VERSION`, `TURNSTILE_SITE_KEY`, `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`; segreti `TURNSTILE_SECRET`, `SESSION_HMAC_KEY`, `HASH_KEY`.
- **Frontend:** Vite + Preact + TypeScript strict, CSS con custom properties, niente Tailwind. Nessun router di terze parti: le viste (mappa, scheda bar, aggiungi prezzo, revisione listino, ricerca, privacy, regole, admin) sono gestite con `history` nativa.
- **Mappa:** MapLibre GL JS, stili derivati da OpenFreeMap `positron` (Bancone) e `dark` (Fuori orario), D-27. Import dinamico avviato subito in parallelo alla shell; worker di MapLibre servito da noi con `setWorkerUrl` (niente `blob:`). Clustering nativo della sorgente GeoJSON.
- **Backend:** Hono su `/api/*`; **zod solo nel Worker** (nel client bastano i tipi condivisi).
- **Codice condiviso** in `src/shared/`: `config.ts`, `catalog.ts`, `geohash.ts` (encoder scritto da noi, ~30 righe), `api-types.ts` (tipi e formati compatti).
- **Database:** D1 per prezzi, conferme, segnalazioni, bar utente, contatori. Catalogo nel codice. Accesso ai dati in un modulo unico (`src/worker/lib/db.ts`).
- **Anti-bot:** Turnstile, caricato solo al primo contributo, validato server-side.

### 4.1 Dipendenze consentite (versioni esatte, lockfile)
- Runtime: `preact`, `maplibre-gl`, `hono`, `zod`.
- Sviluppo: `vite`, `@preact/preset-vite`, `@cloudflare/vite-plugin`, `wrangler`, `typescript`, `vitest`, `@cloudflare/vitest-pool-workers`, `@playwright/test`, `@axe-core/playwright`, `eslint`, `prettier`, `@lhci/cli`. (Eventuali pacchetti di configurazione di ESLint/TypeScript strettamente necessari vanno chiesti con motivo e peso.)
- Import OSM: `osmium-tool` da riga di comando più uno script Node senza dipendenze.
- Ogni altra dipendenza va chiesta con motivo e peso in KB gzip.

## 5. Dati statici dei bar

### 5.1 Import OSM (`scripts/osm-import/`)
1. Scarica `italy-latest.osm.pbf` da Geofabrik.
2. `osmium tags-filter` su nodi e aree (way chiuse e relation multipolygon) con `amenity` in `cafe`, `bar`, `pub`, `biergarten`, `nightclub` e sui nodi `place` in `city`, `town`. `osmium export` in GeoJSON-seq; le aree diventano un punto (centroide calcolato dallo script).
3. Lo script Node (nessuna dipendenza) produce `public/data/<DATA_VERSION>/`:
   - `v/<geohash5>.json` (D-11): `{ "c": [[cityId, "Milano"], ...], "v": [[key, name, kind, lat, lon, addr, ci], ...] }`.
     - `key`: `n123` / `w456` / `r789` (tipo e ID OSM). `kind`: 0 cafe, 1 bar, 2 pub, 3 biergarten, 4 nightclub. Coordinate a 5 decimali. `addr`: via e civico da `addr:*`, stringa vuota se assente. `ci`: indice in `c`, `-1` se nessuna città entro 15 km. `cityId`: ID del nodo OSM del `place` più vicino.
     - Bar senza `name` esclusi.
   - `places.json`: `[[cityId, name, lat, lon, nBars], ...]` ordinato per `nBars` decrescente, caricato al primo uso della ricerca.
   - `s/<prefisso>.json` (v1.3, ADR 0024): `[[key, name, lat, lon, cityId], ...]`, i bar con una parola del nome che inizia col prefisso di 2 caratteri (3 se il frammento supera 40 KB gzip); `s/index.json` elenca i prefissi divisi. Stessa normalizzazione del client (`src/shared/venue.ts`). Lo script fallisce se un frammento supera 40 KB gzip.
   - `LICENSE.txt`: database derivato da OpenStreetMap, ODbL 1.0, con attribuzione.
4. `DATA_VERSION` = data del PBF (`YYYYMMDD`, dal timestamp di replica del file).
5. Lo script **fallisce** se i file totali superano 15.000 (limite piattaforma 20.000) o se un file supera 1 MB, e se un bar o una città non validano (coordinate fuori dal riquadro Italia, nome > 120 caratteri).
6. Un bar sparito da OSM sparisce dai file; i suoi prezzi restano in D1 come storico.

### 5.2 Licenza (ADR 0003)
I prezzi sono dati nostri collegati agli ID OSM e **non vengono mai scritti negli stessi file né nelle stesse proprietà dei dati OSM**, così restano fuori dallo share-alike secondo le linee guida OSMF sui database collettivi.

### 5.3 Consegna al deploy (D-03)
- Il job di deploy: ripristina dalla cache di Actions il PBF del giorno (chiave = `Last-Modified` di Geofabrik), altrimenti lo scarica; esegue l'import; scrive `public/data/<DATA_VERSION>/`; imposta la var `DATA_VERSION`; esegue `wrangler deploy`. Se l'import fallisce, il deploy fallisce: nessun deploy con dati parziali.
- `public/data/` è in `.gitignore`. I file hanno `Cache-Control: public, max-age=31536000, immutable` via `public/_headers`.
- Sviluppo locale ed e2e: `init.sh` copia `tests/fixtures/data/` in `public/data/fixture/` con `DATA_VERSION=fixture`. Il fixture è un estratto reale (alcune celle di Milano centro) con il suo `LICENSE.txt`.

### 5.4 Flusso di lettura della mappa
- Sotto zoom 13: solo tessere e invito "Avvicinati o cerca una città".
- Da zoom 13: il client calcola le celle geohash5 visibili (al massimo 12; oltre, mostra l'invito ad avvicinarsi), scarica i file statici e chiama `GET /api/prices/:cell` per ciascuna. Le celle già scaricate restano in memoria per la visita.
- `GET /api/prices/:cell` legge `prices_current` per indice e `venues_user` della cella, restituisce array compatti (9.2), cache edge con Cache API per 60 s (inattiva su `workers.dev`). Obiettivo: < 2 ms di CPU per richiesta, misurato in M1.

## 6. Catalogo drink (`src/shared/catalog.ts`)

Dalla 1.6 un drink non ha formato né millilitri: un prezzo per bar, drink e fascia, e nessuna misura scritta in nessun punto dell'interfaccia o del codice. I limiti sono inclusivi, in euro; fuori limite → rifiuto con messaggio gentile.

| Codice | Nome | Limiti € |
|---|---|---|
| `beer_draft` | Birra media | 2,50–12 |
| `spritz` | Spritz | 2,50–15 |
| `negroni` | Negroni | 4–20 |
| `sbagliato` | Sbagliato | 4–20 |
| `gin_tonic` | Gin tonic | 4–20 |
| `gin_lemon` | Gin lemon | 4–20 |
| `wine_glass` | Calice di vino | 2–15 |
| `alcohol_free` | Analcolico | 2–12 |
| `water` | Acqua | 0,50–6 |

Menu della mappa (v1.6): un solo pulsante «Scegli cosa bere» apre un elenco a caselle, una per drink, nell'ordine della tabella e con gli stessi nomi della griglia di "Aggiungi prezzo": ciò che si filtra si può inserire e viceversa. La scelta è multipla, resta almeno un drink spuntato (l'ultima casella non si toglie), il predefinito è la Birra media e la scelta resta in memoria per la visita. Con più drink la mappa mostra i bar che ne hanno almeno uno, ciascuno con il prezzo più basso tra i scelti (a parità, il più recente); il colore (D-12) è giudicato sulla mediana del drink di quel prezzo.

## 7. Funzionalità

Ogni funzionalità ha una verifica end-to-end nella sezione 18 (ID tra parentesi).

### 7.1 Mappa (schermata iniziale) — M1, M4
- Si apre sull'Italia. **"Vicino a me"** chiede la posizione e centra la mappa (zoom 15); senza permesso tutto funziona con la ricerca. La posizione resta sul dispositivo (14).
- Menu **«Scegli cosa bere»** (sezione 6): un solo pulsante apre l'elenco a caselle dei drink. I segnaposto mostrano il prezzo più basso tra i drink scelti; i bar senza prezzo restano visibili e discreti. Clustering nativo.
- Colore rispetto alla mediana della cella (D-12), sempre con il valore scritto. Calcolato sul client dai dati della cella.
- Prezzi con `observed_on` oltre 90 giorni marcati "da confermare".
- Barra in basso fissa, sempre di una sola riga: **"Aggiungi prezzo"** (primario) e "Aggiungi locale mancante" (D-28). "Elenco" è un'icona sulla mappa, in alto a destra, di fronte alla riga di stato.
- **Copertura** (v1.3): "X bar su N qui hanno un prezzo" (un prezzo di almeno uno dei drink scelti; un bar vale una volta), dai dati già caricati. **Legenda** "↓ Affare · = Giusto · ↑ Salato" solo quando la zona ha i colori attivi (D-12).
- Attribuzioni sempre visibili.
- **Alternativa accessibile**: icona "Elenco" sulla mappa con la lista dei bar visibili (nome, prezzo del drink scelto, distanza se nota), navigabile da tastiera e screen reader; ogni voce apre la scheda bar.

### 7.2 Scheda bar — M1 (lettura), M2 (azioni)
- Nome, indirizzo, tipo, città; prezzi per drink con data (solo giorno), numero di conferme, etichetta "HH" se happy hour; sezione "In verifica" per i prezzi in quarantena (D-10).
- Azioni per prezzo: **"Confermo"** (1 tocco), **"È cambiato"** (apre l'inserimento precompilato con bar, drink e fascia), **"Segnala un errore"** con motivi: Prezzo sbagliato (`wrong_price`), Bar chiuso definitivamente (`closed`), Bar inesistente (`not_exists`), Nome o indirizzo errato (`wrong_info`), Contenuto offensivo (`offensive`).
- Link "Indicazioni" in uscita: `geo:` su Android, Apple Maps su iOS, OpenStreetMap altrove; solo coordinate del bar.
- URL condivisibile `/bar/<key>?c=<cell>`.

### 7.3 Aggiungi prezzo — M2
1. `Aggiungi prezzo`.
2. **Bar**: i 5 più vicini (D-16), calcolati sul dispositivo dai file statici già scaricati (se la zona non è ancora caricata, il client scarica le celle intorno al punto); oppure ricerca per nome tra i bar caricati. In fondo: i bar pending della cella (D-05) e "Non trovi il bar?".
3. **Drink**: griglia del catalogo, un tocco sceglie il drink (nessun formato da scegliere).
4. **Prezzo**: tastierino numerico (`inputmode="decimal"`), formato euro con virgola, interruttore "Happy hour", `Salva`.
- Conteggio: dalla mappa, `Aggiungi prezzo` (1) → bar (2) → drink (3) → cifre → `Salva` (4).
- Nel passo Prezzo (v1.3): i **prezzi già visti in zona** per lo stesso drink, toccabili al posto delle cifre (dati della cella già caricati); con almeno 5 prezzi la riga "In zona va da X a Y €, mediana Z €".
- Dopo `Salva`: messaggio breve "Prezzo salvato" con **Annulla** per 5 s (D-15), nella forma del **Timbro** con la data del giorno, la Copertura con "+1" e la Tessera (D-29); l'invio parte allo scadere o al passaggio in background (D-15). Annullare non genera richieste.
- Al primo contributo della visita: Turnstile e sessione (13.2), in modo trasparente se possibile.
- Errori (fuori limite, quota, rete) annunciati con `aria-live` e con il prezzo ancora modificabile.

### 7.4 Foto del listino (AI) — rimossa in 1.1
Rimossa con l'ADR 0018. Compenso: dopo `Salva`, "Aggiungi un altro drink qui" (stesso bar, un'unica `POST /api/prices`) e, in `/admin`, l'inserimento da listino (7.9).

### 7.5 Bar mancante — M3 (v1.1, ADR 0019)
- Dentro `Aggiungi prezzo`, passo "Bar": "Non trovi il bar?" → nome (2–80 caratteri) → tipo (bar, pub, locale serale) → pin sulla mappa (la posizione del bar, mai quella del dispositivo, arrotondata a 5 decimali, mappa a zoom ≥ 16) → conferma. Prima dell'invio il dispositivo mostra fino a 3 bar noti entro 150 m con nome simile. `POST /api/venues` → `venues_user` con stato `pending`; duplicato (nome normalizzato uguale entro 50 m da un bar OSM, proposto o approvato) → 409 con la chiave esistente.
- **Solo l'approvazione dell'admin rende pubblico un bar.** Nessuna approvazione automatica: né conferme, né prezzi inseriti. I pending compaiono solo nella scelta del bar (D-05, "Nuovo, da confermare"); i loro prezzi restano non pubblici, e fuori dalla mediana, finché il bar non è approvato. Tetto di 200 proposte in attesa.
- Approvato → `GET /api/prices/:cell` lo include con chiave `u<id>` e i prezzi diventano visibili; rifiutato → `removed`, resta come traccia 30 giorni e blocca lo stesso nome nello stesso punto.

### 7.6 Ricerca — M1, M4
- Città e paesi da `places.json` (D-08), confronto senza accenti e maiuscole, per prefisso e poi per sottostringa, al massimo 8 risultati ordinati per numero di bar.
- Bar per nome **in tutta Italia** (v1.3, D-30, ADR 0024): da 3 caratteri, frammento statico della prima parola significativa; ogni parola digitata è prefisso di una parola del nome; al massimo 8 bar insieme alle città; ordine: nome esatto, inizio del nome, distanza dal centro mappa o dalla posizione (solo se il permesso è già concesso, mai chiesto), alfabetico. La scelta porta la mappa a zoom 17 e apre la scheda. Nessun risultato: "Non trovo questo locale" e "Non trovi il bar?" col nome già scritto. Limiti in D-32.
- Lista **"I più economici qui"** per il drink scelto nell'area visibile (prezzi attivi, al massimo 10, prezzo crescente, poi data più recente). M4.
- Nessuna ricerca lato server: nessun testo digitato lascia il dispositivo. Una sola richiesta per visita, `GET /api/venues/approved` (ADR 0025), porta l'elenco dei bar utente approvati; per il resto zero richieste a `/api/*` e zero letture D1 per ricerca.

### 7.7 PWA — M4
- Manifest, icone, installabile. Service worker scritto a mano: precache della shell (HTML, JS, CSS, font, icone) con nome versionato, nessuna cache di `/api/*` né di `/data/*` né delle tessere.
- Offline: la shell si apre e mostra "Sei offline: la mappa e i prezzi tornano con la connessione".
- Invito all'installazione solo dopo il secondo prezzo inserito (`beforeinstallprompt` dove disponibile; su iOS un suggerimento testuale una sola volta).

### 7.8 Pagine legali — M5
- `/privacy`: bozza da `PRIVACY-NOTES.md` (poi informativa iubenda, a cura di Roberto).
- `/regole`: cosa si inserisce, come si segnala, come un gestore chiede una correzione via email, servizio per maggiorenni.
- Link a entrambe nel piè di pagina della mappa e nella scheda bar.

### 7.9 Admin — M5
- `/admin` dietro Cloudflare Access (D-19): tre code con contatori e totale: **nuovi bar da confermare** (approva o rifiuta l'admin, mai in automatico; nome e tipo correggibili), **bar da cancellare da confermare** ("Elimina dalla mappa" o "Ignora"), **prezzi da rivedere** (`review` e `quarantined`); strumenti: ricerca e nascondi voci che non sono bar, aggiungi un bar, inserimento da listino con data di osservazione; metriche giornaliere (sezione 12); copertura per città = bar con almeno un prezzo attivo (D1) / bar totali (`places.json`).
- **Dashboard di copertura (v1.2, ADR 0022):** sezione in cima a `/admin`, calcolata **solo** quando si preme «Aggiorna» (nessun timer, polling o calcolo all'apertura); `GET /api/admin/coverage`, senza cache, con un minimo di 10 s tra due calcoli. «Bar con almeno un prezzo» = bar visibile sulla mappa con almeno un prezzo `active` (non contano quarantena, `review`, `removed`, bar utente non approvati, bar OSM nascosti). Mostra bar coperti, città coperte, prezzi pubblici, avanzamento verso il gate (Comune di Milano, 150 bar) e una tabella per città (bar con prezzo, bar totali da `places.json`, copertura, prezzi pubblici, ultimo inserimento); ogni bar ha una città: se il dato non la riporta (bar utente, bar OSM a più di 15 km da un luogo) il Worker usa il luogo più vicino di `places.json`; i bar utente approvati si sommano ai bar totali della loro città; la riga «Senza città» compare solo se la posizione di un bar è sconosciuta; toccando il nome di una città si apre l'elenco dei suoi locali con almeno un prezzo pubblico (nome, indirizzo, prezzi con data, link alla scheda), con un link secondario «Vedi sulla mappa». Costo: una scansione di `prices_current` (soglia 5.000 righe, avviso a 4.000 prezzi attivi).

## 8. Dati in D1

Nessuna tabella contiene dati personali. Migrazioni in `migrations/`, mai modificate dopo l'applicazione.

```sql
CREATE TABLE prices_current (            -- un prezzo valido per bar, drink, fascia (dalla 1.6, migrazione 0006: senza formato)
  venue_key TEXT NOT NULL, drink TEXT NOT NULL, hh INTEGER NOT NULL DEFAULT 0,
  cell TEXT NOT NULL, city INTEGER, price_cents INTEGER NOT NULL, observed_on TEXT NOT NULL,
  confirmations INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','quarantined','review','removed')),
  source TEXT NOT NULL CHECK (source IN ('manual','menu_photo')),
  PRIMARY KEY (venue_key, drink, hh)) WITHOUT ROWID;
CREATE INDEX pc_cell ON prices_current (cell, drink);

CREATE TABLE price_obs (                 -- storico, una riga per contributo
  id INTEGER PRIMARY KEY, venue_key TEXT NOT NULL, drink TEXT NOT NULL,
  hh INTEGER NOT NULL, price_cents INTEGER NOT NULL, observed_on TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('manual','menu_photo')), status TEXT NOT NULL);
CREATE INDEX po_venue ON price_obs (venue_key, drink);

CREATE TABLE venues_user (id INTEGER PRIMARY KEY, name TEXT NOT NULL, kind INTEGER NOT NULL,
  lat REAL NOT NULL, lon REAL NOT NULL, cell TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','approved','removed')),
  confirmations INTEGER NOT NULL DEFAULT 0);
CREATE INDEX vu_cell ON venues_user (cell, status);

CREATE TABLE reports (id INTEGER PRIMARY KEY, venue_key TEXT NOT NULL, drink TEXT, hh INTEGER,
  reason TEXT NOT NULL CHECK (reason IN ('wrong_price','closed','not_exists','wrong_info','offensive')), day TEXT NOT NULL);
CREATE TABLE dedup (k TEXT PRIMARY KEY, day TEXT NOT NULL) WITHOUT ROWID;   -- conferme, segnalazioni, token monouso
CREATE TABLE counters (k TEXT NOT NULL, day TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (k, day)) WITHOUT ROWID;
-- ai_usage: eliminata dalla migrazione 0004 (v1.1). Il valore 'menu_photo' di source resta ammesso dallo schema (migrazioni già applicate) ma l'API non lo accetta.
CREATE TABLE metrics_daily (day TEXT NOT NULL, event TEXT NOT NULL, prop TEXT NOT NULL, n INTEGER NOT NULL,
  PRIMARY KEY (day, event, prop)) WITHOUT ROWID;
```

- **Scrittura di un prezzo:** per un bar OSM il Worker legge il file della cella indicata dal client dal binding `ASSETS` e verifica che il bar ci sia, ricavandone cella e città (il client non è mai fonte di verità); per un bar `u<id>` legge `venues_user`. Poi `INSERT` in `price_obs` e upsert in `prices_current` nella stessa `batch()`.
- **Chiavi di `dedup` e `counters`:** `HMAC(HASH_KEY, giorno ‖ tipo ‖ sid o IP ‖ bersaglio)` in esadecimale troncato a 32 caratteri. Nessun ID di sessione o IP in chiaro.
- **Stima delle quote D1** (ADR in M1): un contributo ≈ 6 righe scritte (righe più indici), una cella letta = righe restituite. Con 1.000 utenti attivi al giorno: < 1% delle letture e < 5% delle scritture gratuite. Da misurare in M1.
- **Cron giornaliero** (uno per ambiente): elimina `counters` e `dedup` con `day` più vecchio di 2 giorni.

## 9. API

### 9.1 Regole comuni
- JSON; errori `{ "error": { "code", "message" } }` con `message` in italiano, mai dettagli interni. Codici: `bad_request` 400, `unauthorized` 401, `forbidden` 403, `not_found` 404, `conflict` 409, `payload_too_large` 413, `unsupported_media_type` 415, `rate_limited` 429 (con `Retry-After`), `busy` 503, `internal` 500.
- Tutte le POST: controllo `Origin` uguale all'origine del servizio (assente o diverso → 403).
- Sessione (401 se assente o non valida): richiesta da tutte le POST tranne `/api/session` e `/api/events`.
- `Content-Type` (415 se diverso): `application/json` per tutte le POST tranne `/api/events` (D-06).
- Body JSON ≤ 16 KB, letto con limite anche senza `Content-Length`.
- Ogni ingresso validato con zod (`strict`, niente campi extra).
- Nessun CORS: nessun header `Access-Control-*`.

### 9.2 Rotte

| Metodo e percorso | Scopo | Protezioni specifiche |
|---|---|---|
| `POST /api/session` | `{ token }` Turnstile → cookie `__Host-sid` | siteverify senza IP, controllo `hostname` e `action`, rate limit |
| `GET /api/prices/:cell` | Prezzi della cella e bar utente | geohash5 validato `^[0-9b-hjkmnp-z]{5}$`, cache edge 60 s |
| `GET /api/venues/:key/prices` | Prezzi correnti e storico di un bar (D-26) | chiave validata, rate limit |
| `POST /api/prices` | 1–80 prezzi per **un** bar | sessione, quote, catalogo e limiti, anti-frode |
| `POST /api/prices/confirm` | Conferma di un prezzo | una per sessione per prezzo, quota |
| `POST /api/reports` | Segnalazione | una per sessione per prezzo o bar |
| `POST /api/venues` | Bar mancante | quota, nome 2–80, coordinate in Italia |
| `POST /api/venues/confirm` | Conferma di un bar pending | una per sessione per bar |
| `POST /api/events` | Contatori anonimi (un `sendBeacon` per visita) | D-06 |
| `GET /api/health` | `{ status: "ok", version, data_version }` | nessun dato sensibile |
| `GET /api/admin/*`, `POST /api/admin/*` | Revisione, metriche, budget | JWT Cloudflare Access (D-19) |

Formati compatti (tipi in `src/shared/api-types.ts`):
- `GET /api/prices/:cell` → `{ "p": [[key, drink, hh, price_cents, observed_on, confirmations, q]], "u": [[key, name, kind, lat, lon]], "pend": [[key, name, kind, lat, lon, confirmations]] }` con `q` = 1 se in quarantena. Prezzi `review` e `removed` esclusi.
- `POST /api/prices` ← `{ "venue": "n123", "cell": "u0nd9", "source": "manual", "items": [{ "drink", "hh", "price_cents" }] }`. `observed_on` lo decide il server. Risposta `{ "results": [{ "status": "active" | "quarantined" | "confirmed" | "rejected", "code"? }] }`.

## 10. AI: lettura dei listini — rimosso in 1.1
Rimossa con l'ADR 0018: il progetto non usa modelli linguistici. Il codice è recuperabile dal tag `pre-ai-removal`.

## 11. Qualità dei dati e anti-frode (`docs/data-quality.md`)

- Fuori dai limiti del catalogo → rifiuto con messaggio gentile ("Ci sembra un prezzo insolito per uno spritz: controlla le cifre").
- Oltre ±50% dalla mediana della cella per quel drink e fascia (con almeno 5 prezzi attivi) → `quarantined` (D-10).
- Stesso bar, drink, fascia e prezzo nello stesso giorno → diventa una conferma (della sessione, se non ha già confermato).
- Nuovo prezzo diverso su una chiave esistente → sostituisce il corrente (`confirmations` = 0) e resta nello storico.
- Più di 3 segnalazioni distinte su un prezzo → `review`, esce dalla mappa e dalla scheda finché Roberto non decide.
- Pagina `/admin` per revisione e metriche (7.9).

## 12. Misurazione dei gate (senza tracciamento)

Obiettivi: bar con almeno un prezzo valido per città, prezzi al giorno per fonte, quota di visite con contributo, ritorno entro 30 giorni.
- `localStorage` conserva solo la data del primo uso e il numero di prezzi inseriti (servono anche all'invito PWA).
- Eventi ammessi: `app_open`, `price_added`, `price_confirmed`, `venue_viewed`. Proprietà ammesse: `day_bucket` (`0`, `1-7`, `8-30`, `30+`), `source`, `drink`, `city`. Il Worker incrementa solo `metrics_daily`; inoltre, per ogni beacon che contiene almeno un `price_added`, incrementa `(day, 'visit_contributed', '-')` per stimare la quota di visite con contributo.
- Il client accumula gli eventi della visita e li invia in un unico `sendBeacon` su `visibilitychange` → `hidden`.
- `/admin` mostra la copertura per città: bar con prezzo (D1) diviso bar totali (`places.json`).

## 13. Sicurezza (`SECURITY.md`)

Prima di M2: modello di minaccia **STRIDE** (asset: chiave API, budget, privacy, integrità dei prezzi, reputazione dei locali; attori: bot, spammer di prezzi, concorrenti, prompt injection nelle foto, XSS). Standard: **OWASP ASVS 5.0 livello 1** in `docs/security/asvs-l1.md` (requisito, stato, test) e **OWASP Top 10 LLM 2025** voci LLM01, 02, 05, 07, 09, 10.

### 13.1 Header
Impostati dal Worker per `/api/*` e da `public/_headers` per gli asset:
- `Content-Security-Policy: default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self'; img-src 'self' data: blob:; connect-src 'self' https://tiles.openfreemap.org; worker-src 'self'; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests`. Un test e2e fallisce su qualunque violazione CSP in console.
- `Strict-Transport-Security: max-age=63072000; includeSubDomains` (il `preload` lo aggiunge Roberto dopo la verifica del dominio) · `X-Content-Type-Options: nosniff` · `Referrer-Policy: strict-origin-when-cross-origin` · `Permissions-Policy: camera=(), microphone=(), geolocation=(self), payment=(), usb=()` · `Cross-Origin-Opener-Policy: same-origin` · `Cross-Origin-Resource-Policy: same-origin`.

### 13.2 Sessione anonima
Al primo contributo il client carica Turnstile, ottiene il token, chiama `POST /api/session`. Il Worker verifica con siteverify (senza inviare l'IP; controlla `success`, `hostname`, `action`) e rilascia `__Host-sid` = `base64url(id casuale 128 bit ‖ scadenza)` + firma HMAC-SHA256 (`SESSION_HMAC_KEY`), `HttpOnly; Secure; SameSite=Strict; Path=/`, 30 minuti. Confronto della firma a tempo costante. Scaduta la sessione, il client ripete Turnstile al contributo successivo. È un cookie tecnico: nessun banner.

### 13.3 Rate limit e quote
- Binding Rate Limiting di Workers (periodi 10 o 60 s) con chiave HMAC dell'IP, per i picchi (D-22).
- Quote giornaliere in `counters`, per sessione **e** per IP (entrambi HMAC con sale del giorno): 30 prezzi manuali, 50 conferme, 5 bar nuovi, 20 segnalazioni. Valori in configurazione. In più un tetto globale di 200 bar proposti in attesa (v1.1).

### 13.4 Contenuti degli utenti
Nessun testo degli utenti è trattato come HTML: Preact rende solo testo, vietato `dangerouslySetInnerHTML`. I nomi dei bar proposti sono validati (NFC, 2–80 caratteri, senza caratteri di controllo, URL, email o numeri di telefono).

### 13.5 Nessuna AI (v1.1)
L'app non usa modelli linguistici (ADR 0018): nessuna chiave API, nessun tetto di spesa, nessuna voce OWASP LLM applicabile; ogni voce LLM è marcata "non applicabile, nessun LLM".

### 13.6 Segreti
`TURNSTILE_SECRET`, `SESSION_HMAC_KEY`, `HASH_KEY` solo come secret di Wrangler, impostati da Roberto o dalla CI. `.dev.vars.example` senza valori. Scansione segreti in CI (secret scanning di GitHub più gitleaks sul diff).

### 13.7 Supply chain e CI
Lockfile, versioni esatte, `npm ci`, `npm audit --audit-level=high`, Dependabot per npm e Actions. Nessuno script da CDN tranne Turnstile. Actions di terzi fissate al commit SHA; `permissions: contents: read` di default; niente `pull_request_target`.

### 13.8 Log e varie
Log strutturati scritti da noi: solo codice errore, rotta (senza parametri), durata. Mai body, immagini, IP, celle, prezzi collegati a sessioni. Nessun CORS. `/.well-known/security.txt` (RFC 9116) e `robots.txt`.

### 13.9 Test di sicurezza (`tests/security`)
Header presenti e CSP senza violazioni · 401 senza sessione · token Turnstile riusato rifiutato · 403 su `Origin` estraneo o assente · 413 e 415 sugli upload · 429 oltre le quote · 503 a tetto raggiunto, anche con 20 richieste concorrenti · output del modello con HTML reso come testo · prezzo fuori limite rifiutato · prezzo anomalo in quarantena · bar inesistente rifiutato · token di estrazione riusato o superato rifiutato · nessun segreto nel bundle · nessun EXIF nell'immagine inviata · nessuna coordinata dell'utente nelle richieste di rete (e2e).

## 14. Privacy (GDPR) — riflessa in `PRIVACY-NOTES.md`

- **Posizione:** usata solo sul dispositivo. Al server e alla CDN arrivano solo richieste di celle geohash5 (~5 km), che indicano dove si guarda la mappa, non dove si è. Mai coordinate, mai salvate, mai nei log. Le coordinate dei bar nuovi sono quelle toccate sulla mappa, non la posizione dell'utente.
- **Ricerca per nome** (v1.3): al CDN arriva il nome del frammento, cioè i primi 2 o 3 caratteri di una parola digitata, mai la posizione; la ricerca non chiede il permesso di posizione.
- **Contributi:** bar, drink, prezzo e **solo la data**. Nessun autore pubblico, nessun ID di sessione salvato con il prezzo. Il legame tra contributi della stessa sessione esiste solo in `counters` e `dedup` con sale giornaliero, cancellati entro 48 ore.
- **Foto:** l'app non invia né conserva foto.
- **Sub-responsabili:** Cloudflare (hosting, Turnstile, Access), OpenFreeMap (riceve dal browser le richieste delle tessere), GitHub (codice, nessun dato utente).
- Nessun dato di minori; servizio dichiarato per maggiorenni.

## 15. UX, accessibilità e performance

**Principi:** una schermata, un'azione primaria, default intelligenti, nessun vicolo cieco, italiano semplice. Uso con una mano e poca luce: target ≥ 48×48 px, contrasto alto, tema chiaro e scuro, `prefers-reduced-motion`. Annunci `aria-live` per caricamenti ed errori; test con axe. Tutti i testi per l'utente in `src/app/i18n/it.ts`.

**Budget bloccanti in CI (profilo mobile):** shell iniziale ≤ 50 KB gzip esclusa MapLibre · LCP ≤ 2,5 s · INP ≤ 200 ms · CLS ≤ 0,05 · font ≤ 70 KB in tutto (v1.3) · Lighthouse ≥ 90 Performance e ≥ 95 Accessibility, Best Practices, SEO.

### 15.1 Design system con UI UX Pro Max
1. La skill è installata (plugin `ui-ux-pro-max`); Python 3.13 presente.
2. In M0:
   ```
   python <percorso skill>/scripts/search.py "app mobile mappa prezzi birre e cocktail nei bar, nightlife italiana, community, uso rapido con una mano al bancone" --design-system -p "Dove bevo" --persist -f markdown
   ```
   poi override `--page` per mappa, scheda bar, aggiungi prezzo, ricerca. Output in `design-system/`.
3. Il design system va mostrato a Roberto e approvato prima di M1.
4. **Dalla v1.3** l'identità visiva arriva da `docs/brand/` (ADR 0023) e `design-system/` ne è la sintesi; la skill resta la fonte delle regole UX e della checklist. `MASTER.md` vale ovunque, il file di pagina prevale; linee guida React (compatibili con Preact); token in custom properties; **font self-hosted**, al massimo 2 file woff2; stile OpenFreeMap coerente con la palette. In conflitto prevalgono vincoli, sicurezza, accessibilità, poi la skill.
5. A ogni milestone con interfaccia: checklist pre-consegna della skill con esito riportato in PROGRESS, screenshot Playwright a 390×844.

## 16. CI/CD

- **PR:** lint, typecheck, unit, e2e (Chromium e WebKit, viewport 390×844, geolocalizzazione simulata, dati fixture), sicurezza, Lighthouse CI, `npm audit`, scansione segreti, guardia della feature list (D-21).
- **Merge su `main`** → import OSM (5.3), migrazioni D1 su staging, deploy in **staging**, smoke test (`/api/health`, una cella, header).
- **Produzione** solo da tag `v0.x.y` approvato da Roberto (environment GitHub con approvazione). Migrazioni prima in staging.
- Rollback (`wrangler rollback` alla versione precedente) documentato in `docs/runbook-rollback.md` e provato in staging prima di M6.
- Deploy, segreti e scritture sul D1 remoto: solo Roberto o la CI, mai Claude Code.

## 17. Struttura del repository

```
/
├── CLAUDE.md · init.sh · README.md · SECURITY.md · PRIVACY-NOTES.md · CHANGELOG.md · .dev.vars.example
├── .claude/          settings.json, hooks/, agents/, claude-security-guidance.md
├── .github/          workflows/, dependabot.yml
├── docs/             BRIEF, SPEC, PROGRESS, feature_list.json, adr/, security/asvs-l1.md, data-quality.md, runbook-rollback.md
├── design-system/    generato da UI UX Pro Max
├── scripts/osm-import/  scripts/check-feature-list.mjs
├── src/shared/       config.ts, catalog.ts, geohash.ts, api-types.ts
├── src/worker/       index.ts (Hono), routes/, lib/ (session, quota, db, access)
├── src/app/          views/, components/, lib/ (map, image, api, events), i18n/it.ts, styles/, sw.ts
├── migrations/
├── public/           manifest, icone, font, _headers, robots.txt, .well-known/security.txt, data/ (generata, fuori da git)
└── tests/            unit, e2e, security, fixtures/data
```

## 18. Funzionalità e verifiche (copiate in `docs/feature_list.json`)

Le verifiche "e2e" sono test Playwright a 390×844 su Chromium e WebKit con dati fixture; "unit" sono Vitest (Worker con `@cloudflare/vitest-pool-workers`); "sec" sono test in `tests/security`. Una funzionalità è `passes: true` solo con output dei test, comandi con risultato e, se tocca l'interfaccia, screenshot confrontati col design system.

### M0
| ID | Funzionalità | Verifica |
|---|---|---|
| M0-01 | Tooling: lint, typecheck, test, format con le sole dipendenze consentite | `npm ci && npm run lint && npm run typecheck && npm run test` escono con 0; `package.json` contiene solo dipendenze della sezione 4.1 a versione esatta |
| M0-02 | Worker con static assets, fallback SPA e `/api/health` | e2e: `GET /` e `GET /bar/n1` restituiscono la shell; `GET /api/health` → 200 `{status:"ok",version,data_version}`; `GET /api/nonesiste` → 404 JSON `not_found` |
| M0-03 | Header di sicurezza su asset e API | sec: per `/`, un asset JS e `/api/health` tutti gli header di 13.1 sono presenti con i valori esatti; nessun header `Access-Control-*` |
| M0-04 | CSP senza violazioni | e2e: apertura della shell e della mappa senza messaggi CSP in console |
| M0-05 | Pipeline CI su PR | una PR di prova esegue tutti i job della sezione 16 e fallisce se uno fallisce (prova: PR con errore di lint volutamente rossa, poi verde) |
| M0-06 | Guardia della feature list | `node scripts/check-feature-list.mjs` passa con un cambio di `passes` e fallisce se si modifica `descrizione` o `verifica` o si rimuove una voce (test unit con i tre casi) |
| M0-07 | Deploy in staging da `main` con smoke test | dopo il merge il job di deploy è verde; `curl https://<staging>/api/health` → 200 con `data_version` dell'import |
| M0-08 | Supply chain | `npm audit --audit-level=high` verde in CI; Dependabot attivo per npm e Actions; tutte le Actions di terzi fissate a SHA; nessun `pull_request_target` (grep in CI) |
| M0-09 | Scansione segreti | gitleaks in CI fallisce su un segreto di prova in un branch di test; `.dev.vars.example` senza valori |
| M0-10 | Design system approvato | `design-system/MASTER.md` e override di pagina presenti; token in `src/app/styles/tokens.css`; font ≤ 2 woff2 self-hosted; approvazione di Roberto registrata in PROGRESS |
| M0-11 | Rate Limiting binding verificato | ADR con esito della verifica sul piano gratuito (D-22) |

### M1
| ID | Funzionalità | Verifica |
|---|---|---|
| M1-01 | Encoder geohash | unit: vettori noti (es. 45.4642, 9.19 → `u0nd9` a 5 caratteri), bordi ±90/±180, calcolo delle celle visibili ≤ 12 |
| M1-02 | Import OSM in file statici | unit dello script su un PBF di test: formato D-11, `key` corrette, centroidi delle aree, `places.json` solo city/town, `LICENSE.txt` presente; lo script fallisce oltre 15.000 file o con un file > 1 MB |
| M1-03 | Import completo in CI | log del job: numero di bar e file, tutti i file ≤ 1 MB, totale ≤ 15.000, durata |
| M1-04 | Cache immutabile dei dati | e2e/sec: `/data/<DATA_VERSION>/v/<cell>.json` ha `Cache-Control: public, max-age=31536000, immutable` |
| M1-05 | ADR licenza e quote D1 | `docs/adr/` contiene licenza ODbL (separazione prezzi) e stima quote con misure reali |
| M1-06 | Mappa iniziale sull'Italia con attribuzioni | e2e: all'apertura la mappa mostra l'Italia; attribuzioni OpenFreeMap, OpenMapTiles, OpenStreetMap visibili; screenshot 390×844 |
| M1-07 | Invito sotto zoom 13 e caricamento celle da zoom 13 | e2e: a zoom 12 nessuna richiesta `/api/prices` e invito visibile; a zoom 14 su Milano richieste per ≤ 12 celle e segnaposto visibili |
| M1-08 | `GET /api/prices/:cell` | unit: formato compatto 9.2, `review`/`removed` esclusi, cella non valida → 400; misura CPU < 2 ms riportata in PROGRESS |
| M1-09 | Menu dei drink | e2e: nel menu «Scegli cosa bere» scegliendo "Spritz" i segnaposto mostrano il prezzo dello spritz; bar senza prezzo restano visibili e discreti |
| M1-10 | "Vicino a me" | e2e con geolocalizzazione simulata: la mappa si centra sulla posizione; con permesso negato appare l'invito alla ricerca e tutto resta usabile |
| M1-11 | Ricerca città | e2e: cerco "milano" → primo risultato Milano → la mappa si sposta e carica le celle |
| M1-12 | Scheda bar in lettura | e2e: apro un bar con prezzi fixture: nome, indirizzo, tipo, prezzi con data, conferme, link "Indicazioni"; URL `/bar/<key>` funziona anche ricaricando |
| M1-13 | Elenco accessibile dei bar visibili | e2e: l'icona "Elenco" (sulla mappa, non nella barra) mostra i bar visibili; navigazione solo da tastiera fino all'apertura di una scheda; axe senza violazioni |
| M1-14 | Nessuna coordinata dell'utente in rete | e2e con posizione simulata: nessuna richiesta (URL, header, body) contiene le coordinate simulate né loro arrotondamenti a 2+ decimali |
| M1-15 | Storico di un bar | unit: `GET /api/venues/:key/prices` restituisce correnti e ≤ 10 osservazioni per drink, solo data |
| M1-16 | La mappa non cambia mai altezza né si muove da sola | e2e Chromium e WebKit 390×844: l'altezza della mappa e della barra è identica con Birra, Spritz e Negroni scelti nel menu dei drink (zona con e senza prezzi); a ogni zoom da 13 in su (con Spritz e Negroni) nessun ridimensionamento della mappa durante lo zoom e, a riposo, nessun ridimensionamento né cambio di centro o zoom per 2 s; il test fallisce sul codice con la barra che cambia altezza |

### M2
| ID | Funzionalità | Verifica |
|---|---|---|
| M2-01 | STRIDE in `SECURITY.md` | documento con asset, attori, minacce e contromisure mappate ai test |
| M2-02 | Turnstile caricato solo al primo contributo | e2e: nessuna richiesta a `challenges.cloudflare.com` finché non si salva un prezzo |
| M2-03 | Sessione anonima | unit/sec: `POST /api/session` con token valido → cookie `__Host-sid` con attributi esatti e 30 min; token riusato → 403; firma alterata o scaduta → 401 |
| M2-04 | Controlli comuni delle POST | sec: 401 senza sessione, 403 con `Origin` estraneo o assente, 415 senza JSON, 413 oltre 16 KB, 400 con campi extra |
| M2-05 | Inserimento in 4 tocchi più le cifre | e2e: dalla mappa `Aggiungi prezzo` → primo bar proposto → Spritz → "7,50" → `Salva`: esattamente 4 tocchi; dopo 5 s il prezzo compare nella scheda |
| M2-06 | Annulla senza scritture | e2e: `Salva` poi `Annulla` entro 5 s → nessuna `POST /api/prices`; passaggio in background entro 5 s → invio con `keepalive` |
| M2-07 | Bar proposti per vicinanza | e2e: con posizione simulata i 5 bar proposti sono i più vicini secondo i dati fixture; senza posizione, i più vicini al centro mappa |
| M2-08 | Validazione prezzo e bar | sec: prezzo fuori limite → `rejected` con messaggio; bar inesistente nella cella → 400; drink fuori catalogo (anche prosecco, bibita, bottiglia) o campo `size_ml` → 400 |
| M2-09 | Quarantena anti-frode | sec: con 5 prezzi attivi a ~5 €, un prezzo a 9 € → `quarantined`, non in mappa, presente in "In verifica"; conferma da altra sessione → `active` |
| M2-10 | Stesso prezzo stesso giorno = conferma | unit: secondo inserimento identico da altra sessione → `confirmed`, `confirmations` +1, nessuna nuova riga corrente |
| M2-11 | "Confermo" in 1 tocco | e2e: un tocco su "Confermo" incrementa il contatore; secondo tocco della stessa sessione non incrementa |
| M2-12 | "È cambiato" precompilato | e2e: apre l'inserimento con bar, drink e fascia già scelti; basta cifre e `Salva` |
| M2-13 | Segnalazioni | e2e/unit: motivi chiusi; una per sessione per prezzo; alla quarta distinta il prezzo passa in `review` e sparisce |
| M2-14 | Quote e rate limit | sec: 31° prezzo manuale della giornata → 429 con `Retry-After`; stesso limite per IP con sessioni diverse |
| M2-15 | Pulizia giornaliera | unit: lo scheduled handler elimina `counters` e `dedup` più vecchi di 2 giorni e lascia gli altri |
| M2-16 | Nessun dato personale salvato | unit: dopo un flusso completo nessuna tabella contiene sid, IP o loro hash fuori da `counters`/`dedup` |

### M3
| ID | Funzionalità | Verifica |
|---|---|---|
| M3-11 | Proposta di un bar mancante | e2e Chromium e WebKit 390×844: `Aggiungi prezzo` → "Non trovi il bar?" → nome → tipo → pin sulla mappa → `Invia`, con tocchi e tempo contati; messaggio "Grazie: Roberto controlla che esista e poi compare sulla mappa"; prima dell'invio, fino a 3 bar noti entro 150 m con nome simile ("È uno di questi?") |
| M3-12 | Validazione, duplicati e abusi delle proposte | sec/unit: nome con URL, email, telefono o caratteri di controllo → 400; nome con HTML reso come testo; stesso nome normalizzato entro 50 m da un bar OSM, proposto o approvato → 409 con la chiave esistente; sesta proposta del giorno → 429; oltre 200 in attesa → risposta gentile; coordinate fuori dall'Italia → 400 |
| M3-13 | Un bar proposto è pubblico solo se lo approva l'admin | unit/e2e: un bar `pending` e i suoi prezzi non compaiono sulla mappa né tra i prezzi della cella, né nella sua scheda; compare solo nella scelta del bar con "Nuovo, da confermare"; conferme e prezzi non lo approvano mai e non muovono la mediana; dopo l'approvazione bar e prezzi sono pubblici; dopo il rifiuto no |
| M3-14 | Pannello admin a tre code | e2e con JWT di test: tre code con contatori e badge (nuovi bar, bar da cancellare, prezzi da rivedere); Approva/Rifiuta un bar; "Togli dalla mappa" nasconde un bar OSM ed elimina un bar utente approvato; "Tieni" archivia le segnalazioni; nessuna cancellazione senza azione dell'admin; axe senza violazioni |
| M3-15 | "Vicino a me" diagnosticabile | e2e Chromium e WebKit: permesso concesso, negato e timeout danno messaggi distinti e il focus passa alla ricerca; un solo modulo `locate()` per il pulsante e per `Aggiungi prezzo`; la posizione non compare nelle richieste di rete. La prova su iPhone e Android è di Roberto |
| M3-16 | Aggiungi un altro drink qui | e2e: dopo `Salva` il messaggio offre "Aggiungi un altro drink qui"; il bar resta selezionato; più drink partono in un'unica `POST /api/prices` con l'Annulla di 5 s |
| M3-17 | Inserimento da listino in admin | unit/e2e con JWT di test: in `/admin` si sceglie un bar, si compila una tabella di drink e prezzi con la data di osservazione; data futura o oltre 90 giorni → 400; i prezzi passano gli stessi controlli di catalogo e limiti dell'inserimento manuale |
| M3-18 | Nessun pagamento e nessuna AI | sec: nessun riferimento a processori di pagamento (`paddle`, `stripe`, `checkout`) né ad `anthropic` nel codice, nelle dipendenze e in `dist/` |
| M3-19 | Degrado gentile | e2e: se `/api/*` risponde con HTML e stato 200 il client mostra "Il servizio è molto richiesto, riprova più tardi", mantiene i dati già caricati e non scrive errori in console |
| M3-20 | Lettura di una cella a costo costante | unit worker: `GET /api/prices/:cell` legge al massimo 5 righe D1 con 300 prezzi nella cella; un contributo scrive al massimo 10 righe (test di regressione, ADR 0020) |

### M4
| ID | Funzionalità | Verifica |
|---|---|---|
| M4-03 | Colori sulla mediana | unit + e2e: con ≥ 5 prezzi colori più economico/media/più caro secondo D-12 con valore scritto; con < 5 colore neutro; contrasto AA in entrambi i temi |
| M4-04 | "I più economici qui" | e2e: lista ordinata per prezzo del drink scelto nell'area visibile, al massimo 10, esclusi quarantena e `review` |
| M4-05 | Freschezza | e2e: un prezzo con data > 90 giorni mostra "da confermare" in mappa e scheda |
| M4-07 | PWA installabile | Lighthouse/manifest valido; e2e: service worker registrato, precache della shell, nessuna voce `/api/*` o `/data/*` in cache |
| M4-08 | Shell offline | e2e: dopo una visita, offline la shell si apre e mostra il messaggio offline |
| M4-09 | Invito all'installazione | e2e: invito assente dopo il primo prezzo, presente dopo il secondo, una volta sola |
| M4-10 | Happy hour | e2e: con solo prezzo HH la mappa mostra "HH"; la scheda mostra entrambe le fasce |
| M4-11 | Indice di ricerca a frammenti nell'import (ADR 0024) | unit dello script: `s/<prefisso>.json` e `s/index.json` nel formato di 5.1, voci con `cityId` del nodo OSM, prefissi divisi a 3 caratteri sopra 40 KB gzip; lo script fallisce con un frammento > 40 KB gzip, oltre 15.000 file o con un file > 1 MB; import e client usano la stessa normalizzazione di `src/shared/venue.ts` (casi `Caffè`, `l'Osteria`, `Bar Sport`, `Più`, `Trattoria da Mario`); riga in `PRIVACY-NOTES.md` |
| M4-12 | Ricerca dei bar per nome in tutta Italia (sostituisce M4-06) | e2e Chromium e WebKit 390×844: scrivo 3 caratteri di un bar fixture fuori dalle celle caricate → compare; lo scelgo → la mappa va a zoom 17 e si apre la scheda, con tocchi e tempo contati; nessuna richiesta a `/api/*` durante la ricerca; `Caffè Roma` si trova con `caffe roma`, `roma caf` e `CAFFÈ`; `bar sport` richiede entrambe le parole e l'ordine delle parole non cambia i risultati |
| M4-13 | Ordine dei risultati della ricerca | e2e: con la mappa su Milano, "Bar Sport" mostra prima quelli di Milano; nome esatto prima dell'inizio del nome; il permesso di posizione non viene mai chiesto dalla ricerca |
| M4-14 | Ricerca: nessun risultato, errori, bar nascosti | e2e: nessun risultato → "Non trovo questo locale" e "Non trovi il bar?" col nome già scritto; frammento non scaricabile → messaggio gentile, la ricerca per città funziona, nessun errore in console; bar nascosto dall'admin → dopo la scelta "Questo locale non è più sulla mappa" (D-32) |
| M4-15 | Accessibilità della ricerca | e2e: schema ARIA `combobox` con frecce, Invio ed Esc; numero di risultati in `aria-live`; parte corrispondente in `<mark>`; target ≥ 48×48 px; volo della mappa rispettoso di `prefers-reduced-motion`; axe senza violazioni nei due temi; screenshot di campo vuoto, digitazione, risultati, nessun risultato, errore |
| M4-16 | Peso e velocità della ricerca | build: codice di ricerca in un chunk a richiesta, shell ≤ 50 KB gzip; e2e: una ricerca tipica scarica ≤ 60 KB, risultati ≤ 150 ms con il frammento in memoria; misure in PROGRESS |

### MB (v1.3, brand identity v1, ADR 0023)
| ID | Funzionalità | Verifica |
|---|---|---|
| MB-01 | Token da una sola fonte | unit: `scripts/build-tokens.mjs` genera da `docs/brand/tokens.json` un CSS identico a `src/app/styles/tokens.css` committato (il test fallisce se diverso); CI: nessun colore esadecimale fuori dai file generati; `theme_color` e `background_color` del manifest dallo stesso script |
| MB-02 | Font del kit | build/e2e: 2 file woff2 (Bricolage Grotesque, Geist Mono) self-hosted, ≤ 70 KB in tutto, `font-display: swap`, `preload` del solo Bricolage, fallback con metriche misurate; Lighthouse CLS ≤ 0,05 |
| MB-03 | Contrasti verificati nei due temi | unit: per ogni coppia ammessa nelle note di `tokens.json`, rapporto ≥ 4,5:1 per il testo e ≥ 3:1 per bordi, pin e focus, in Bancone e in Fuori orario |
| MB-04 | Controlli del kit | e2e: bottoni, chip e campi con bordo `ink` 2 px e ombra `shadow-stampa`, premuti scendono di 3 px; focus a 3 px con 2 px di distanza su ogni elemento interattivo; con `prefers-reduced-motion` nessuna animazione; screenshot 390×844 nei due temi |
| MB-05 | Icone dei drink | unit: ogni codice del catalogo (SPEC 6) ha un'icona inline con `currentColor` in un modulo unico; nessuna emoji |
| MB-06 | Stili della mappa Bancone e Fuori orario (D-27) | build/e2e: stili generati da `scripts/build-map-styles.mjs` in `public/map/` con cache immutabile, senza punti di interesse né etichette delle strade minori; glifi, sprite e tessere solo da `tiles.openfreemap.org`; attribuzioni visibili; al cambio di tema prezzi e bar tornano senza nuove richieste a `/api/*` o `/data/*`, tempo misurato |
| MB-07 | Pin e legenda | unit + e2e: gradino, glifo e prezzo corretti rispetto alla mediana (D-12); neutro sotto 5 prezzi; bordo tratteggiato oltre 90 giorni; tappo quando selezionato; HH come D-13; legenda solo con colori attivi; interazione peggiore ≤ 200 ms con 300 pin (misura in PROGRESS) |
| MB-08 | Copertura della zona | e2e: "X bar su N qui hanno un prezzo" uguale al calcolo a mano su un caso fixture; nessuna richiesta di rete in più all'apertura e al movimento della mappa |
| MB-09 | Scheda bar come scontrino | e2e: righe per drink con icona, data e conferme in `meta`, al massimo 5 righe poi "Vedi tutti"; "In verifica" (D-10), "Confermo", "È cambiato", "Indicazioni", "Segnala un errore" invariati; nessun attributo `style` nell'HTML servito |
| MB-10 | Prezzi già visti in zona | e2e: nel passo Prezzo compaiono i prezzi della cella per lo stesso drink; un tocco su uno sostituisce le cifre: esattamente 4 tocchi senza cifre; la riga con intervallo e mediana solo con ≥ 5 prezzi; nessuna richiesta in più |
| MB-11 | Timbro dopo `Salva` | e2e: timbro con la data del giorno; `Annulla` entro 5 s → nessuna `POST /api/prices`; dopo 5 s una sola; passaggio in background → invio con `keepalive` (D-15); "Aggiungi un altro drink qui" (M3-16) presente; `UNDO_MS`, durata della barra di avanzamento e testi coincidono (unit) |
| MB-12 | Tessera (D-29) | e2e: timbri a 1, 5, 10, 25, 50 prezzi dal contatore esistente; nessuna chiave nuova in `localStorage`; nessuna richiesta in più |
| MB-13 | Zona senza prezzi e barra della mappa a due tasti (D-28) | e2e: la barra ha sempre e solo "Aggiungi prezzo" e "Aggiungi locale mancante" in una riga, con la stessa altezza anche nella zona senza prezzi; nessuna frase di invito nella zona senza prezzi ("Qui nessuno ha ancora segnato un prezzo" non compare in nessun punto); l'icona "Elenco" è sulla mappa, 48×48 px, senza sovrapporsi a stato e attribuzioni, nei due temi; nessun "Manda la mappa a un amico" |
| MB-14 | Tema Fuori orario | e2e Chromium e WebKit: ogni vista nel tema scuro progettato (non invertito); axe senza violazioni in entrambi i temi; nessuna violazione CSP su ogni vista nuova |
| MB-15 | Voce e parole vietate (D-31) | unit: le frasi di `docs/brand/02-voce.md` sono in `it.ts` (escluso il bottone primario, che resta "Aggiungi prezzo"); il test fallisce se `it.ts` contiene una parola dell'elenco D-31 |
| MB-16 | Logo e icone dell'app | build: PNG 192, 512 e maskable generati da `dovebevo-icona-app.svg` con uno script Playwright; favicon SVG dal simbolo; simbolo sulla mappa e logo orizzontale in `/privacy` e `/regole` |
| MB-17 | Budget brand | Lighthouse CI mobile: Performance ≥ 90, altre ≥ 95, LCP ≤ 2,5 s, CLS ≤ 0,05; shell ≤ 50 KB gzip; font ≤ 70 KB; righe D1 e richieste per vista e per contributo invariate (M3-20); misure prima e dopo in PROGRESS |


### MC (v1.6, ADR 0028)
| ID | Funzionalità | Verifica |
|---|---|---|
| MC-01 | Menu «Scegli cosa bere» a caselle multiple | e2e Chromium e WebKit 390×844: nell'intestazione un solo pulsante (nessuna riga di chip da scorrere) con l'elenco chiuso all'inizio; si apre e si chiude con tocco, tastiera, Esc (il fuoco torna al pulsante) e tocco fuori; nove voci nell'ordine della tabella 6, la stessa lista della griglia di "Aggiungi prezzo"; l'ultima casella spuntata non si toglie; target ≥ 48 px, nessuna misura (ml) nei nomi, axe senza violazioni nei due temi |
| MC-02 | Con più drink il segnaposto mostra il prezzo più basso | unit + e2e: `bestPrice` sceglie il prezzo più basso tra i drink scelti (parità: il più recente), ignora quarantena e fascia HH se esiste il normale; con più drink spuntati i bar contati sono quelli con almeno uno dei drink (un bar una volta sola), pin, «Elenco» e «I più economici qui» mostrano il minimo con il nome del drink, il colore (D-12) è sulla mediana di quel drink; nessuna richiesta di rete in più |
| MC-03 | Catalogo senza formati | unit/worker/sec: `CATALOG` ha i nove drink della tabella 6 e nessun formato; `POST /api/prices`, `/confirm`, `/reports` e l'admin rifiutano `size_ml` e i drink tolti con 400; `src/` non contiene `size_ml`, `formatSize` né `findSize` (test); la migrazione 0006, su un D1 con prezzi a più formati, tiene i drink validi, porta la birra a 400 ml sull'unica chiave, archivia in `archive_sizes_*` le righe dei drink tolti e delle birre 0,2 e 0,5 l, conserva le segnalazioni sul bar; formato compatto 9.2 senza `size_ml` |
| MC-04 | Nomi e icone dei nuovi drink | unit/e2e: i nomi di `it.ts` sono quelli della tabella 6; ogni codice ha la sua icona (MB-05); la scheda bar, l'elenco, l'admin e le pagine per i motori di ricerca non scrivono più alcun formato |

### M5
| ID | Funzionalità | Verifica |
|---|---|---|
| M5-01 | Eventi anonimi | e2e: una visita genera un solo `sendBeacon` a `/api/events`; sec: evento o proprietà fuori elenco → 400, body > 2 KB → 413, `Origin` estraneo → 403; `metrics_daily` incrementato |
| M5-02 | Admin protetta | sec: `/api/admin/*` senza JWT Access valido → 403 (firma, `aud`, scadenza verificati) |
| M5-03 | Admin: revisione e metriche | e2e con JWT di test: code `review`/`quarantined`/`pending` con Approva/Rimuovi; metriche giornaliere; copertura per città |
| M5-04 | Pagine `/privacy` e `/regole` | e2e: raggiungibili dal piè di pagina e dalla scheda; contenuto da `PRIVACY-NOTES.md`; "servizio per maggiorenni" presente |
| M5-05 | Accessibilità | axe senza violazioni su tutte le viste; navigazione completa da tastiera; target ≥ 48×48 px (test sulle dimensioni); `prefers-reduced-motion` rispettato |
| M5-06 | Performance | Lighthouse CI mobile: Performance ≥ 90, Accessibility/Best Practices/SEO ≥ 95, LCP ≤ 2,5 s, CLS ≤ 0,05; shell ≤ 50 KB gzip esclusa MapLibre; INP ≤ 200 ms misurato in e2e |
| M5-07 | ASVS L1 | `docs/security/asvs-l1.md` senza voci "da fare", ogni voce con test o motivazione |
| M5-08 | Nessun segreto nel bundle | sec: scansione di `dist/` per i nomi e i formati dei segreti |
| M5-09 | security.txt e robots.txt | e2e: `/.well-known/security.txt` conforme a RFC 9116 (Contact, Expires); `robots.txt` presente |
| M5-10 | Traccia del test con 5 persone | `docs/user-test.md` con compiti, domande e criteri di successo |
| M5-11 | Rotta di copertura protetta e a richiesta | unit/sec: `GET /api/admin/coverage` senza JWT Access valido → 403; con JWT → 200, `Cache-Control: no-store`, formato compatto; secondo calcolo entro 10 s → 429 `rate_limited` con `Retry-After`, senza letture D1 |
| M5-12 | Definizione di «bar con almeno un prezzo» | unit worker: conta solo i bar con ≥ 1 prezzo `active`; quarantena, `review`, `removed`, bar utente `pending` o rifiutato, bar OSM nascosto non contano; secondo prezzo sullo stesso bar → bar invariati, prezzi +1; approvazione e ripristino → conta; somma per città + «Senza città» = totale; stessa attribuzione con `places.json` riordinato (chiave = ID nodo OSM) |
| M5-13 | Costo in righe D1 della dashboard | unit worker con 5.000 prezzi: piano `SCAN prices_current` senza `TEMP B-TREE`, `rows_read` ≤ righe della tabella + 10; righe scritte per un contributo invariate (≤ 6); avviso quando i prezzi attivi superano 4.000 (ADR 0022) |
| M5-14 | Aggiornamento solo con il pulsante | e2e: all'apertura di `/admin` nessuna richiesta a `/api/admin/coverage`; nessuna dopo 5 minuti, dopo un cambio di scheda e al ritorno; «Aggiorna» → una richiesta; doppio tocco rapido → una sola |
| M5-15 | Interfaccia della dashboard | e2e Chromium e WebKit 390×844: stato iniziale, caricamento, dati, errore (rete o risposta HTML: restano i dati precedenti + «Aggiornamento non riuscito, riprova»); indicatori e gate Milano X/150; tabella con ricerca, ordinamento (`aria-sort`) e interruttore «città senza prezzi» senza nuove richieste; riga «Senza città»; «Aggiorna» visibile senza scorrere, nessuno scroll orizzontale, target ≥ 48 px; axe senza violazioni |
| M5-16 | Nessun peso sulla shell pubblica | build: la dashboard è in un chunk caricato a richiesta; shell ≤ 50 KB gzip, misura prima e dopo in PROGRESS |

### M6
| ID | Funzionalità | Verifica |
|---|---|---|
| M6-01 | Dominio di produzione | `APP_DOMAIN` aggiornato; HTTPS e header 13.1 verificati sul dominio; Cache API attiva (header `cf-cache-status` o test di hit) |
| M6-02 | Segreti di produzione | checklist firmata da Roberto in PROGRESS (impostati da lui) |
| M6-03 | Rollback provato | esecuzione in staging documentata in `docs/runbook-rollback.md` con esito |
| M6-04 | Rilascio `v0.1.0` | tag `v0.1.0` approvato, deploy di produzione verde, `CHANGELOG.md` aggiornato |
| M6-05 | Smoke test in produzione | `/api/health`, una cella, header e CSP verificati in produzione; feature list tutta a `passes: true` |

## 19. Milestone

| Milestone | Contenuto | Fatto quando |
|---|---|---|
| **M-1** | Intervista, SPEC, feature list, PROGRESS, `init.sh`, ADR iniziali, `.claude/` | SPEC e configurazione approvate, tag `spec-approved`; poi `/clear` |
| **M0** | Tooling, Worker con assets, header, CI, staging via CI, design system | M0-01…M0-11 |
| **M1** | Import OSM, mappa, celle, ricerca città, scheda bar in lettura | M1-01…M1-16 |
| **M2** | STRIDE, Turnstile e sessione, inserimento, conferme, segnalazioni, anti-frode, quote | M2-01…M2-16 |
| **M3** | Bar proposti dagli utenti (li approva solo l'admin), pannello admin a tre code, "Vicino a me", "Aggiungi un altro drink qui", inserimento da listino, lettura delle celle a costo costante | M3-11…M3-20 |
| **M4** | Colori sulla mediana, "più economici qui", freschezza, PWA, happy hour, ricerca dei bar per nome in tutta Italia (v1.3) | M4-03…M4-05, M4-07…M4-16 |
| **MB** | Brand identity v1 (v1.3, ADR 0023), insieme alla ricerca per nome | MB-01…MB-17 |
| **MC** | Menu «Scegli cosa bere», catalogo di 9 drink senza formati (v1.6, ADR 0028) | MC-01…MC-04 |
| **M5** | Eventi e `/admin`, dashboard di copertura, pagine legali, a11y e performance, ASVS L1, test con 5 persone | M5-01…M5-16 |
| **M6** | Dominio, segreti di produzione, rollback, `v0.1.0`, smoke test | M6-01…M6-05 |

Ciclo di ogni milestone: plan mode e ok di Roberto → una funzionalità alla volta (test prima, poi codice, poi verifica con prove) → `/code-review`, `/security-review`, subagent `spec-reviewer` (solo correttezza, sicurezza, requisiti mancanti) → test verdi, PROGRESS, commit, PR verso `main`, riepilogo → stop. Se lo stesso errore si ripete due volte: stop e proposta di `/clear` con istruzione migliore.

## 20. Fuori ambito e definizione di finito

**Fuori ambito in Fase 0:** account, punti e classifiche, rivendicazione del locale, pagamenti, pubblicità, indice pubblico dei prezzi per città, ricerca nazionale dei bar lato server, app native, notifiche, analytics di terze parti. Il codice resta pronto: servizio AI dietro un'interfaccia, accesso ai dati in un modulo unico.

**Definizione di finito** per ogni funzionalità: conforme al design system · TypeScript senza `any` · zod su ogni ingresso del Worker · test unit ed e2e con prove · revisioni chiuse · nessuna regressione su header, CSP, budget e privacy · testi in `it.ts` · usabile da tastiera · feature list, PROGRESS e ADR aggiornati.

## 21. Prerequisiti a carico di Roberto

| Quando | Cosa |
|---|---|
| M0 | Creare il repo GitHub pubblico (o autorizzare Claude a crearlo con `gh`); account Cloudflare; API token Cloudflare con permessi Workers/D1 come secret della CI; creare i D1 `dovebevo-staging` e `dovebevo-production` (o autorizzare la CI) |
| M0 | Approvare il design system |
| M2 | Widget Turnstile (site key e secret) per staging e produzione |
| M3 | Provare "Vicino a me" su iPhone e Android; approvare i bar proposti dagli utenti da `/admin` |
| M5 | Cloudflare Access (team, applicazione su `/admin*` e `/api/admin/*`, `aud`); revisione di `PRIVACY-NOTES.md` e informativa iubenda; esecuzione del test con 5 persone |
| M6 | Dominio, segreti di produzione, approvazione del tag `v0.1.0`, `preload` HSTS |

## 22. Rischi e verifiche aperte

- **Rate Limiting binding** sul piano gratuito (D-22) — verifica in M0.
- **Turnstile e `style-src 'self'`**: verificare in M2 che il widget non richieda stili inline; se sì, proporre la deroga minima a Roberto.
- **MapLibre e CSP**: verificare in M1 che stile, glifi, sprite e worker funzionino con la CSP (glifi e sprite via `fetch` → `connect-src`).
- **"Vicino a me"** non funziona sul telefono di Roberto, causa non nota: diagnosi in M3 con messaggi distinti (v1.1); se non regge su un dispositivo reale, si toglie con il codice, i testi e le voci collegate.
- **Durata del deploy** con l'import OSM completo (D-03): se supera 15 minuti, proporre la cache dell'output per data del PBF.
- **Cloudflare Access su `workers.dev`** in staging — verifica in M5.
