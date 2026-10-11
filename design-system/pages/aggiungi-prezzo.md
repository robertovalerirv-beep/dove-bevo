# Pagina: Aggiungi prezzo — override di MASTER

Obiettivo: 4 tocchi più le cifre (SPEC 2.2). Ogni passo è un foglio a tutta altezza con titolo, "Indietro" in alto a sinistra (48 px) e contenuto raggiungibile col pollice.
- **Passo Bar**: i 5 bar più vicini come righe 64 px (nome 600, indirizzo e distanza muted); campo "Cerca per nome"; in fondo bar "Nuovo, da confermare" con pulsante "Esiste, confermo" e la riga "Non trovi il bar?". Tocco su una riga = passo successivo (nessun "Avanti").
- **Passo Drink**: griglia 3 colonne di riquadri ≥ 96×88 px con icona SVG e nome; il formato preselezionato è scritto sotto ("Media 0,4 l"), cambiabile con un selettore secondario senza costo di tocchi. Tocco = passo successivo.
- **Passo Prezzo**: cifra grande centrata (`--text-2xl` 800 tabellare) in un campo `inputmode="decimal"` con focus automatico, suffisso €; interruttore "Happy hour" (48 px, `role="switch"`); **Salva** primario 56 px in basso, sopra la tastiera. Errori sotto il campo, `aria-live="assertive"`, valore ancora modificabile.
- **Dopo Salva**: ritorno alla mappa con toast "Prezzo salvato" + "Annulla" (10 s, barra di avanzamento solo se non è attivo reduced-motion).
