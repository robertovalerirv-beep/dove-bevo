# Prompt per Claude Code — Dove bevo, brand identity v1 + ricerca per nome del locale (16/10/2026)

> **Come si usa.** Scompatta `dovebevo-brand-kit.zip` nella radice del repo `dove-bevo`: crea `docs/brand/` e mette questo file in `docs/PROMPT-BRAND-RICERCA.md`. Apri Claude Code nella cartella del repo **in plan mode**, fai `/clear` e incolla: `Leggi per intero @docs/PROMPT-BRAND-RICERCA.md e @docs/brand/README.md, poi CLAUDE.md, docs/SPEC.md, docs/PROGRESS.md, docs/feature_list.json, design-system/MASTER.md e le ADR 0002, 0011, 0013, 0017, 0019, 0020, 0022. Parti dalla sezione 9, passo 0.`
>
> Questo documento **sostituisce** `prompt-code-dove-bevo-ricerca-locali.md` di stamattina: lo contiene per intero (parte B). Non usare i due prompt separatamente. Non sostituisce la SPEC: la modifica in modo controllato.

---

## 0. Ruolo, metodo e perché un lavoro unico

Sei un senior engineer, un senior developer e un design engineer. Il codice deve essere ottimizzato alla perfezione nel senso misurabile già in uso: budget numerici, misure prima e dopo in `docs/PROGRESS.md`, nessuna regressione, meno codice e meno dipendenze possibile.

Metodo invariato (CLAUDE.md): plan mode, una funzionalità alla volta, test prima del codice, prove (output dei test, screenshot Playwright 390×844 in Chromium e WebKit, temi chiaro e scuro), `/code-review`, `/security-review`, subagent `spec-reviewer` e `ux-a11y-reviewer`, commit piccoli, PR verso `main`, poi ti fermi.

**UI UX Pro Max, come sempre.** Usa la skill UI UX Pro Max (`nextlevelbuilder/ui-ux-pro-max-skill`) per le regole di UX, accessibilità e interazione e per la checklist pre-consegna a ogni milestone con interfaccia. L'identità visiva invece arriva già decisa in `docs/brand/`. Priorità in caso di conflitto: vincoli della SPEC, sicurezza e privacy, accessibilità WCAG 2.2 AA, codice minimo, `docs/brand/`, indicazioni della skill.

**Perché un lavoro unico.** La ricerca per nome aggiunge una vista e dei risultati; la brand identity rifà tutte le viste. Fatte separatamente, la ricerca verrebbe disegnata con lo stile vecchio e ridisegnata subito dopo, cioè codice scritto due volte. Fatte insieme, la ricerca nasce già con i componenti nuovi. Ordine quindi: fondamenta del brand, poi indice di ricerca, poi le viste (ricerca compresa) con i componenti nuovi.

---

# PARTE A — Brand identity v1

## A1. Perché cambiamo (verificato sul repository il 16/10/2026)

Leggi `docs/brand/01-strategia.md`. La catena di cause:
1. **Anonima.** L'ADR 0011 dice che la skill non aveva la categoria "nightlife" e che si è ripiegato su "Food Delivery / On-Demand": blu `#1D4ED8`, grigio-blu `#F8FAFC`/`#0F172A` e Plus Jakarta Sans "Friendly SaaS". È il linguaggio di migliaia di app di servizi, quindi niente si ricorda.
2. **Statica.** Dopo `Salva` compare un messaggio scuro "Prezzo salvato" con Annulla, senza ricompensa. Il contributo sembra lavoro gratuito, quindi i contributi calano e la mappa resta vuota: il rischio principale della SPEC (sezione 1).
3. **Noiosa e affollata.** Sotto la mappa ci sono quattro bottoni con lo stesso peso visivo. I pin sono pillole bianche indistinte, e il prezzo non è l'elemento principale dello schermo.
4. **Concorrenti.** What's the Beer, Cheep, Tap Map e PintPath (tutte del 2026) sono in inglese, parlano di pinta e usano uno sfondo quasi nero. Dove bevo si distingue con l'aperitivo italiano: crema e spritz di giorno, nero caldo la sera. Il sistema visivo usa quattro oggetti del bar:
   - **tappo a corona**: il posto;
   - **pillola col prezzo**: il dato;
   - **scontrino**: la prova;
   - **timbro**: la ricompensa.

