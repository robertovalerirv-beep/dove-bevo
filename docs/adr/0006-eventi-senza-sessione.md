# 0006 · Eventi anonimi senza sessione

- **Stato:** accettata (M-1, approvata con SPEC 1.0) · **Data:** 2026-10-11 · **Riferimenti:** SPEC D-06, 12

## Contesto
Il BRIEF chiede la sessione per tutte le POST, ma la sessione nasce solo al primo contributo: gli eventi dei visitatori che non contribuiscono andrebbero persi e la quota di visite con contributo non sarebbe misurabile.

## Decisione
`POST /api/events` è esente da sessione e da `Content-Type: application/json` (`sendBeacon` invia `text/plain`). Protezioni: controllo `Origin`, body ≤ 2 KB, schema zod chiuso (5 eventi, 4 proprietà), ≤ 10 eventi per beacon, rate limit per IP-HMAC. Il Worker incrementa solo `metrics_daily`.

## Conseguenze
- Un bot può gonfiare i contatori entro il rate limit: le metriche sono indicative, non contabili.
- Nessun identificativo del visitatore lascia il dispositivo.
