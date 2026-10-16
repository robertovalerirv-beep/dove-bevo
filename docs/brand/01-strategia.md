# Strategia: perché cambiare e dove andare

## Verdetto

Il design attuale non ha un problema estetico ma di significato: non dice di chi è e non premia chi contribuisce. Nella SPEC il design system è stato generato da un prompt generico ("mappa prezzi, nightlife, community") e la mappa usa uno stile OpenFreeMap standard. Il risultato è un'app che potrebbe essere di chiunque. Per un prodotto che vive di contributi spontanei, l'anonimato costa dati: nessuno torna a nutrire una mappa che non ricorda.

Verifica sul codice (16/10/2026, repository `dove-bevo`): l'ADR 0011 conferma che il catalogo della skill non aveva la categoria "nightlife" e che il design system viene dalla categoria più vicina, "Food Delivery / On-Demand". I token attuali sono il blu `#1D4ED8` e la scala grigio-blu `#F8FAFC`/`#0F172A`, con il font Plus Jakarta Sans scelto come "Friendly SaaS". Prezzi in verde, ambra e rosso. Sulla mappa, in basso, ci sono quattro bottoni (Aggiungi prezzo, Aggiungi locale mancante, Vicino a me, Elenco) e dopo il salvataggio compare un messaggio scuro "Prezzo salvato" con Annulla. La critica che segue regge su questi fatti.

## Critica, una catena di cause

1. **Anonima.** Palette e tipografia vengono da una categoria di ripiego (consegna a domicilio) e da un font "Friendly SaaS": il linguaggio di migliaia di app di servizi. Nessun oggetto del bar italiano compare nell'interfaccia. Quindi niente si ricorda dopo la prima visita.
2. **Statica.** Inserire un prezzo finisce con un messaggio di testo e un Annulla di 10 secondi. GasBuddy viene criticata esattamente per questo: segnalare un prezzo dà un riscontro debole. Senza ricompensa visibile il contributo sembra lavoro gratuito, e la mappa resta vuota: il rischio principale scritto nel brief.
3. **Noiosa.** La mappa è il prodotto, ma con uno stile di base i prezzi competono con strade, negozi ed etichette. Il numero non è l'eroe dello schermo.
4. **Ambigua sui dati.** Il colore rispetto alla mediana è la scorciatoia giusta (la stessa che rende utile GasBuddy), ma i gradini non hanno un nome. "Più economico, nella media, più caro" è una legenda, non un linguaggio. "Affare, giusto, salato" si dice al bancone.

## Cosa fanno gli aggregatori (ricerca del 16/10/2026)

| Servizio | Cosa funziona | Cosa prendiamo |
|---|---|---|
| GasBuddy | Prezzo direttamente sul pin, colore relativo ai vicini come scorciatoia cognitiva | Il prezzo è il pin. Evitiamo il suo difetto: riscontro debole dopo la segnalazione e troppi elementi sulla mappa |
| Yuka | Un numero, una scala di colore, un'azione centrale | Una sola azione primaria; dettaglio progressivo |
| Beli | Avanzamento esplicito ("sei stato in 0 di 15") che dà riscontro | Contatore di copertura della zona: "42 bar su 180 hanno un prezzo" |
| Untappd | Feed "vicino a te" che riempie lo stato vuoto; badge legati a gesti ripetuti | Ricompensa locale (Tessera) senza account e senza dati sul server |
| What's the Beer, Cheep, Tap Map, PintPath (tutte del 2026) | Mappa dei prezzi della birra con verde e rosso, conferma con un tocco | Il gesto "Confermo". E la differenza: sono tutte in inglese, centrate sulla pinta, con tema quasi nero (#0D0D0D nelle schede degli store). Nessuna è italiana, nessuna parla di aperitivo |

## Posizionamento

Per chi esce a bere in Italia e vuole sapere quanto spenderà prima di sedersi, Dove bevo è la mappa dei prezzi veri, scritta da chi ordina, gratuita e senza account. A differenza delle app straniere sulla pinta, parla di spritz, calici e analcolici, in italiano, e mette il prezzo al centro come lo farebbe uno scontrino.

## Personalità

L'amico che sa sempre quanto costa uno spritz in ogni quartiere. Pratico, ironico, onesto sui numeri. Non è un locale notturno, non è una banca, non è un influencer.

## Perché crema e arancio e non nero e neon

Le app concorrenti hanno scelto il nero della notte. L'aperitivo italiano succede invece tra le 18 e le 21, al tramonto e spesso all'aperto. Il tema chiaro **Bancone** è quindi il principale e il tema scuro **Fuori orario** è un tema progettato, non un'inversione. Lo spritz è il colore che chiunque in Italia associa all'aperitivo; lo usiamo come unico colore di marca, mai per indicare un prezzo alto.

## Vincolo legale sul tono

La legge 125/2001, articolo 13, vieta tra l'altro la pubblicità di bevande alcoliche che presenti positivamente il consumo e quella nei luoghi frequentati soprattutto da minori. L'app mostra prezzi, non promuove marchi, ma la sua comunicazione sui social e con i creator è vicina alla pubblicità. Da qui le regole di voce: si parla di prezzi e di posti, mai di bere tanto; l'analcolico è un drink di prima classe; il servizio resta dichiarato per maggiorenni. Da verificare con un legale prima delle campagne.

## Fonti

- [Design critique GasBuddy, Pratt IxD, 2024](https://ixd.prattsi.org/2024/09/design-critique-gasbuddy-ios-app/)
- [Design critique Beli, Pratt IxD, 2026](https://ixd.prattsi.org/2026/09/a-design-critique-of-beli-restaurant-discovery-and-social-platform/)
- [Lezioni di community da Untappd, Braze, 2016](https://www.braze.com/resources/articles/engage-millions-users-mobile-community-building-lessons-untappd)
- [Yuka, Fueled](https://fueled.com/blog/yuka-empowers-smart-shoppers/)
- [What's the Beer, scheda MWM](https://mwm.ai/apps/whats-the-beer/6762054878) · [Cheep, scheda MWM](https://mwm.ai/apps/cheep/6788138825) · [Tap Map, App Store](https://apps.apple.com/mx/app/tap-map-app/id6745830369) · [PintPath, App Store](https://apps.apple.com/us/app/pintpath/id6770141295)
- [Tendenze app 2026, Moburst](https://www.moburst.com/blog/top-mobile-web-design-trends/)
- [OpenFreeMap, stili personalizzati](https://openfreemap.org/quick_start/)
- [Bricolage Grotesque, repository](https://github.com/ateliertriay/bricolage) · [Geist Mono, licenza](https://miktex.org/packages/geist-font)
- [Legge 125/2001, testo](https://www.certifico.com/news/news-generali/legge-30-marzo-2001-n-125)