Ogni modifica che proponi deve dire quale di questi punti risolve. Se non ne risolve nessuno, non la fai.

## A2. Il kit in `docs/brand/`

| File | Cosa contiene |
|---|---|
| `README.md` | regole d'uso: colore, tipografia, forme, movimento, icone, logo, divieti |
| `01-strategia.md` | critica verificata sul codice, ricerca, posizionamento, vincolo legale sul tono, fonti |
| `02-voce.md` | lessico di marca e frasi pronte per `it.ts` |
| `03-mappa.md` | stile della mappa e specifica dei pin |
| `tokens.json` | **unica fonte** di colori (temi `light` "Bancone" e `dark` "Fuori orario"), tipografia, spazi, raggi, ombre, bordi |
| `components/*/README.md`, `components/bundle.css` | riferimento per Bottone, ChipDrink, PinPrezzo, Scontrino, Timbro, Copertura, Tessera. Il CSS è un riferimento visivo, non da copiare così com'è |
| `assets/Logo/*.svg` | simbolo, logo orizzontale (anche negativo e mono), icona dell'app |
| `assets/Icone/*.svg` | 9 icone dei drink, una per voce del catalogo (SPEC 6) |
| `fonts/*.woff2` + licenze OFL | Bricolage Grotesque (variabile, peso 200–800, 41 KB) e Geist Mono (variabile, 23 KB), sottoinsieme latino |
| `mockup/*.png`, `mockup/README.md` | 7 schermate a 390×844 e cosa cambia rispetto a oggi |

Nel mockup i nomi dei bar e i prezzi sono di esempio. Non indovinare valori che non sono nei file del kit.

## A3. Cosa resta come oggi (non è in discussione)

- **Catalogo e chip (SPEC 6, D-04):**
  - una chip per ogni drink e formato inseribile, nell'ordine della tabella;
  - predefinita la birra alla spina 0,4 l.
  
  Il mockup mostra solo 5 chip per brevità: conta la SPEC. I tre formati della spina usano la stessa icona.
- **Colori sulla mediana (D-12):** sotto 5 prezzi il pin è **neutro**, cioè pillola `surface` senza glifo. I gradini Affare, Giusto e Salato valgono solo con almeno 5 prezzi e con le soglie in configurazione (0,9 e 1,1 della mediana).
- **"Elenco"**, l'alternativa accessibile alla mappa (SPEC 7.1), resta sulla schermata principale.
- **Flussi, API, D1, quote, privacy, CSP, Annulla da 10 secondi (D-15), 4 tocchi più le cifre:** tutto invariato.

## A4. Nuovi vincoli (si aggiungono a SPEC 2 e a CLAUDE.md)

- **B1. Una sola fonte dei token.**
  - `docs/brand/tokens.json` genera `src/app/styles/tokens.css` con uno script Node senza dipendenze (`scripts/build-tokens.mjs`, eseguito in `npm run build` e in CI). Un test fallisce se il CSS committato non coincide con quello generato.
  - I nomi oggi in uso (`--color-*`, `--price-*`, `--map-pill-*`, `--target*`, `--switch-*` ecc.) migrano ai nomi del kit in un solo passaggio. Ciò che il kit non definisce (target, switch, durate) resta come token tuo dentro lo stesso file generato.
  - Nessun colore esadecimale fuori dai file generati: lo verifica un controllo in CI. I pin su canvas leggono i colori con `getComputedStyle`; il manifest prende `theme_color` e `background_color` dallo stesso script.
- **B2. Font.**
  - Al posto di Plus Jakarta Sans vanno i due woff2 del kit: ≤ 2 file, come vuole la SPEC.
  - `font-display: swap` e `preload` del solo Bricolage.
  - Fallback con `size-adjust`, `ascent-override` e `descent-override` misurati, così CLS resta ≤ 0,05.
  - Totale font ≤ 70 KB. Prima di usare `fonttools` per un sottoinsieme solo italiano, chiedimelo.
