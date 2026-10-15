# Prompt per Claude Code — Dove bevo, dashboard di copertura in `/admin` · v2 (15/10/2026)

> **Come si usa.** Apri Claude Code nella cartella del repo `dove-bevo` **in plan mode**, fai `/clear` e incolla: `Salva questo prompt in docs/PROMPT-DASHBOARD.md, poi leggi CLAUDE.md, docs/SPEC.md, docs/PROGRESS.md, docs/feature_list.json e le ADR su quote D1 e pannello admin. Parti dalla sezione 5, passo 0.` Questo documento **non sostituisce** la SPEC né `docs/PROMPT-V3.md`: aggiunge una funzionalità dentro i loro vincoli.

---

## 0. Ruolo e metodo

Sei un senior engineer e un senior developer. Il codice deve essere ottimizzato alla perfezione, nel senso misurabile già in uso: budget numerici, misure prima e dopo in `docs/PROGRESS.md`, nessuna regressione, meno codice e meno dipendenze possibile.

Metodo invariato: plan mode, una funzionalità alla volta, test prima del codice, prove (output dei test, screenshot Playwright 390×844), `/code-review`, `/security-review`, subagent `spec-reviewer`, commit piccoli, PR verso `main`, poi ti fermi. Per l'aspetto visivo usa come sempre il design system generato con **UI UX Pro Max** in `design-system/` e la sua checklist pre-consegna.

## 1. Obiettivo

Roberto vuole aprire `/admin`, premere **Aggiorna** e capire in pochi secondi **a che punto è il riempimento della mappa**. La domanda a cui la dashboard risponde è una sola: *in quali città ci sono bar con almeno un prezzo, quanti, e quanto manca al gate.*

È il numero che decide i gate del progetto (gate di copertura: 150 bar con prezzo nella zona di lancio di Milano) e che guida dove chiedere aiuto agli amici. Per questo vale più di qualunque altra metrica in `/admin`.

## 2. Cosa mostra

### 2.1 Definizione del dato (vincolante)
**Bar con almeno un prezzo** = bar visibile sulla mappa pubblica con almeno una riga in `prices_current` con `status = 'active'`. Quindi:
- **non** contano i prezzi in quarantena, in `review`, `removed`, né i prezzi dei bar `pending` (non ancora approvati da Roberto);
- **non** contano i bar nascosti dall'admin (OSM nascosto o bar utente rimosso);
- un bar con 5 prezzi conta **1**;
- conta il bar, non il drink: niente ripartizione per drink in questa prima versione.

Questa definizione deve coincidere con ciò che vede l'utente sulla mappa. Se nel codice esiste già una funzione o una condizione SQL che stabilisce "prezzo pubblico", **riusala**: non scriverne una seconda (N6 di PROMPT-V3).

### 2.2 Contenuto
In cima, una riga di indicatori:
- bar con almeno un prezzo, in tutta Italia;
- città con almeno un bar coperto;
- prezzi pubblici totali;
- prezzi inseriti oggi e negli ultimi 7 giorni, **solo se** si ricavano dai contatori giornalieri che esistono già (`metrics_daily`, evento `price_added`); se non esistono, ometti l'indicatore e dimmelo, non creare tabelle per questo;
- l'avanzamento verso il gate: bar coperti nella zona di lancio su 150 (la definizione della zona è nella SPEC; se non è codificata, chiedimelo).

Sotto, **una tabella per città**:

| Colonna | Significato |
|---|---|
| Città | nome da `places.json` (o dalla fonte stabile, vedi 3.2) |
| Bar con prezzo | come 2.1 |
| Bar totali | bar della città nei file statici più bar utente approvati |
| Copertura | bar con prezzo ÷ bar totali, in percentuale, con il numero sempre scritto accanto |
| Prezzi pubblici | righe attive della città |
| Ultimo inserimento | solo la data (coerente con la privacy: nessun orario per bar) |

Ordinamento predefinito per bar con prezzo decrescente, ordinabile per colonna, campo di ricerca per città. Ordinamento e ricerca lavorano sui dati già scaricati, senza nuove richieste. Le città con zero bar coperti non compaiono di default (sarebbero migliaia di righe vuote); un interruttore "Mostra anche le città senza prezzi" le include, sempre senza nuove richieste. I bar senza città assegnata finiscono in una riga **"Senza città"**, mai scartati in silenzio.

Ogni riga apre la mappa centrata su quella città (link alla vista esistente, nessun componente nuovo).

