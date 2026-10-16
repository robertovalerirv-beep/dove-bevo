**Il prezzo, prima del conto.** Dove bevo è la mappa dei prezzi veri di birre e drink nei bar italiani, scritta da chi ordina. Questa identità serve a una cosa: rendere un numero (6,50 €) la cosa più riconoscibile, divertente e affidabile dello schermo.

## Idea di marca

Il bar italiano ha tre oggetti che tutti riconoscono: il **tappo a corona**, il **sottobicchiere** e lo **scontrino**. L'identità li usa come sistema, non come decorazione:

- **Tappo a corona = il posto.** Il simbolo è un tappo con la punta di un segnaposto. Sulla mappa, il bar selezionato diventa un tappo.
- **Pillola col prezzo = il dato.** Ogni prezzo è una pillola con bordo `ink`, ombra `shadow-stampa` e cifre in `mono`: si legge come un cartellino.
- **Scontrino = la prova.** La scheda del bar è uno scontrino: cifre in colonna, data in `meta`, bordo inferiore seghettato. Comunica "questo l'ha pagato qualcuno, non è una stima".
- **Timbro = il grazie.** Dopo `Salva` compare un timbro che si imprime (componente Timbro). È la ricompensa, al posto di punti o classifiche.

## Colore

- Due temi con nomi di marca: **Bancone** (`light`, crema e inchiostro) e **Fuori orario** (`dark`, nero caldo). Il tema segue `prefers-color-scheme`.
- `spritz` è l'unico colore di marca. Usalo per: l'azione primaria della schermata, il logo, la selezione. Una sola superficie spritz grande per schermata.
- La scala dei prezzi ha tre gradini con nome: **Affare** (`affare`, lime), **Giusto** (`giusto`, carta), **Salato** (`salato`, rosso vino). Rosso vino e non rosso semaforo, per non confondere "caro" con il colore di marca.
- I tre gradini si distinguono per luminosità (lime chiaro, carta, vino scuro) e portano sempre un glifo: `↓` affare, `=` giusto, `↑` salato. Il colore non è mai l'unico segnale, il numero è sempre scritto.
- Testo solo con le coppie verificate nei token: `ink` e `ink-muted` su `bg`, `surface`, `surface-2`; `on-spritz` su `spritz`; `on-affare`, `on-giusto`, `on-salato` sui rispettivi fondi; `spritz-text` per i link su `bg` e `surface`.
- Il focus è un anello `focus` da 3px pieno con 2px di distanza dall'elemento, così cade sempre su `bg` o `surface`.
- Vietato: gradienti, sfumature viola-blu, nero puro `#000` come sfondo, bianco puro come sfondo.

## Tipografia

- **Bricolage Grotesque** (`sans`, variabile 200–800, OFL) per tutto il testo. Ha le cifre tabellari (`font-feature-settings: "tnum"`), da attivare negli elenchi.
- **Geist Mono** (`mono`, variabile, OFL) solo per prezzi e metadati da scontrino: `price-xl`, `price`, `meta`. Le cifre monospaziate si allineano in colonna come su uno scontrino.
- Due file woff2 in tutto, sottoinsieme latino, serviti dal proprio dominio (41 KB + 23 KB prima di un eventuale sottoinsieme solo italiano).
- Gerarchia: `display` una volta per schermata, `title` per il nome del bar, `body` minimo 16px. Maiuscolo solo in `meta`.
- Prezzi sempre in formato italiano: `6,50 €` nelle schede, `6,50` nei pin dove il simbolo è implicito.

## Forme, spazi, ombre

- Ogni controllo ha bordo `ink` da `border-strong` e ombra `shadow-stampa`. Premuto (`:active`): trasla di 3px e passa a `shadow-premuto`. È l'effetto "pulsante fisico" che rende l'interfaccia toccabile.
- Raggi: `radius-pill` per chip, pin e contatori; `radius-md` per bottoni e schede; `radius-lg` per i fogli dal basso; `radius-sm` per i campi.
- Margine di pagina `space-4`; target tattili minimi 48×48px.
- Lo scontrino ha il bordo inferiore seghettato con una `mask-image` SVG in `data:` nel foglio di stile.

## Movimento

- Durate: 120 ms per i tocchi, 180 ms per i fogli, 260 ms per il timbro.
- Curve: `cubic-bezier(.2,.8,.2,1)` per entrare; `cubic-bezier(.3,1.6,.5,1)` (rimbalzo) solo per il timbro e per il pin selezionato che diventa tappo.
- I pin compaiono con una scala da 0,6 a 1 sfalsata di 20 ms, massimo 12 per volta.
- Con `prefers-reduced-motion: reduce` tutto diventa una dissolvenza di 120 ms o nulla.
- Niente librerie di animazione: solo CSS e Web Animations API.

## Iconografia

- Nove icone dei drink, una per voce del catalogo (gruppo Icone): boccale (birra alla spina, tutti i formati), bottiglia, coppa da spritz con mezza fetta d'arancia, tumbler con ghiaccio e lime (gin tonic), tumbler basso con scorza (negroni), calice di vino, flûte (prosecco), bicchiere con cannuccia (analcolico), lattina (bibita). Griglia 24px, tratto 2px, estremità arrotondate.
- Nei file l'inchiostro è `#1B1611`; nel codice vanno inline con `stroke="currentColor"` per seguire il tema.
- Per il resto dell'interfaccia (cerca, posizione, chiudi, indietro) usa lo stesso stile: 24px, tratto 2px, angoli arrotondati. Niente emoji nell'interfaccia.

## Logo

- Simbolo: tappo a corona con punta da segnaposto (`dovebevo-simbolo.svg`). Versione orizzontale con la scritta "dove bevo" in minuscolo, Bricolage 800 vettorializzato.
- Su fondo scuro usa `dovebevo-logo-orizzontale-negativo.svg`. Sotto i 24px usa `dovebevo-simbolo-mono.svg`.
- Icona dell'app: simbolo crema su fondo spritz (`dovebevo-icona-app.svg`), da esportare in PNG 192 e 512 e in versione maskable con margine del 20%.
- Spazio di rispetto: metà della larghezza del simbolo su ogni lato. Non ruotare, non cambiare colori, non aggiungere ombre.

## Cosa non fare

- Non promuovere il bere: niente "bevi di più", brindisi, sbronze, shot, giochi alcolici. Si parla di prezzi e di posti.
- Non usare il nero freddo con neon verdi e viola: è il linguaggio delle altre app di prezzi della birra.
- Non trasformare lo scontrino in un muro di testo: massimo cinque righe di prezzo visibili, poi "Vedi tutti".
- Non usare più di un bottone `spritz` per schermata.
