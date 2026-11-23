# 0051 · Il deploy non scarica più il file OSM

- **Stato:** decisa da Roberto il 23/11/2026 in chat («se merge e commit sono verdi, il deploy deve essere verde») · **Data:** 2026-11-23 · modifica SPEC 5.3 e D-03 (il testo «ripristina dalla cache il PBF del giorno, altrimenti lo scarica»; la SPEC va riallineata con l'ok di Roberto). Non cambia schema, API, interfaccia e feature list. Completa l'ADR 0050.

## Contesto
Il «Deploy staging» del merge #443 si è fermato 40 minuti (due tentativi) al passo «Download the extract», con `curl` vivo alla cancellazione. Dai log: la chiave della cache era la data del file di Geofabrik, quindi il primo deploy di ogni giornata scaricava il file intero. Misurato: 26 min 17 s e 4 min 6 s il 20/11, oltre 40 min senza fine il 23/11; con la cache il passo dura 0 s e il deploy 3–4 minuti (dozzine di volte il 20/11). Se il job che scarica falliva dopo il download (il 20/11 lo «Smoke test»), la cache non veniva salvata e il deploy dopo riscaricava. Un deploy di solo codice dipendeva quindi da un server di terzi e dall'ora del giorno.

## Decisione
1. **Il deploy non scarica più nulla di norma.** Ripristina dalla cache l'estratto più recente (`actions/cache/restore` con `restore-keys: osm-italy-`: vince la voce creata per ultima) e fa l'import. Nessuna richiesta a Geofabrik.
2. **Un flusso a parte tiene piena la cache:** `.github/workflows/refresh-osm-extract.yml`, ogni giorno alle 09:37 UTC (Geofabrik pubblica verso le 08:53) e a richiesta. Scarica solo se la voce del giorno non c'è e la salva subito dopo il download, non a fine job. Se fallisce, il suo run è rosso e visibile, ma i deploy continuano con l'estratto precedente.
3. **Ultima risorsa:** se la cache non contiene alcun estratto (voce espulsa), il deploy scarica con limiti: 50 minuti sul passo, 75 sul job, `curl` che scarta e riprende (`-C -`) una connessione sotto 300 KB/s per 60 s, fino a 10 tentativi.

## Conseguenze
- I dati dei bar nel sito hanno al massimo l'età dell'ultimo aggiornamento riuscito (normalmente un giorno); un deploy di codice non aggiorna più i bar da sé. Con il refresh fermo, i bar restano quelli dell'ultimo estratto: lo si vede dal run rosso e dalla data in `/api/health` (`data_version`).
- GitHub elimina le voci non usate da 7 giorni e oltre i 10 GB: il refresh quotidiano e i deploy le tengono vive; ogni voce pesa circa 2 GB, quindi restano 3–4 giorni di estratti.
- La cache vale per il ramo `main`: il deploy (`workflow_run`) e il refresh (`schedule`) girano entrambi lì.
- **Non provato dal vero:** al primo deploy dopo il merge il passo «Restore the newest OSM extract» mostra se una voce esiste ancora (l'ultima salvata è del 20/11, dentro i 7 giorni). Se non c'è, scatta la risorsa di riserva del punto 3 e va avviato a mano «Refresh OSM extract».
- Rollback con `git revert`: nessun dato toccato.
