# 0037 · Moderazione dalla prima segnalazione e nomi privati fino all'approvazione

- **Stato:** correzione sorgente autorizzata per la preparazione mobile; distribuzione non eseguita.
- **Data:** 2026-10-26.
- **Responsabile operativo:** Roberto; contatto esistente: `supportemaildovebevo@gmail.com`.

## Decisione implementata

Ogni segnalazione di un prezzo arriva nella coda protetta da Cloudflare Access dalla prima segnalazione. La riga mostra bersaglio (locale, drink e fascia), prezzo e data attuali, stato, motivi, numero e ultima data delle segnalazioni. Le segnalazioni dei locali mostrano anche lo stato corrente. Roberto può mettere in revisione o rimuovere un prezzo attivo segnalato, approvare un prezzo in revisione/quarantena, oppure ignorare le segnalazioni del solo bersaglio scelto. Ignorarle non cambia lo stato del contenuto. Una decisione finale sul prezzo chiude le sue segnalazioni nello stesso batch D1; metterlo in revisione le conserva. I marcatori anti-duplicato restano. Si conserva la convenzione esistente: chiudere una segnalazione significa eliminarla dalla coda, senza introdurre un archivio o una nuova durata di conservazione.

La soglia automatica resta **più di tre** segnalazioni distinte. Non si crea una quarta segnalazione artificiale. Le code mantengono il limite esistente di 200 righe per risposta; risolvendo le prime, si rendono visibili le successive. Il conteggio non è una prova di identità né di colpevolezza.

I nomi e i pin dei locali in attesa non fanno più parte della risposta pubblica della cella. `pend` resta presente come array vuoto per compatibilità. `getCellPrices` legge solo i locali approvati; le risposte legacy già presenti in `cell_snapshot` e nella Cache API vengono ripulite prima di restituirle. La trasformazione non riscrive né azzera `v`: resta la protezione che impedisce a una lettura lenta di ripopolare uno snapshot invalidato. I nuovi client ignorano anche `pend` proveniente da un vecchio server o dalla cache del browser.

La conferma locale della proposta resta nel dispositivo della persona che l'ha appena inviata: `App.sendProposal` costruisce il locale con il nome e il pin appena inseriti e apre l'inserimento del suo prezzo. Gli altri visitatori non scaricano quel nome e quindi non lo vedono nel selettore o nei suggerimenti di duplicati. Il controllo server dei duplicati e il suo `409` con la sola chiave restano invariati: non restituiscono nomi o pin. I prezzi di locali non approvati restano privati.

Questa correzione restringe l'eccezione storica di SPEC M3-13, che permetteva i nomi in attesa nella scelta del locale. I test di quel vecchio comportamento cambiano esplicitamente; la feature list vincolata al tag resta immutata. La promessa già pubblicata in `/regole` («Compare per tutti solo dopo che lo abbiamo controllato») diventa applicata anche al confine API. Nessuna migrazione D1 è necessaria. Non è possibile richiamare copie già scaricate da vecchi client: eventuali cache esterne che rispondono prima del Worker richiedono una verifica di distribuzione separata.

## Prove

- `tests/worker/moderation.test.ts`: invio reale della prima e della terza segnalazione, rimozione/revisione/approvazione/chiusura tramite JWT Access, conservazione dei marcatori e dei bersagli indipendenti.
- `tests/worker/premoderation-cache.test.ts`: vecchio JSON seminato in D1 e nella Cache API; nessun nome non approvato nella risposta; contenuto approvato conservato; scrittore concorrente intercalato nella vera ricostruzione D1, versione avanzata e snapshot non ripopolato.
- `tests/unit/data-premoderation.test.ts`: un vecchio `pend` non entra nei dati usati dal selettore e dai suggerimenti.
- `tests/e2e/admin.spec.ts`: azioni dalla prima segnalazione, evidenza leggibile, controlli da 48 px, assenza di scorrimento orizzontale e axe a 390×844 nei due temi.
- `tests/e2e/propose.spec.ts`: conferma locale, inserimento immediato del prezzo, duplicato locale, proposta assente dalla mappa pubblica.

## Blocco degli abusi: analisi e opzioni, non implementazione

Vincolo esatto di `CLAUDE.md`: **«Nessun ID di sessione o IP salvato con i contributi; solo HMAC con sale del giorno in `counters`/`dedup`.»** Restano vietati identificatori persistenti del dispositivo, tracciamento e invio della posizione GPS. Un sidecar di attribuzione non aggirerebbe questo vincolo: collegherebbe comunque contributi e persona/sessione. Questa fase non aggiunge tale collegamento.

Il codice attuale consente queste sole conclusioni:

- `routes/prices.ts::authorKeys` crea marcatori HMAC per giorno, sessione/IP e singolo prezzo; `routes/venues.ts` crea marcatori analoghi per proposta. `routes/reports.ts` limita i duplicati per bersaglio. Questi valori non permettono di recuperare sessione/IP da una riga segnalata; l'admin non può tradurre «rimuovi questo prezzo» in «blocca chi l'ha scritto».
- `lib/quota.ts::consumeQuota` usa sessione e IP della richiesta in corso, con HMAC giornalieri in `counters`; `clientIp` riduce IPv6 a /64. Le quote attuali sono 30 prezzi, 50 conferme, 5 nuovi locali e 20 segnalazioni. `lib/rate-limit.ts` limita già i picchi. IP condivisi producono possibili falsi positivi e cambiare rete/sessione può aggirare parte delle protezioni.
- `config.ts::KEEP_DAYS`, il cron in `index.ts` e `db.ts::purgeOldKeys` mantengono la pulizia esistente di oggi/ieri. La presenza del cron nel sorgente non dimostra esecuzione o conservazione effettiva nel provider. Il mobile richiama gli stessi handler e quote; un'eventuale protezione deve applicarsi a entrambe le superfici.

**Opzione minima senza attribuzione:** continuare con rimozione del bersaglio, premoderazione e quote esistenti. I prezzi `review`/`removed` non accettano sostituzioni pubbliche e il rifiuto di un locale mantiene il controllo dei duplicati già previsto. È moderazione del contenuto, non un ban della persona.

**Possibile fase successiva, solo dopo scelta esplicita:** aggiungere una sospensione giornaliera per abuso osservabile nella richiesta in corso, memorizzando soltanto contatori HMAC giornalieri di sessione/IP in `counters`. Un evento concreto potrebbe essere la ripetizione di proposte con nomi già rifiutati dal validatore per link o caratteri di controllo. La regola, la soglia e le rotte interessate vanno fissate prima del codice, distinguendo errori di digitazione, retry e incompatibilità dei client. Il controllo del contatore precederebbe le scritture web e mobile; oltre soglia, `429` con scadenza al giorno di Roma e la pulizia esistente. Nessuna riga del contenuto avrebbe una chiave autore. Questo limita richieste della sessione/rete osservata, non consente all'admin di bloccare retroattivamente l'autore di un contenuto e non identifica una persona durevolmente.

**Un pulsante admin che blocchi l'autore richiederebbe un'altra decisione di architettura e privacy.** Il minimo tecnico sarebbe un legame tra l'esatta revisione del contributo e un identificatore di abuso a scadenza; oggi tale legame è vietato, non esiste e non è ricostruibile dai marcatori. Non si propone un nuovo periodo di conservazione o un'identità legale inventata. Prima di autorizzarlo servirebbero vincoli espliciti su ambito, scadenza, revoca, errori su reti condivise, informativa e test di isolamento. Non chiamare nessuna delle opzioni correnti «ban permanente dell'utente».
