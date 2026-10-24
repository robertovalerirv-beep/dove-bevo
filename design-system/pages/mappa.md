# Pagina: Mappa (schermata iniziale) — override di MASTER

Riferimento: `docs/brand/mockup/1-mappa.png`, `5-zona-vuota.png`, `docs/brand/03-mappa.md`. Il mockup mostra 5 chip, "Segna un prezzo" e non mostra "Elenco": prevale la SPEC (tutte le chip di SPEC 6, bottone "Aggiungi prezzo", "Elenco" presente).

- **Struttura dall'alto**: simbolo (tappo) · casella "Cerca un bar o una città" (48 px, apre la Ricerca) · "Vicino a me" come pulsante a sola icona 48 px con `aria-label` (M3-15) · fila di chip dei drink scorrevole (`DrinkChips`, icona + nome, predefinita birra alla spina 0,4 l) · `CoverageMeter` "X bar su N qui hanno un prezzo" · mappa · legenda "↓ Affare · = Giusto · ↑ Salato" in `meta`, solo con colori attivi · in basso il primario `spritz` **"Aggiungi prezzo"** a larghezza piena (56 px) con "Elenco" come secondario accanto o sopra. "Aggiungi locale mancante" non c'è (D-28).
- **Pin** (`docs/brand/03-mappa.md`): pillola `radius-pill` con glifo e prezzo in `price` (Geist Mono), bordo `ink` 2 px, ombra stampa; neutro sotto 5 prezzi (`surface`, nessun glifo); senza prezzo punto 10 px con area di tocco 48 px; cluster cerchio `ink` con numero in `price`, meno evidente dei prezzi; selezionato = tappo `spritz` con prezzo sotto, rimbalzo 260 ms; oltre 90 giorni bordo tratteggiato, senza ombra, corsivo; HH come D-13.
- **Attribuzioni**: sempre visibili, contrasto AA, mai coperte dalla legenda: una riga a 11 px nell'angolo in basso a destra, che va a capo su un telefono stretto o con il testo spaziato; la legenda ne segue l'altezza misurata (ADR 0031).
- **Pallino della posizione** (D-33): cerchio `map-me` di 12 px con bordo chiaro e alone al 25% (si distingue dai bar per forma, non solo per colore), sotto i prezzi, non toccabile; solo dopo «Vicino a me», fermo fino al tocco successivo.
- **Sotto zoom 13**: "Avvicinati per vedere i prezzi, o cerca una città." su `surface`, `role="status"`.
- **Zona senza prezzi** (copertura < 5%): foglio con `display` "Qui nessuno ha ancora segnato un prezzo." e il primario; da qui si raggiunge anche "Non trovi il bar?".
- **Elenco** (SPEC 7.1): foglio con righe 56 px, `PricePill` HTML con glifo e testo del gradino ("affare", "giusto", "salato"), distanza se nota; ogni riga apre la scheda.
- **Fuori orario**: mappa scura derivata da Dark (D-27), stessi pin con i token del tema scuro.
