# 0045 · Pagine con chiave per richiesta (nonce) e chiusura delle segnalazioni di Google

- **Stato:** proposta, da approvare da Roberto (SPEC 1.15; non cambiando `docs/feature_list.json` non richiede un nuovo tag, la guardia resta su `spec-approved-14`) · **Data:** 2026-10-29 · corregge ADR 0025 (tema), ADR 0039 (quando parte il download della mappa) e SPEC 13.1 (CSP, HSTS)

## Contesto
Search Console (Lighthouse) segnalava su www.dovebevo.com: `theme.js` e il CSS che bloccano il rendering (−450 ms stimati), `script-src` con elenco di host («Alta»), HSTS senza `preload`, nessuna regola Trusted Types, immagine della mappa più grande del necessario, `/.well-known/ai-catalog.json` che rispondeva 200 con la pagina HTML (errore del controllo ARD) e un'attività lunga di ~118 ms. Gli interventi del 28/10 non le toccavano. Rimisurate su `main` il 29/10 (Lighthouse locale, build di produzione, profilo mobile della CI): FCP 1,56 s, LCP 2,41 s (una run su cinque a 3,65 s), Performance 0,95.

## Decisione
1. **Ogni pagina passa dal Worker, che le dà un nonce nuovo a ogni richiesta** (`run_worker_first: ["/*", "!/assets/*", …]`, solo i file restano fuori). `src/worker/lib/security-headers.ts` mette il nonce con `HTMLRewriter` su `<script>`, `<style>` e `<link rel="modulepreload">` e imposta `script-src 'nonce-…' 'strict-dynamic' 'self' https://challenges.cloudflare.com` e `style-src 'self' 'nonce-…'`. Le risposte che non sono pagine (API, file) tengono la CSP fissa. ETag, Last-Modified e Content-Length della pagina vengono tolti: un 304 abbinerebbe l'header nuovo a un corpo con un nonce vecchio.
2. **Tema e CSS dentro la pagina** (plugin `inline-first-paint` in `vite.config.ts`): nessuna richiesta blocca il primo disegno. Il file CSS dell'entry non viene emesso né messo nella cache del service worker. `public/theme.js` resta come sorgente (sviluppo, test). Il preload dell'immagine non ha più `fetchpriority=high`: con lo script inline competeva con il JS che disegna l'immagine (LCP +138 ms in prova).
3. **Download della mappa dopo l'LCP** (`map-warmup.ts`): `load`, poi il primo `largest-contentful-paint`, poi 300 ms, poi un momento libero; senza supporto, 3 s. Con il primo disegno più rapido il download di ~440 KB cadeva prima dell'LCP e, nella simulazione, rubava banda alla foto: LCP tra 1,9 e 3,4 s (4 run su 7 cattive).
4. **Trusted Types**: `require-trusted-types-for 'script'` e una sola regola `default` (`src/app/lib/trusted-types.ts`) che accetta come URL di script solo `/assets/*`, `/sw.js` e l'indirizzo esatto di Turnstile e non offre `createHTML` né `createScript`. Senza regola MapLibre viola la direttiva in un solo punto (`new Worker`) e la mappa non parte.
5. **HSTS con `preload`** nell'header. L'invio a hstspreload.org e le impostazioni Cloudflare (HSTS sul dominio senza `www`, redirect HTTP → HTTPS prima di `www`) restano a Roberto.
6. **404 vero su `/.well-known/*`**, tranne `security.txt`. Non si pubblica un catalogo ARD: lo standard è una proposta e il formato cambia.
7. **Immagini della mappa in WebP** (`scripts/build-map-images.mjs`, canvas di Chromium via Playwright, qualità 0,65): 76/93 KB → 42/54 KB, stessa vista (confronto a occhio). Sorgenti JPEG in `docs/brand/assets/map/`.

## Misure (Lighthouse locale, 7 run, mediana)
| | `main` | soluzione |
|---|---|---|
| FCP | 1557 ms | 1221 ms |
| LCP | 2414 ms (una run su cinque a 3650) | 1981 ms (7 run su 7 tra 1972 e 1995) |
| Performance | 0,95 | 0,99 |
| Richieste che bloccano il rendering | 2 | 0 |

## Conseguenze
- Una invocazione del Worker per ogni visualizzazione di pagina (non per file): da tenere d'occhio sul piano gratuito (100.000 richieste/giorno).
- HTML da ~5 a ~10 KB trasferiti, CSS non riutilizzato tra pagine (app a pagina singola; il service worker tiene la copia offline con il suo nonce).
- Resta una nota «Media» di Lighthouse sulla CSP (ripiego `'unsafe-inline'` per browser senza nonce): non si aggiunge, perché indebolirebbe la CSP senza beneficio per i browser attuali.
- L'attività lunga (74–136 ms) non cambia; è sotto la soglia di INP e si riguarda dopo il deploy.
- Un nuovo script di terze parti va ammesso nella regola dei Trusted Types.
- Misure di laboratorio (CPU 4× più lenta, rete simulata): la conferma viene da Search Console dopo il deploy.
