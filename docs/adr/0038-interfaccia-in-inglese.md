# 0038 · Interfaccia pubblica in inglese, scelta non salvata

- **Stato:** decisa da Roberto il 28/10/2026 in chat · **Data:** 2026-10-28 · SPEC 1.11 (tag `spec-approved-12`)

## Contesto
Il sito è in italiano, ma serve anche a chi non lo legge (turisti, studenti). I testi sono già tutti in un solo file (`src/app/i18n/it.ts`) e il database non contiene testi da tradurre: i prezzi sono numeri e codici, i nomi dei bar vengono da OpenStreetMap.

## Decisione
- Seconda lingua: inglese, solo per la parte pubblica. Menu a tendina «IT/EN» in alto a sinistra sulla mappa (in `/privacy` e `/regole`, nell'intestazione).
- Il sito si apre sempre in italiano. La scelta vale finché la pagina è aperta e **non si salva** (nessuna chiave in `localStorage`, nessun cookie): le promesse di privacy (SPEC 2.10, D-29, sezione 12, MB-12) restano vere così come sono.
- Il dizionario inglese è un file a parte (`src/app/i18n/en.ts`), scaricato solo se scelto. L'italiano resta nella pagina come oggi. Un modulo `src/app/i18n/lang.ts` tiene la lingua corrente; i file pubblici cambiano solo la riga di import.
- Il tipo del dizionario è derivato da `it.ts`: se manca una frase inglese, `tsc -b` fallisce.
- Restano italiani: `/admin` e le sue pagine, messaggi d'errore dell'API (il client non li mostra mai), pagine per i motori di ricerca, manifest, `lang` di `index.html`. Numeri, date, valuta e distanze restano `it-IT`.
- Privacy e regole in inglese: traduzione bozza, da rileggere prima del rilascio. Il test delle parole vietate (D-31) resta solo su `it.ts`.

## Conseguenze
- Chi usa l'inglese deve riscegliere a ogni visita (scelta di Roberto per non toccare la privacy).
- Un testo nuovo pubblico va scritto in due lingue; il compilatore lo ricorda.
- Nessuna dipendenza nuova, nessuna migrazione, nessuna richiesta di rete in più.
- Se un giorno serve ricordare la lingua o usare quella del telefono, serve una nuova versione della SPEC (sezione 14, 2.10, D-29) e dell'informativa.
