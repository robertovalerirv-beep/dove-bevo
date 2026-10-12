# Sicurezza di Dove bevo

## Segnalare una vulnerabilità
Scrivi all'indirizzo in `/.well-known/security.txt` (RFC 9116, in arrivo con M5). Non aprire issue pubbliche per le vulnerabilità.

## Modello di minaccia (STRIDE) — M2-01

Riferimenti: SPEC 13–14, ADR 0005 (sessione e quote), 0006 (eventi), 0007 (tetto AI). Standard: OWASP ASVS 5.0 livello 1 (`docs/security/asvs-l1.md`, M5) e OWASP Top 10 LLM 2025 (LLM01, 02, 05, 07, 09, 10).

### Asset
| Asset | Perché conta |
|---|---|
| Chiave API Anthropic e budget AI | spesa reale; unica voce di costo variabile (SPEC 2.4) |
| Privacy degli utenti | posizione, abitudini; nessun dato personale deve esistere (SPEC 14) |
| Integrità dei prezzi | il valore del prodotto; prezzi falsi danneggiano utenti e locali |
| Reputazione dei locali | segnalazioni o prezzi falsi possono colpire un bar specifico |
| Disponibilità e quote gratuite | Workers, D1 (ADR 0013), asset statici |
| Segreti (`SESSION_HMAC_KEY`, `HASH_KEY`, `TURNSTILE_SECRET`, token Cloudflare) | permettono di falsificare sessioni o di deployare |

### Attori
Bot e script automatici · spammer di prezzi · concorrenti di un locale · utente curioso che manipola le richieste · autore di un listino con istruzioni nascoste (prompt injection nelle foto) · attaccante XSS tramite nomi OSM o output del modello · contributore malevolo di OpenStreetMap · fork e PR malevole sul repository pubblico.

