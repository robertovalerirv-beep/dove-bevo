# Raaro Firenze: owner menu source candidate

This is a **source-only, app-only candidate** for independent review. It adds no public prices, changes no customer contributions, and does not alter Roberto's website or backend.

## Existing venue identity

- Roberto's [20261119 static `srb10` catalogue](https://www.dovebevo.com/data/20261119/v/srb10.json) contains `n12533714501`, **Raaro**, kind `bar` (`1`), at `43.78398, 11.27857`, address `Piazza Leopoldo Nobili 15`, Firenze city ID `61753360`.
- The live [OSM node](https://www.openstreetmap.org/node/12533714501) returned the same name, street number, venue type, and coordinates `43.7839837, 11.2785659` on 20 November 2026. It links `https://www.raaro.it/`.
- The owner [Firenze page](https://www.raaro.it/it) gives the same address and links its *RAARO Sips & Bites* menu. Its [company information](https://www.raaro.it/it/company-info) identifies RARO S.r.l. at Piazza Nobili 15.
- The [live app-only v2 read](https://www.dovebevo.com/api/mobile/v2/menu/venues/n12533714501?cell=srb10&limit=1) returned `stored_offer_count: 0` on 20 November 2026. Recheck before any seed.

## Owner PDF and transcription

- The owner menu link opens [its viewer](https://www.raaro.it/media/menu/RAARO-Sips-Bites-ita/index.html). The viewer's `files/assets/workspace.js` sets its enabled PDF download to `RAARO-ita.pdf`. The resulting [owner-hosted PDF](https://www.raaro.it/media/menu/RAARO-Sips-Bites-ita/files/assets/common/downloads/RAARO-ita.pdf) returned HTTPS 200, `application/pdf`, 972,640 bytes and 28 pages on 20 November 2026.
- Exact PDF SHA-256: `53a64749cb830461e061f017c00d6766d919ddfa7009aea0de577735c81bc7c4`. Importer `pdf_text_v1` normalized text SHA-256: `e1dc07cc8645e4d708df8fa066ae42b7320c91b09448d418430c4d1f4e08fb70`, computed with Poppler `pdftotext` 26.09.0, layout UTF-8. The [immutable manifest](../../data/mobile-menu-v2-seeds/c757ccd1ca7a8676ac2474eb910266d36d80b5b5425b3386d0cabebc034b7e75.json) has SHA-256 equal to its filename.
- **56 exact EUR drink offers** are staged: 33 individually named cocktails on PDF pages 7, 9, 12–13 and 15–17; two Theresianer beers with a printed 33 cl serving on page 21; and 21 wine prices explicitly marked *calice* or *bottiglia* on pages 22–23. Names, prices, servings and vintages were checked against the extracted text and selected rendered pages. No cocktail serving volume is printed, so those fields are null. The two beers are left uncategorized because the PDF does not say draft or bottle.
- The PDF states no service charge or explicit absence of fees; fee coverage is therefore **unknown**. No customer confirmations, receipt dates, review counts, discounts or current stock availability are claimed. The PDF is mutable despite being linked by the owner's live site.
- Excluded: food; multi-drink tasting flights (pages 11 and 14); bottled Negroni retail formats (page 14); and spirits on pages 19–21 whose footnote permits either 30 or 60 ml without assigning a serving size to each price. There is no evidence here for an automatic price at another venue.
- No open reuse license was found on the owner pages. The manifest records factual item names, prices and source references only; it does not copy descriptions, menu artwork or images.

## Guard before public import

An independent reviewer must verify the exact PDF bytes and text digest, the owner-to-OSM/static identity, the page-level price evidence, current duplicates and source-use review. Run the protected read-only importer audit on this manifest, then decide separately whether to seed it. A source change or Poppler text-digest mismatch must hold the import for review.
