# 0032 · Dominio www.dovebevo.com sul Worker esistente

- **Stato:** decisa da Roberto il 25/10/2026 in chat · **Data:** 2026-10-25 · tocca SPEC D-01 e M6-01 (nessun cambio di testo: `APP_DOMAIN` era un segnaposto)

## Contesto
Roberto ha comprato `dovebevo.com` su Cloudflare. Ha voluto portare il sito vero lì con tutti i bar, i prezzi e le conferme già presenti, senza errori e senza passaggi in più.

## Decisione
- Il dominio si collega al Worker `dovebevo-staging` che c'è già, con il suo D1: nessuna copia dei dati, nessuna migrazione, nessun nuovo ambiente. Produzione separata (D1, Worker, segreti e tag `v0.x.y` di SPEC 16) resta rimandata finché ci sono altri utenti da proteggere dalle prove.
- Indirizzo canonico: `www.dovebevo.com`. L'indirizzo senza `www` reindirizza lì con una Redirect Rule di Cloudflare (nessun codice); Roberto ha scelto questa direzione in chat.
- `TURNSTILE_HOSTNAME` (un solo valore, confrontato con quello di siteverify) passa a `www.dovebevo.com`: l'indirizzo `workers.dev` resta raggiungibile ma non salva più prezzi. Access e hostname del widget Turnstile si aggiungono nella dashboard (public hostname `admin` e `api/admin/*` su `www.dovebevo.com`, hostname del widget `www.dovebevo.com`); l'AUD non cambia.
- `APP_DOMAIN = "www.dovebevo.com"`. Le guide puntano al nuovo indirizzo.

## Conseguenze
- Da qui la Cache API è attiva (`CF-Cache-Status: HIT` già visto sul nuovo dominio): la lettura delle celle costa meno righe D1 (ADR 0013, 0021).
- La sessione anonima (`__Host-sid`) è per host: chi arriva dal nuovo indirizzo rifà Turnstile una volta.
- Il rimedio WAF dell'ADR 0021 (regola di rate limiting) è ora possibile e resta da configurare da Roberto.