### Minacce e contromisure
| STRIDE | Minaccia | Contromisure | Verifica |
|---|---|---|---|
| **S**poofing | Bot che contribuiscono in massa | Turnstile al primo contributo, verificato server-side senza IP, `hostname` e `action` controllati; sessione `__Host-sid` firmata HMAC-SHA256, 30 min, confronto a tempo costante | M2-02, M2-03 |
| S | Sessione falsificata o rubata | Cookie `HttpOnly; Secure; SameSite=Strict`, prefisso `__Host-`; firma con `SESSION_HMAC_KEY`; nessun dato in chiaro nel cookie oltre a id casuale e scadenza | M2-03 |
| S | Richieste da siti terzi (CSRF) | Controllo `Origin` su tutte le POST; `SameSite=Strict`; `Content-Type: application/json` obbligatorio | M2-04 |
| S | Accesso ad `/admin` | Cloudflare Access + verifica del JWT nel Worker (firma RS256, `aud`, scadenza) | M5-02 |
| **T**ampering | Prezzi falsi o fuori scala | Catalogo e limiti per drink/formato; quarantena oltre ±50 % dalla mediana con ≥ 5 prezzi; conferme da sessioni diverse | M2-08, M2-09 |
| T | Bar inesistente o cella falsa nella richiesta | Il Worker legge il file della cella da `ASSETS` e verifica il bar; il client non è mai fonte di verità | M2-08 |
| T | Campi extra o tipi sbagliati | zod `strict` su ogni ingresso; body ≤ 16 KB letto con limite anche senza `Content-Length` | M2-04 |
| T | Prompt injection nel listino (LLM01) | Il testo dell'immagine è dato, mai istruzione; structured output con schema; zod tronca e valida; revisione obbligatoria dell'utente; nessuna azione automatica dall'output | M3-04, M3-06 |
| T | Dati OSM manipolati | Validazione dell'import (riquadro Italia, nomi ≤ 120); deploy fallisce se l'import fallisce | M1-02, M1-03 |
| T | Supply chain e CI | Lockfile e versioni esatte, `npm audit`, Dependabot, Actions fissate a SHA, niente `pull_request_target`, deploy solo da `main` con `workflow_run` filtrato, ruleset su `main` e sul tag `spec-approved` | M0-05, M0-08 |
| **R**epudiation | Contributi non attribuibili | Accettato per scelta (anonimato, SPEC 14): si limita l'abuso con quote e conferme, non con l'identità. Log senza dati personali: codice, rotta, durata | M2-16 |
| **I**nformation disclosure | Posizione dell'utente | Calcoli di distanza e "Vicino a me" sul dispositivo; al server solo celle geohash5; nessuna coordinata in URL, header o body | M1-14 |
| I | Legame tra contributi della stessa persona | Nessun sid o IP salvato con i prezzi; solo HMAC con sale del giorno in `counters`/`dedup`, cancellati dopo 48 h | M2-15, M2-16 |
| I | EXIF e posizione nelle foto | Ricodifica JPEG sul client (niente metadati); immagine mai salvata né loggata | M3-01 |
| I | Segreti nel bundle o nel repo | Segreti solo come secret di Wrangler/CI; gitleaks e secret scanning; scansione di `dist/` | M0-09, M5-08 |
| I | Prompt di sistema (LLM07) | Considerato pubblico: nessun segreto né regola di sicurezza nel prompt | M3 |
| I | Errori con dettagli interni | Formato `{ error: { code, message } }` in italiano, mai stack o testo dell'errore | M0-02 |
| **D**enial of service | Quote D1 esaurite, spam di scritture | Quote giornaliere per sessione e per IP; binding Rate Limiting per i picchi (ADR 0010); Cache API sulle celle; misure in ADR 0013 | M2-14 |
| D | Budget AI consumato (LLM10) | Prenotazione atomica del costo massimo prima della chiamata; tetti giornaliero e mensile per ambiente; `AI_ENABLED=false`; limite di spesa in Console Anthropic | M3-08 |
| D | Upload enormi | Limite 1,5 MB su `Content-Length` e sullo stream; magic bytes JPEG | M3-03 |
| **E**levation of privilege | XSS da nomi OSM, input utente o output del modello (LLM05) | Preact rende solo testo; `dangerouslySetInnerHTML` vietato dal lint; CSP senza `unsafe-inline`; nessun CORS | M0-03, M0-04, M3-05 |
| E | Azioni del modello oltre il previsto (LLM06/09) | Il modello non ha strumenti né accesso a dati: legge un'immagine e restituisce JSON validato; l'utente conferma ogni voce | M3-04, M3-06 |
| E | SQL injection | Solo query con parametri in `src/worker/lib/db.ts`; chiavi e celle validate con regex | M1-08, M1-15 |

### Rischi accettati
- Un attaccante con molte reti diverse può superare le quote per IP: limitato da Turnstile, rate limit, quarantena e conferme. Da rivalutare con i dati reali.
- Il binding Rate Limiting è per località ed eventualmente consistente (ADR 0010): non è un contatore esatto, le quote esatte stanno in D1.
- L'immagine statica e i dati OSM sono pubblici per definizione.
- Le segnalazioni sono uniche per bersaglio, per sessione e per IP (IPv6 ridotto al /64) **nel giorno**: la stessa persona può segnalare di nuovo nei giorni seguenti. Contare i segnalatori distinti su più giorni richiederebbe salvare un hash dell'IP accanto alla segnalazione, vietato da SPEC 14. Accettato: `review` toglie il prezzo dalla vista ma non lo cancella, e decide l'admin (M5).
- L'autore di un prezzo è riconosciuto (per sessione e per IP, come HMAC) solo per 48 ore, la vita di `dedup` imposta da SPEC 8: dopo, da un IP diverso, potrebbe confermare il proprio prezzo in quarantena. Accettato: la quarantena serve a frenare valori anomali immediati, e i prezzi in `review` restano fermi finché non decide l'admin.
