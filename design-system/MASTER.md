# Dove bevo — Design system (MASTER)

> Vale ovunque; il file di pagina in `pages/` prevale. **Dalla SPEC 1.3 (ADR 0023) l'identità visiva viene da `docs/brand/`**: i valori stanno solo in `docs/brand/tokens.json`, che genera `src/app/styles/tokens.css` (`scripts/build-tokens.mjs`). Questo file è la sintesi operativa; in caso di dubbio prevale il kit. UI UX Pro Max resta la fonte delle regole UX, accessibilità e interazione e della checklist pre-consegna. Il design system di M0 (palette blu "C", Plus Jakarta Sans, ADR 0011) è superato per i valori visivi.

Priorità in conflitto: vincoli SPEC → sicurezza e privacy → WCAG 2.2 AA → codice minimo → `docs/brand/` → skill.

## Idea
Quattro oggetti del bar, usati come sistema e non come decorazione: **tappo a corona** = il posto (simbolo, pin selezionato) · **pillola col prezzo** = il dato · **scontrino** = la prova (scheda bar) · **timbro** = il grazie (dopo `Salva`). Ogni scelta deve risolvere un punto della critica (`docs/brand/01-strategia.md`): anonima, statica, affollata, indistinta dai concorrenti.

## Principi (SPEC 15, invariati)
Una schermata, un'azione primaria. Una mano, poca luce: comandi nella metà bassa, target ≥ 48×48 px, testo ≥ 16 px. Il prezzo è il contenuto: sempre in cifre, mai solo colore. Italiano semplice (`docs/brand/02-voce.md`). Nessuna emoji.

## Colore
- Temi **Bancone** (chiaro, principale) e **Fuori orario** (scuro, progettato, non invertito), da `prefers-color-scheme`, nessun interruttore. La mappa cambia stile con il tema (D-27).
- Token (nomi del kit): `bg`, `surface`, `surface-2`, `ink`, `ink-muted`, `line-soft`, `spritz`, `on-spritz`, `spritz-text`, `affare`/`on-affare`, `giusto`/`on-giusto`, `salato`/`on-salato`, `focus`, `map-land`, `map-water`, `map-park`, `map-road`, `map-label`. Valori e usi in `tokens.json`.
- `spritz` è l'unico colore di marca: azione primaria, logo, selezione. **Un solo bottone `spritz` per schermata.** Mai come testo su `bg` (usa `spritz-text`).
- Gradini sulla mediana (D-12): **Affare** `↓` (lime), **Giusto** `=` (carta), **Salato** `↑` (vino). Sempre glifo + numero + bordo `ink` 2 px; sotto 5 prezzi pillola `surface` neutra senza glifo.
- Coppie testo/fondo **solo** quelle delle note di `tokens.json`; un test le ricalcola nei due temi (≥ 4,5:1 testo, ≥ 3:1 bordi, pin, focus).
- Vietati: gradienti, viola-blu, `#000` o bianco puro come sfondo, colori esadecimali fuori dai file generati.

## Tipografia
- **Bricolage Grotesque** (`sans`, variabile 200–800) per tutto il testo; **Geist Mono** (`mono`) solo per `price-xl`, `price`, `meta`. Due woff2 del kit, self-hosted, ≤ 70 KB in tutto, `font-display: swap`, preload del solo Bricolage, fallback con metriche misurate.
- Stili: `display` (una volta per schermata), `title`, `subtitle`, `body` (mai sotto 16 px), `label`, `caption`, `price-xl`, `price`, `meta` (maiuscolo solo qui). Cifre tabellari negli elenchi.
- Prezzi in formato italiano: `6,50 €` nelle schede, `6,50` nei pin.

