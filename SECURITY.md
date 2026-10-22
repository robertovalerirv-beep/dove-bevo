# Sicurezza di Dove bevo

## Segnalare una vulnerabilità
Usa la segnalazione privata di GitHub (<https://github.com/robertovalerirv-beep/dove-bevo/security/advisories/new>), indicata anche in `/.well-known/security.txt` (RFC 9116, da rinnovare prima della scadenza). Non aprire issue pubbliche per le vulnerabilità.

## Modello di minaccia (STRIDE) — M2-01

Riferimenti: SPEC 13–14, ADR 0005 (sessione e quote), 0006 (eventi), 0018 (niente AI), 0019 (bar proposti). Standard: OWASP ASVS 5.0 livello 1 (`docs/security/asvs-l1.md`, M5). OWASP Top 10 LLM 2025: non applicabile, nessun LLM.

### Asset
| Asset | Perché conta |
|---|---|
| Quote dei piani gratuiti | nessuna spesa variabile: se si esauriscono il servizio rallenta, non si paga (ADR 0018, 0020) |
| Privacy degli utenti | posizione, abitudini; nessun dato personale deve esistere (SPEC 14) |
| Integrità dei prezzi | il valore del prodotto; prezzi falsi danneggiano utenti e locali |
| Reputazione dei locali | segnalazioni o prezzi falsi possono colpire un bar specifico |
| Disponibilità e quote gratuite | Workers, D1 (ADR 0013), asset statici |
| Segreti (`SESSION_HMAC_KEY`, `HASH_KEY`, `TURNSTILE_SECRET`, token Cloudflare) | permettono di falsificare sessioni o di deployare |

### Attori
Bot e script automatici · spammer di prezzi · concorrenti di un locale · utente curioso che manipola le richieste · chi propone bar inesistenti o con nomi pubblicitari · attaccante XSS tramite nomi OSM o nomi di bar proposti · contributore malevolo di OpenStreetMap · fork e PR malevole sul repository pubblico.

### Minacce e contromisure
| STRIDE | Minaccia | Contromisure | Verifica |
|---|---|---|---|
| **S**poofing | Bot che contribuiscono in massa | Turnstile al primo contributo, verificato server-side senza IP, `hostname` e `action` controllati; sessione `__Host-sid` firmata HMAC-SHA256, 30 min, confronto a tempo costante | M2-02, M2-03 |
| S | Sessione falsificata o rubata | Cookie `HttpOnly; Secure; SameSite=Strict`, prefisso `__Host-`; firma con `SESSION_HMAC_KEY`; nessun dato in chiaro nel cookie oltre a id casuale e scadenza; un Worker con le chiavi segnaposto di sviluppo rifiuta sessioni e scritture fuori da localhost (`env-guard`, ADR 0029) | M2-03 |
| S | Richieste da siti terzi (CSRF) | Controllo `Origin` su tutte le POST; `SameSite=Strict`; `Content-Type: application/json` obbligatorio | M2-04 |
| S | Accesso ad `/admin` | Cloudflare Access + verifica del JWT nel Worker (firma RS256, `aud`, scadenza) | M5-02 |
| **T**ampering | Prezzi falsi o fuori scala | Catalogo e limiti per drink; quarantena oltre ±50 % dalla mediana con ≥ 5 prezzi; conferme da sessioni diverse | M2-08, M2-09 |
| T | Bar inesistente o cella falsa nella richiesta | Il Worker legge il file della cella da `ASSETS` e verifica il bar; il client non è mai fonte di verità | M2-08 |
| T | Campi extra o tipi sbagliati | zod `strict` su ogni ingresso; body ≤ 16 KB letto con limite anche senza `Content-Length` | M2-04 |
| T | Prompt injection (LLM01) | Non applicabile: nessun LLM (ADR 0018) | — |
| T | Bar falsi o spam di proposte | Un bar proposto è `pending` e diventa pubblico solo con l'approvazione dell'admin, mai in automatico; nome validato (2–80, NFC, niente URL, email, telefoni, link nascosti con full-width o spazi, caratteri di controllo, invisibili, di uso privato o non validi; ADR 0029); duplicati bloccati (nome uguale entro 50 m → 409); 5 proposte al giorno per sessione e per IP; massimo 200 in attesa; prezzi di bar non approvati mai pubblici (ADR 0019) | M3-11, M3-12, M3-13 |
| T | Dati OSM manipolati | Validazione dell'import (riquadro Italia, nomi ≤ 120); deploy fallisce se l'import fallisce | M1-02, M1-03 |
| T | Supply chain e CI | Lockfile e versioni esatte, `npm audit`, Dependabot, Actions fissate a SHA, niente `pull_request_target`, deploy solo da `main` con `workflow_run` filtrato, ruleset su `main` e sui tag `spec-approved*` (esteso il 22/10/2026, ADR 0029); approvazione di Roberto per i workflow dei fork esterni; `scripts/check-config.mjs` in CI: ogni ambiente di `wrangler.jsonc` senza segnaposto e ogni deploy con `CLOUDFLARE_ENV`; `npm audit` anche sulle sole dipendenze di produzione a qualsiasi gravità | M0-05, M0-08 |
| **R**epudiation | Contributi non attribuibili | Accettato per scelta (anonimato, SPEC 14): si limita l'abuso con quote e conferme, non con l'identità. Log senza dati personali: codice, rotta, durata | M2-16 |
| **I**nformation disclosure | Posizione dell'utente | Calcoli di distanza e "Vicino a me" sul dispositivo; al server solo celle geohash5; nessuna coordinata in URL, header o body | M1-14 |
| I | Legame tra contributi della stessa persona | Nessun sid o IP salvato con i prezzi; solo HMAC con sale del giorno in `counters`/`dedup`, cancellati entro 48 h (ADR 0016) | M2-15, M2-16 |
| I | Posizione nella proposta di un bar | Il punto inviato è il pin confermato dall'utente (la posizione del bar, 5 decimali), mai la posizione del dispositivo; nessun sid salvato con la proposta | M3-11 |
| I | Segreti nel bundle o nel repo | Segreti solo come secret di Wrangler/CI; gitleaks e secret scanning; scansione di `dist/` | M0-09, M5-08 |
| I | Errori con dettagli interni | Formato `{ error: { code, message } }` in italiano, mai stack o testo dell'errore | M0-02 |
| **D**enial of service | Quote D1 esaurite, spam di scritture | Quote giornaliere per sessione e per IP; binding Rate Limiting per i picchi (ADR 0010); Cache API sulle celle; misure in ADR 0013 | M2-14 |
| D | Budget AI consumato (LLM10) | Non applicabile: nessuna AI, nessuna spesa variabile (ADR 0018) | — |
| D | Quote gratuite esaurite dal traffico | Con il limite del giorno raggiunto `/api/*` può rispondere con la pagina dell'app: il client lo riconosce e mostra «Il servizio è molto richiesto» senza perdere i dati già caricati (ADR 0020) | M3-19 |
| **E**levation of privilege | XSS da nomi OSM, input utente o output del modello (LLM05) | Preact rende solo testo; `dangerouslySetInnerHTML` vietato dal lint; CSP senza `unsafe-inline`; nessun CORS | M0-03, M0-04, M3-05 |
| E | Azioni del modello oltre il previsto (LLM06/09) | Non applicabile: nessun LLM (ADR 0018) | — |
| E | SQL injection | Solo query con parametri in `src/worker/lib/db.ts`; chiavi e celle validate con regex | M1-08, M1-15 |

### Rischi accettati
- Duplicato futuro: quando OpenStreetMap aggiungerà un bar già proposto e approvato, compariranno due bar. Si risolve a mano da `/admin` (strumento «Trova un bar sulla mappa»), segnalando il duplicato per prossimità. Il controllo dei duplicati lato server guarda solo la cella del punto: un duplicato a cavallo del confine tra due celle può passare e lo vede l'admin tra i «bar noti vicini».
- Un attaccante con molte reti diverse può superare le quote per IP: limitato da Turnstile, rate limit, quarantena e conferme. Da rivalutare con i dati reali.
- Il binding Rate Limiting è per località ed eventualmente consistente (ADR 0010): non è un contatore esatto, le quote esatte stanno in D1.
- L'immagine statica e i dati OSM sono pubblici per definizione.
- Le segnalazioni sono uniche per bersaglio, per sessione e per IP (IPv6 ridotto al /64) **nel giorno**: la stessa persona può segnalare di nuovo nei giorni seguenti. Contare i segnalatori distinti su più giorni richiederebbe salvare un hash dell'IP accanto alla segnalazione, vietato da SPEC 14. Accettato: `review` toglie il prezzo dalla vista ma non lo cancella, e decide l'admin (M5).
- L'autore di un prezzo è riconosciuto (per sessione e per IP, come HMAC) solo per 48 ore, la vita di `dedup` imposta da SPEC 8: dopo, da un IP diverso, potrebbe confermare il proprio prezzo in quarantena. Accettato: la quarantena serve a frenare valori anomali immediati, e i prezzi in `review` restano fermi finché non decide l'admin.
- Pen test del 22/10/2026 (ADR 0029): restano da decidere, perché cambiano la SPEC, l'attivazione di un prezzo in quarantena con la conferma di una seconda identità (D-10), la rimozione con 4 segnalazioni distinte, il prezzo «ultimo vince» sotto i 5 prezzi in cella e le quote per IP aggirabili con molti prefissi IPv6 e sessioni. Ogni identità richiede una risoluzione Turnstile.
