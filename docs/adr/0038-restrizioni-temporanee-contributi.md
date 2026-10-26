# 0038 · Restrizioni temporanee per gruppo contenuto/giorno

- **Stato:** implementazione sorgente autorizzata; nessuna migrazione remota o distribuzione eseguita.
- **Data:** 2026-10-26.
- **Responsabile operativo:** Roberto Valeri; assistenza esistente: `dovebevo@gmail.com`.
- **Seguito:** ADR 0037, senza modificare la feature list vincolata al tag.

## Decisione e vincolo

Vincolo esatto di `CLAUDE.md`: **«Nessun ID di sessione o IP salvato con i contributi; solo HMAC con sale del giorno in `counters`/`dedup`.»** Nessun account consumatore, ID persistente del dispositivo, fingerprint, invio GPS o sidecar di attribuzione viene introdotto.

I marcatori esistenti non sono invertibili per recuperare l'autore. È però possibile ricalcolare un candidato a partire dalla sessione e dalla rete della richiesta in corso e verificare la presenza del risultato in `dedup`. Si riutilizza così per la moderazione la funzione di sicurezza dei marcatori giornalieri, già usati contro auto-conferme e duplicati. È una restrizione di un **gruppo contenuto/giorno e delle reti coinvolte**, non l'identificazione dell'autore originale o un ban durevole della persona.

La nuova migrazione append-only `0010_contribution_restrictions.sql` conserva esattamente quattro campi: `family`, `target`, `day`, `expires_at`. `target` è un riferimento al contenuto (`venue|drink|hh` per prezzi, chiave `u…` per proposte), non a una persona. Non vengono copiati HMAC, sessioni o IP, né conservati risultati dei confronti, cronologie dei candidati o attribuzioni. Per una proposta non approvata il riferimento è la chiave già restituita al proponente, mai il nome o il pin nella risposta pubblica.

## Corrispondenze ammesse e limiti

Le sole famiglie confrontate sono quelle già prodotte dagli handler:

- `routes/prices.ts`: `[day, 'author', 'sid', candidateSid, 'venue|drink|hh']` e `[day, 'author', 'ip', candidateIp, 'venue|drink|hh']`.
- `routes/venues.ts`: `[day, 'propose-sid', candidateSid, venueKey]` e `[day, 'propose-ip', candidateIp, venueKey]`.

L'IP è normalizzato con l'esistente `clientIp` (IPv6 ridotto a /64). Non vengono confrontati marcatori `confirm`, `report` o contatori di quota. Un prezzo scritto più volte nello stesso giorno può avere più partecipanti: tutti appartengono al gruppo. Le proposte includono il primo proponente, i duplicati e anche il tentativo che ha registrato il solo marcatore IP prima di scoprire un duplicato di sessione. Non viene presentato come gruppo di soli autori accertati.

Cambiare solo sessione o solo rete può ancora corrispondere; cambiare entrambe può evitare il limite. Una rete condivisa può coinvolgere persone estranee. Sessioni web e native distinte non si collegano tra loro: può corrispondere la rete condivisa. Un IP assente usa il comportamento preesistente `unknown`, quindi ha granularità ancora più grossolana. Cancellazione dei marcatori, rotazione della chiave HMAC o fine della loro conservazione eliminano la corrispondenza; il controllo non ricrea né prolunga i marcatori.

## Giorni, scadenza e costo finito

L'admin seleziona esplicitamente uno dei due giorni forniti dal server: oggi o ieri, calendario `Europe/Rome`. Non si deduce il giorno da `observed_on` (rinnovabile dalle conferme), dalla data delle segnalazioni o da `venues_user.day` (modificabile). Se non vi sono marcatori del giorno selezionato, il limite non corrisponde a nessuno. Per coprire entrambi i giorni occorrono due riferimenti distinti.

Il server calcola la scadenza alla mezzanotte di Roma di `day + 2`; il client non può scegliere una durata. Un riferimento di ieri termina alla prossima mezzanotte, uno di oggi alla successiva. I cambi d'ora sono trattati come giorni di calendario; non si promette una durata fissa di 48 ore. La lettura filtra subito `expires_at > now` e il controllo ammette solo oggi/ieri: la scadenza funziona anche senza cron. Il cron esistente rimuove le righe scadute, senza modificare la conservazione di `dedup`. Un nuovo invio autentico potrà creare i propri marcatori secondo le regole preesistenti; nessun vecchio marcatore viene rinnovato dal limite.

