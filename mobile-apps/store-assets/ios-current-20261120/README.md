# iOS App Store screenshots selected on 20 November 2026

These four PNGs are byte-for-byte copies of genuine hosted iOS simulator captures. They document the screenshots selected in App Store Connect for Dove Bevo 1.0.0: the three iPhone images in the order below and one loaded iPad image. The previous `ios-current-20261102` set remains historical.

| File | Pixels | SHA-256 |
| --- | ---: | --- |
| `assets/01-iphone-milano-map.png` | 1206 x 2622 | `64b88565b5b73d8a17d462bc13e088f73d32d0e55546f7101dea5378874fe6a9` |
| `assets/02-iphone-venue-price.png` | 1206 x 2622 | `a0ad0936ccd313c6723de691939bb5507b5da5053e11e322e41e962f50bc0c98` |
| `assets/03-iphone-scopri.png` | 1206 x 2622 | `ca1f447e584292388621f9170267e8d9ef07cf81105cbfce02bd91d51cb353d1` |
| `assets/01-ipad-italy-loaded.png` | 2048 x 2732 | `c21ef6375e5f2d6d1274bc631596e9bb4dc7b544a2a331e950de0c8cc6ed5733` |

**Capture provenance.** The iPhone images came from the combined screenshot run `44758747713` (artifact `14643780023`) at commit `139dfdcf5a415834355b45029132ea04d06ca9ce`. The loaded iPad image came from separate run `44754853526` (artifact `14639626623`) at commit `895fdbab106047b8adc0635ccfc5529244f9c244`. The later combined iPad capture still showed loading, so it was not selected. A fourth iPhone capture, `04-iphone-consigliati.png`, was not uploaded and is intentionally absent here.

The production app source in these captures matches the app source on `main` at `c607e5db0c15a633150460b07f0b37b92173897e` and `4f4d41285ff97c2c3c99aadbfb47043c9f80d4a1`. The intervening PR 439 changed the capture workflow, UI tests and iPad capture script only. App Store Connect displayed the selected files in the corresponding screenshot slots on 20 November 2026. These simulator images do not establish physical-device quality assurance, App Review approval or public availability.
