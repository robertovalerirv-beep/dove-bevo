# 0027 · La mappa non cambia mai altezza: barra a due tasti, «Elenco» sulla mappa, Annulla da 5 secondi

- **Stato:** accettata (richiesta da Roberto il 2026-10-21 in chat, dopo la segnalazione di un tester e la prova di Roberto) · **Data:** 2026-10-21

## Contesto
1. **Difetto:** zoomando un po' (da zoom 13 in su) la mappa «salta tra due livelli di zoom» e l'uso è sgradevole. Lo ha visto un tester, poi Roberto.
2. **Causa, misurata** (test `tests/e2e/map-stability.spec.ts`, rosso sul codice di `main`): la barra in basso cambiava altezza con ciò che la vista mostrava. Nella «zona senza prezzi» (copertura sotto il 5%, cioè quasi tutta l'Italia reale) aggiungeva un paragrafo e due bottoni (+102 px: mappa 654 → 552 px con le chip Spritz e Birra sullo stesso punto). La mappa è `position: absolute; inset: 0` dentro `.main`, quindi si ridimensionava; il ridimensionamento fa partire `moveend`, la nuova vista ricarica le celle (`cellsState = "loading"`), `emptyZone` tornava falso per un attimo e la barra cambiava di nuovo. Con Spritz, andando a zoom 13, la mappa si è ridimensionata **3 volte** senza che nessuno la toccasse. Il test di MB-13 misurava l'altezza solo *dentro* lo stato vuoto e non poteva vederlo.
3. **Richieste di Roberto** (chat, 21/10/2026): barra con soli due tasti («Aggiungi prezzo» e «Aggiungi locale»); «Manda la mappa» eliminato con tutto il suo codice («per mandare il sito basta copiare il sito stesso»); «Elenco» come soluzione intelligente, un'icona sulla mappa che non disturbi; l'Annulla da 10 a 5 secondi.

## Decisioni
1. **Regola:** nulla di ciò che dipende dalla vista (copertura, zona senza prezzi, legenda, messaggi) può cambiare il layout. Il layout della mappa dipende solo dalla finestra del dispositivo. Le informazioni della vista stanno *sopra* la mappa, in posizione assoluta.
2. **Barra in basso:** sempre e solo «Aggiungi prezzo» (primario) e «Aggiungi locale mancante», in una riga. Etichetta invariata (nessuna stringa nuova; se si preferisce «Aggiungi locale» è una stringa e i nomi nei test). **Modifica a D-28:** il bar mancante torna sulla mappa; resta raggiungibile anche dal passo Bar e dalla ricerca senza risultati. L'invito all'installazione (dopo il secondo prezzo) era nella barra e la faceva crescere di 112 px: trovato dalla revisione, ora sta sulla mappa come la nota. Durante il posizionamento del pin l'icona «Elenco», la nota e l'invito spariscono (prima stavano nella barra inerte).
3. **«Elenco»:** bottone-icona rotondo 48×48 px (`aria-label` «Elenco»), in alto a destra sulla mappa, di fronte alla riga di stato, nello stile ink/stampa del kit; la riga di stato lascia l'angolo (`max-width`). Stessa lista, stessa tastiera (M1-13).
4. **Nota della zona senza prezzi, legenda e invito all'installazione:** un contenitore assoluto sopra le attribuzioni (`.map__stack`), l'una sopra l'altra se ci sono entrambe, senza mai toccare le attribuzioni (SPEC 2.8). Il testo («Qui nessuno ha ancora segnato un prezzo. Il primo sei tu: ci vogliono 10 secondi.») non cambia: parla dello sforzo di inserire un prezzo, non dell'Annulla.
5. **«Manda la mappa a un amico» rimosso:** il tasto, `navigator.share`, `it.map.shareMap`, `.bottom__wide`, `.bottom__empty`.
6. **Annulla da 5 s (D-15):** costante unica `UNDO_MS` in `src/shared/config.ts` per il timer dell'invio, per la durata della barra di avanzamento (`--toast-duration`, generato da `scripts/tokens.ts`) e (con un test) per il testo «hai 5 secondi per annullare». Vale per ogni salvataggio (nuovo, «È cambiato», prezzo già visto, altro drink). Restano come prima il passaggio in background (invio con `keepalive`) e la pausa con puntatore o focus sul messaggio (WCAG 2.2.1). I messaggi semplici (4 s e 8 s) non cambiano.

## Test (tutti scritti prima del codice dove possibile)
- `tests/e2e/map-stability.spec.ts` (nuovo, M1-16): altezza di mappa e barra uguale con Birra, Spritz e Negroni; a ogni zoom da 13 nessun ridimensionamento durante lo zoom e, a riposo, nessun ridimensionamento né cambio di centro o zoom per 2 s. **Rosso su `main`** (altezze 552/167 contro 654/65; 3 ridimensionamenti andando a zoom 13), verde dopo la modifica, Chromium e WebKit.
- MB-13 riscritto: la barra ha esattamente due tasti in una riga e la stessa posizione prima e dopo; nota sulla mappa; icona «Elenco» 48×48 px dentro la mappa, senza sovrapporsi a stato, nota e attribuzioni, nei due temi, con axe.
- `tests/unit/undo.test.ts`: `UNDO_MS` = 5000, uguale alla durata nei token generati e al testo.
- Dopo la revisione: l'altezza di mappa e barra resta uguale quando compare l'invito (iPhone), l'icona «Elenco» non c'è mentre si posiziona il pin, e a 320×568 il Timbro non esce dallo schermo (`max-height` con scorrimento sotto i 700 px di altezza: senza la regola era a y = −43 px e «Annulla» irraggiungibile). Quest'ultimo test era rosso senza la correzione.
- `contribute.spec.ts`: nessun «10» scritto a mano; le attese sono `UNDO_MS + 1500` solo per asserire un'assenza, quelle per un invio hanno solo massimi generosi (nessun limite inferiore a tempo, per non dipendere dalla velocità del runner).

## Processo (SPEC 1.5)
Cambiano testi di voci congelate della feature list (M1-13, M2-05, M2-06, M3-16, MB-11, MB-13) e se ne aggiunge una (M1-16): serve un nuovo tag. `spec-approved-5` esiste già (SPEC 1.4, ramo `brand-v2-map`, mai unito a `main`): la guardia passa a `spec-approved-6`. **Il tag lo pubblica Roberto prima del push del ramo**, altrimenti la guardia della CI fallisce.

## Il gate rosso al primo push (stessa sessione)
Il controllo locale del push è caduto una volta su M2-09 («Non riesco a caricare i prezzi»): `RATE_LIMITER` (20 richieste / 10 s per IP, SPEC 13.3) vale anche per le prove locali, dove tutti i test arrivano dallo stesso IP e due browser scrivono in parallelo. Misura (`contribute.spec`, due browser, carico doppio con `--repeat-each=2`): **con 10 s e con 5 s lo stesso risultato**, 5 risposte 429 e 6 test caduti (M3-16, M4-09, autore che conferma, M2-09…): il difetto c'era già (è la «M2-11 Confermo» intermittente che il gate aveva dato altre volte), non lo ha introdotto il 5 s.
- `wrangler.jsonc` (livello alto, usato da `npm run dev`, e2e e Lighthouse): `RATE_LIMITER` a 3000 / 10 s, come `READ_LIMITER` che era già «praticamente spento» in locale per lo stesso motivo. Staging (`namespace_id` 1002) resta a 20 / 10 s; produzione dovrà ripetere il suo blocco.
- `vitest.config.ts`: i test del Worker usano il limite vero (20 / 10 s), quindi `rate-limit.test.ts` continua a provare il 429.
- `tests/unit/rate-limit-config.test.ts`: staging a 20 / 10, il livello alto a 3000 e nessun altro ambiente che usi il suo `namespace_id` per errore.
- Dopo la modifica, stessa prova a carico doppio: nessuna 429; restano 4 test che non si possono ripetere due volte sullo stesso database (M2-11 e M2-13, artefatto di `--repeat-each` e non del carico).

## Rischi accettati
- 5 secondi sono pochi con un dito su un telefono: il timer si ferma solo con puntatore o focus sul messaggio. Se i tester si lamentano, si cambia la sola costante `UNDO_MS`.
- Quando una nota e la legenda compaiono insieme coprono una fascia della mappa sopra le attribuzioni (circa 100 px); ammesso, sono transitorie e non toccano i controlli.
