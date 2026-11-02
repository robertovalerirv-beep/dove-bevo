# Android build 62 current screenshots

Three genuine original RGB PNGs, 1080 × 1920 (9:16), captured on 2 November
2026 through the normal app flow after the app-only CSS containment fix was
verified live. No image was cropped, resized, repainted, converted or otherwise
edited. `provenance.json` records exact original bytes and hashes.

| File | Actual screen |
| --- | --- |
| `milano-map.png` | Production Milano map with real tiles and price pin |
| `milano-native-scopri-beer.png` | Native Scopri comparing actually returned Milano beer prices |
| `milano-actual-venue.png` | The actually returned Picchio venue and its existing prices |

The local debug app is version 1.0.0 / build 62. Its production Android source
tree is byte-identical to reference commit
`8a408fe677d8e7962601c26eaec9bbfb009980b0`; this capture does not establish
installation of the signed Play-delivered binary. The device was an Android
API 36 SDK emulator (`sdk_gphone64_x86_64`), not a physical phone.

The deployed mobile frontend was commit
`3164f371310b0ae1bffae6a9b21f1690542428b8`, with the live 34-venue catalogue
version `8dba6d321be21f71`. The scoped CSS fix contains the drink inputs in their
scrolling options. The normal pointer, keyboard and Back flow passed the actual
visible map/sheet geometry guards; there were no runtime CSS, viewport, scroll
or zoom overrides. The unchanged native wide-viewport and overview settings
remained false. Exactly 35 owned runtime cases and the separate actual GBP/EUR
native read also passed. No public price, vote, confirmation, report or venue
contribution was created.

The coordinator uploaded these exact three files to Google Play Console on
2 November 2026 and saved them in map, Scopri, venue order. The four superseded
listing placements were removed while the source assets remained in the library.
Only the venue screenshot was labelled for its generated Spritz illustration.
The console confirmed the listing was saved and ready to send for review.
These screenshots and SDK checks
do not establish physical-device acceptance, a signed release installation,
store approval or a public mobile release.

The initial context/diagnostic image and private execution logs are deliberately
outside this asset package. Existing failed captures remain retained separately;
they were not edited into these screenshots.