- **B3. Colore mai da solo.** Ogni gradino porta glifo (`↓` `=` `↑`) e numero, e ogni pin ha un bordo `ink` da 2px. Le coppie testo/fondo ammesse sono solo quelle nelle note di `tokens.json`. Un test le ricalcola in entrambi i temi: ≥ 4,5:1 per il testo, ≥ 3:1 per bordi e focus.
- **B4. Movimento solo con CSS e Web Animations API.** Con `prefers-reduced-motion` si spegne tutto, anche i movimenti di camera di MapLibre, come oggi.
- **B5. Tono.**
  - Le frasi di `02-voce.md` vanno in `src/app/i18n/it.ts`.
  - Si parla di prezzi e posti, mai di bere tanto. La legge 125/2001, art. 13, vieta di presentare positivamente il consumo nella pubblicità; l'app non è pubblicità, ma il tono deve reggere anche sui social.
  - Un test fallisce se `it.ts` contiene parole dell'elenco vietato, che proponi tu e approvo io.
- **B6. CSP invariata.**
  - Niente attributi `style` nell'HTML statico (MASTER, anti-pattern). In Preact solo la prop `style`, cioè CSSOM, o `setProperty`.
  - La maschera seghettata dello scontrino è un SVG in `data:` dentro il foglio di stile, coperto da `img-src data:`.
  - Il test che fallisce su violazioni CSP in console resta e copre ogni vista nuova.
- **B7. Nessun dato nuovo.**
  - Copertura, prezzi suggeriti e Tessera si calcolano sul dispositivo, da dati già scaricati o già conservati (`localStorage` della SPEC 12).
  - Nessuna richiesta in più a `/api/*`, nessuna riga D1 in più, nessuna chiave nuova in `localStorage`.

## A5. Cosa cambia nell'app

### A5.1 Fondamenta
- Generazione di `tokens.css` (B1) e temi con `prefers-color-scheme`.
- Bottoni, chip e campi:
  - bordo `ink` da 2px e ombra `shadow-stampa`;
  - premuti scendono di 3px.
- Focus: anello `focus` da 3px a 2px di distanza. Oggi sulla mappa c'è un anello a due toni (MASTER): tienilo se il contrasto lo richiede.
- Icone dei drink: modulo unico che estende `src/app/components/Icon.tsx`, inline con `currentColor`, mappate per codice del catalogo.
- `design-system/MASTER.md` e `design-system/pages/*.md` riscritti dal kit, con ADR 0023 che sostituisce l'ADR 0011 per i valori visivi. La skill resta la fonte delle regole UX.

### A5.2 Mappa (`03-mappa.md`)
- **Stile.** Due stili derivati da OpenFreeMap: Positron per Bancone e Dark per Fuori orario.
  - Sono generati da `scripts/build-map-styles.mjs`, che parte dai JSON di OpenFreeMap salvati nel repo e applica i token `map-*`.
  - Sono ospitati in `public/map/` con nome versionato e `Cache-Control` immutabile.
  - Tolti i punti di interesse e le etichette delle strade minori.
  - Glifi, sprite e tessere restano su `tiles.openfreemap.org`, già in `connect-src`: verifica nel JSON.
  - Attribuzione invariata.
- **Cambio di tema.** `matchMedia` porta a `map.setStyle()`. Lo stile nuovo non contiene le sorgenti dei prezzi aggiunte a runtime, quindi dopo `style.load` ri-aggiungi sorgenti e livelli dai dati già in memoria, senza nuove richieste. Misura il tempo.
- **Pin.** Restano un livello simbolo sulla sorgente GeoJSON con clustering.
  - L'immagine di ogni pin (pillola, glifo, prezzo in Geist Mono) si disegna su canvas con `styleimagemissing` + `addImage`, nome `pin-<gradino>-<prezzo>-<tema>`, dopo `document.fonts.load`.
  - Selezionato: tappo a corona spritz.
  - Senza prezzo: punto, con area di tocco da 48px come oggi.
  - Oltre 90 giorni: bordo tratteggiato e corsivo.
  - HH: etichetta come da D-13.
  - Misura CPU e INP prima e dopo con 300 pin.
- **Legenda** "↓ Affare · = Giusto · ↑ Salato" sopra il bottone primario, solo quando la zona ha i colori attivi (D-12).

### A5.3 Schermate (mockup 1–7)
1. **Mappa.**
   - In alto: simbolo, casella "Cerca un bar o una città", "Vicino a me" come icona (se resta, M3-15).
   - Sotto: chip del catalogo e **Copertura**. La Copertura estende la pillola attuale "N bar nella zona" in "X bar su N qui hanno un prezzo", calcolata dai dati già caricati.
   - Poi pin e legenda.
   - In basso: primario a larghezza piena con "Elenco" come secondario accanto o sopra. Il bottone "Aggiungi locale mancante" esce dalla mappa: vedi decisione A7.2.
