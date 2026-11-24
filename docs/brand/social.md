# Social: stile e account

Riferimento per post, reel e storie. Vale insieme a `02-voce.md` (regole di voce e parole vietate D-31); in caso di dubbio prevalgono quelle, tranne dove questo file dichiara una deroga (solo emoji 18+, sotto). Grafica solo dal kit del brand (`tokens.json`, `fonts/`, `components/`, `assets/`). I file dei contenuti (immagini, video) non stanno nel repository.

Ultimo allineamento: 24/11/2026 (carosello per quartiere di Milano e carosello di Roma, 11° contenuto); prima il 20/11/2026 (reel di Bevino a Roma e note sui prompt di Veo 3.1); prima ancora il 09/11/2026, con le decisioni di Roberto in chat (i reel hanno audio: voce e musica; dal 4° contenuto i reel hanno un protagonista, Bevino, che compare anche nei caroselli; dal 6° contenuto Bevino ha un amico, Franco; dal 7° i caroselli mostrano i dati di copertura per città).

## Account

- **Instagram:** @dovebevo · nome «Dove Bevo» · immagine: simbolo crema su fondo `spritz`.
- **Bio attuale** (rilevata dal profilo il 10/11/2026, schermata di Roberto; la data del cambio non è nota):

  ```
  Stessa storia, stessa piazza, stesso drink: 5€ da una parte e 11€ dall'altra.
  Dove si spende meno?
  Bevi responsabilmente 🔞
  ```

- **Link in bio:** `www.dovebevo.com`. «Coming soon» non c'è più, né in bio né come linea dei contenuti. Se bio o link cambiano, questo file va aggiornato nello stesso giorno.

## Come scriviamo

Lo stile è quello della caption del reel 01, scritta da Roberto il 24/10/2026.

- **Si apre con una scena vissuta**, in seconda persona: la cassa, il conto, lo scontrino.
- **Riferimenti locali**: Navigli, quartieri, abitudini milanesi e italiane.
- **Iperbole e ironia**, sempre sul prezzo o sul posto.
- **Complicità**: «Capita a tutti».
- **Lessico da chat**: «top secret», «spoiler», «seguici», «coming soon».
- Frasi brevi, un'idea per riga, chiusura con un invito diretto.
- **Fase attuale (dal 09/11/2026):** copertura per città, in percentuale, e invito a segnare un prezzo o a proporre un bar che manca (carosello «Quanto costa davvero il tuo drink?»). Il contrasto di prezzo tra due locali resta valido quando i due prezzi sono reali e controllati il giorno stesso.
- **Fase precedente (dal 26/10/2026):** contrasto di prezzo reale, «stessa birra, due prezzi» (carosello «Stessa birra.»: 3,50 € contro 9,00 €, «Più del doppio. Cambia solo dove paghi.»), con «Coming soon» finché non si decide il link. La suspense dei primi due contenuti (la mappa, chi ha appena pagato) non è più la linea principale.

Esempio, la caption del reel 01 con la prima riga corretta:

```
Quante volte alla cassa hai scoperto che lo spritz costava quanto un affitto sui Navigli?
Capita a tutti.

Stiamo lavorando a un progetto che potrebbe salvarti da queste spiacevoli sorprese.

Cos'è di preciso? Per ora è top secret. Diciamo solo che c'entra una mappa. E qualcuno che il conto l'ha appena pagato.

Spoiler, manca poco. Seguici.

Per maggiorenni.
#dovebevo #aperitivo #prezzi #bar
```

## Limiti fissi