Il massimo è **16 riferimenti attivi**, verificato da un unico `INSERT … SELECT` atomico. Oltre capacità la creazione risponde `503 busy`; non si ignora una parte dei riferimenti con `LIMIT`. La stessa selezione è idempotente e non aggiorna la scadenza. Revocare libera un posto. Se un'invariante violata fuori dall'API produce più di 16 riferimenti attivi, le contribuzioni ricevono `503` prima del lavoro HMAC. Per richiesta ammessa: una lettura dei riferimenti, al massimo 32 HMAC candidati e un'unica interrogazione di appartenenza con indice sulla chiave primaria `dedup.k`; senza riferimenti non si esegue quella interrogazione. Nessuna cache di decisioni ritarda una revoca.

Misura locale indicativa con Node 24.19.0: 200 richieste dopo 20 di riscaldamento, 16 riferimenti misti, 32 HMAC, nessuna corrispondenza, D1 simulato senza latenza: mediana **0,154 ms**, p95 **0,216 ms**, massimo **0,274 ms**. Non è una garanzia di CPU Cloudflare, rete o latenza D1. Il test automatico verifica il limite di 32 firme e una sola query; una prova su D1 locale verifica l'uso dell'indice.

## API, interfaccia e ordine dei controlli

Le API admin sono protette dall'esistente JWT Cloudflare Access e dai confini Origin/burst:

- `GET /api/admin/restrictions`: giorni selezionabili, riferimenti attivi e capacità; `Cache-Control: no-store`.
- `POST /api/admin/restrictions`: `{family:'price',venue,drink,hh,day}` oppure `{family:'proposal',venue,day}`. Oggetti stretti; contenuto esistente; oggi/ieri soltanto. Nessun parametro di scadenza o attore ammesso.
- `POST /api/admin/restrictions/revoke`: lo stesso riferimento esplicito. La revoca è idempotente.

La gestione mostra il contenuto delle code, la scelta obbligatoria del giorno, il rischio per reti condivise e duplicati, capacità, scadenza e revoca. Selezionare il riferimento prima di risolvere la coda che lo contiene: le decisioni definitive possono far sparire il contenuto dalle scelte, mentre i limiti già creati restano elencati e revocabili. Un locale OSM segnalato senza un prezzo selezionabile non ha una famiglia di marcatori di proposta: non si inventa un autore da bloccare.

Il controllo viene eseguito nei tre handler condivisi di prezzi, conferme e proposte, **dopo autenticazione e limite di picco, prima di parsing/scritture/quote giornaliere**. Riguarda sia `/api/*` web sia `/api/mobile/*` nativo. Letture, segnalazioni e assistenza rimangono disponibili. Una corrispondenza restituisce `429` con codice distinto `contribution_restricted`. Non aggiunge contatori o marcatori, non scatena riautenticazione e non viene interpretata dal client come quota giornaliera esaurita. Prezzo e proposta restano riprovabili; una conferma fallita non viene memorizzata come riuscita. Il testo locale spiega sessione/rete e assistenza senza ripetere messaggi arbitrari del server.

## Prove e confini di rilascio

- Test Worker con scritture reali web e native: stesso autore su contenuto diverso, più scrittori, sessione/rete cambiata, IPv6 normalizzato, altri partecipanti ammessi, segnalazioni ancora possibili, conferme/proposte bloccate, revoca immediata.
- Confermatori e segnalatori senza marcatori autore esclusi; duplicati di proposta e caso solo-IP espliciti; marcatori cancellati non ricreati.
- Scadenza prima del cron anche nei cambi d'ora, rifiuto di giorni malformati/futuri/vecchi e scadenze arbitrarie, concorrenza sul limite 16, sole colonne ammesse, autenticazione e picco prima del lavoro D1.
- Test browser Chromium/WebKit a 390×844: scelta esplicita, avviso, scadenza, revoca, entrambe le famiglie, temi chiaro/scuro, axe senza esclusioni e controlli da 48 px. Messaggi corretti per prezzo, conferma e proposta, senza loop automatico.
- Il rilascio deve applicare la nuova migrazione prima del Worker: senza tabella i nuovi handler non possono funzionare. Nessuna migrazione o distribuzione remota è stata fatta da questa fase. Nessuna affermazione di accettazione da parte degli store, ban permanente o attribuzione di identità.