2. **Scheda bar** = foglio con lo **Scontrino**:
   - righe per drink con icona, data in `meta`, conferme e pin;
   - sezione "In verifica" come oggi (D-10);
   - "Confermo" e il primario "Aggiungi qui";
   - link "È cambiato", "Indicazioni", "Segnala".
3. **Inserimento del prezzo**:
   - avanzamento in tre tratti;
   - bar e drink come chip modificabili;
   - domanda "Quanto l'hai pagato?" e campo `inputmode="decimal"` in `price-xl`;
   - **prezzi già visti in zona** per lo stesso drink e formato, come pin toccabili: un tocco al posto delle cifre, dati della cella già caricati (B7);
   - riga "In zona va da X a Y €, mediana Z €" solo con almeno 5 prezzi;
   - happy hour e "Salva X €".
4. **Salvato**:
   - **Timbro** con la data del giorno al posto del messaggio attuale, con Annulla da 10 secondi invariato;
   - Copertura con "+1 grazie a te";
   - Tessera, se approvata (A7.1);
   - "Aggiungi un altro drink qui" (M3-16) e "Torna alla mappa".
5. **Zona senza prezzi** (copertura sotto il 5%): foglio con "Qui nessuno ha ancora segnato un prezzo." e il primario.
6. **Ricerca**: vedi la parte B. Si aggiunge "I più economici qui" (M4-04) nello stile nuovo.
7. **Fuori orario**: tutto nel tema scuro, progettato e non invertito. La mappa scura dipende dalla decisione A7.3.

### A5.4 Componenti
Un componente per ciascuno, nessun doppione. Prima cerca con `git grep` e **estendi** quelli esistenti: `Sheet`, `BarSheet`, `AddPriceSheet`, `Toast`, `ListSheet`, `SearchSheet`, `PinPanel`.

| Componente | Dove serve |
|---|---|
| `Button` | tutte le viste |
| `DrinkChips` | mappa |
| `PricePill` | elenco, scontrino, suggerimenti, ricerca; condivide le costanti geometriche con i pin su canvas |
| `ReceiptSheet` | evoluzione di `BarSheet` |
| `StampToast` | evoluzione di `Toast` |
| `CoverageMeter` | evoluzione della pillola "bar nella zona" |
| `LoyaltyCard` | Tessera, solo se approvata |

### A5.5 PWA e logo
- Manifest con colori dai token di Bancone.
- Icone PNG 192, 512 e maskable generate da `dovebevo-icona-app.svg` con uno script che usa Playwright, già tra le dipendenze di sviluppo.
- Favicon SVG dal simbolo.
- Sulla mappa basta il simbolo; il logo orizzontale va in `/privacy`, `/regole` e nelle condivisioni.
- Anche `/admin` eredita i token, senza riprogettarlo.

## A6. Budget brand (bloccanti in CI)

- Shell ≤ 50 KB gzip esclusa MapLibre, invariata.
- Font ≤ 70 KB.
- LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,05.
- Lighthouse ≥ 90 Performance e ≥ 95 sugli altri.
- Righe D1 e richieste per vista e per contributo invariate (test M3-20).
- axe senza violazioni nei due temi.

## A7. Decisioni da chiedermi con AskUserQuestion (solo queste, al passo 1)

1. **Tessera** (timbri a 1, 5, 10, 25 e 50 prezzi dal contatore già in `localStorage`): la teniamo? Default proposto: sì.
2. **"Aggiungi locale mancante"** fuori dalla mappa: resta raggiungibile da tre punti:
   - il passo "Bar" dell'inserimento (SPEC 7.5);
   - la ricerca senza risultati (parte B);
   - lo stato "zona senza prezzi".
   
   Default proposto: sì.
