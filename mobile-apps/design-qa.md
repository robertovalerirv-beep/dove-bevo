# Dove Bevo app visual adaptation — design QA

Review date: 30 October 2026. Paths below are relative to the integration checkout root. This report lives at the mobile project root. This reviews the existing mobile product adapted to the owner's six-screen visual direction. It does not certify a pixel-identical recreation, a new public catalogue, physical-device acceptance or store approval.

## Findings

- **Resolved P2 — loading content exceeded the reduced largest-text viewport.** The whole loading visibility owner is now a native scroll view bounded to the actual WK viewport. Run 52 passes all 88 native and four phone interface cases. The original 320 × 568/XXXL captures and geometry show viewport y116–268, content height382.333, offsets0/4.333/230.333, full 53-point body text, a fully reachable spinner and first/last text lines. The complete label fits its scroll content; hiding the entire owner passes touches to the actual WKWebView. Original images plus independent review confirm it no longer paints under navigation or bottom controls.
- **Resolved P1 — largest iOS text size overflowed the real bottom controls.** Run 50 showed 56-point buttons with 40-point text needing up to 96 points and approximately 31-point symbols. The real content-based sizing correction at cea03a66e38c885fcd42c0121d971013d9ff5929 passes all 87 native tests in run 51. The original post-fix geometry and owned-window snapshot show 144-point buttons, all ten title/icon containment checks true and full 40-point text retained. Settling, same-instance normal resize/shrink, landscape, targets and accessibility states pass without lowering assertions. The coordinator and independent reviewer both inspected the original evidence.

## Source and implementation evidence

- Source visual truth: `mobile-apps/design/owner-visual-reference-20261029.jpg`, the owner's original 853 × 1280 pixel six-screen board.
- Full comparison input: `../test-evidence/visual-design-20261029/reference-comparison-full.png`. The original board and the original Android captures are together in one browser-rendered comparison, with an additional focused venue pair. This is a comparison document, not an altered app screenshot.
- Comparison document and original-byte provenance: `../visual-design-android-20261029/.t/reference-qa/index.html` and `provenance.json`; loopback URL `http://127.0.0.1:4187/`.
- Real Android originals: `../visual-design-android-20261029/.t/native-visual/` — `milano-map-final.png`, `camparino-venue-final.png`, `add-price-form-final.png`, `favourite-compact-final.png`, `recommendations-final.png`, `native-threebutton-home.png`. The first four are displayed together in the full comparison.
- Real iOS originals: `../visual-design-ios-20261029/.t/ios48-originals/`, verified artifact 12943315093 from run 40973878631 at source `95c6e8328831261d651a7b84b755ecd649498fe1`. These are simulator captures of existing service browsing and native screens, not physical or store-delivered evidence.
- iOS keyboard/action capture: `Screenshots/888712E3-3823-40A2-8718-6AACD999192C.png`; focused field capture `Screenshots/4D670A3A-5D65-43C3-A716-75A052830D9F.png`. The native viewport ends at point 504, above the actual accessory; the disabled empty-form action is at approximately 423–480 after scrolling.
- iOS extreme-size originals: `../visual-design-ios-20261029/.t/ios50-originals/Screenshots/37A3D1E8-5699-43AE-8F86-1A4A8876CD17.txt` and `D5FA3ADD-BF91-4078-9B92-3BBC0B36FB6E.png`. The latter is explicitly an owned unit-fixture window layer snapshot, not a live venue screen or a physical screenshot.

## Viewport, scale and state

The reference is a composite proposal including device bezels and illustrative Bar San Marco/Spritz data. Its full-board comparison preserves its aspect ratio. The focused source viewport uses rectangle x298, y82, width260, height536 in the unchanged JPEG, CSS-clipped and displayed at 320 pixels wide (scale 1.230769). The actual Android original is 1080 × 1920 pixels, displayed at 320 × 568.889 CSS pixels (scale 0.296296). Different content, device proportions, platform chrome and source raster quality are explicit; no precise pixel-matching inference is made from them. The combined browser capture uses the default 1264-pixel-wide viewport, without a remaining viewport override.

