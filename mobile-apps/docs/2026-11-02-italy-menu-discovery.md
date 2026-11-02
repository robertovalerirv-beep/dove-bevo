# One-off Italian menu discovery

The owner removed the minimum Google review threshold. Existing venue and customer records remain protected. This bounded research collector discovers current OSM website/menu tags for exact existing catalogue node identities. It never fetches discovered links, guesses prices, writes public contributions, modifies schema, or runs on a schedule.

## Actual discovery on 2 November 2026

Catalogue version 20261101, four priority centre cells only: Milano u0nd9, Roma sr2yk, Torino u0j2q, Napoli sr60k. At most 250 deterministic node samples per cell; ways and relations are not converted to nodes. 692 identities were requested in seven sequential batches of at most 100 IDs with a 1.1 second cooldown. 146 identity-matching website/menu leads were found: Milano 65, Roma 33, Torino 37, Napoli 11. The remaining 546 records are explicitly held. This is not whole-city or Italy coverage, and discovery leads are not imported prices.

The checked-in snapshot contains approved public URL tags and catalogue identifiers only. Editor identity, contact details and unrelated OSM tags are discarded. Attribution: OpenStreetMap contributors, ODbL.

## Verification and limits

Fixed HTTPS catalogue/Core API routes, no redirects, two MiB transport cap, bounded timeouts, duplicate-key and non-finite rejection. Names and rounded coordinates must still agree. Stop after a failed OSM batch; no retries, alternate endpoints, auth or rate-limit bypass. Check catalogue version again at completion. Queries and anchors may be retained as unfetched discovery strings, never automatically accepted by the stricter price importer.

Offline tests exercise route and URL guards, actual size limits, duplicate JSON/IDs, unknown-city neighbours, moved/renamed/deleted nodes, privacy minimisation, sampling bounds, failure stop, and version turnover.

Each lead still requires an official current priced menu, branch/address binding, explicit category/serving/conditions review and a source hash before a protected import. Existing prices/history/reports/hidden content are never overwritten. Menu prices retain their real currency; no conversion or invented price dates.