3. **Mappa scura in Fuori orario.** Oggi la mappa resta chiara in entrambi i temi (MASTER), e SPEC 4 ammette solo `liberty` o `positron`. Lo stile scuro richiede la mia deroga in SPEC 1.3. Default proposto: sì, con lo stile derivato da Dark.
4. **"Aggiungi prezzo" diventa "Segna un prezzo"?** Il testo compare nelle verifiche congelate della feature list (M2-05, M3-11, M3-16 e test e2e). Cambiarlo richiede di modificare quelle verifiche col nuovo tag. Default proposto: sì, nello stesso commit `chore(spec)` della parte B.
5. **Spritz preselezionato dalle 17 alle 21** invece della birra 0,4 l sempre (D-04)? Default proposto: no, resta la SPEC.
6. **Elenco delle parole vietate** in `it.ts` (B5): proponimelo.

---

# PARTE B — Ricerca per nome del locale (dal prompt di stamattina, integrato)

## B1. Obiettivo

Oggi `SearchSheet` trova le città da `places.json` e i bar solo tra quelli delle celle già caricate (M4-06). Se l'utente scrive il nome di un locale che non ha sullo schermo, non trova niente. Ho verificato che per l'utente è più facile cercare per nome del locale che per città.

Obiettivo: dalla stessa casella si trova **qualunque bar d'Italia per nome**, senza aver scelto prima la città, senza server e senza account.

La ricerca per quartiere **non** si fa: i dati OSM sui quartieri sono incompleti e darebbero risultati sbagliati senza segnalarlo.

## B2. Vincoli

1. **Nessuna ricerca lato server** (SPEC 7.6, 20). Si usano solo file statici, che non eseguono il Worker. Criterio di accettazione: **zero richieste a `/api/*` e zero letture D1 per ogni ricerca**.
2. Nessuna dipendenza nuova. Niente librerie fuzzy (Fuse, MiniSearch, Lunr): la corrispondenza per prefisso di parola si scrive in poche righe.
3. **Limiti dei file statici:**
   - totale file ≤ 15.000, compresi i `v/<geohash5>.json` esistenti;
   - nessun file sopra 1 MB.
   
   Conta soprattutto il peso che scarica il telefono.
4. **Privacy.** Al CDN arriva il nome del frammento, cioè i primi caratteri digitati, mai la posizione. Va dichiarato con una riga in `PRIVACY-NOTES.md`. La ricerca non chiede il permesso di posizione.
5. **Una sola normalizzazione.** Esiste già `searchKey` in `src/shared/venue`: verifica che la usino sia lo script di import sia il client. Se i due normalizzano in modo diverso, la ricerca fallisce senza errori visibili. Un test con casi reali lo impedisce: `Caffè`, `l'Osteria`, `Bar Sport`, `Più`, `Trattoria da Mario`.

## B3. Disegno proposto (da validare con le misure del passo 0)

- **Perché né un indice unico né uno per città.** 100–150 mila bar pesano alcuni MB gzip, troppi per un telefono. L'indice per città obbliga a scegliere prima la città. Resta l'**indice a frammenti per prefisso di parola**.
- **Generazione.** `scripts/osm-import/` genera, accanto ai file esistenti in `public/data/<DATA_VERSION>/`, i frammenti `s/<prefisso>.json`.
  - Ogni nome si divide in parole normalizzate.
  - Le parole di almeno 3 caratteri, esclusa una lista di parole vuote (`bar`, `caffe`, `pub`, `di`, `da`, `del`, `la`, `il`, `the`, …), vanno nel frammento del loro prefisso di 2 caratteri.
  - Voce del frammento: `[key, nome, lat, lon, cityId]`. Usa `cityId` (ID del nodo OSM, D-11), non un indice: resta stabile tra `DATA_VERSION`.
- **Frammenti troppo grandi** (sopra il budget): si dividono in prefissi di 3 caratteri. Il manifest `s/index.json`, piccolo e caricato al primo uso della ricerca, dice quali prefissi sono divisi.
- **Client**, da 3 caratteri digitati:
  - normalizza e scarica una volta il frammento della prima parola significativa (cache immutabile, in memoria per la visita);
  - tiene le voci in cui **tutte** le parole digitate sono prefisso di una parola del nome;
  - mostra al massimo 8 bar insieme alle città, come oggi.