iOS phone originals are 1206 × 2622 pixels from the actual iPhone 17 simulator, 402 × 874 logical points at scale 3. The extreme-size native fixture is 320 × 568 logical points at scale 3. The loopback CSS fixtures at 390 and 320 pixels are synthetic local markup tests and are kept separate from these genuine runtime originals.

The map and venue captures use real existing Milano/Camparino data. The price form is empty with its real numeric keyboard and no submission. The favourites capture uses the actual venue name, selected drink/band, recorded date, confirmation count and missing-state contract. No public content was created for these captures.

## Required fidelity surfaces

| Surface | Observed adaptation and limits |
| --- | --- |
| Fonts and typography | Native system families replace the earlier receipt/display treatment. Venue names, price amounts and section headings have a clearer weight hierarchy; addresses and dates remain secondary. Long form titles wrap instead of being truncated. The largest iOS bottom labels fit with full size retained; loading content scrolls within its actual viewport. |
| Spacing and layout rhythm | White rounded venue sheets, soft borders, quiet separators and grouped input/currency replace heavy receipt edges. Existing per-drink confirm/change/report controls remain, so rows are taller than the reference's abbreviated secondary-price list. Five owner-required bottom actions remain instead of the board's three tabs. |
| Colours and tokens | White/off-white surfaces and dark primary actions follow the board. Existing green/amber/red price-tier semantics remain; missing/sparse data stays neutral. Native favourite prices are neutral because their feed has no verified tier. The existing map can use its night basemap and cached canvas pins; this pass does not replace their renderer or guarantee new teardrop geometry. |
| Image quality and assets | The supplied brand and existing real icon assets are retained. No generated bar photos, drink photography, fake map imagery, receipt upload control or decorative share illustration substitutes for absent product data. Actual originals remain byte-identical; comparison cropping/scaling is CSS-only and labelled. |
| Copy and content | Actual venue names, amounts, dates, confirmations and correction/report actions remain. Private bookmarking uses the venue's name without a rename prompt. Shared drink recommendations remain distinct from public prices, price tiers and private favourites. No personalised feed, contribution history or fabricated venue/menu content is shown. |

## Comparison history and verification

1. Local CSS comparison found an oversized form question, a currency label outside its field, and narrow price-form title truncation. The shared theme now uses a compact readable question, one bordered amount/currency group and wrapping titles. Post-fix local captures: `css-price-390-v2.jpg`, `css-price-320-v3.jpg`, `css-venue-320-long.jpg` under the evidence directory. These are explicitly local synthetic fixtures. Existing long-sheet scrolling and local-only form/toggle interaction were exercised.
2. Genuine iOS run 47 showed the browser viewport behind the docked keyboard/accessory. Recorded swipes started on the accessory, so they did not prove the web form had scrolled. The browser now ends at the public keyboard layout guide; tests conditionally focus the real decimal field, verify viewport shrink/restoration and reach the real empty/disabled action. Runs 48 and 49 each passed all four phone interface cases. Run 48's original field/action images and accessibility trees verify the fix. No public price or vote was submitted.
3. Runs 48 and 49 exposed the largest-text bottom-control containment failures. Run 50 added exact geometry and an owned-window snapshot while retaining every assertion. Real content-based row sizing resolves this P1 in run 51 (40979876010), source cea03a66, 87 tests/zero failures. Original geometry: `../visual-design-ios-20261029/.t/ios51-originals/Screenshots/057FBDE3-6042-4367-BF60-303C2C7EB42C.txt`; original owned-window snapshot: `4776B176-59B8-433E-AF61-A8A73F152D1D.png` in the same directory. This full-window comparison also identifies the separate loading-content P2 above, which is resolved by the subsequent full native/phone run below.
4. Coordinator Android validation independently verified the installed final APK/asset bytes, 74 JVM cases, zero lint errors and all 31 real runtime cases. Existing normal/large-text/three-button captures remain supplemental. Hosted Android live smoke encountered a genuine Cloudflare managed challenge in runs 47 and 48; those failures remain red and were not waived or bypassed.

