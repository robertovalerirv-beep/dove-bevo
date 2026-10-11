# 0010 · Binding Rate Limiting sul piano gratuito

- **Stato:** proposta, in verifica al primo deploy in staging (D-22, M0-11) · **Data:** 2026-10-11

## Contesto
SPEC 13.3 usa il binding Rate Limiting di Workers (periodi 10 o 60 s) per i picchi, più le quote giornaliere in D1. D-22 chiede di verificare che il binding sia disponibile sul piano gratuito.

## Verifica documentale (2026-10-11)
- Il binding è GA dal 19/9/2025 (changelog Cloudflare). Configurazione: `ratelimits` con `name`, `namespace_id` (stringa con intero), `simple.limit`, `simple.period` ∈ {10, 60}; `limit({ key })` restituisce `{ success }`.
- Il limite è **per località** ed eventualmente consistente: non è un contatore esatto. Per questo le quote giornaliere restano in D1.
- Né la pagina del binding né quella dei prezzi dicono se è incluso nel piano Free; una discussione della community pone la stessa domanda senza risposta ufficiale.

## Decisione
Il binding `RATE_LIMITER` (20 richieste per 10 s per chiave, da tarare in M2) è dichiarato per locale e staging. Il primo deploy in staging decide l'esito:
- **deploy accettato** → binding disponibile, si usa come da SPEC;
- **deploy rifiutato per il binding** → si toglie, restano solo le quote D1 e si avvisa Roberto (D-22).

## Esito
Da registrare dopo il primo deploy di staging (log del job `Deploy staging`).