- **Ordinamento:** nome esatto, poi inizio del nome, poi vicinanza al centro della mappa o alla posizione (solo se il permesso è già concesso, senza chiederlo), poi alfabetico. "Bar Sport" esiste in ogni città: senza la distanza il primo risultato sarebbe casuale.
- **Scelta di un bar:** la mappa vola a zoom 17, le celle si caricano come oggi e si apre la scheda dalla `key`. I risultati non mostrano prezzi, quindi nessuna lettura prima della scelta.
- **Nessun risultato:** "Non trovo questo locale" e un pulsante che apre il flusso "Non trovi il bar?" (SPEC 7.5) col nome già scritto. Una ricerca fallita diventa un contributo.
- **Budget bloccanti:**
  - frammento ≤ 40 KB gzip;
  - ricerca tipica ≤ 60 KB scaricati;
  - risultati ≤ 150 ms con frammento in memoria e ≤ 1 s su rete mobile media;
  - codice di ricerca caricato a richiesta, nessun peso sulla shell.

Se le misure del passo 0 bocciano questo disegno, proponimi in ADR l'alternativa più semplice, con i numeri.

## B4. Da verificare nel codice (non ipotizzare)

1. **Cosa esiste già:** `SearchSheet.tsx`, `searchKey`, `git grep -n "places.json\|search" src/`. Estendi, nessun secondo punto di ingresso.
2. **Bar nascosti dall'admin (ADR 0017).** I file statici non cambiano, quindi un bar nascosto comparirebbe tra i risultati e poi sparirebbe alla scelta. Proponi il modo più semplice di escluderli, per esempio un elenco corto di chiavi nascoste servito senza letture D1 per ricerca, oppure documenta il limite con il messaggio mostrato all'utente. Decido io dopo l'ADR.
3. **Bar utente approvati** (chiavi `u…`): non sono nei file statici. Default proposto: limite documentato in questa versione, perché compaiono comunque sulla mappa.
4. **Bar senza nome:** sono già esclusi dall'import (SPEC 5.1). Riporta quanti sono.

## B5. Interfaccia (nello stile della parte A)

- Stessa casella e stesso `SearchSheet`, nessuna schermata nuova. Elenco unico con il tipo indicato:
  - città, con il numero di bar;
  - bar, con nome, tipo, città e distanza se nota.
- La parte di nome corrispondente è evidenziata con un `<mark>` su fondo `affare`.
- Accessibilità:
  - schema ARIA `combobox`: frecce, Invio, Esc;
  - `aria-live` con il numero di risultati;
  - target ≥ 48×48 px;
  - volo della mappa rispettoso di `prefers-reduced-motion`.
- Download del frammento: indicatore discreto, la digitazione non si blocca.
- Errore di rete: "Ricerca non disponibile ora, cerca una città", e la ricerca per città continua a funzionare.

---

# 9. Ordine di lavoro (unico)

0. **Stato reale, nessuna modifica.**
   - Screenshot 390×844 di ogni vista nei due temi, Chromium e WebKit, in `docs/brand/prima/`.
   - Inventario di colori, font, raggi e componenti con dove sono definiti, più i valori duplicati.
   - Misure: shell, font, Lighthouse, INP con 300 pin, CPU del Worker.
   - Per la ricerca: numero di bar e di bar senza nome; file attuali e margine sotto 15.000; distribuzione dei frammenti con il peso gzip dei 10 più grandi; gestione dei bar nascosti.
   - Confronta lo stato reale con A1 e dimmi dove la critica non regge.
   
   Fermati.
1. **Piano e documenti.**
   - Domande A7 e decisioni di B4.
   - ADR 0023 (brand identity v1) e ADR 0024 (indice di ricerca a frammenti).
   - SPEC 1.3 con il registro delle modifiche.
   - `design-system/` aggiornato dal kit.
   - Feature list in un commit dedicato `chore(spec): …`: voci nuove con `"passes": false` per brand e ricerca, M4-06 sostituita dalla ricerca nazionale e, se approvato, il nuovo testo del bottone nelle verifiche.
   - Proponimi il tag `spec-approved-4` e l'adeguamento di CLAUDE.md, che oggi cita ancora `spec-approved-2`. Non toccare il ruleset dei tag.
   
   Fermati per il mio ok.
