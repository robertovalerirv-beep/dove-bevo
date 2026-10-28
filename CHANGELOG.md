# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/it-IT/1.1.0/). Versioni `0.x.y`, un tag per ogni rilascio in produzione.

## [Non rilasciato] — verso 0.1.0

Il sito vivo è l'ambiente `staging` su `www.dovebevo.com` (ADR 0035 e 0036): il tag `v0.1.0` segna la versione su `main`, senza un secondo deploy.

### Aggiunto
- Verificati a mano su iPhone e Android: pulsante centrale, menu della lingua, traduzione inglese e riga di stato su telefono stretto.
- Specifica 1.13: pulsante centrale «Clicca sulla mappa o cerca una città» all'apertura, attribuzioni della mappa con link da 24 px, titolo della pagina neutro sulla mappa (ADR 0040). Il codice arriva nei prossimi commit di questa PR.
- Mappa pronta al primo tocco: dopo il caricamento della pagina, a telefono libero, i file della mappa si scaricano in anticipo con un `fetch` (funziona anche su Safari) e cache lunga sui file con hash; salta con il risparmio dati.
- Specifica 1.11: mappa pronta al primo tocco (file scaricato in anticipo) e interfaccia pubblica in inglese con menu in alto a sinistra, senza salvare la scelta (ADR 0037, 0038). Il codice arriva nei prossimi rami.
- Interfaccia pubblica in inglese (ADR 0038): menu «IT/EN» in alto a sinistra sulla mappa e nell'intestazione di `/privacy` e `/regole`; la scelta non viene salvata e si riparte sempre dall'italiano; numeri, date e valuta restano `it-IT`; `/admin` resta in italiano. Privacy e regole in inglese sono una bozza da rileggere.
- Mappa dei bar italiani con i prezzi inseriti dagli utenti, senza registrazione e senza tracciamento.
- «Scegli cosa bere»: nove drink, prezzo più basso tra quelli scelti, colori Affare, Giusto, Salato rispetto alla mediana della zona.
- «Vicino a me» con pallino fermo della posizione, che resta sul telefono.
- Ricerca di città e di bar per nome in tutta Italia, senza richieste a `/api/*`.
- «Aggiungi prezzo» in al massimo 4 tocchi più le cifre, con Annulla di 5 secondi, conferme, segnalazioni e quarantena dei prezzi anomali.
- Proposta di un bar mancante (lo rende pubblico solo l'admin).
- `/admin` dietro Cloudflare Access: tre code di revisione, strumenti per i bar, metriche giornaliere, dashboard di copertura e inserimento da listino.
- Pagine `/privacy` e `/regole`.
- PWA: installabile e con la shell offline.
- Pagine per i motori di ricerca (città, bar, `sitemap.xml`, `llms.txt`).

### Sicurezza
- Header e CSP di SPEC 13.1, sessione anonima con Turnstile, quote e rate limit, nessun dato personale salvato (SECURITY.md, `docs/security/asvs-l1.md`).
- Pen test del 22/10/2026 e rafforzamenti (ADR 0029).
