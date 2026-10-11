# 0007 · Tetto di spesa AI con prenotazione atomica

- **Stato:** accettata (M-1, approvata con SPEC 1.0) · **Data:** 2026-10-11 · **Riferimenti:** SPEC 13.5, D-17

## Contesto
L'API Anthropic è l'unica spesa variabile. Richieste concorrenti non devono poter superare il tetto.

## Decisione
Prima di ogni chiamata il Worker prenota il costo massimo stimato con un unico `UPDATE` condizionato (tetto giornaliero e mensile) su `ai_usage`, atomico in D1. Dopo la risposta corregge con il costo reale dai token; restituisce la prenotazione se l'API risponde con errore senza addebito; la trattiene in caso di timeout. Tetti per ambiente: staging 0,02 €/giorno e 0,50 €/mese, produzione 0,18 €/giorno e 4,50 €/mese. `USD_TO_EUR` in configurazione, default 1,00. Secondo livello: limite di spesa nella Console Anthropic, impostato da Roberto.

## Conseguenze
- Con il tetto pieno la lettura dei listini si mette in pausa (503) e l'app resta usabile a mano.
- La stima prudente riduce le chiamate possibili rispetto al costo reale; si ricalibra dopo le evals.
