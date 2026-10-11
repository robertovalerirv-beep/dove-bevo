# Dove bevo — Design system (MASTER)

> Vale ovunque; il file di pagina in `pages/` prevale. Token implementati in `src/app/styles/tokens.css`. Stato: **approvato da Roberto l'11/10/2026 con la palette C "Blu e arancio"** (M0-10).

## Fonte e scelte
Generato con UI UX Pro Max 2.13 (SPEC 15.1). La query di SPEC (in italiano) e una riformulazione in inglese ("nightlife bar drink prices map mobile app") hanno restituito un risultato fuori tema (landing di documentazione, font accademici): **non** è stato salvato. Il catalogo non ha la categoria "nightlife"; la più vicina è **Food Delivery / On-Demand** (mobile, mappa, uso rapido, prezzi):
- stile **Vibrant & Block-based**: blocchi netti, alto contrasto, energico, giovane;
- palette di partenza **arancio caldo + blu fiducia** (`--domain color "food delivery restaurant warm"`); Roberto ha scelto fra tre varianti la **C: blu come colore principale, arancio per focus e dettagli** (verde e rosso esclusi come principali perché indicano i prezzi);
- tipografia: la coppia suggerita (Playfair Display SC + Karla) è scartata perché richiederebbe più di 2 file woff2 (SPEC 15.1.4); si usa **Plus Jakarta Sans** variabile (`--domain typography`, "Friendly SaaS"/"Mobile"), un solo file.

Correzioni per i vincoli (prevalgono su skill): colori scuriti finché ogni coppia testo/sfondo ≥ 4,5:1 nei due temi (calcolo in PROGRESS); motion al minimo (dial 3/10) e nessuna libreria di animazione; niente hero né landing: l'app apre direttamente sulla mappa.

## Principi (SPEC 15)
Una schermata, un'azione primaria. Uso con una mano, al bancone, con poca luce: comandi principali nella metà bassa dello schermo, target ≥ 48×48 px, testo ≥ 16 px nei controlli. Il prezzo è il contenuto: sempre scritto in cifre, mai solo colore. Italiano semplice. Nessuna emoji come icona.

## Colore (token semantici; nei componenti mai valori grezzi)
| Token | Chiaro | Scuro | Uso |
|---|---|---|---|
| `--color-bg` | `#F8FAFC` | `#0F172A` | sfondo app |
| `--color-surface` | `#FFFFFF` | `#1E293B` | fogli, schede, liste |
| `--color-text` | `#0F172A` | `#F8FAFC` | testo |
| `--color-text-muted` | `#475569` | `#CBD5E1` | testo secondario, date |
| `--color-primary` | `#1D4ED8` | `#93C5FD` | azione primaria ("Aggiungi prezzo", "Salva") |
| `--color-on-primary` | `#FFFFFF` | `#0F172A` | testo su primario |
| `--color-focus` | `#C2410C` | `#FDBA74` | anello di focus, dettagli |
| `--color-border` | `#E2E8F0` | `#334155` | separatori decorativi |
| `--color-border-strong` | `#64748B` | `#94A3B8` | bordi di campi e controlli (≥ 3:1) |
| `--color-error` | `#B91C1C` | `#FCA5A5` | errori (sempre con testo) |
| `--price-cheap` / `--on-price-cheap` | `#15803D` / `#FFFFFF` | `#4ADE80` / `#052E16` | più economico della mediana (D-12) |
| `--price-avg` / `--on-price-avg` | `#A16207` / `#FFFFFF` | `#FACC15` / `#422006` | nella media |
| `--price-high` / `--on-price-high` | `#B91C1C` / `#FFFFFF` | `#F87171` / `#450A0A` | più caro |
| `--price-neutral` / `--on-price-neutral` | `#FFFFFF` / `#0F172A` | `#1E293B` / `#F8FAFC` | < 5 prezzi o bar senza prezzo (con bordo `--color-border-strong`) |

Il tema segue `prefers-color-scheme`; nessun interruttore (niente onboarding/impostazioni in Fase 0). Il colore della mediana è sempre accompagnato dal valore e, nell'elenco accessibile, da un testo ("più economico", "nella media", "più caro").

