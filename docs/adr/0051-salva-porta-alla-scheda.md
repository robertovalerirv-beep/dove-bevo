# 0051 · «Salva» porta subito alla scheda del bar

- **Stato:** decisa da Roberto il 23/11/2026 in chat (piano approvato, permesso esplicito di cambiare le verifiche) · **Data:** 2026-11-23 · SPEC 1.20 · sostituisce, per il dopo-`Salva`, D-15 (Annulla di 5 s), il Timbro di MB-11 e la Tessera di D-29 (ADR 0023). Non cambia schema, API, D1 e scritture. Cambia i testi delle verifiche M2-05, M2-06, M3-16, MB-10, MB-11, MB-12, ME-01 e ME-04 in `docs/feature_list.json`, quindi la guardia passa al tag `spec-approved-17`.

## Contesto
Dopo «Salva» compariva per 5 s un riquadro grande: Timbro con la data, «Segnato…», «Copertura +1», Tessera con i cerchi, «Annulla» con la barra di avanzamento e «Aggiungi un altro drink qui». Roberto, provandolo su iPhone, lo trova più noioso che utile: chi ha appena segnato un prezzo vuole vederlo nella scheda del bar, non aspettare.

Quei 5 s facevano quattro lavori: (1) l'Annulla senza scritture; (2) più drink dello stesso bar in una sola `POST`; (3) Turnstile caricato durante l'attesa, quindi invisibile; (4) l'invio al passaggio in background, perché chiudere l'app non fosse un annullamento.

## Decisione
1. **Nessun riquadro.** `Salva` chiude il foglio e apre la scheda del bar (`navigate('/bar/<key>?c=<cell>')`; dalla mappa è un passaggio di pagina, quindi «Indietro» torna alla mappa). «Prezzo salvato» è annunciato solo allo screen reader (regione `status` con testo `.sr-only`, WCAG 4.1.3) e il fuoco va sul nome del bar (WCAG 2.4.3).
2. **Invio subito** con `keepalive: true` (D-15): non serve più il gestore di `visibilitychange`. `UNDO_MS`, `--toast-duration`, la barra, il Timbro e la Tessera spariscono dal sito. Un prezzo sbagliato si corregge con «È cambiato» (SPEC 11: un prezzo nuovo sostituisce il corrente).
3. **Un drink, una richiesta.** «Aggiungi un altro drink qui» diventa «Aggiungi un prezzo qui» della scheda, che già esisteva. Quote e righe D1 si contano per prezzo, quindi non cambiano (M3-20).
4. **Prezzi già visti in zona:** il tocco mette le cifre nel campo, poi serve `Salva`. Senza l'Annulla, un tocco sbagliato sarebbe finito in mappa. I tocchi restano 4 (vincolo 2.2): il tocco sul prezzo prende il posto delle cifre.
5. **Errori parlanti**, nel passo Prezzo riaperto con le cifre: quota del giorno (429 con `Retry-After` oltre 60 s), troppi di fila (429 con `Retry-After` ≤ 60 s), offline, servizio occupato (503 o risposta non JSON, M3-19), verifica anti-robot non riuscita, prezzo segnalato e in controllo (`under_review`), fuori limite con i limiti del drink (`out_of_range`).
6. **Conferma:** se il prezzo uguale c'era già, un banner di una riga, senza pulsanti, che sparisce da solo dopo 4 s.
7. **Quarantena:** nessun banner. Nella scheda, sotto «In verifica», ogni prezzo dice «Molto diverso dagli altri prezzi della zona (mediana X €)», con la mediana calcolata sul dispositivo dai prezzi della cella già scaricati. La quarantena scatta solo con ≥ 5 prezzi attivi e oltre ±50% dalla mediana: mai per il primo prezzo della zona.
8. **App native:** seguono il sito, perché usano lo stesso `app.tsx` (nuovo hash in `mobile-apps/web/build-contract.mjs`). Il loro `AddPriceSheet` e il loro `BarSheet` ricevono le stesse due modifiche (tocco sul prezzo visto, motivo della verifica). L'app Europa tiene il suo Annulla, con una costante sua invece di `UNDO_MS` del sito.

## Alternative scartate
- **Tenere il riquadro senza Annulla:** toglie solo un pulsante; l'ingombro, che è il fastidio, resta.
- **Un banner «Prezzo salvato» visibile:** non voluto da Roberto; la scheda con il prezzo è già la conferma.
- **Tocco sul prezzo visto che salva subito:** scartato da Roberto; senza Annulla un errore diventa pubblico.

## Conseguenze
- Al primo prezzo della visita la `POST` aspetta Turnstile. La scheda è già aperta, e il prezzo compare quando il server risponde.
- Il contatore dei prezzi in `localStorage` resta: serve all'invito all'installazione dopo il secondo prezzo (M4-09). Quando il contributo parte dalla mappa, l'invito si vede al ritorno sulla mappa.
- I testi del Timbro e della Tessera escono da `it.ts`, `en.ts` e `docs/brand/02-voce.md`.
- Rollback con `git revert`: nessun dato è stato toccato.