### 2.3 Aggiornamento solo su richiesta (vincolante)
- **L'unico modo di calcolare le statistiche è il pulsante "Aggiorna".** Nessun aggiornamento automatico, nessun timer, nessun polling, nessun calcolo al cambio di scheda o al ritorno sulla pagina, nessun WebSocket, Durable Object o Server-Sent Events.
- All'apertura di `/admin` la dashboard **non legge nulla**: mostra il pulsante e il testo "Premi Aggiorna per calcolare lo stato della mappa". Le tre code e gli strumenti di `/admin` restano come sono.
- Ogni pressione calcola i dati **al momento**: niente cache lato server, così il dato è esatto quando lo leggo.
- Dopo il calcolo: "Aggiornato alle HH:MM:SS". Durante il calcolo il pulsante è disabilitato con un indicatore di caricamento, così un doppio tocco non lancia due calcoli.
- Se la richiesta fallisce o la risposta non è JSON (degrado gentile di PROMPT-V3 §5.3), restano i dati precedenti, se ci sono, con "Aggiornamento non riuscito, riprova".

## 3. Vincoli tecnici e ragionamento da verificare

### 3.1 Costo in righe lette: con l'aggiornamento manuale basta la query diretta, fino a una soglia
Su D1 ogni riga scansionata conta come letta, indici compresi, e il piano gratuito ne concede 5 milioni al giorno, condivisi con la mappa pubblica. Un conteggio per città su `prices_current` legge **una riga per ogni prezzo attivo**, anche con un indice di copertura.

Catena da verificare con le misure. Con il solo pulsante il costo giornaliero è *pressioni al giorno × prezzi attivi*. Ipotesi prudente: 20 pressioni al giorno. Obiettivo: la dashboard consuma **≤ 2% della quota giornaliera di letture D1, cioè 100.000 righe**. Quindi la query diretta rispetta l'obiettivo fino a circa **5.000 prezzi attivi**: 20 × 5.000 = 100.000. Oltre quella soglia ogni pressione costa di più e la dashboard comincia a togliere quota agli utenti.

**Decisione di partenza (codice minimo):**
1. **Query diretta** al momento della pressione, che usa un indice di copertura (per esempio su `status, city, venue_key`, da verificare con `EXPLAIN QUERY PLAN`; se un indice esistente basta, nessun indice nuovo). Nessuna tabella aggregata, nessuna modifica alle scritture: il contributo resta com'è oggi.
2. I bar totali per città vengono da `places.json` (già nei file statici) più i bar utente approvati: misura come leggerli senza scansioni inutili.
3. **ADR** con: righe lette per pressione misurate in staging, soglia calcolata con i numeri reali, e il piano da applicare **solo** al superamento della soglia (tabella aggregata per città aggiornata nella stessa `batch()` delle scritture che cambiano lo stato pubblico, più riconciliazione nel Cron giornaliero esistente). Il piano si documenta, non si implementa ora.
4. Un avviso in `/admin`, sotto la dashboard, quando i prezzi attivi superano l'80% della soglia: "La dashboard si avvicina al limite di costo previsto, vedi ADR". Il numero di prezzi attivi lo restituisce la stessa query, senza letture in più.
5. Un limite minimo tra due calcoli, per esempio 10 secondi, applicato nel Worker: protegge la quota da tocchi ripetuti. Se lo ritieni superfluo dopo le misure, dimmelo.

Se il passo 0 mostra che esiste già un aggregato per cella o per città (per esempio la riga snapshot per cella proposta in PROMPT-V3 §5.3), **deriva le città da lì**, perché costa meno della query diretta e non duplica strutture.

### 3.2 Stabilità della chiave città
I file statici assegnano a ogni bar un `cityIdx`, indice dentro `places.json`, e la SPEC salva `city INTEGER` in `prices_current`. **Verifica se quell'indice resta stabile quando l'import OSM mensile rigenera `places.json` con un nuovo `DATA_VERSION`.** Se non lo è, dopo il primo nuovo import la dashboard mostrerebbe prezzi attribuiti alla città sbagliata senza alcun errore visibile. In quel caso proponimi la correzione più semplice (chiave stabile, ad esempio l'ID OSM del nodo `place`, oppure remapping nell'import) prima di costruire la dashboard. Documenta la scelta in ADR.

### 3.3 Sicurezza e privacy
- Rotta in lettura sotto `/api/admin/*`, protetta dal JWT di Cloudflare Access come le altre. Test: senza JWT valido → rifiuto.
- Solo dati aggregati per città: nessun ID di sessione, nessun orario per singolo bar, nessuna coordinata utente. Nessun dato nuovo da dichiarare in `PRIVACY-NOTES.md`.
- Nomi delle città sempre resi come testo.
- `Cache-Control: no-store` sulla risposta admin.

### 3.4 Codice
- **Parti dall'esistente**: la SPEC (sezione 10 del brief) prevedeva già in `/admin` la copertura per città, e il pannello ha già una parte "metriche". Prima di scrivere, cerca con `git grep -n "coverage\|copertura\|metrics" src/` cosa esiste. Estendi, non duplicare.
- La dashboard è una sezione della pagina `/admin` esistente, in cima, sopra le tre code. Stessi componenti di elenco/tabella delle code se adattabili; nessuna libreria di grafici, nessun grafico in questa versione.
- Caricamento a richiesta (import dinamico): la dashboard non deve pesare sulla shell pubblica.
- Testi in `src/app/i18n/it.ts`, TypeScript strict, zod sulla risposta nel Worker, nessuna dipendenza nuova.