## Tipografia
- Famiglia unica: `"Plus Jakarta Sans", system-ui, sans-serif`, variabile 200–800, file `public/fonts/plus-jakarta-sans-latin-wght.woff2` (27 KB, latin con accenti e €), licenza OFL in `public/fonts/OFL.txt`, `font-display: swap`.
- Scala (rem, base 16 px): `--text-sm` 0,875 · `--text-md` 1 · `--text-lg` 1,25 · `--text-xl` 1,5 · `--text-2xl` 2. Interlinea 1,5 (titoli 1,2). Pesi: 400 testo, 600 etichette e prezzi, 800 titoli.
- Prezzi in cifre tabellari (`font-variant-numeric: tabular-nums`), formato `7,50 €`.
- Nessun testo sotto 14 px (0,875 rem); rispettare lo zoom del browser (nessun `maximum-scale`).

## Spaziatura, forma, elevazione
- Spazi multipli di 4: `--space-1` 4 · `--space-2` 8 · `--space-3` 12 · `--space-4` 16 · `--space-6` 24 · `--space-8` 32 px.
- Raggi: `--radius-sm` 8 (campi, chip), `--radius-md` 12 (schede), `--radius-pill` 999 (segnaposto prezzo, chip).
- Blocchi pieni con bordo netto invece di ombre sfumate; un'unica ombra `--shadow-sheet` per i fogli sopra la mappa.
- Target: `--target` 48 px minimo, spazio ≥ 8 px tra target adiacenti.

## Movimento
`--duration-fast` 150 ms (feedback al tocco), `--duration-base` 200 ms (fogli, toast); easing `ease-out`. Con `prefers-reduced-motion: reduce` tutte le durate vanno a 0 e la mappa non anima gli spostamenti. Nessuna animazione decorativa.

## Componenti di base
- **Pulsante primario**: pieno `--color-primary`, testo `--color-on-primary` 600, altezza 56 px, larghezza piena nei fogli; fisso in basso sulla mappa ("Aggiungi prezzo").
- **Pulsante secondario**: superficie con bordo `--color-border-strong`, altezza 48 px.
- **Chip** (drink): pill 48 px di altezza, selezionata = piena primario con `aria-pressed="true"`.
- **Segnaposto prezzo**: pill con prezzo in 600 tabellare, colore secondo D-12; bar senza prezzo = punto neutro piccolo ma con area di tocco 48 px.
- **Foglio (bottom sheet)**: superficie, raggio 12 in alto, maniglia visiva, chiudibile con Esc e pulsante "Chiudi".
- **Toast** ("Prezzo salvato" + "Annulla"): in basso sopra il pulsante primario, `role="status"`, 10 s.
- **Focus**: anello 3 px `--color-focus` con offset 2 px su ogni elemento interattivo, mai rimosso.
- **Icone**: SVG inline a tratto 2 px, 24 px (`--icon-md`), decorative con `aria-hidden="true"`; solo icona → `aria-label`.

## Mappa
Stile OpenFreeMap **positron** (neutro e chiaro: fa risaltare i segnaposto colorati) in entrambi i temi; uno stile scuro richiederebbe una deroga a SPEC 4 (solo `liberty` o `positron`), da decidere con Roberto. Attribuzioni sempre visibili in basso a sinistra, sopra il pulsante primario, contrasto AA.

**Elementi sopra la mappa** (la mappa resta chiara anche in tema scuro; revisione UX di M0): i segnaposto usano sempre i token prezzo del tema chiaro, con bordo 2 px `#0F172A`, così il contrasto non testuale verso la mappa resta ≥ 3:1 (WCAG 1.4.11); il focus sui controlli sopra la mappa è un anello a due toni (anello `--color-focus` più un bordo interno del colore opposto). I movimenti di camera di MapLibre rispettano `prefers-reduced-motion` anche in JavaScript.

## Anti-pattern
Colori spenti e testo grigio su grigio; emoji come icone; prezzo comunicato solo dal colore; hero o splash; animazioni in ingresso; testo dentro immagini; target piccoli vicini; stili inline (vietati anche dalla CSP).

## Checklist pre-consegna (da UI UX Pro Max, a ogni milestone con interfaccia)
- [ ] Nessuna emoji come icona; icone SVG di un'unica famiglia e tratto
- [ ] Feedback visivo al tocco senza spostamenti di layout
- [ ] Target ≥ 48×48 px, ordine di focus uguale all'ordine visivo, etichette descrittive
- [ ] Contrasto testo ≥ 4,5:1 e controlli ≥ 3:1 verificati **separatamente** in chiaro e scuro
- [ ] `prefers-reduced-motion` rispettato; zoom testo 200% senza perdita di contenuto
- [ ] Provato a 375 e 390 px e in orizzontale; nessun contenuto sotto le aree sicure (`env(safe-area-inset-*)`)
- [ ] Solo token semantici, nessun colore grezzo nei componenti
