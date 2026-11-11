# Venue sheet layout evidence

These 390 px screenshots use the local `components.test.mjs` fixture, not a real venue or a public contribution. The fixture deliberately includes markup characters in the venue and drink names to check escaping.

- `before.png`: selected owner-menu Spritz also expands an unrelated customer Gin tonic into a second large card with its three actions always visible.
- `after.png`: the owner-menu drink is the only featured card; customer prices stay in a compact list with visible “Azioni prezzo” controls. Price, serving, menu source, date, and fee caveat remain visible.
- `after-native.png`: the same updated sheet after the native Save capabilities are enabled in the fixture. Each visible drink has its own private Save and public thumbs-up action.
- `after-selected-actions.png`: the selected owner drink is absent from the lower menu list; its linked customer report and update action remain available without duplicating its menu price.
- `after-footer.png`: the other menu prices, documented supplement, directions, reporting, and legal links remain reachable after scrolling.

The focused browser test captures current screenshots when `DOVEBEVO_CAPTURE_VENUE=after` is set. The baseline screenshot was captured from `986e9bab00d8b29744302d4f31dc13cd5d2eca7a` before the layout change. These screenshots are visual review evidence; they do not replace physical-device testing or a store release.
