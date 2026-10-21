Il riscontro dopo `Salva`: un timbro si imprime con un rimbalzo di 260 ms, il testo conferma cosa è stato segnato.

- Resta 5 secondi con "Annulla": l'invio parte allo scadere (comportamento già nella SPEC).
- `role="status"` per gli screen reader. Il timbro porta la data del giorno, come un timbro postale, e ruota di -12°.
- Su Android, se disponibile, una vibrazione di 20 ms (`navigator.vibrate`), mai su richieste ripetute.
- Con movimento ridotto: nessuna animazione, solo comparsa.
- Sostituisce il messaggio di testo attuale: è la ricompensa del contributo.
