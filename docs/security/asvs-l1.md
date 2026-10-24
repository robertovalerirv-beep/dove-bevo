# OWASP ASVS 5.0, livello 1 — Dove bevo (M5-07)

Una riga per ogni area dei capitoli ASVS 5.0 che riguardano un servizio web come questo. Stato: **Sì** (soddisfatto, con il test che lo prova), **N/A** (non applicabile, con il motivo) o **Accettato** (rischio deciso, scritto in `SECURITY.md`). Nessuna riga è «da fare». Modello di minaccia: `SECURITY.md`. OWASP Top 10 LLM 2025: tutte le voci sono N/A, l'app non usa nessun modello linguistico (ADR 0018).

Come si riesegue la prova: `npm run test` (unit e Worker), `npm run test:security` (Worker e sicurezza), `npm run test:e2e` (browser).

| Cap. | Area | Stato | Come e dove si prova |
|---|---|---|---|
| V1 Codifica e sanificazione | Output verso HTML | Sì | Preact rende solo testo, `dangerouslySetInnerHTML` vietato dal lint (`eslint.config.js`); nomi di bar con HTML mostrati come testo: `tests/worker/venue-proposals.test.ts` |
| V1 | Iniezione SQL | Sì | Solo query con parametri in `src/worker/lib/db.ts`; chiavi e celle validate con regex; piani di lettura in `tests/worker/d1-reads.test.ts` |
| V1 | Iniezione in URL, header, comandi | Sì | Nessun comando di sistema né redirect da input; URL costruiti da chiavi validate (`tests/worker/pentest-suite.test.ts`) |
| V2 Validazione e logica | Validazione di ogni ingresso | Sì | zod `strict` su ogni rotta (campi extra → 400): `tests/worker/prices-post.test.ts`, `venue-proposals.test.ts`, `admin-listino.test.ts` |
| V2 | Limiti di logica (prezzi, quote, duplicati) | Sì | Catalogo e limiti, quarantena, una conferma per persona, quote 429: `prices-post.test.ts`, `rate-limit.test.ts`, `hardening-keys.test.ts` |
| V2 | Nomi di bar dagli utenti | Sì | NFC, 2–80 caratteri, niente URL, email, telefoni, caratteri invisibili: `venue-proposals.test.ts`, `tests/unit/venue-name.test.ts` |
| V3 Frontend | CSP senza `unsafe-inline` e header di sicurezza | Sì | `tests/security/headers.spec.ts` (valori esatti di SPEC 13.1 su asset e API); nessuna violazione CSP: `tests/e2e/csp.spec.ts`, `tests/e2e/legal.spec.ts` |
| V3 | Nessun CORS, nessun framing | Sì | Nessun header `Access-Control-*` e `frame-ancestors 'none'`: `headers.spec.ts` |
| V3 | Archiviazione nel browser | Sì | Solo due chiavi `localStorage` (data del primo uso, numero di prezzi), mai inviate: `tests/unit/usage.test.ts`, `tests/e2e/contribute.spec.ts` |
| V4 API | Metodi, tipi di contenuto, dimensioni | Sì | 401 senza sessione, 403 con `Origin` estraneo, 415, 413, 400: `tests/worker/session.test.ts`, `prices-post.test.ts` |
| V4 | Errori senza dettagli interni | Sì | Formato `{ error: { code, message } }` in italiano: `tests/e2e/shell.spec.ts` (`not_found`), `tests/worker/pentest-suite.test.ts` |
| V5 File | Caricamento di file | N/A | L'app non riceve file né foto (SPEC 14) |
| V6 Autenticazione | Utenti finali | N/A | Nessun account né password (vincolo 2.1); chi contribuisce è anonimo, protetto da Turnstile |
| V6 | Amministratore | Sì | Cloudflare Access davanti a `/admin*` e `/api/admin/*`, più verifica del JWT nel Worker: `tests/worker/admin.test.ts` (firma, `aud`, emittente, scadenza) |
| V7 Sessioni | Creazione, scadenza, attributi | Sì | Cookie `__Host-sid`, `HttpOnly; Secure; SameSite=Strict`, 30 minuti, firma HMAC con confronto a tempo costante: `tests/worker/session.test.ts`, `session-lib.test.ts` |
| V7 | Chiavi di sviluppo fuori da localhost | Sì | `tests/worker/env-guard.test.ts` (ADR 0029) |
| V8 Autorizzazione | Rotte admin | Sì | 403 senza JWT valido su ogni rotta `/api/admin/*`: `admin.test.ts`, `admin-listino.test.ts`, `coverage.test.ts`, `admin-metrics.test.ts` |
| V8 | Azioni sui dati di altri | Sì | Un prezzo in `review` o `removed` si cambia solo dall'admin; il client non decide cella e città (il Worker le legge dai dati): `prices-post.test.ts`, `venue-prices.test.ts` |
| V9 Token autocontenuti | JWT di Access | Sì | Algoritmo RS256 fissato, chiavi dal team domain, `aud`, emittente e scadenza controllati (`src/worker/lib/access.ts`): `admin.test.ts` |
| V10 OAuth e OIDC | — | N/A | Nessun accesso con provider esterni |
| V11 Crittografia | Algoritmi e chiavi | Sì | Solo WebCrypto (HMAC-SHA256, RS256); chiavi come secret di Wrangler, mai nel repo né nel bundle: `tests/security/no-secrets.spec.ts`, gitleaks in CI |
| V11 | Dati anonimi con sale giornaliero | Sì | HMAC con giorno come sale, cancellati entro 48 ore: `tests/worker/reports-cron.test.ts`, `hardening-keys.test.ts` |
| V12 Comunicazione | TLS e HSTS | Sì | HSTS 2 anni e `upgrade-insecure-requests`: `headers.spec.ts`; TLS lo termina Cloudflare |
| V12 | Chiamate verso terzi | Sì | Solo `tiles.openfreemap.org` (mappa, lato browser) e Turnstile; il siteverify non invia l'IP (`src/worker/routes/session.ts`, nessun `remoteip`): `tests/worker/session.test.ts` |
| V13 Configurazione | Segreti, ambienti, dipendenze | Sì | `scripts/check-config.mjs` (nessun segnaposto negli ambienti): `tests/unit/check-config.test.ts`; `npm audit`, Dependabot, Actions fissate a SHA, niente `pull_request_target` in CI |
| V13 | Superficie esposta | Sì | `/.well-known/security.txt` e `robots.txt`: `tests/security/security-txt.spec.ts`; nessun segreto nel bundle: `no-secrets.spec.ts` |
| V14 Protezione dei dati | Dati personali | Sì | Nessuna tabella con sid, IP o loro hash fuori da `counters` e `dedup`: `tests/worker/prices-post.test.ts`, `reports-cron.test.ts` |
| V14 | Posizione | Sì | Nessuna coordinata dell'utente nelle richieste (URL, header, body): `tests/e2e/privacy.spec.ts`, `tests/e2e/position-dot.spec.ts` |
| V14 | Cache dei dati | Sì | Cella con cache edge 60 s senza dati personali; dati OSM immutabili: `tests/security/data-cache.spec.ts` |
| V15 Codice sicuro e architettura | Dipendenze e supply chain | Sì | Solo le dipendenze di SPEC 4.1 a versione esatta: `tests/unit/dependencies.test.ts`; override in ADR 0030 |
| V15 | Nessun pagamento e nessuna AI | Sì | `tests/security/no-payments.spec.ts` |
| V15 | Concorrenza e abuso delle risorse | Sì | Letture di cella a costo costante, scritture limitate: `tests/worker/d1-reads.test.ts`; 20 richieste concorrenti: `stress-test-hardening.test.ts` |
| V16 Log ed errori | Log senza dati personali | Sì | Solo codice errore, rotta senza parametri, durata (`src/worker/index.ts`); invocazioni non registrate (`wrangler.jsonc`) |
| V16 | Gestione degli errori | Sì | Gestore globale (`src/worker/lib/errors.ts`): un errore imprevisto diventa 500 `internal` con messaggio fisso, senza stack; il formato è provato su 400, 403 e 404: `tests/worker/pentest-suite.test.ts` |
| V17 WebRTC | — | N/A | Nessuna comunicazione in tempo reale |

## Rischi accettati e decisioni aperte

Sono quelli di `SECURITY.md` («Rischi accettati»): segnalazioni uniche solo nel giorno, autore di un prezzo riconosciuto per 48 ore, quote per IP aggirabili con molti prefissi IPv6 (ogni identità costa una risoluzione Turnstile), duplicato futuro con OpenStreetMap. Quattro punti del pen test del 22/10/2026 (ADR 0029) cambiano la SPEC e li decide Roberto: conferma di un prezzo in quarantena da una seconda identità, rimozione con 4 segnalazioni, «ultimo vince» sotto i 5 prezzi, quote per IP. Finché non cambia la SPEC restano il comportamento accettato.
