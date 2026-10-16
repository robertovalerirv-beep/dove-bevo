# Inventario dello stato attuale (passo 0, 16/10/2026)

Commit di riferimento: `7549eda` (main). Screenshot in questa cartella: `<vista>-<motore>-<tema>.png`, 15 viste × Chromium/WebKit × chiaro/scuro = 60 file, 390×844, dati fixture.

## Dove sono definiti i valori visivi

| Cosa | Dove | Note |
|---|---|---|
| Colori, tema chiaro | `src/app/styles/tokens.css:13-37` | 10 `--color-*`, 8 `--price-*`/`--on-price-*`, 4 `--map-*` |
| Colori, tema scuro | `src/app/styles/tokens.css:83-106` | ridefinisce solo `--color-*`, `--price-*`, ombra e fondo; i `--map-*` restano chiari (mappa chiara in entrambi i temi, MASTER) |
| Font | `tokens.css:2-8` (`@font-face`), `:39` (`--font-sans`), `index.html:10-13` (preload) | un solo file, Plus Jakarta Sans variabile, 27.348 B |
| Tipografia | `tokens.css:40-44` (`--text-sm`…`--text-2xl`), `:78-80` (pesi 400/600/800) | |
| Spazi | `tokens.css:46-51` | stessi valori del kit (`space-1…8`) |
| Raggi | `tokens.css:53-55` | `sm 8`, `md 12` (kit: 14), `pill 999`; manca `radius-lg` |
| Ombre | `tokens.css:56` (`--shadow-sheet`) | ombra sfocata; nessuna ombra "stampa" |
| Target e controlli | `tokens.css:60-70` | `--target 48`, `--target-primary 56`, `--target-row 64`, switch, toast 10 s: il kit non li definisce, restano nostri |
| Movimento | `tokens.css:72-74`, `:109-114` (reduced motion → 0 ms), `base.css:36`, `app.css:610` | `--duration-base` non usata da nessuna parte |
| Focus | `tokens.css:19,37,76-77` | arancio `#c2410c` (scuro `#fdba74`), 3 px a 2 px; anello a due toni sulla mappa (`app.css:139,207`) |
| Colori dei pin su canvas | `src/app/lib/maplibre-map.ts:43-44` (`getComputedStyle`), `:79-101` (pillola su canvas), `:136-138` | legge già i token: niente esadecimali nel TS |

**Esadecimali fuori da `tokens.css`: zero** in `src/`, `index.html`, `public/_headers` (grep). Il manifest PWA non esiste ancora.

## Valori duplicati o mancanti
- **Spessori dei bordi scritti a mano**: 21 occorrenze `Npx solid` in `app.css` (1, 2, 3 px). Il kit li chiama `border-hair` e `border-strong`.
- **Token mai usati**: `--price-cheap`, `--price-avg`, `--price-high`, `--price-neutral` e i loro `--on-*` (tutti e 8), `--duration-base`. I colori sulla mediana (D-12, M4-03) **non sono implementati**: oggi ogni pin è la stessa pillola bianca.
- Nessun altro valore ripetuto in modo significativo: spazi, raggi e target passano tutti dai token (conteggi: `--space-2` 36 usi, `--space-3` 28, `--space-4` 25, `--target` 15).

## Componenti esistenti → componenti del kit

| Oggi (`src/app/components/`) | Righe | Diventa | Note |
|---|---|---|---|
| classi CSS `.btn`, `.btn--primary`, `.btn--secondary` (nessun componente TSX) | — | `Button` | il componente non esiste: va creato o resta una classe? da decidere al passo 2 (codice minimo: basta la classe) |
| `.chip`, `.chips` dentro `app.tsx` | — | `DrinkChips` | |
| `Icon.tsx` | 27 | modulo icone dei drink | estendere |
| pillola canvas in `maplibre-map.ts` + `.row__price` | — | `PricePill` + pin canvas | stesse costanti geometriche |
| `BarSheet.tsx` | 239 | `ReceiptSheet` | |
| `Toast.tsx` | 52 | `StampToast` | |
| status "N bar nella zona" in `app.tsx` | — | `CoverageMeter` | |
| — | — | `LoyaltyCard` | nuovo, solo se approvata la Tessera |
| `Sheet.tsx` 64 · `ListSheet.tsx` 62 · `SearchSheet.tsx` 133 · `AddPriceSheet.tsx` 257 · `PinPanel.tsx` 89 · `ProposeSheet.tsx` 84 · `ReportSheet.tsx` 51 | | restano, ristilizzati | |
