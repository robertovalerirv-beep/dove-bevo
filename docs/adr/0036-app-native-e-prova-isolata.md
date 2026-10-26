# ADR 0036 — App iOS/Android e prova mobile isolata

Data: 26 ottobre 2026. Stato: direzione scelta dal proprietario; implementazione della prova in corso, nessuna autorizzazione tecnica alla pubblicazione finale implicita.

## Contesto

La richiesta è sviluppare e pubblicare app iOS e Android per Dove bevo. Il proprietario ha scelto di riusare l'app esistente e ha chiesto esecuzione autonoma con swarm e domande solo necessarie. I due account store sono organizzazioni già iscritte; l'accesso GitHub in scrittura è verificato. La Fase 0 originaria resta web/PWA.

Il backend accetta POST solo same-origin e usa cookie Secure/HttpOnly/SameSite=Strict e Turnstile. Un client locale non può limitarsi a cambiare l'URL delle API. Il trasporto HTTP nativo predefinito Capacitor usa cookie condivisi: un header Cookie vuoto non fornisce isolamento affidabile su Android.

## Decisione

Usare Capacitor con asset Preact inclusi nei binari e adattatori nativi piccoli, senza `server.url` di produzione. Iniziare con identità Preview, namespace mobile chiuso per impostazione predefinita, codici PKCE S256 monouso a 120 secondi e token di sessione in memoria a 30 minuti, separati crittograficamente dai cookie web. Il client pubblico non dimostra autenticità dell'app: hostname, ambiente, nonce, callback e verdetto Turnstile sono vincoli verificati separatamente.

Usare una pagina HTTPS controllata per Turnstile, una callback Preview fissa, e un plugin HTTP isolato (URLSession effimera senza cookie su iOS; client OkHttp dedicato senza cookie/cache/redirect su Android). Nessun bearer su dati pubblici, mappe o eventi. Non indebolire le protezioni del web né duplicare la cache pubblica dei prezzi.

La prova remota richiede Worker/D1/widget separati: il Worker chiamato staging serve già il sito pubblico. Il ramo mobile non si unisce a main prima che migrazioni, distribuzione e compatibilità siano state provate; l'attuale CI applica migrazioni a quel D1 dopo un main verde.

## Conseguenze e prove

Conservare l'interfaccia, le quote, l'anonimato e le regole editoriali esistenti riduce la duplicazione. Servono build Windows/Android e macOS/iOS, misure reali dei bundle, revisione delle dichiarazioni store e prove fisiche. I test simulati non attestano cookie, callback e sospensione sul telefono.

Le nuove dipendenze sono fissate e motivate nel progetto mobile. Le credenziali sono dedicate a Dove bevo e non si conservano nel repository o in cartelle sincronizzate. Le richieste di nuova accessibilità/credenziali restano soggette alla conferma richiesta al momento dell'azione. Le informazioni legali e i test sui dispositivi restano gate espliciti, non fatti inventati.
