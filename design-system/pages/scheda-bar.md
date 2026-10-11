# Pagina: Scheda bar — override di MASTER

- **Forma**: foglio sopra la mappa su telefono (altezza 85%, trascinabile solo come scorciatoia: si chiude anche con "Chiudi" ed Esc); URL proprio `/bar/<key>` che funziona anche a freddo.
- **Intestazione**: nome (`--text-xl` 800), tipo e città (`--text-sm` muted), indirizzo; link "Indicazioni" come pulsante secondario con icona.
- **Prezzi**: una riga per drink e formato: nome drink a sinistra, prezzo grande (`--text-lg` 600 tabellare) a destra, sotto data (solo giorno) e "N conferme"; etichette testuali "HH", "da confermare", "Letto dall'AI da una foto del listino, controllato da chi l'ha inserito" (testo intero, `--text-sm`, icona decorativa).
- **Azioni per prezzo**: "Confermo" (secondario, 48 px), "È cambiato" (secondario), "Segnala un errore" (link testuale 48 px di area); dopo "Confermo" il contatore si aggiorna e il pulsante diventa disabilitato con testo "Confermato".
- **In verifica** (D-10): sezione separata in fondo con titolo e spiegazione di una riga; stesse righe con solo "Confermo".
- Piè di pagina con link a Privacy e Regole.
