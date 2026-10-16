# Pagina: Scheda bar — override di MASTER

Riferimento: `docs/brand/mockup/2-scheda-bar.png`, `docs/brand/components/Scontrino/`.

- **Forma**: foglio dal basso (`radius-lg`) con dentro lo **scontrino** (`ReceiptSheet`): fondo `surface`, bordo inferiore seghettato con `mask-image` SVG `data:` nel CSS. Il bar selezionato sulla mappa diventa un tappo. URL `/bar/<key>` invariato, anche a freddo; si chiude con "Chiudi" ed Esc.
- **Intestazione**: nome in `title`, tipo e città in `caption` `ink-muted`, indirizzo.
- **Righe di prezzo**: icona del drink, nome e formato, `PricePill` a destra; sotto in `meta` la data (solo giorno) e le conferme ("12 OTT · 3 CONFERME"); "HH" e "DA CONFERMARE" in `meta`. Al massimo 5 righe, poi "Vedi tutti".
- **In verifica** (D-10): sezione separata con titolo e una riga di spiegazione, righe con solo "Confermo".
- **Azioni**: "Confermo" (secondario), primario `spritz` "Aggiungi un prezzo qui" (uno solo per schermata); link "È cambiato", "Indicazioni", "Segnala un errore". Piè con Privacy e Regole.
