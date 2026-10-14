# 0020 · Capacità sul piano gratuito e degrado gentile

- **Stato:** proposta (misure fatte, redesign delle letture da decidere con Roberto) · **Data:** 2026-10-14 · completa l'ADR 0013

## Limiti (documentazione Cloudflare, verificata il 13/10/2026)
Workers: 100.000 richieste al giorno, 10 ms di CPU, 50 subrequest per invocazione. D1: 5 milioni di righe lette e 100.000 scritte al giorno (le letture contano ogni riga scansionata, indici compresi). I file statici non eseguono il Worker e non contano.

## Misure (D1 locale in workerd, rotte vere, contate le righe di ogni istruzione)
| Operazione | Istruzioni | Righe lette | Righe scritte |
|---|---|---|---|
| `GET /api/prices/:cell`, 5 prezzi | 3 | 13 | 0 |
| idem, 90 prezzi | 3 | 183 | 0 |
| idem, 300 prezzi | 3 | 603 | 0 |
| idem, 500 prezzi | 3 | 1.002 | 0 |
| idem, cella vuota | 3 | 3 | 0 |
| `POST /api/prices`, 1 prezzo nuovo | 9 | 34 | 8 |
| idem, stesso prezzo (conferma) | 11 | 6 | 5 |
| idem, 3 prezzi nuovi | 21 | 101 | 18 |
| `GET /api/venues/:key/prices` (3 prezzi, 25 osservazioni) | 2 | 170 | 0 |
| pulizia di 12 righe di `counters`/`dedup` | 2 | 12 | 12 |

Richieste al Worker per una vista mappa (390×844, funzioni del progetto): zoom 13 → 6 celle a Milano e Roma, 4 a Palermo; zoom 14 → 1–2; zoom 15 → 1–2. Ogni cella è una richiesta.

## Capacità stimata
Per utente al giorno: 6 celle, 2 schede bar, il 30 % contribuisce (8,6 richieste, 3,6 righe scritte più le cancellazioni).

| Prezzi per cella | Letture per utente | Utenti da richieste | da letture | da scritture | Capacità |
|---|---|---|---|---|---|
| 30 | ~510 | 11.600 | 9.800 | 27.800 | ~9.800 |
| 100 | ~1.430 | 11.600 | 3.500 | 27.800 | ~3.500 |
| 300 | ~3.970 | 11.600 | 1.260 | 27.800 | ~1.260 |

Gli obiettivi (≤ 5 righe lette per cella a prescindere dai prezzi; ≥ 5.000 utenti al giorno) **non sono raggiunti a regime**: la lettura di una cella costa circa 2 righe per prezzo (riga dell'indice e riga della chiave primaria). Lo scrittura di un contributo è 8 righe, ma circa 12 contando la pulizia.

## Proposta (da decidere)
Una riga «istantanea» per cella con il JSON compatto, aggiornata nella stessa `batch()` della scrittura: 1 riga letta per cella anche a 500 prezzi, capacità stimata ~11.600 utenti al giorno (limite: le richieste), costo +1–2 righe scritte per contributo. Alternative scartate: un endpoint con più celle (abbassa le richieste, non le letture, che oggi stringono); un indice coprente (dimezza soltanto). Va fatto prima di M4, quando le celle del centro supereranno i 100 prezzi.

## Degrado gentile (fatto)
A limite raggiunto il Worker «fail open» può rispondere a `/api/*` con la pagina dell'app (200). Il client verifica il `Content-Type`: se non è JSON mostra «Il servizio è molto richiesto, riprova più tardi» e continua a mostrare i dati già caricati (`ServiceBusy` in `src/app/lib/data.ts`; test e2e M3-19).
