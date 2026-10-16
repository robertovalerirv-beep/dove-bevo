# 0023 · Brand identity v1 (Bancone e Fuori orario)

- **Stato:** proposta (decisioni A7 di Roberto del 2026-10-16, in attesa dell'ok al passo 1) · **Data:** 2026-10-16
- **Sostituisce** l'ADR 0011 per i valori visivi (colori, font, forme, movimento). UI UX Pro Max resta la fonte delle regole di UX, accessibilità e interazione e della checklist pre-consegna.

## Contesto
Il design system di M0 viene da una categoria di ripiego ("Food Delivery / On-Demand", ADR 0011): blu `#1D4ED8`, grigio-blu, Plus Jakarta Sans. Il passo 0 (PROGRESS, 16/10) conferma sugli screenshot che l'interfaccia non ha segni propri, che dopo `Salva` c'è solo un messaggio con Annulla e che sotto la mappa ci sono quattro bottoni di pari peso. Precisa anche tre cose: i pin sono bianchi perché i colori sulla mediana (D-12, M4-03) non sono ancora implementati; sulla mappa i cerchi dei cluster si notano più dei prezzi; non ci sono esadecimali fuori da `tokens.css`. Il kit `docs/brand/` (Roberto, 16/10) definisce identità, token, componenti e mockup. Ogni modifica deve risolvere uno dei punti di A1 (anonima, statica, affollata, indistinta dai concorrenti).

## Decisione
1. **Una sola fonte dei token**: `docs/brand/tokens.json`. `scripts/build-tokens.mjs` (Node, nessuna dipendenza, in `npm run build` e in CI) genera `src/app/styles/tokens.css` e i colori del manifest. Un test fallisce se il CSS committato è diverso da quello generato; un controllo in CI fallisce su un esadecimale fuori dai file generati. I nomi `--color-*`, `--price-*`, `--map-pill-*` migrano ai nomi del kit in un passaggio unico; ciò che il kit non definisce (target, switch, durate, larghezza dei fogli) resta un token nostro nello stesso file, in una sezione separata dello script.
2. **Temi**: Bancone (chiaro, principale) e Fuori orario (scuro, progettato), da `prefers-color-scheme`. **Mappa scura in Fuori orario** (decisione A7.3): deroga a SPEC 4 e al MASTER di M0, vedi D-27.
3. **Font**: Bricolage Grotesque (testo) e Geist Mono (prezzi e metadati), 2 woff2 del kit, 64.472 B in tutto (budget 70 KB). `font-display: swap`, `preload` del solo Bricolage, fallback con `size-adjust`/`ascent-override`/`descent-override` misurati (CLS ≤ 0,05). Nessun sottoinsieme ulteriore senza chiedere.
4. **Colore mai da solo**: gradini Affare `↓`, Giusto `=`, Salato `↑`, sempre con glifo, numero e bordo `ink` 2 px. Ammesse solo le coppie testo/fondo delle note di `tokens.json`; un test le ricalcola nei due temi (≥ 4,5:1 testo, ≥ 3:1 bordi e focus). Sotto 5 prezzi il pin è neutro (D-12 invariato, soglie 0,9 e 1,1 in configurazione).
5. **Stili della mappa**: `scripts/build-map-styles.mjs` parte da Positron e Dark di OpenFreeMap salvati nel repo, applica i token `map-*`, toglie i punti di interesse e le etichette delle strade minori, e scrive `public/map/<nome>-<hash>.json` con cache immutabile. Glifi, sprite e tessere restano su `tiles.openfreemap.org` (già in `connect-src`). Al cambio di tema `setStyle()` e, dopo `style.load`, sorgenti e livelli dei prezzi si ri-aggiungono dai dati in memoria, senza richieste nuove. *Alternativa scartata*: modificare lo stile a runtime in `loadStyle()` come oggi; costa meno righe ma lega l'aspetto alle versioni dello stile pubblicato da OpenFreeMap, che possono cambiare senza preavviso, e richiede uno scaricamento in più al cambio di tema. Il file generato invece si rivede nel diff.
6. **Pin su canvas**: restano un livello `symbol` sulla sorgente GeoJSON con clustering. Ogni immagine (`pin-<gradino>-<prezzo>-<tema>`) si disegna con `styleimagemissing` + `addImage` dopo `document.fonts.load`; selezionato = tappo spritz; senza prezzo = punto con area di tocco 48 px; oltre 90 giorni = bordo tratteggiato e corsivo; HH come D-13. Le costanti geometriche sono condivise con `PricePill` (HTML). Legenda solo con i colori attivi.
7. **Componenti** (estensione degli esistenti, nessun doppione): `Button` (oggi solo classi `.btn`), `DrinkChips`, `PricePill`, `ReceiptSheet` (da `BarSheet`), `StampToast` (da `Toast`), `CoverageMeter` (dalla pillola "N bar nella zona"), `LoyaltyCard` (Tessera, decisione A7.1). Icone dei drink in un modulo unico che estende `Icon.tsx`, inline con `currentColor`.
8. **Nessun dato nuovo**: Copertura, prezzi suggeriti e Tessera si calcolano dai dati già scaricati e dal contatore già in `localStorage` (SPEC 12). Nessuna richiesta in più a `/api/*`, nessuna riga D1, nessuna chiave `localStorage` nuova.
9. **Movimento** solo CSS e Web Animations API; `prefers-reduced-motion` spegne tutto, anche le animazioni di camera.
10. **CSP invariata**: nessun attributo `style` nell'HTML statico; in Preact solo la prop `style` (CSSOM) o `setProperty`; maschera dello scontrino come SVG `data:` nel CSS (`img-src data:`).
11. **Testi**: frasi di `docs/brand/02-voce.md` in `it.ts`, **tranne** il bottone primario, che resta «Aggiungi prezzo» (decisione A7.4: le verifiche congelate restano). Test che fallisce sulle parole vietate (elenco approvato da Roberto, D-31).
12. **"Aggiungi locale mancante" esce dalla mappa** (decisione A7.2): resta nel passo Bar, nella ricerca senza risultati e nella zona senza prezzi (D-28).
13. Invariati: catalogo e chip (D-04, nessuno spritz a orario, decisione A7.5), "Elenco", flussi, API, D1, quote, privacy, Annulla da 10 s (D-15), 4 tocchi più le cifre.

## Misure prima (PROGRESS, 16/10)
Shell 33.129 B gzip · font 27.348 B · Lighthouse 0,99/1/1/1, LCP ~1,97 s, CLS 0 · interazione peggiore con 300 prezzi 88–128 ms (CPU 4×). Le stesse misure "dopo" chiudono il lavoro.

## Conseguenze
- `design-system/MASTER.md` e `pages/*.md` sono riscritti dal kit; i valori stanno solo in `tokens.json`.
- Si aggiungono due script di build (token, stili della mappa) e uno per le icone PNG dell'app (Playwright, già tra le dipendenze di sviluppo).
- Il tema scuro raddoppia gli screenshot di verifica e i controlli di contrasto.
- `public/map-italia.jpg` (ADR 0014) va rigenerata con il nuovo stile Bancone.