2. **Fondamenta brand:** `build-tokens`, `tokens.css`, font, Button, focus, icone. Prove: screenshot prima e dopo, pesi.
3. **Indice di ricerca:** stessa normalizzazione nell'import, frammenti, manifest, controlli di budget nello script. Test prima del codice.
4. **Mappa:** stili generati, cambio tema, pin su canvas, Copertura, legenda.
5. **Viste:** scheda (Scontrino), inserimento, salvato (Timbro), zona vuota, ricerca (parte B con i componenti nuovi), Fuori orario. Una funzionalità alla volta.
6. **Testi** in `it.ts` da `02-voce.md` e test delle parole vietate.
7. **PWA e icone.**
8. **Chiusura:**
   - checklist pre-consegna di UI UX Pro Max e revisioni;
   - `docs/brand/dopo/` con gli stessi screenshot del passo 0;
   - pesi, Lighthouse, INP, CPU e righe D1 prima e dopo in `PROGRESS.md`;
   - `git diff --shortstat` per PR, con il saldo di righe giustificato.

# 10. Prove richieste

**Brand**
- Screenshot prima e dopo di ogni vista, due temi, Chromium e WebKit.
- `tokens.css` coincide con quello generato. Nessun esadecimale fuori dai file generati. Contrasti verificati da test in entrambi i temi.
- Pin: gradino, glifo e prezzo corretti rispetto alla mediana; neutro sotto 5 prezzi; tratteggiato oltre 90 giorni; tappo quando selezionato.
- Copertura uguale al calcolo a mano su un caso di test, **senza richieste di rete in più** all'apertura e al movimento della mappa.
- Inserimento: e2e che conta i tocchi, ≤ 4 più le cifre, e 4 senza cifre usando un prezzo suggerito.
- Timbro: Annulla entro 10 secondi produce nessuna `POST /api/prices`; dopo 10 secondi una sola. D-15 invariato.
- Nessuna violazione CSP, nessun attributo `style` nell'HTML servito, `prefers-reduced-motion` rispettato, `it.ts` senza parole vietate.

**Ricerca**
- Scrivo 3 caratteri di un locale che non è sullo schermo: compare. Lo scelgo: la mappa vola e la scheda si apre. Contare tocchi e tempo.
- **Nessuna richiesta a `/api/*` durante la ricerca** e nessuna riga D1 letta.
- Stessa normalizzazione tra import e client: `Caffè Roma` si trova con `caffe roma`, `roma caf` e `CAFFÈ`. `bar sport` richiede entrambe le parole; l'ordine delle parole non cambia i risultati.
- Con la mappa su Milano, "Bar Sport" mostra prima quelli di Milano. Il permesso di posizione non viene mai chiesto.
- Tutti i frammenti ≤ 40 KB gzip, totale file ≤ 15.000, nessun file > 1 MB (controlli nello script).
- Frammento non scaricabile: messaggio gentile, la ricerca per città funziona, nessun errore in console.
- Nessun risultato: "Non trovi il bar?" col nome precompilato.
- Bar nascosto dall'admin escluso, oppure il comportamento deciso in ADR.
- Percorso completo da tastiera e screen reader; axe senza violazioni; screenshot di campo vuoto, digitazione, risultati, nessun risultato ed errore.

**Finito** significa:
- viste conformi al mockup e al kit;
- una sola fonte per token e normalizzazione;
- zero richieste al Worker per ricerca;
- budget rispettati con le misure;
- accessibilità verificata nei due temi;
- ADR, SPEC, feature list e `PRIVACY-NOTES.md` aggiornati;
- revisioni chiuse.

# 11. Notion

Dopo il mio ok al passo 1, proponimi l'aggiornamento della pagina "Dove bevo" e scrivi solo dopo la mia conferma.

- **Step operativi:**
  - "Applicare la brand identity v1 (kit in docs/brand)";
  - "Ricerca per nome del locale".
- **Decisioni** (Stato: Deciso, Data: 16/10/2026):
  - "Identità visiva: tappo, pillola del prezzo, scontrino, timbro; spritz unico colore di marca; tema chiaro principale";
  - "Gradini di prezzo Affare / Giusto / Salato con glifo";
  - "Tono: si parla di prezzi e posti, mai di bere tanto";
  - "La ricerca dei bar per nome usa indici statici a frammenti, senza server né quota D1";
  - "Niente ricerca per quartiere: dato OSM non affidabile".

# 12. Fuori ambito

Grafiche per i social, merchandising e adesivi; ricerca per quartiere; funzioni non elencate qui; account, punti o classifiche lato server; pubblicità.

Fine del prompt. Nessun codice applicativo prima del mio ok al passo 1.
