# 0019 · Bar proposti dagli utenti: li rende pubblici solo l'admin

- **Stato:** accettata — decisione di Roberto del 13/10/2026 (prompt v3.2) · **Data:** 2026-10-14 · modifica SPEC 7.5, D-05, M4-01, M4-02

## Contesto
La SPEC 1.0 faceva diventare pubblico un bar proposto dopo 2 conferme da sessioni diverse (e un prezzo valeva come conferma) oppure con l'approvazione dell'admin. Senza account, conferme e prezzi sono facili da simulare: un bar inesistente o pubblicitario avrebbe potuto comparire sulla mappa senza che nessuno lo controllasse.

## Decisione
- **Solo l'approvazione dell'admin rende pubblico un bar.** Nessuna approvazione automatica, mai: né conferme, né prezzi inseriti.
- Flusso utente, dentro «Aggiungi prezzo» → passo «Bar»: «Non trovi il bar?» → nome → tipo (Bar, Pub, Locale serale) → pin sulla mappa → «Conferma e invia». Il pin è la posizione **del bar** (il centro della mappa che l'utente ha spostato e confermato, arrotondato a 5 decimali), mai la posizione del dispositivo, e la mappa deve essere a zoom ≥ 16.
- Duplicati: sul dispositivo, fino a 3 bar noti entro 150 m con nome simile («È uno di questi?»); sul server, stesso nome normalizzato (senza accenti, maiuscole e punteggiatura) entro 50 m da un bar OSM, proposto o approvato → `409` con la chiave esistente e il client passa a quel bar. Un rifiuto recente (30 giorni) blocca lo stesso nome nello stesso punto (`409` senza chiave).
- Validazione (una sola funzione, `validVenueName` in `src/shared/venue.ts`, usata anche dall'admin): 2–80 caratteri, NFC, niente caratteri di controllo, URL, email o numeri di telefono; tipo da elenco chiuso (OSM 1, 2, 4); coordinate in Italia. Il nome si mostra sempre come testo.
- Anti-abuso: 5 bar nuovi al giorno per sessione e per IP (la quota si spende solo con una proposta nuova, non trovando un bar già presente); tetto di 200 proposte in attesa, oltre il quale la risposta è `503 busy` («Troppe richieste in verifica, riprova più tardi»). Nessun identificativo di sessione salvato con la proposta.
- Dati: `venues_user` (stato `pending` / `approved` / `removed`, come da SPEC), chiave pubblica `u<id>`; la migrazione `0004` aggiunge `day` (giorno della proposta o del rifiuto) e l'indice `vu_status`. `confirmations` non è più una conferma: conta le persone indipendenti che hanno proposto lo stesso bar e **serve solo a ordinare la coda**; non approva niente.
- I prezzi di un bar `pending` si salvano ma non sono pubblici: `GET /api/prices/:cell` li esclude finché il bar non è approvato.
- Il pulsante «Esiste, confermo» è tolto: senza effetto sull'approvazione servirebbe solo a ordinare la coda, e lo fa già un secondo invio dello stesso bar (`409` che incrementa il contatore, una volta per sessione e per IP).
- Rischio documentato in `SECURITY.md` e `docs/data-quality.md`: quando OSM aggiungerà un bar già approvato compariranno due bar; si risolve a mano da `/admin`.

## Pannello `/admin` a tre code
Un solo componente `Queue`, con contatori e un totale in alto: **nuovi bar da confermare** (nome e tipo modificabili, posizione su mappa, bar noti vicini, prezzi in attesa, «Cerca su Google Maps» solo come link in uscita; azioni Approva e Rifiuta), **bar da cancellare da confermare** (le segnalazioni a livello di bar, già presenti: «Elimina dalla mappa» o «Ignora»), **prezzi da rivedere**. Sotto, gli strumenti invariati.

## Conseguenze
M4-01 e M4-02 della feature list vanno sostituite da test della nuova regola (richiede il nuovo tag `spec-approved-2`). I test: `tests/worker/venue-proposals.test.ts`, `tests/e2e/propose.spec.ts`, `tests/e2e/admin.spec.ts`.
