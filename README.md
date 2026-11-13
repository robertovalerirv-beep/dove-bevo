# Dove bevo

Mappa gratuita dei bar italiani con i prezzi reali di birre e drink, inseriti da chi li ha pagati.

**Sito: <https://www.dovebevo.com>**

Entri in un bar, ordini uno spritz, apri la mappa e in pochi secondi segni quanto l'hai pagato. Chiunque vede dove si beve a quale prezzo, vicino a sé o in qualsiasi città.

## Principi

- **Gratis, senza registrazione**: né per consultare né per contribuire. Nessun onboarding, nessun cookie banner.
- **Nessun tracciamento**: la posizione resta sul telefono; al server arrivano solo celle di circa 5 km che dicono dove si guarda la mappa, non dove si è.
- **Contributi anonimi**: di un prezzo si salvano bar, drink, importo e giorno. Nessun autore.
- **Veloce**: inserire un prezzo richiede al massimo 4 tocchi più le cifre.
- **Accessibile**: WCAG 2.2 AA, tema chiaro e scuro, italiano e inglese.
- **Nessuna AI, nessun pagamento** per chi usa la mappa.

Il servizio è destinato a maggiorenni.

## Come è fatto

Un solo Cloudflare Worker con file statici: i bar (da OpenStreetMap) sono file generati a ogni rilascio, i prezzi stanno in D1.

- Frontend: Vite, Preact, TypeScript, MapLibre GL JS, mappe OpenFreeMap.
- Backend: Hono e zod sul Worker, database D1, Turnstile contro i bot.
- Test: Vitest, Playwright (Chromium e WebKit a 390×844), axe, Lighthouse CI.

Le app Android e iOS stanno in [`mobile-apps/`](mobile-apps/README.md).

## Avvio in locale

Servono Node.js 24 o superiore e Git Bash (su Windows).

```bash
./init.sh
```

Installa le dipendenze, prepara i dati di prova (alcune celle di Milano), avvia l'app e fa uno smoke test. `./init.sh --stop` la ferma.

| Comando | Cosa fa |
|---|---|
| `npm run dev` | Vite e Worker in locale, con i dati di prova |
| `npm run test` | test unit e del Worker |
| `npm run test:e2e` | test Playwright |
| `npm run test:security` | test di sicurezza |
| `npm run verify` | tutto ciò che esegue la CI |

## Documenti

| Documento | Contenuto |
|---|---|
| [`docs/SPEC.md`](docs/SPEC.md) | specifica completa: vincoli, funzionalità, API, dati |
| [`docs/adr/`](docs/adr/) | decisioni di progetto, una per file |
| [`docs/PROGRESS.md`](docs/PROGRESS.md) | stato dei lavori |
| [`CHANGELOG.md`](CHANGELOG.md) | cosa cambia a ogni versione |
| [`SECURITY.md`](SECURITY.md) | modello di minaccia e come segnalare una vulnerabilità |
| [`PRIVACY-NOTES.md`](PRIVACY-NOTES.md) | quali dati esistono e quali no |
| [`docs/brand/`](docs/brand/README.md) | identità visiva |

## Dati e attribuzioni

- I bar e le città vengono da [OpenStreetMap](https://www.openstreetmap.org/copyright), © OpenStreetMap contributors, con licenza [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
- Le mappe sono servite da [OpenFreeMap](https://openfreemap.org), con dati © [OpenMapTiles](https://openmaptiles.org) e © OpenStreetMap contributors.
- I prezzi sono dati di Dove bevo: sono collegati agli identificativi di OpenStreetMap ma non stanno mai negli stessi file dei dati OSM ([ADR 0003](docs/adr/0003-licenza-odbl-separazione-prezzi.md)).

## Licenza del codice

Il codice è pubblico per trasparenza, ma al momento non ha una licenza: tutti i diritti sono riservati. Per riusarlo scrivi all'indirizzo qui sotto.

## Contatti

- Vulnerabilità: [segnalazione privata su GitHub](https://github.com/robertovalerirv-beep/dove-bevo/security/advisories/new), mai una issue pubblica.
- Correzioni chieste da un gestore e ogni altra domanda: <dovebevo@gmail.com>.
