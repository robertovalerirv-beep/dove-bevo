# 0047 · «Gin lemon» diventa «Americano», il codice `gin_lemon` resta

- **Stato:** decisa da Roberto il 10/11/2026 in chat · **Data:** 2026-11-10 · aggiorna l'ADR 0028 (catalogo di nove drink) per il solo nome del sesto drink. SPEC 1.17. Non cambia schema, API, D1 né `docs/feature_list.json`.

## Contesto
Roberto vuole l'Americano al posto del Gin lemon nella scelta dei drink. Il sito è vivo: il codice `gin_lemon` è nei prezzi già salvati, nei vincoli `CHECK` di cinque migrazioni (0009–0014), nelle rotte del Worker e nelle tre app native già installate.

## Decisione
1. Cambia **solo il nome mostrato**: `gin_lemon` → «Americano» in `src/app/i18n/it.ts` e `en.ts`, e nel testo per i motori di ricerca (`src/worker/seo-texts.ts`). Vale per menu «Scegli cosa bere», Aggiungi prezzo, scheda bar, Elenco e admin, che leggono tutti la stessa etichetta.
2. Il **codice resta `gin_lemon`** in `catalog.ts`, D1, API e app native: nessuna migrazione, nessuna richiesta delle app già installate rifiutata.
3. **Icona nuova** per lo stesso codice in `src/app/components/Icon.tsx`: tumbler basso con mezza fetta d'arancia e ghiaccio.
4. **Limiti invariati**, 4–20 €, come Negroni e Sbagliato.
5. I **prezzi già salvati** con `gin_lemon` restano e si leggono come prezzi dell'Americano (scelta di Roberto, al posto dell'archiviazione).
6. Le **app native** (`mobile-apps/`) non cambiano in questo passo.

## Conseguenze
- Nel codice un nome interno (`gin_lemon`) non corrisponde più all'etichetta: lo dicono questo ADR, la nota in SPEC 6 e il commento accanto all'icona.
- I prezzi inseriti finora per il Gin lemon compaiono come Americano finché qualcuno non li conferma o li cambia; oltre 90 giorni restano «da confermare» come ogni prezzo.
- Sito e app native chiamano lo stesso codice in due modi (Americano, Gin lemon) finché le app non vengono allineate e ripubblicate.
- Rollback con `git revert`: nessun dato è stato toccato.