### 3.5 Usabilità
La userò soprattutto dal telefono. A 390×844 il pulsante **Aggiorna** è visibile senza scorrere e la tabella resta leggibile: colonne secondarie (prezzi pubblici, ultimo inserimento) nascoste sotto una larghezza minima o mostrate come seconda riga, mai scroll orizzontale della pagina. Tabella semantica (`<table>`, `<th scope>`, `aria-sort` sulla colonna ordinata), annuncio `aria-live` discreto a calcolo finito, axe senza violazioni.

## 4. Punti da chiedermi con AskUserQuestion (solo questi)
1. La zona di lancio per l'indicatore del gate, se non è già codificata.
2. Se vuoi vedere in una colonna separata i bar con prezzi **in attesa** (bar pending o prezzi in quarantena), utile per sapere quanto si sbloccherà approvando le code. Default proposto: no, perché è già nelle tre code.
3. Se la riga "Senza città" deve proporre un'azione (per esempio aprire l'elenco di quei bar) o restare solo informativa.

## 5. Ordine di lavoro

0. **Misure e stato reale, nessuna modifica.** Riporta: cosa esiste già in `/admin` per metriche e copertura; come è salvata la città e se la chiave è stabile (3.2); se esistono contatori giornalieri di `price_added`; quanti prezzi attivi ci sono in staging; righe lette dalla query diretta e piano di esecuzione. Calcola con questi numeri la soglia di 3.1. Fermati.
1. **Proposta di design** in plan mode con ADR: query, indice, soglia, piano per il superamento, limite tra due calcoli. Fermati per il mio ok.
2. **Aggiunta alla feature list** in un commit dedicato: nuove voci con `"passes": false`, senza toccare le altre. Come per PROMPT-V3, proponimi l'eventuale nuovo tag di approvazione e aspetta.
3. **Worker**: rotta admin con la query, limite tra due calcoli. Test prima del codice.
4. **Interfaccia**: stato iniziale vuoto, pulsante, indicatori, tabella, ricerca, ordinamento, degrado gentile.
5. **Prove e chiusura.**

## 6. Prove richieste
- Apertura di `/admin` → **nessuna** richiesta alla rotta della dashboard (verifica sulle richieste di rete).
- Nessuna richiesta alla rotta della dashboard dopo 5 minuti di pagina aperta, dopo un cambio di scheda e al ritorno sulla pagina, senza premere il pulsante.
- Premo Aggiorna → una sola richiesta; doppio tocco rapido → sempre una sola richiesta.
- Inserisco il primo prezzo in un bar, premo Aggiorna → il bar compare tra i coperti della sua città.
- Secondo prezzo sullo stesso bar → bar coperti invariati, prezzi pubblici +1.
- Prezzo in quarantena → non conta; esce dalla quarantena → conta.
- Bar `pending` con prezzi → non conta; dopo l'approvazione → conta; dopo il rifiuto → non conta.
- "Togli dalla mappa" su un bar coperto → il conteggio scende; ripristino → risale.
- Somma dei bar coperti per città = totale nazionale, sempre (test di invariante).
- Se la chiave città cambia tra due `DATA_VERSION`, il test dimostra che l'attribuzione resta corretta (o che 3.2 è stato risolto).
- Rotta admin senza JWT → rifiuto; risposta con `no-store`; secondo calcolo entro il limite minimo → risposta gentile senza lettura D1.
- Righe D1 lette per pressione e `EXPLAIN QUERY PLAN` in `PROGRESS.md`; righe scritte per un contributo invariate.
- Screenshot 390×844 in Chromium e WebKit (stato iniziale, caricamento, dati, errore), axe senza violazioni, nessun peso aggiunto alla shell pubblica.
- `git diff --shortstat` nel riepilogo, con il saldo di righe giustificato.

**Finito** = definizione 2.1 rispettata ovunque, nessuna lettura senza pressione del pulsante, soglia di 3.1 misurata e documentata, nessuna regressione su budget, quote e privacy, ADR e feature list aggiornate, revisioni chiuse.

## 7. Notion
Dopo il mio ok al passo 1, proponimi l'aggiunta alla pagina "Dove bevo": step operativo "Dashboard di copertura in /admin" e decisione "La copertura si misura sui bar con almeno un prezzo pubblico, calcolata solo su richiesta con il pulsante Aggiorna" (Stato: Deciso, Data: 15/10/2026). Scrivi solo dopo la mia conferma.

Fine del prompt. Nessun codice prima del mio ok al passo 1.
