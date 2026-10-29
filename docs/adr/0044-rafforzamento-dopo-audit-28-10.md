# 0044 · Rafforzamento dopo l'audit del 28/10/2026

- **Stato:** decisa da Roberto il 29/10/2026 in chat · **Data:** 2026-10-29 · nessuna modifica a SPEC, schema, migrazioni, interfaccia, testi o feature list (il tetto di eventi è una protezione in più dentro il «rate limit per IP-HMAC» di D-06)

## Contesto
L'audit del 28/10/2026 (codice letto per intero, attacchi simulati in workerd) ha trovato quattro punti piccoli e già corretti qui; gli altri restano a decisione di Roberto. Ogni correzione ha un test scritto prima, che ha fallito per il motivo giusto.

## Decisione
- **S1 · Un bar nascosto non restituisce più i suoi prezzi dalla scheda.** `GET /api/venues/:key/prices` guardava solo i bar utente non approvati: un bar OSM nascosto dall'admin spariva dalla mappa, dalla cella e dalle pagine per i motori di ricerca ma i suoi prezzi e il suo storico restavano leggibili per chiave. `BAR_IS_PUBLIC` ora esclude anche i nascosti (`venues_hidden`). Per gli utenti non cambia nulla: la scheda mostrava già «Questo locale non è più sulla mappa».
- **S3 · Chiavi di Access e limite sulle GET admin.** Un token ben formato (audience, issuer e scadenza sono valori pubblici) con un `kid` inventato faceva riscaricare le chiavi di Cloudflare a ogni richiesta: 41 download per 40 richieste. Ora un `kid` ignoto può chiedere le chiavi solo se l'ultimo download ha più di 30 s (`REFRESH_MIN_MS`): una rotazione vera si recupera con al più 30 s di ritardo. `GET /api/admin/*` ha lo stesso limite sui picchi delle scritture (20 richieste ogni 10 s per indirizzo), prima del controllo del JWT.
- **S4 · Tetto giornaliero di eventi per indirizzo.** `POST /api/events` non ha sessione (D-06): da un solo indirizzo si potevano contare 400 `price_added` finti in pochi secondi. Ora un indirizzo conta al massimo `EVENTS_PER_IP_DAY = 3000` eventi al giorno (chiave HMAC con il giorno come sale, cancellata entro 48 ore come le altre quote); oltre, 429 con `Retry-After`. Un corpo rifiutato dallo schema non consuma il tetto. Costo: una riga scritta in `counters` per beacon.
- **S5 · Duplicati con lettere simili.** `sameName` ora trasforma le lettere cirilliche e greche identiche alle latine (tabella esplicita in `src/worker/lib/same-name.ts`, scritta con i punti di codice) prima di confrontare: «Bistrоt» con la о cirillica è «Bistrot». Il modulo è solo del Worker per non pesare sulla shell (23,20 KB gzip, invariata).

## Compromessi
- Il tetto di 3000 eventi è un freno, non una barriera: chi ha molti indirizzi può ancora sporcare le metriche. Per decidere sui gate di lancio conviene affiancare le metriche ai prezzi realmente presenti in D1.
- La tabella delle lettere simili non copre ogni carattere simile; un nome tutto in cirillico resta confrontabile con sé stesso e diverso da un altro.
- Il limite sulle GET admin può respingere una pagina admin che faccia più di 20 richieste in 10 secondi dallo stesso indirizzo; oggi ne fa 4-5.
- I test admin esistenti mandavano tutti lo stesso «indirizzo sconosciuto»: l'helper `call` in `tests/worker/access-jwt.ts` ora manda un indirizzo diverso a ogni chiamata. Nessuna asserzione è cambiata.

## Verifica
`tests/worker/venue-prices.test.ts` (bar nascosto), `tests/worker/access-refresh.test.ts` (nuovo: 40 kid ignoti → al più 1 download; rotazione dopo 30 s → 1 download; 21ª GET in 10 s → 429), `tests/worker/events.test.ts` (tetto, indirizzi indipendenti, corpo rifiutato, nessun indirizzo in chiaro), `tests/unit/venue-name.test.ts` e `tests/worker/venue-proposals.test.ts` (lettere simili → 409 con la chiave del bar vero).