## Final native, phone and package evidence

Full beta run 52 (`40982631982`) at immutable source `cdd0bdd8437f3ee1f7b87dcfc7b53486381fcea0` succeeded: 88 native tests/zero failures and four phone UI tests/zero failures. The new mounted loading case passes in 2.339 seconds; normal keyboard, real venue, favourites and recommendations cases also pass. Both intended signing jobs ran only after both platform check jobs passed. The internal-only iOS signer stayed skipped.

Original check artifact12946082670 is16,604,857 bytes, SHA256 `d0ad4152de1954c809bfe1fbbbfdeca2377a18db64688f023044e28c40d3b942`. All27 retained files and26 actual attachment metadata records were independently checked. Evidence is under `../visual-design-ios-20261029/.t/ios52-originals/`: loading initial `1E07146D-788C-42B1-8FE3-C936963BF43C.png`, first-line `69929819-2160-4AB1-9664-A4267D2D3A3C.png`, end `5056EEBE-5C9B-48E0-8792-8F4FBC056814.png`, with their original geometry records. Normal venue `E302A54D-CB29-4CE2-B569-D2759E714186.png`, keyboard/action `C3392CFE-0CB5-40A1-93E6-05D8E6434B8C.png` and favourites `C1293B5D-AC98-4C76-80D6-F3BF19888165.png` were compared together with the reference in `../test-evidence/visual-design-20261029/reference-comparison-final.png`. This final full browser capture includes the earlier Android comparison and all complete iOS scenes. The focused iOS row uses a260px reference crop and up-to250px-wide originals; differing content and density are labelled.

The check artifact has no simulator app bundle, so it does not establish fresh simulator resource parity. Actual signed package verification does: Android AAB SHA256 `cbd7557168882bf664ec8a0b1f58023223f3f2ee5221037fb4b8cdeb4738ad76`; iOS IPA SHA256 `84e0b0db936835762ab11e308d3bd63e78e6b78b9317f49960b98b56661f6d34`. Both contain the exact shared theme SHA256 `af9775196688f2a39132615577a23dffbbe1896a791c99410c1d2e0367025e9f`; actual identities/version52 and approved public signing pins match. iOS privacy/terms bytes are unchanged. Mac strict signature/profile verification is supported by the successful exact-source guarded signing script; it was not repeated on Windows. Neither those packages nor this visual QA alone establish Apple processing, tester access, physical acceptance or public launch.

## Implementation checklist

- Preserve the now-verified largest-text iOS button/row sizing and strict geometry tests.
- Verified bounded loading presentation, complete scroll reachability, transitions and touch passthrough in the fresh native/phone run.
- Passed the full native/phone gates before both intended signed candidate jobs.
- Verified signed package identities/resources; provider distribution claims require their own read-back receipts.
- Preserve the already-submitted build 41 releases and the public website/backend.
- Record remaining physical-device and store-review gaps separately from visual QA.

## Follow-up polish and intentional product differences

The existing map renderer/attribution, night basemap and cached marker geometry remain. The reference's venue photography, observation-date picker, receipt upload, editorial discovery, own-contribution history, rating faces and share-image cards require distinct functional product work; they are not decorative placeholders in this adaptation. Native URL sharing and the existing support/privacy controls remain usable. The one-off Europe catalogue/menu import is a separate paused task.

final result: passed

No actionable P0/P1/P2 visual finding remains in the tested adaptation. Physical-device acceptance, later store decisions and complete Europe venue/menu coverage are separate outstanding work; this report does not certify them.
