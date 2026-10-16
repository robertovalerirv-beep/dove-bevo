# Pagina: Aggiungi prezzo — override di MASTER

Riferimento: `docs/brand/mockup/3-segna-prezzo.png`, `4-segnato.png`. Il bottone resta "Aggiungi prezzo" (A7.4); 4 tocchi più le cifre (SPEC 2.2).

- **Avanzamento** in tre tratti in alto (Bar · Drink · Prezzo), tratto attivo `spritz`; "Indietro" a sola icona 48 px.
- **Passo Bar**: i 5 più vicini come righe 64 px; "Cerca per nome"; in fondo i bar "Nuovo, da confermare" e "Non trovi il bar?". Tocco = passo successivo.
- **Passo Drink**: griglia di riquadri ≥ 96×88 px con icona del kit e nome; formato preselezionato scritto sotto, cambiabile senza costo di tocchi.
- **Passo Prezzo**: bar e drink come chip modificabili in alto; domanda `display` "Quanto l'hai pagato?"; campo `inputmode="decimal"` in `price-xl` con suffisso €, focus automatico; "GIÀ VISTI IN ZONA · TOCCA PER USARLO" in `meta` con i prezzi della cella per lo stesso drink e formato come `PricePill` toccabili (un tocco = cifre compilate); con ≥ 5 prezzi la riga "In zona lo spritz va da X a Y €. Mediana Z €." in `caption`; interruttore "Prezzo da happy hour" (`role="switch"`, 48 px); primario "Salva X €" in basso. Errori sotto il campo, `aria-live="assertive"`.
- **Dopo Salva** (`StampToast`): timbro con la data del giorno che si imprime (260 ms, rimbalzo; dissolvenza con reduced motion), "Segnato. Il prossimo che passa sa già quanto spende.", "Annulla" per 10 s (D-15 invariato), `CoverageMeter` con "+1 grazie a te", `LoyaltyCard` (D-29), "Aggiungi un altro drink qui" (M3-16) e "Torna alla mappa".
