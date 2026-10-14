# 0018 · Rimozione della lettura dei listini con AI

- **Stato:** accettata — decisione di Roberto del 13/10/2026 (prompt v3.2) · **Data:** 2026-10-14 · sostituisce l'ADR 0007

## Contesto
La SPEC 1.0 prevedeva (M3) la foto del listino letta da un modello linguistico, con revisione obbligatoria delle voci. La revisione costa all'utente quasi quanto inserire i prezzi a mano, la lettura aggiunge una spesa variabile (chiave API, tetto di budget, evals) e il progetto deve restare a costo zero e senza pagamenti: l'utente non paga mai, in nessuna forma. Nessuna riga di M3 era stata scritta: il codice AI non esisteva ancora, c'erano solo il valore `menu_photo` nello schema, un'etichetta nell'interfaccia e un ramo che rifiutava quel valore.

## Decisione
- Niente AI: nessuna rotta `menu-extract`, nessun prompt, nessun servizio Anthropic, nessun budget, nessuna chiave. Non c'è più nulla da pubblicare o da dichiarare a norma dell'art. 50 dell'AI Act (non applicabile: l'app non genera contenuti con AI).
- Migrazione `0004`: `DROP TABLE ai_usage`. Il valore `menu_photo` di `source` resta **ammesso dallo schema** (`prices_current` e `price_obs`, migrazioni già applicate) e non viene più scritto: l'API accetta solo `source: "manual"`. Il formato compatto dei prezzi perde l'ultimo campo («da foto»).
- Documenti: le voci OWASP LLM e le minacce AI di `SECURITY.md` sono marcate «non applicabile, nessun LLM»; Anthropic esce dai sub-responsabili.
- Il codice resta recuperabile dalla cronologia: tag `pre-ai-removal`.

## Compenso alla «mappa vuota»
- Dopo `Salva`, «Aggiungi un altro drink qui»: il bar resta selezionato e più drink partono in un'unica `POST /api/prices` (il contratto ammette già 1–80 voci), con un solo «Annulla» di 10 secondi.
- In `/admin`, un inserimento da listino per riempire la zona di partenza (data di osservazione non futura e non oltre 90 giorni). Da fare.

## Conseguenze
Meno codice, nessuna spesa, nessuna chiave da custodire. L'ADR 0007 (tetto AI con prenotazione atomica) non serve più.
