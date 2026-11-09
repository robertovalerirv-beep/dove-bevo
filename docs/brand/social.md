# Social: stile e account

Riferimento per post, reel e storie. Vale insieme a `02-voce.md` (regole di voce e parole vietate D-31); in caso di dubbio prevalgono quelle, tranne dove questo file dichiara una deroga (solo emoji 18+, sotto). Grafica solo dal kit del brand (`tokens.json`, `fonts/`, `components/`, `assets/`). I file dei contenuti (immagini, video) non stanno nel repository.

Ultimo allineamento: 09/11/2026, con le decisioni di Roberto in chat (i reel hanno audio: voce e musica; dal 4° contenuto i reel hanno un protagonista, Bevino, che compare anche nei caroselli; dal 6° contenuto Bevino ha un amico, Franco; dal 7° i caroselli mostrano i dati di copertura per città).

## Account

- **Instagram:** @dovebevo · nome «Dove Bevo» · immagine: simbolo crema su fondo `spritz`.
- **Bio attuale** (confermata da Roberto il 27/10/2026):

  ```
  Stessa storia, stessa piazza, stesso drink: 5€ da una parte e 11€ dall'altra.
  Dove si spende meno?
  Coming soon. 🔞
  ```

- **Link in bio:** nessuno per ora. **Decisione aperta (Roberto, 27/10/2026): se e quando metterlo.** Il sito è raggiungibile su `www.dovebevo.com` dal 25/10/2026 (ADR 0035), quindi il vincolo non è più il dominio. Quando si decide, «Coming soon» lascia il posto a un invito diretto e si aggiunge il link; questo file va aggiornato nello stesso giorno.

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

Ordine dei contenuti nel feed al 09/11/2026: 1° carosello (24/10), 2° reel (24/10), 3° carosello (26/10), 4° reel con Bevino (02/11), 5° carosello «Ma chi li scrive» (03/11), 6° reel con Bevino e Franco a Porta Romana (05/11), 7° carosello «Quanto costa davvero il tuo drink?» (09/11). Le storie non contano.
