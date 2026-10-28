# 0039 · Download in anticipo con `fetch`, non con `prefetch`

- **Stato:** decisa da Roberto il 28/10/2026 in chat · **Data:** 2026-10-28 · SPEC 1.12 (tag `spec-approved-13`); corregge l'ADR 0037 (il resto dell'ADR 0037 resta valido) e cambia MF-01, MF-02, MF-03

## Contesto
L'ADR 0037 prevedeva `<link rel="prefetch">` per scaricare in anticipo il file di MapLibre, il suo CSS e il suo worker. Provandolo con WebKit (il motore di Safari e di tutti i browser su iPhone) il browser crea i link ma non scarica nulla finché la mappa non serve: su iPhone, il telefono di Roberto, il primo tocco resterebbe lento come prima. Su Chrome e Android funziona.

## Decisione
- Dopo `load` e a telefono libero, nella sola pagina della mappa, un `fetch` a bassa priorità scarica gli stessi tre file (percorsi dal `<meta name="map-chunk">` scritto dalla build). Non si esegue nulla: niente `import()`, niente `modulepreload`, `loadMap()` non viene chiamato.
- Non parte se il telefono ha il risparmio dati attivo (`Save-Data`): evita ai piani a consumo circa 440 KB non richiesti.
- `/assets/*` ha cache lunga `immutable` in `public/_headers` (i nomi hanno l'hash): senza, al tocco il browser fa comunque una richiesta di conferma per file; con la cache lunga non scarica nulla.
- MF-02: con il certificato autofirmato dei test Chrome non salva i file in cache; il test automatico controlla gli indirizzi scaricati, la cache lunga e l'assenza di richieste nuove al tocco. La prova che il tocco non riscarica nulla resta una verifica a mano su telefono con rete lenta.

## Conseguenze
- Stessi costi e rischi dell'ADR 0037 (circa 440 KB per chi non tocca la mappa, misura Lighthouse prima e dopo), meno il costo ai piani a consumo.
- Se su Safari il `fetch` non riempie la cache come previsto, lo dice la prova su WebKit prima del rilascio; in quel caso si torna da Roberto con i numeri.
- Nessun cambio a D1, API, CSP e dati.