- **L'esagerazione cade sul conto, mai su quanto si beve** (L. 125/2001, art. 13). Sì: «lo spritz costava quanto un affitto sui Navigli». No: «ti sei bevuto anche il naviglio».
- **Prezzi: solo reali, presi dai dati inseriti dagli utenti** (decisione di Roberto, 27/10/2026). Niente prezzi illustrativi, stimati o inventati, nemmeno «per esempio». Ogni cifra di una grafica o di una caption si controlla sulla mappa il giorno in cui si pubblica; se non si può controllare, non si pubblica. Il segnaposto `?,??` resta solo per i contenuti che parlano di dati non ancora disponibili.
- **Niente emoji, con una deroga:** l'emoji 18+ (🔞) come segnale per maggiorenni, in bio e nelle caption, come oggi. È una deroga a `02-voce.md` valida solo sui social; l'interfaccia dell'app resta senza emoji.
- «Per maggiorenni» in fondo a ogni caption e nell'ultima schermata dei video.
- Hashtag: `#dovebevo #aperitivo #prezzi #bar`.
- Prima delle campagne con creator, verifica di un legale (`01-strategia.md`).

## Cadenza

- **Almeno 3 contenuti a settimana nel feed** (due reel e un carosello). Roberto vuole farne di più: non c'è un tetto, si sale quando i contenuti si riescono a produrre con la stessa cura (decisione del 27/10/2026).
- Le storie si fanno quando hanno uno scopo preciso: finora 31 e 43 visualizzazioni, quasi nessuna interazione.

## Formati

- **Post:** carosello 4:5 (1080×1350), 4 slide: domanda → problema → promessa coperta → attesa. Testo alternativo per ogni slide.
- **Caroselli con i dati** (dal 09/11/2026), 4 slide in quest'ordine: 1 introduzione → 2 classifica → 3 obiettivo e perché → 4 richiesta (segnare un prezzo o proporre un bar, a scelta di chi legge).
  - **Sfondi** che alternano arancione `spritz` e crema, mai il nero come sfondo; logo orizzontale in alto a destra su ogni slide; font e colori solo dal kit (`tokens.json`).
  - **Poco testo**, soprattutto nelle ultime due slide: chi scorre non legge. Un'idea per slide.
  - **Percentuali, non totali.** Il 150 di Milano è un traguardo, non il numero dei bar della città: si mostra come avanzamento (31 % del traguardo) e le città si confrontano per quota di bar con almeno un prezzo, mai per numero assoluto. Barre dritte, tutte della stessa lunghezza e allineate a sinistra.
  - **Testi generici sui drink:** l'apertura parla di «drink», mai di un solo drink (spritz, birra), perché non passi l'idea che l'app serva per uno solo.
  - **Frasi nostre e naturali**, senza slogan già usati e senza il tono da assistente automatico.
  - **Numeri dal pannello `/admin`** premendo «Aggiorna» il giorno della pubblicazione (limite sui prezzi reali). Segnaposto `?,??` solo dove il dato non esiste.
- **Caroselli per quartiere** (dal 24/11/2026, modello: il post su Milano, 12 slide; Roma, 9 slide). Si usano quando la città ha abbastanza quartieri con prezzi da fare una classifica.
  - **Ordine:** 1 gancio («Quanto costa un drink a [città]?», sfondo `spritz`, mosaico di tutti i quartieri in crema con i primi in nero, adesivo con la domanda: «Due zone sono già oltre il 70%. Quali?» a Milano, «Roma è appena partita. Chi è in testa?» a Roma) → 2 «Dove i prezzi ci sono già» (sfondo crema; mappa con le vie visibili sotto, zone colorate **semitrasparenti** a gradini del 5 %, primi quartieri numerati, quartieri sotto i 10 bar in tinta grigia, legenda a gradiente in alto a sinistra) → 3 «La classifica» (numero, miniatura della città con il quartiere evidenziato, barra su scala 0–100 e percentuale) → una slide per quartiere, dal più alto al più basso, con fondi alternati `spritz`/crema → ultima «Fai salire la tua zona.» con «Segna un prezzo», «Aggiungi un bar», l'Italia a puntini e «Per maggiorenni».
  - **Slide di quartiere:** nome e percentuale sulla stessa riga, **stessa grandezza in tutte le slide** (a Roma: nome 92 px a sinistra, percentuale 170 px a destra), mappa con il confine nero e un pallino per bar: arancio con un prezzo, bianco senza. Legenda «con un prezzo · senza prezzo» e «Scorri →».
  - **Regole:** solo quartieri con almeno 10 bar in classifica (sotto, tinta grigia); percentuali e mai totali; barre su scala 0–100, non riscalate sul primo; i confini possono essere approssimati (mosaico di zone ricavato dal centro dei bar di ogni quartiere) purché si capisca la zona e si vedano le vie sotto; quando il confine è solo il contorno dei bar della zona, dirlo nel testo alternativo; con pochi bar per quartiere la percentuale cambia molto a ogni prezzo inserito: ricontrollare il giorno della pubblicazione.
  - **Come si produce:** grafiche 1080×1350 dal kit (font e colori da `tokens.json`, logo orizzontale), mappe dallo stile Bancone del sito (OpenFreeMap) con quartieri da OpenStreetMap; un testo alternativo per ogni slide. Dati: elenco dei bar per quartiere dagli indirizzi di OpenStreetMap (Nominatim, una richiesta al secondo), prezzi dalle celle pubbliche del sito; numeri ufficiali da `/admin` con «Aggiorna».
