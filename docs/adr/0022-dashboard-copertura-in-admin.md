# 0022 · Dashboard di copertura in `/admin`: calcolo a richiesta, soglia di costo, chiave città

- **Stato:** proposta (in attesa dell'ok di Roberto) · **Data:** 2026-10-15

## Contesto
Roberto vuole aprire `/admin`, premere **Aggiorna** e vedere quanti bar con almeno un prezzo pubblico ci sono per città e quanto manca al gate (150 bar a Milano). Il piano gratuito di D1 concede 5 milioni di righe lette al giorno, condivise con la mappa pubblica (ADR 0013, 0020). Prompt: `docs/PROMPT-DASHBOARD.md`.

## Decisione

### 1. Definizione del dato
**Bar con almeno un prezzo** = bar visibile sulla mappa con almeno una riga `prices_current` in stato `active`. Non contano quarantena, `review`, `removed`, bar utente non approvati, bar OSM nascosti (`venues_hidden`). Una sola definizione nel codice: l'helper `isPublicBar(key, approvedUserIds, hiddenKeys)` in `src/worker/lib/db.ts`, usato anche da `getCellPrices` (che oggi ha il filtro inline).

### 2. Calcolo solo su richiesta
Rotta `GET /api/admin/coverage` (JWT Access come le altre, `Cache-Control: no-store`), chiamata **solo** dal pulsante Aggiorna. Nessun timer, polling, calcolo al cambio di scheda, cache lato server. All'apertura di `/admin` la dashboard non legge nulla.

### 3. Query: diretta, senza indice, `GROUP BY venue_key`
```sql
SELECT max(city) AS city, venue_key, COUNT(*) AS n, MAX(observed_on) AS d
FROM prices_current WHERE status = 'active' GROUP BY venue_key
```
più `SELECT venue_key FROM venues_hidden` e `SELECT id FROM venues_user WHERE status = 'approved'` (liste piccole); il Worker filtra con `isPublicBar` e somma per città. La città è costante per bar, quindi `max(city)`.

Misure (D1 locale in workerd, 5.000 righe, ~3% non attive; vedi PROGRESS 15/10):
| Query | Piano | `rows_read` |
|---|---|---|
| `GROUP BY city, venue_key` (e `venue_key, city`) | `SCAN` + `TEMP B-TREE FOR GROUP BY` | 9.833 (≈ 2 × righe) |
| **`GROUP BY venue_key`** | `SCAN prices_current` | **5.000** (1 per riga) |

Il B-tree temporaneo raddoppia le letture: si evita raggruppando sul prefisso della chiave primaria. **Nessun indice nuovo, nessuna migrazione**: un indice su `(status, city, …)` risparmierebbe solo le righe non attive ma costerebbe una scrittura in più a ogni contributo (`rows_written` deve restare invariato, ADR 0013).

### 4. Soglia
Con 20 pressioni al giorno e l'obiettivo ≤ 2% della quota (100.000 righe): 100.000 ÷ 20 = **5.000 righe in `prices_current`** (attive e non, la scansione le legge tutte). Avviso in `/admin` sotto la dashboard quando i prezzi attivi superano l'80% (**4.000**): «La dashboard si avvicina al limite di costo previsto, vedi ADR». Il numero esce dalla stessa query. Il conteggio in staging non è stato misurato (`--remote` vietato a Claude Code): lo fornisce Roberto.

### 5. Piano oltre la soglia (solo documentato, non implementato)
Tabella `coverage_city (city INTEGER PRIMARY KEY, bars INTEGER, prices INTEGER, last_day TEXT)` aggiornata nella stessa `batch()` delle scritture che cambiano lo stato pubblico di un prezzo o di un bar (inserimento, conferma da quarantena, approvazione, rifiuto, nascondi/ripristina), con riconciliazione nel Cron giornaliero esistente. La lettura passa a ≈ 1 riga per città. Costo: più righe scritte per contributo (da rimisurare) e più codice nelle scritture.

### 6. Limite tra due calcoli: 10 secondi
Timestamp a livello di modulo nel Worker (per isolate, **best-effort**): entro 10 s dall'ultimo calcolo → `429 rate_limited` con `Retry-After` e messaggio gentile, **senza leggere D1**. Zero costo D1; un isolate nuovo lo azzera, accettato perché a usare la pagina è una persona e il pulsante è disabilitato durante il calcolo.

### 7. Chiave città: già stabile
`prices_current.city` è l'ID del nodo OSM del `place` (D-11), non un indice dentro `places.json`: rigenerare l'import con un nuovo `DATA_VERSION` non cambia l'attribuzione. Nessun remapping. Un test lo dimostra (stesso `cityId`, `places.json` riordinato).

### 8. Deviazioni dal prompt
- **Bar utente senza città**: `resolveVenue` assegna `city = NULL` ai bar utente, quindi finiscono in «Senza città» e **non** sommano a «Bar totali» di una città (= `nBars` di `places.json`, bar OSM al momento dell'import, compresi quelli poi nascosti). Per «Senza città»: bar con prezzo e prezzi sì, bar totali e copertura «—». Assegnare la città ai bar utente all'approvazione è un lavoro a parte.
- **Prezzi oggi / ultimi 7 giorni** omessi: nessun codice scrive `metrics_daily` (manca `/api/events`, M5-01). Nessuna tabella nuova.
- Il gate usa `LAUNCH_CITY_ID = 62505581` (Comune di Milano) e `LAUNCH_TARGET = 150` in `src/shared/config.ts`.

## Conseguenze
- Nessuna modifica a schema, migrazioni e scritture; test di regressione sulle righe lette e scritte.
- La dashboard può togliere quota agli utenti oltre 5.000 righe: l'avviso a 4.000 serve a saperlo in tempo, poi si applica il piano del punto 5.
- Privacy: solo aggregati per città, nessun orario per singolo bar, nessun dato da aggiungere a `PRIVACY-NOTES.md`.
