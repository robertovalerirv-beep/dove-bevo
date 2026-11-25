# 0053 · Ogni bar con un prezzo è raggiungibile dai motori di ricerca

- **Stato:** proposta, da confermare da Roberto con la PR · **Data:** 2026-11-25 · completa l'ADR 0025 e l'ADR 0046. Non cambia SPEC, schema, API, scritture e `docs/feature_list.json`.

## Contesto
Search Console (dati al 16/11/2026): 72 pagine indicizzate, 151 bar «Rilevata, ma attualmente non indicizzata», 3 «Pagina con reindirizzamento». Misure del 25/11/2026 sul sito vivo e sugli elenchi di Search Console:
- I 151 URL sono tutti schede bar **mai scansionate** («Ultima scansione: N/D»): Google li conosce dalla sitemap e non li apre. «Pagina scansionata, non indicizzata» è 0: quelle aperte vengono indicizzate.
- Dei 250 bar in sitemap **166 non avevano nessun link interno**: le pagine città elencavano al massimo 30 bar di 3 celle, fuori dalle sei città non c'era nessun link, i bar proposti dagli utenti (senza città in D1) non ne avevano mai e una scheda bar non linkava nessun'altra scheda. Degli 84 bar con un link 42 erano indicizzati; dei 166 senza link 19; **dei bar proposti dagli utenti nessuno**. I limiti fissi spiegano perché il problema cresce con i bar (92 → 151).
- `robots.txt` vietava `/api/`. Un motore che esegue JavaScript disegna allora ogni scheda come «**Questo locale non è più sulla mappa.**» (provato con Playwright sul sito vivo bloccando `/api/**`): il client scambiava una lettura fallita per un bar sparito. Lo stesso messaggio falso lo vedeva un utente con la rete caduta.
- 3 bar in sitemap non sono più nei dati OSM: la pagina era la shell vuota, senza canonical.
- I 3 redirect sono `http://dovebevo.com/`, `https://dovebevo.com/` e `http://www.dovebevo.com/`: 301 voluti, con un salto solo. È lo stato giusto: **non c'è nulla da correggere né da convalidare**.

## Decisione
1. **Pagine città:** elencano tutti i bar (tetto `hubLinks` = 2.000, non più 30), aprendo fino a `hubNameCells` = 30 file di cella; anche quelli con il solo prezzo happy hour e i bar utente delle celle della città. Conteggi e mediane invariati.
2. **`/copertura`:** diventa l'indice: le righe delle sei città portano alla loro pagina; ogni altro bar è linkato sotto la sua città o in «Altre zone». Città e `/copertura` insieme raggiungono tutti i bar della sitemap (test). Un bar la cui cella supera i 30 file resta linkato con un testo generico, quindi non diventa orfano.
3. **Scheda bar:** sezione «Altri bar con un prezzo in zona» (stessa cella, al massimo 30, ad anello così ogni bar è linkato da altri), link alla pagina della città e a `/copertura`; città nel titolo e nella descrizione; giorno di ogni prezzo e, con almeno 5 prezzi (D-12), mediana della zona. Nomi dallo stesso file già aperto, prezzi dalla riga istantanea della cella (1 riga, ADR 0020).
4. **`robots.txt`:** `Allow: /api/prices/` e `/api/venues/`, le due letture che servono a disegnare una scheda (già dichiarate pubbliche in `llms.txt`); il resto di `/api/` e `/admin` restano vietati. Tutte le risposte `/api/*` hanno `X-Robots-Tag: noindex`, tranne `/api/ai/cerca`: non diventano risultati di ricerca.
5. **Scheda nel client:** se la cella non si legge, il messaggio è «Non riesco a caricare i prezzi. Controlla la connessione.» (o «Il servizio è molto richiesto…»), testi già esistenti; «non è più sulla mappa» solo quando la cella è stata letta e il bar non c'è.
6. **Bar spariti da OSM o senza prezzi:** `<meta name="robots" content="noindex">` sulla scheda e, per gli spariti, niente voce in sitemap (per le 30 celle lette). Mai per un guasto: oltre il limite, D1 fermo o file non letto, la pagina resta com'era.

## Conseguenze
- Costo: una scansione di `prices_current` in più per pagina città e nessuna in più per `/copertura` (pagine costruite al massimo ogni 5 minuti per isolate); una riga D1 in più per scheda bar. File aperti per richiesta ≤ 31 (tetto del piano gratuito 50, ADR 0050). Le 59 celle vive con un prezzo pesano 264 KB; `JSON.parse` di tutte prende 2,9 ms (Node, misura locale).
- I bar utente compaiono nell'elenco della pagina città ma non nei suoi conteggi, come prima.
- Resta vero l'ADR 0046: l'indicizzazione la decide Google. I link e le pagine leggibili tolgono gli ostacoli nostri, non danno garanzie né tempi certi; le schede con uno o due prezzi restano contenuto sottile.
- Rollback con `git revert`: nessun dato toccato.
