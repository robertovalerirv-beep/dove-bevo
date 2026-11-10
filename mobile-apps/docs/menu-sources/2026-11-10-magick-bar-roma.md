# The Magick Bar Roma: owner menu candidate

**Status:** Draft for independent source review. No public import or customer price was written by this change.

The venue is already in Roberto's static catalogue as OpenStreetMap node `n4798279234`, at Lungotevere Guglielmo Oberdan 2, Roma, cell `sr2y7`. The owner [QR menu page](https://themagickbar.com/qr-menu/qr-menu-bar/) links the [eight-page 2026 bar PDF](https://themagickbar.com/wp-content/uploads/2026/05/2026-MENU-BAR.pdf.pdf). This candidate checked the live PDF on 10 November 2026 and pins its exact bytes as SHA-256 `d05a5c572ca7a0ffb717c6861094b0a0cbfb7322a810d52c5377b34788b45638`; the importer-normalized text SHA-256 is `9bbcc59d269d1c002763455f843d2abc3811ed0d311906d3a73b9b9bdd8ff393`.

The proposed [manifest](../../data/mobile-menu-v2-seeds/5f5e91a762bce9a56c526a312997fdc27bb0bc0c0877ce617af12d7b76120fb7.json) has 51 item-specific price rows, all linked to this existing venue:

| PDF page | Included factual rows |
| --- | --- |
| 3 | Acqua, one printed price, with no volume asserted |
| 4 | Six named signature cocktails and two named mocktails |
| 5 | Six named beers and six named soft drinks or juice groups |
| 6 | Three red and two rosé wines, each with the two printed price columns |
| 7 | Four sparkling wines and five white wines with two prices each; two Champagnes with one bottle-column price each |

Page 3 explicitly lists **Vini al calice**, **Vini in bottiglia**, **Bollicine al calice**, and **Bollicine in bottiglia**. Those categories and the price-column positions on pages 6–7 are the basis for `Calice` and `Bottiglia` serving labels. No millilitre quantity is asserted. The two Champagnes have only one printed price, in the bottle column. Generic price tiers on page 3, such as `Distillato 12 / 15 / 18`, are held because they do not identify a particular drink or a unique serving and can overlap item-specific rows. The separate page-3 Red Bull price duplicates the named page-5 row, so it is represented once.

**Currency caveat:** The PDF prints numbers without a currency symbol. `EUR` is an explicit inference from the venue's Roma location and Italy's euro currency, not a claim that the PDF printed `€`. The source review must accept this disclosed inference before a seed. The owner homepage describes a summer May–September venue; a live 2026 PDF in November is evidence of its last published menu, not evidence that the bar is open or the listed prices are available today. No fee statement appears in the checked menu, so fee coverage remains unknown. Only factual names, price numbers, and serving category labels are transcribed; images and descriptions are not copied.

The guarded importer must re-fetch the same PDF and verify both pinned hashes. This candidate still needs an independent row-by-row visual review, hosted checks, a protected dry-run audit, and a separately authorized guarded seed and public app API readback. It must not overwrite user reports or Roberto's legacy EUR price records.
