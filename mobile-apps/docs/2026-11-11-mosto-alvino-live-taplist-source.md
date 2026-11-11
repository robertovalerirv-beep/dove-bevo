# Mosto Alvino Napoli: dynamic tap-list candidate

This is a **source-only candidate**, not a public price import. It changes no venue, website interface, legacy/customer price, database schema, or Cloudflare resource. Do not use its 48 offers as customer-observed prices.

## Existing venue and source

- Roberto's static catalogue version `20261108`, cell `sr607`, has `n13739499391`, **Mosto - Birra & Cocktail alla spina**, Via Enrico Alvino 59, Napoli, at `40.8442, 14.23042`, city ID `428339558`. The [OpenStreetMap node](https://www.openstreetmap.org/node/13739499391) has the same name, amenity `pub`, street, number and coordinates and points to the [Mosto owner site](https://www.mosto.beer/).
- The [owner's Alvino page](https://www.mosto.beer/sedi/alvino/) repeats Via Enrico Alvino 59 and links **Cosa c'è alla spina** to the [Alvino tap list](https://mo5.it/m/alvino). The menu page is HTTPS and publicly readable. No Google review count was used.
- A source check on **11 November 2026** found 16 occupied taps and 48 individual *stored* EUR facts: S, M and L for each named beer. The page renderer has fallback numbers for missing database prices; the candidate reads only non-null values actually returned by the live branch-specific data. It does not copy images or descriptive prose. No menu publication date or millilitre volume is asserted, because neither is supplied for these prices.
- Manifest: `mobile-apps/data/mobile-menu-v2-seeds/8056b42188ccedc8ff768a5ca87d7cccf9660a897fce33e67a02b0dd848a02b6.json`; SHA-256 is the filename. Its source data digest is `422d67b8db4b4af7badfafc6d8ec126d8a41566c6bab9d3b140ff200ae171cfa`; pinned renderer SHA-256 is `49d9d53123213e5e59ff8a06486009a65c391c52a50e0704ee819273b74fb41d`. It contains no fee row or claim that fees are absent; fee coverage is unknown.

## Audit contract and limits

The `mosto_taplist_v1` adapter accepts only the owner-linked Alvino URL, verifies that the owner page still links it, pins the exact renderer bytes, reads only the public Alvino branch ID `2`, and derives a canonical digest from the **actual venue-specific tap rows** including identities and explicit stored S/M/L prices. A changed tap, name or price fails the source pin. The public API key published by the menu page is used transiently for a read-only request; it is not stored in the manifest, code, logs or receipt. The adapter rejects redirects, non-public source IPs, non-JSON responses, malformed/duplicate entries, page fallbacks, missing or extra offers, and any serving volume or fee assertion unsupported by this source.

The tap list can rotate. A merged manifest alone will not populate the app. Before any public write, obtain **independent item/identity/source review**, a successful protected production dry-run audit for this exact manifest and main commit, confirm no hidden/reported/moderated venue or customer-price conflict, then run the separate guarded seed with its successful audit run ID. Verify the receipt and public app-only API readback. If the tap list has changed, stop and prepare a new reviewed snapshot; never force the old pin or silently update customer contributions.
