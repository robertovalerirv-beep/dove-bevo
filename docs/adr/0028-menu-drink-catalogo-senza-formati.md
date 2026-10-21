# 0028 · Menu «Scegli cosa bere», catalogo di nove drink e nessun formato

- **Stato:** accettata (richiesta da Roberto il 2026-10-21 in chat, dopo il feedback degli amici che provano l'app) · **Data:** 2026-10-21

## Contesto
Gli amici che provano l'app hanno segnalato, sul telefono (390×844):
1. la riga di chip dei drink è sempre in cima alla mappa, a qualsiasi zoom, e va scorsa di lato: con 13 chip occupa spazio e confonde;
2. la lista dei drink non è quella voluta;
3. scelta una città restano quattro pulsanti in basso invece di due (già risolto dalla 1.5 e dall'ADR 0027: la barra ha solo «Aggiungi prezzo» e «Aggiungi locale mancante», «Elenco» è l'icona sulla mappa).

## Decisioni di Roberto (chat, 2026-10-21)
1. Un solo pulsante **«Scegli cosa bere»** apre un menu a tendina con caselle multiple; la mappa si filtra come prima.
2. Con più drink spuntati il segnaposto mostra **il prezzo più basso** tra i scelti.
3. La nuova lista **sostituisce** la vecchia, anche in «Aggiungi prezzo»: Birra media, Spritz, Negroni, Sbagliato, Gin tonic, Gin lemon, Calice di vino, Analcolico, Acqua. Spariscono birra alla spina 0,2 e 0,5 l, birra in bottiglia, prosecco e bibita.
4. **La colonna dei millilitri va tolta da qualsiasi parte del codice.**

## Decisioni
1. **Un drink, un prezzo.** Sparisce il formato: `size_ml` esce da catalogo, schema, API, formato compatto, interfaccia, SEO e test. `CATALOG` è `{ code, min, max }[]`. Il test `tests/unit/no-sizes.test.ts` fallisce se `size_ml`, `formatSize`, `findSize`, `defaultSize` o `DrinkSize` tornano in `src/`.
2. **Migrazione `0006_no_sizes.sql`** (le vecchie non si toccano). `prices_current` perde `size_ml` e la chiave primaria diventa `(venue_key, drink, hh)`; `price_obs` e `reports` perdono la colonna. Le righe che non hanno più posto (bottiglia, prosecco, bibita, birra 0,2 e 0,5 l: la birra media è quella a 400 ml) **non vengono cancellate**: prima sono copiate in `archive_sizes_prices`, `archive_sizes_obs` e `archive_sizes_reports`, che restano finché Roberto non le toglie. Le segnalazioni sul bar (senza drink) restano dove sono: un primo tentativo le perdeva per la logica NULL di SQL, il test `tests/worker/migration-no-sizes.test.ts` lo ha trovato.
3. **Formato compatto** `PriceRow` = `[key, drink, hh, price_cents, observed_on, confirmations, q]` (prima aveva `size_ml` in terza posizione): tutti gli indici dopo `drink` scalano di uno. Nessun campo `s` (foto) da tempo.
4. **Menu a caselle**, componente `DrinkMenu`: pulsante con titolo e riepilogo dei drink scelti, elenco di nove caselle (icona, nome, casella con spunta come forma, mai il solo colore), target ≥ 48 px, chiusura con tocco fuori, Esc (il fuoco torna al pulsante) e di nuovo il pulsante. **L'ultima casella spuntata non si toglie** (`aria-disabled`, tocco annullato): la mappa ha sempre un drink di cui mostrare il prezzo. Predefinito: Birra media; la scelta resta in memoria per la visita, come la chip di prima.
5. **Più drink = il più basso.** `bestPrice(venue, drinks)` (in `src/shared/prices.ts`) sceglie, tra i prezzi mostrati dei drink scelti, il più basso; a parità il più recente. Pin, copertura («X bar su N qui hanno un prezzo», un bar vale una volta), «Elenco» e «I più economici qui» usano lo stesso, e con più di un drink ogni riga scrive anche il nome del drink. Il colore Affare/Giusto/Salato (D-12) resta giudicato sulla mediana del drink di quel prezzo; la fascia HH resta neutra (D-13).
6. **Zona senza prezzi:** niente da cambiare, la barra a due tasti è già quella dell'ADR 0027.

## Rischi accettati
- **Il formato compatto e le POST cambiano**: un telefono con la vecchia versione già aperta riceve 400 al salvataggio (`size_ml` non è più ammesso, gli schemi sono `strict`) e legge male le righe, finché non ricarica; la cache edge delle celle dura 60 s. Accettato in Fase 0.
- **I prezzi dei drink tolti spariscono dall'app**, ma non dal database (archivio). La dashboard di copertura calcola da `prices_current`: i prezzi archiviati non contano più.
- Le tre icone nuove (Sbagliato, Gin lemon, Acqua) sono disegnate per il progetto, da guardare negli screenshot. I limiti di Acqua (0,50–6 €), Sbagliato e Gin lemon (4–20 €) sono ipotesi, correggibili in `catalog.ts`.

## Processo (SPEC 1.6)
Cambiano testi di voci congelate della feature list (M1-09, M1-15, M1-16, M2-08, M2-12, MB-05, MB-10) e se ne aggiungono quattro (MC-01…MC-04): serve un nuovo tag. **`spec-approved-7` lo pubblica Roberto prima del push del ramo**, altrimenti la guardia della CI fallisce (la guardia passa a `spec-approved-7`). Il ramo parte dalla punta di `fix/map-stability-undo-5s` (PR 40, SPEC 1.5): va unito dopo quella.
