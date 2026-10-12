# Qualità dei dati e anti-frode (SPEC 11)

Regole applicate dal Worker a ogni prezzo inserito (`POST /api/prices`, `src/worker/routes/prices.ts`).
Valori in `src/worker/config.ts` e `src/shared/catalog.ts`. Test: `tests/worker/prices-post.test.ts`,
`tests/worker/reports-cron.test.ts`, `tests/security/`.

| Regola | Comportamento | Codice / test |
|---|---|---|
| Catalogo | Drink o formato fuori catalogo → 400 per tutta la richiesta | M2-08 |
| Limiti di prezzo | Fuori dai limiti inclusivi del formato (SPEC 6) → voce `rejected`, codice `out_of_range`; il client mostra "Ci sembra un prezzo insolito per …: controlla le cifre" | M2-08 |
| Bar | Bar OSM verificato sul file della cella dal binding `ASSETS`; bar `u<id>` su `venues_user`. Il client non è fonte di verità: cella e città vengono dal server | M2-08 |
| Quarantena | Con almeno 5 prezzi `active` dello stesso drink, formato e fascia nella cella, un prezzo oltre ±50 % dalla mediana → `quarantined`: fuori dalla mappa, nella sezione "In verifica" della scheda | M2-09 |
| Uscita dalla quarantena | Una conferma (o lo stesso prezzo) da una sessione **e** un IP diversi da chi l'ha inserito → `active` (D-10) | M2-09 |
| Stesso prezzo | Stesso bar, drink, formato, fascia e prezzo del prezzo corrente → conferma (+1, `observed_on` aggiornato a oggi), nessuna nuova riga in `prices_current` né in `price_obs`. Se la sessione o l'IP ha già confermato, o ne è l'autore, la risposta è `confirmed` con codice `already` e il contatore non cambia | M2-10 |
| Prezzo diverso | Sostituisce il corrente con `confirmations = 0`; la vecchia osservazione resta in `price_obs` (storico, D-26) | M2-10 |
| Segnalazioni | Motivi chiusi (D-07). Una per sessione e per IP per bersaglio. Più di 3 segnalazioni distinte **dall'ultimo cambio di prezzo** → `review`: fuori da mappa, scheda e storico finché Roberto non decide | M2-13 |
| Prezzi in revisione | Un prezzo `review` o `removed` non si sovrascrive né si conferma dal pubblico (`rejected`, codice `under_review`; conferma → 404) | M2-13 |
| Quote | Per sessione e per IP (IPv6 ridotto a /64), giorno `Europe/Rome`: 30 prezzi manuali, 50 conferme, 20 segnalazioni, 5 bar, 10 foto; oltre → 429 con `Retry-After` fino a mezzanotte | M2-14 |
| Picchi | Binding Rate Limiting (20 richieste / 10 s per IP-HMAC) su tutte le POST e sullo storico | ADR 0010 |

## Note di interpretazione

- **"Stesso prezzo nello stesso giorno"** (SPEC 11): la regola è applicata anche a giorni diversi. Ripetere
  un prezzo già noto è una conferma che ne rinnova la data, invece di azzerare le conferme con una "sostituzione"
  identica. Approvato da Roberto il 12/10/2026.
- La quarantena usa solo prezzi `active`: i prezzi in quarantena non spostano la mediana.
- Unicità per sessione **e per IP**: ADR 0015.
- Nessun dato personale nelle tabelle dei prezzi: il legame con la sessione esiste solo nelle chiavi HMAC
  con sale giornaliero di `counters` e `dedup` (SPEC 14), cancellate entro 48 ore (ADR 0016).
- La moderazione (`review` → `active` o `removed`) arriva con `/admin` in M5.
