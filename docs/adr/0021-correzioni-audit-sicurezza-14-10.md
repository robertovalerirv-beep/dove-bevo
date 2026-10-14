# 0021 · Correzioni dell'audit di sicurezza del 14/10/2026

- **Stato:** accettata (richiesta di Roberto: correggere subito e pubblicare) · **Data:** 2026-10-14 · tocca SPEC 9.2, 13.3

## Contesto
Un audit "da attaccante" del codice (subagent, sessione del 14/10) ha trovato nessun bypass di sessione o di Access, ma quattro punti reali, confermati rileggendo `main`:
1. `GET /api/prices/:cell` senza limite: su `workers.dev` la Cache API è inattiva, quindi ogni richiesta legge D1; con uno script si consumano le 100.000 richieste al giorno in circa 20 minuti.
2. Il pin di una proposta poteva coincidere con la posizione del dispositivo: bastava un tocco sulla mappa (che parte centrata sul dispositivo) e al server arrivava, e agli altri utenti veniva mostrata, la posizione esatta (5 decimali).
3. Chiavi non canoniche (`u007` = `u7` per `Number()`): righe di prezzo nascoste che contano nella mediana di quarantena.
4. Una sola persona con pochi IP e sessioni poteva riempire le 200 proposte in attesa e bloccare tutti.

## Decisione
- **Lettura delle celle limitata** da un secondo binding Rate Limiting (`READ_LIMITER`): 100 richieste ogni 60 s per IP in staging (una vista di mappa ne usa fino a 12; cinque amici sulla stessa rete restano nel limite). In locale e negli e2e il limite è 3.000 (tutti i test condividono un IP).
- **Pin**: il centro della mappa deve essere stato spostato di almeno 10 m rispetto a dove la mappa è partita (zoom 17: circa 25 px); un tocco o un piccolo spostamento non bastano. Senza un punto di partenza noto (nessuna posizione, mappa lontana) basta un tocco, perché il punto non può essere la posizione del dispositivo.
- **Chiavi canoniche**: `^[nwru][1-9]\d{0,14}$`; `u007`, `n0123` e simili sono rifiutate (400).
- **Tetto di 15 proposte in attesa per cella** (oltre al tetto di 200 in totale): risposta `503 busy` come per il tetto generale. Il valore 15 e non 5 serve a non bloccare i test degli amici nel centro di Milano.

## Alternative rifiutate
- Riusare `RATE_LIMITER` (20 richieste / 10 s) anche per le celle: un utente che sposta la mappa carica fino a 12 celle alla volta e supererebbe il limite.
- Limite di 100 richieste / 60 s come difesa completa: **non basta**. Un solo IP può ancora fare 144.000 richieste al giorno; il costo per l'attaccante passa da 20 minuti a circa 17 ore con un IP. Il rimedio vero resta il dominio con regole WAF e Cache API attiva (M6).
- Eliminare i nomi in attesa dalla risposta della cella (`pend`): cambia il flusso «Nuovo, da confermare» (D-05); rimandato.

## Conseguenze
- Un utente dietro la stessa rete che carica più di 100 celle in un minuto vede «Riprova» sulle celle rifiutate.
- Non corretti in questa passata (rischio basso, nel backlog dell'audit): filtro dei nomi in attesa (`bit.ly/…`, caratteri Unicode di separazione), pulizia dei bar `removed` vecchi, `/64` IPv6 per le quote, soglia delle 4 segnalazioni distinte, ricarica del JWKS di Access senza cache negativa, valori di sviluppo nel `wrangler.jsonc` di livello alto (usati solo in locale; staging e produzione hanno blocchi propri).

## Seconda revisione (security-reviewer, 14/10, nessun punto bloccante)
Corretti: il pin non può coincidere con la posizione del dispositivo nemmeno se «Vicino a me» risponde dopo l'inizio del passo (si controlla anche `position` corrente); le chiavi di bar in admin e nel client usano la stessa regola canonica del Worker.
Accettati e annotati:
- La regola dei 10 m è solo sul client: il server non può distinguere un pin da una posizione, è una protezione di buon senso (la posizione non è mai un campo a parte).
- Una risposta `busy` consuma comunque una delle 5 proposte giornaliere della sessione.
- Il limitatore non è fail-open: se il binding manca, le celle rispondono 500. Quando M6 aggiunge `env.production`, **deve ripetere entrambi i blocchi `ratelimits`** (i binding non si ereditano) e un controllo di CI lo verificherà.
- Durante il `flyTo` iniziale `view` è ancora quella vecchia: il pulsante di conferma può essere attivo per 800 ms (qualità del dato, non privacy).
