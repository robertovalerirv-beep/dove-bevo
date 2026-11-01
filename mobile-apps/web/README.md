# App-only HTTPS presentation

This entry reuses the existing App's data, moderation, authentication and contribution logic. It supplies a separate white mobile layout, compact venue and price sheets, drink chips, and map price pins. The public website source, Worker code/configuration and database schema are unchanged.

`npm run build` builds the existing website first, then stages only `/mobile/index.html` and `/assets/mobile/*`. Staging hashes every pre-existing website artifact and fails if one changes. App and map seams are compile-time transforms pinned to reviewed LF-normalized source hashes; upstream source changes require an explicit review and new pins. No browser-history prototype or shared website runtime is patched.

Routes remain real HTTPS assets: `/mobile/` for the map and `/mobile/?path=%2Fbar%2Fn123&c=u0nd9` for a venue. Private native bookmarks and public sharing must retain canonical `/bar/n123?c=u0nd9` links. Native apps must validate and translate these routes, verify the document's `data-dovebevo-mobile-shell="1"` marker, and handle a missing marker before switching their default entry. An existing root-scoped website service worker can still return its original cached homepage on an offline navigation; this entry does not unregister it or erase browser storage.

The map preserves the existing data selection, price tiers, normal/HH preference and attribution. A price pin's head and geographical tip share one hit target; overlapping hit layers dispatch a single venue selection. HH remains a separate label. Neutral prices remain neutral when there is insufficient evidence for a relative-price tier.

The Spritz image is original generated illustrative drink photography, not a photo of a particular venue or evidence of its serving. It is used only for the Spritz category. It was generated from an unbranded glass of orange spritz with ice and an orange slice on a white background, then encoded as JPEG quality 80 at the original 1024 x 1536 dimensions. JPEG SHA-256: `374e91b2a7852b3b10ca7e0839eefaeb19f38986ad2589e0501567e9a234314c`. Original PNG SHA-256: `0fcf8e7502e125c3e6f258a5b5cc4b343342798ba1f8d0c5ff62a7aa8ae25d3f`.

## Verification

- `node --test mobile-apps/web/tests/*.test.mjs mobile-apps/web/components/tests/components.test.mjs` after a full build. The browser uses Playwright Chromium, or the explicitly supplied `DOVEBEVO_BROWSER` executable. All API data is isolated and non-GET requests are blocked. Fixture screenshots are not proof of live basemap or installed-phone fidelity.
- `npx tsc -p mobile-apps/web/tsconfig.json --noEmit` verifies the app entry and components, in addition to the existing repository gates.
- Existing security E2E checks exercise the actual workerd asset path, production nonces/headers and unchanged website entry.
- Optional visual comparison: run the bundle cases with `DOVEBEVO_LIVE_MAP_STYLE=1` to use the emitted production style and real OpenFreeMap tiles. Venue and price records still belong to the isolated fixture, and all non-GET requests remain blocked.

Real-phone integration, live basemap comparison with the owner's reference, source-reviewed native route translation, and store distribution remain required before release. This source change alone does not update an installed app or establish a public store launch.