## Forme, spazi, ombre
- Ogni controllo: bordo `ink` `border-strong` (2 px) e ombra `shadow-stampa` (piena, spostata, niente sfocature); `:active` trasla di 3 px e passa a `shadow-premuto`.
- Raggi: `radius-pill` chip, pin, contatori · `radius-md` bottoni e schede · `radius-lg` fogli dal basso · `radius-sm` campi.
- Spazi `space-1…8` (4–32 px), margine di pagina `space-4`. Separatori `line-soft` 1 px, mai come bordo di un controllo.
- Token nostri non definiti dal kit (restano nello stesso file generato): `--target` 48, `--target-primary` 56, `--target-row` 64, switch, durata del toast 10 s, larghezza massima dei fogli.

## Focus
Anello `focus` pieno da 3 px con 2 px di distanza, così cade su `bg` o `surface`; mai dentro un bottone `spritz`. Sopra la mappa resta l'anello a due toni se il contrasto lo richiede.

## Movimento
120 ms tocchi · 180 ms fogli · 260 ms timbro. Entrata `cubic-bezier(.2,.8,.2,1)`; rimbalzo `cubic-bezier(.3,1.6,.5,1)` solo per timbro e tappo. Pin che compaiono: scala 0,6→1 sfalsata di 20 ms, al massimo 12. Solo CSS e Web Animations API. `prefers-reduced-motion: reduce` → dissolvenza di 120 ms o nulla, anche per la camera di MapLibre.

## Componenti (uno per tipo, si estendono quelli esistenti)
| Componente | Da | Note |
|---|---|---|
| `Button` | classi `.btn` | primario `spritz` 56 px, secondario `surface` 48 px, tutti con bordo `ink` e ombra stampa |
| `DrinkChips` | `.chips` | una chip per drink e formato inseribile (SPEC 6), icona del drink; selezionata con `aria-pressed` |
| `PricePill` | `.row__price` | stessa geometria dei pin su canvas |
| `ReceiptSheet` | `BarSheet` | scontrino: bordo inferiore seghettato (`mask-image` SVG `data:` nel CSS), max 5 righe poi "Vedi tutti" |
| `StampToast` | `Toast` | timbro con la data, Annulla 10 s invariato, `role="status"` |
| `CoverageMeter` | pillola "N bar nella zona" | "X bar su N qui hanno un prezzo" |
| `LoyaltyCard` | nuovo | Tessera (D-29) |
Icone: 24 px, tratto 2 px, inline con `currentColor`, decorative con `aria-hidden`; i 9 drink da `docs/brand/assets/Icone/`.

## Mappa
Vedi `docs/brand/03-mappa.md` e `pages/mappa.md`. Stili derivati da Positron (Bancone) e Dark (Fuori orario) con i token `map-*`, senza punti di interesse né etichette delle strade minori. I pin sono un livello `symbol` con immagini disegnate su canvas. Attribuzioni sempre visibili.

## Logo
Simbolo sulla mappa; logo orizzontale in `/privacy`, `/regole` e nelle condivisioni; negativo su fondo scuro; mono sotto 24 px. Icona dell'app: simbolo crema su `spritz`.

## Anti-pattern
Promuovere il bere (D-31); nero freddo con neon; scontrino come muro di testo; più di un bottone `spritz` per schermata; prezzo comunicato solo dal colore; emoji; animazioni decorative; stili inline nell'HTML statico (CSP); target piccoli vicini.

## Checklist pre-consegna (UI UX Pro Max, a ogni milestone con interfaccia)
- [ ] Nessuna emoji come icona; icone SVG di un'unica famiglia e tratto
- [ ] Feedback visivo al tocco senza spostamenti di layout
- [ ] Target ≥ 48×48 px, ordine di focus uguale all'ordine visivo, etichette descrittive
- [ ] Contrasto testo ≥ 4,5:1 e controlli ≥ 3:1 verificati **separatamente** in Bancone e Fuori orario
- [ ] `prefers-reduced-motion` rispettato; zoom testo 200% senza perdita di contenuto
- [ ] Provato a 375 e 390 px e in orizzontale; nessun contenuto sotto le aree sicure (`env(safe-area-inset-*)`)
- [ ] Solo token generati da `tokens.json`, nessun colore grezzo nei componenti
- [ ] Un solo bottone `spritz` per schermata; testi da `02-voce.md`, nessuna parola vietata
