# 0046 · Sitemap con `lastmod` e elenco dei bar nelle pagine città

- **Stato:** decisa da Roberto il 09/11/2026 in chat · **Data:** 2026-11-09 · completa l'ADR 0025 (pagine per i motori di ricerca). Non cambia SPEC, schema, API né `docs/feature_list.json`.

## Contesto
Search Console segnalava (non bloccante) 3 URL «Pagina con reindirizzamento» e 92 URL `/bar/…?c=…` «Rilevata, attualmente non indicizzata». Misure live del 09/11/2026:
- I redirect `http→https` e `dovebevo.com→www` sono 301 voluti. `http://dovebevo.com` fa due salti: si riduce a uno con una Redirect Rule Cloudflare (nessun codice).
- Le pagine bar hanno title, description, canonical e og:url uguali all'URL in sitemap (`/bar/<chiave>?c=<cella>`): nessun problema di normalizzazione.
- La sitemap aveva solo `changefreq` e `priority`, ignorati da Google. Le pagine città linkavano al massimo 15 bar (i 5 più economici per birra, spritz e gin tonic): gli altri si scoprivano solo dalla sitemap.

## Decisione
1. **`<lastmod>` per i bar**: il giorno dell'ultimo prezzo attivo (`MAX(observed_on)`, data di Roma, già pubblica) nella stessa query della sitemap, senza righe lette in più. Tolti `changefreq` e `priority`. Home, `/copertura` e città restano senza `lastmod`: non hanno una data vera e una data inventata toglie fiducia al segnale.
2. **Sezione «Tutti i bar con un prezzo»** nel testo pre-renderizzato (`<noscript>`) delle pagine città: ogni bar con nome già risolto, una volta sola, al massimo `SEO_LIMITS.barsPerPage`. Si usano solo i nomi che la pagina risolve già: nessun file da leggere e nessuna query in più. L'interfaccia visibile non cambia.
3. Si tiene `?c=` nel canonical (nessun lookup D1 in più per pagina).

## Conseguenze
- Nessun impatto su UI, CSP, shell, budget di peso. Rollback con `git revert`.
- Restano fuori dall'elenco i bar delle celle oltre le 3 con più prezzi (`nameCells`) e le città fuori da `SEO_CITIES`. Allargare costa CPU per pagina: va misurato su Cloudflare prima di alzare `nameCells`.
- L'indicizzazione dipende da Google e dalla qualità percepita (schede con 1-2 prezzi sono contenuto sottile): `lastmod` e link interni accorciano la scoperta, non garantiscono l'indicizzazione. I tempi (da pochi giorni a qualche settimana, fino a 1-2 mesi) sono una stima.
- A carico di Roberto: Redirect Rule Cloudflare, controllo che i crawler verificati non siano bloccati, nuovo invio della sitemap in Search Console.