- **Reel:** 1080×1920, circa 15 s, con audio: voce e musica insieme (decisione di Roberto, 31/10/2026). La musica si sceglie dalla libreria di Instagram; la voce, propria o sintetica, è da decidere. Testi nella fascia centrale, tra y 260 e y 1480, lontani dal bordo destro. Copertina dalla scena più curiosa.

## Bevino (reel e caroselli con protagonista)

- **Chi è:** Bevino, un tappo a corona vivo che ricalca il simbolo: disco arancio `spritz` lucido, bordo zigrinato a 21 denti con contorno scuro, due occhi grandi e scuri, sorriso piccolo, braccia e gambe nere sottili. Personaggio originale, alto 25 cm nella scena.
- **Come si produce (artigianale):** clip generate con Sora (opengen), 9:16, in inglese per il prompt e in italiano per le battute; le clip si uniscono su Clipchamp (già su Windows 11). Il blocco di descrizione di Bevino si ripete identico in ogni prompt.
- **Continuità tra clip:** stessa location descritta con le stesse parole, stato finale di una clip = stato iniziale della successiva, ultimo fotogramma come immagine di partenza quando si può. Niente testo leggibile nel video: schermate, messaggi e «Per maggiorenni» si sovrappongono nel montaggio.
- **Franco** (dal 6° contenuto): amico di Bevino, un tappo arancio trentenne che conosce la città e gli fa da guida. Stesso disegno di Bevino, ma un po' più grande (30 cm), con sopracciglia scure sottili, mezzo sorriso sicuro e una sciarpa `salato` sottile. Nei caroselli ha la sciarpa e non ha mai naso, barba o rughe.
- **Prompt per i video, cosa abbiamo imparato (05/11/2026):**
  - **Un solo personaggio per inquadratura.** Con Bevino e Franco insieme il modello mescola i tratti: Franco invecchia (naso, rughe, barba, pizzetto), Bevino si mette il tappo in testa. Si stacca tra i due, con gli sguardi incrociati (Franco guarda a sinistra, Bevino a destra) e un'ultima inquadratura da dietro, piccoli e lontani, per il momento in cui sono insieme.
  - **Il corpo È il tappo.** Nel prompt: «niente sopra la testa: niente cappello, niente tappo in testa, niente capelli»; volto liscio con «niente naso, niente barba, niente rughe».
  - **Impostazioni opengen:** proporzioni 9:16 (il campo vince sul testo del prompt, nelle prime prove era 16:9) e miglioramento automatico del prompt spento, altrimenti riscrive i divieti.
  - **Niente scritte nel video:** il modello inventa insegne e iscrizioni (sull'arco di Porta Romana era comparso «ARCO PORTA ROMANA»). Il prompt le vieta; la schermata vera del sito si sovrappone nel montaggio.
  - **Durata:** 8 s per clip con Veo 3.1 Lite, circa 15–20 parole di battute. L'inglese rende meglio per le descrizioni; l'italiano va bene per le battute.
  - **Battuta lunga, scena vuota (20/11/2026):** con molte parole e molte azioni (tram, risata, occhiolino, musica) la voce non si capiva. Funziona meglio così: personaggio fermo, strada vuota e sfocata, telecamera ferma, solo la voce senza musica né rumori («fast, clear, lips clearly moving, no pauses»). La musica si aggiunge nel montaggio. Il sito si scrive «dovebevo punto com» perché la voce lo legga bene. Clip da 4 s: 8–10 parole.
- **Nei caroselli** (dal 03/11/2026) compare in grafica ferma, con contorno crema da adesivo perché resti leggibile sul fondo `spritz`; personaggio disegnato a mano in SVG dalla stessa descrizione, non ancora nel kit del brand.
- Valgono tutti i limiti fissi: prezzi solo reali e controllati il giorno, nessuna enfasi sul bere molto.

## Pubblicati

Dati di Instagram al 27/10/2026, ore 13:19 (35 follower, 1.001 visualizzazioni in totale, 117 visite al profilo, 0 tocchi sul link). I numeri si aggiornano nel tempo: la colonna serve come punto di partenza.

| Data | Formato | Contenuto | Visual. · Like · Invii |
|---|---|---|---|
| 24/10/2026 | Post | «Quanto l'hai pagato?»: scontrino a `?,??`, mappa coperta, «Ci siamo quasi.» | 320 · 10 · 1 |
| 24/10/2026 | Reel | «Coming soon»: le stesse quattro scene animate, prezzi che girano e si fermano su `?,??` | 442 · 12 · 6 |
| 26/10/2026 | Post | «Stessa birra.»: 3,50 € contro 9,00 €, «Più del doppio. Cambia solo dove paghi.» (caption: «Alla cassa: «sono 9€»…») | 243 (dopo 16 h) · 8 · 4 |
| 25–26/10/2026 | Storie | Due storie: il simbolo «coming soon» e il telefono con la tastiera | 31 e 43 · 1 e 0 · 0 |
| 02/11/2026 | Reel | Bevino, appena arrivato a Milano, chiama Franco, scopre dovebevo.com ed esce verso Piazza del Duomo: «Trova dove andare a bere vicino a te con dovebevo.com». Fatto con Sora (opengen) | da rilevare |
| 03/11/2026 | Post | «Ma chi li scrive i prezzi sulla mappa?»: carosello a dialogo con Bevino, come si segna un prezzo e come si aggiunge un bar mancante, «Prezzi inventati: nessuno»; messaggio: chiunque può inserire, basta che sia reale (caption: «Alla cassa ti dicono la cifra e tu annuisci…», con invito a taggare il locale mancante) | da rilevare |
| 05/11/2026 | Reel | Bevino e Franco passeggiano a Porta Romana verso le 18: Franco, che ha fatto da guida tutto il pomeriggio, propone una birra e dice a Bevino di aprire dovebevo.com; Bevino trova un locale vicino, raggiungibile a piedi in pochi minuti con «Indicazioni». Fatto con opengen | da rilevare |
| 09/11/2026 | Post | «Quanto costa davvero il tuo drink?»: carosello a quattro slide, introduzione con Affare · Giusto · Salato e lo scontrino `?,??`; classifica della copertura per città (Sestri Levante 22 %, Legnano 14 %, Milano 7 %, Torino 3 %, Roma 1 %); obiettivo di Milano al 31 % (47 bar su 150, griglia); richiesta «Hai pagato? Segnalo.» con «Segna un prezzo» e «Aggiungi un bar». Dati `/admin` del 09/11: 138 bar con un prezzo, 39 città, 381 prezzi | da rilevare |
| 20/11/2026 (previsto 17:30–18) | Reel | 10° contenuto. Bevino arriva a Roma Termini alle 17 per lavoro, l'indomani ha una riunione importante e non conosce un posto: chiama Franco, che è di Milano e di Roma non sa niente, e gli dice di aprire dovebevo.com, che mostra tutti i locali vicini anche in una città che non conosci, «tanto paga il capo». Tre clip con Veo 3.1 (8 + 8 + 4 s), un personaggio per clip. Caption: «Sei a Roma per lavoro. Sono le 17…», invito a mandarlo «al collega che parte lunedì» | da rilevare |
| data da confermare (dopo il 09/11/2026) | Post | 8° o 9° contenuto, carosello per quartiere di Milano, 12 slide: «Quanto costa un drink a Milano?» (gancio «Due zone sono già oltre il 70%. Quali?»), «Dove i prezzi ci sono già», «La classifica» e una slide per quartiere: Porta Romana 75 %, Guastalla 73 %, Porta Vigentina 57 %, Porta Nuova 21 %, Porta Venezia 16 %, Corsica 15 %, Duomo 15 %, NoLo 12 %; ultima «Fai salire la tua zona.» con «Oltre 25.000 locali in tutta Italia» e «Si parte da Milano». Caption: «Dovebevo.com raccoglie tutti i locali d'Italia ma siamo partiti da Milano. La tua città ha i tuoi posti del cuore con il prezzo inserito? Clicca il link in bio. Bevi responsabilmente 🔞», hashtag `#alcohol #milano #dovebevo #spritz` (diversi dai quattro fissi di «Limiti fissi») | 15,1 mila · 48 · 4 (con 3 repost), da screenshot di Roberto del 24/11/2026 |
| 24/11/2026 (da pubblicare) | Post | 11° contenuto, carosello per quartiere di Roma, 9 slide sul modello di Milano: gancio «Quanto costa un drink a Roma?» con adesivo «Roma è appena partita. Chi è in testa?», «Dove i prezzi ci sono già», «La classifica», poi Prati 36 % (5 bar su 14), Trastevere 24 % (5 su 21), Campo Marzio 17 % (2 su 12), Monteverde 13 % (2 su 15), Garbatella 7 % (2 su 28), e «Fai salire la tua zona.» con i quartieri ancora a zero (Pigneto, Monti, Nomentano, San Lorenzo, Prenestino-Centocelle). Roma nel suo insieme: 33 bar con un prezzo su 665 (5 %, era 1 % il 09/11). Dati dal sito pubblico del 24/11, **da ricontrollare su `/admin` il giorno della pubblicazione**; per Monteverde e Garbatella il confine è il contorno dei bar della zona. Caption proposta: «Dopo Milano, tocca a Roma. Dovebevo.com raccoglie tutti i locali d'Italia. Il tuo quartiere è già in classifica? Segna quanto hai pagato nel bar sotto casa tua. Clicca il link in bio.», «Per maggiorenni · Bevi responsabilmente 🔞», `#dovebevo #aperitivo #prezzi #bar` | da rilevare |

Dati di Instagram al 10/11/2026 (export «Insight sull'account» 10/10–09/11 e profilo): 152 follower, 44 seguiti, 7 post, 15.730 visualizzazioni in 30 giorni, 9.508 account raggiunti, 1.924 visualizzazioni dei reel (4 reel nell'export, due sponsorizzati), 162 like, 4 commenti, 13 repost, 75 condivisioni, 22 salvataggi. Follower: 75,7 % uomini, 39,2 % tra 25 e 34 anni, 31,2 % tra 35 e 44, Milano 40,9 %. Tocchi sul link e dati per singolo contenuto: da rilevare.

Ordine dei contenuti nel feed al 09/11/2026: 1° carosello (24/10), 2° reel (24/10), 3° carosello (26/10), 4° reel con Bevino (02/11), 5° carosello «Ma chi li scrive» (03/11), 6° reel con Bevino e Franco a Porta Romana (05/11), 7° carosello «Quanto costa davvero il tuo drink?» (09/11). Dal 24/11/2026: uno tra l'8° e il 9° è il carosello per quartiere di Milano (l'altro non è ancora registrato qui, né la data esatta), il 10° è il reel di Bevino a Roma (20/11), l'11° è il carosello per quartiere di Roma. Le storie non contano.
