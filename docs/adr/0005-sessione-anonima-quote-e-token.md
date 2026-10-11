# 0005 · Sessione anonima, quote e token di estrazione

- **Stato:** accettata (M-1, approvata con SPEC 1.0) · **Data:** 2026-10-11 · **Riferimenti:** SPEC 13.2, 13.3, D-09

## Contesto
Niente registrazione, ma le scritture vanno protette da bot e spam senza creare dati personali.

## Decisione
- Turnstile al primo contributo → cookie `__Host-sid` firmato HMAC, 30 minuti, `HttpOnly; Secure; SameSite=Strict`. Nessuna tabella di sessioni: il cookie si verifica con la sola firma.
- Quote giornaliere in `counters` per sessione e per IP, entrambi come HMAC con sale del giorno (`Europe/Rome`); `counters` e `dedup` cancellati dopo 2 giorni.
- I prezzi da foto non consumano la quota manuale: richiedono un **token di estrazione** firmato e monouso emesso da `menu-extract`, valido per al massimo le voci estratte.

## Conseguenze
- Nessun legame persistente tra contributi e persone.
- Un attaccante con sessioni multiple è limitato anche dalla quota per IP e dal rate limit.
- Il limite reale dei prezzi da foto è 10 foto × 80 voci al giorno per sessione e IP, solo dopo una chiamata AI pagata e il tetto di spesa.
