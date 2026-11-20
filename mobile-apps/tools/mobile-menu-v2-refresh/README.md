# Birrifugio app-menu refresh guard

This one-off tool is limited to the independently reviewed candidate at
`mobile-apps/data/mobile-menu-v2-refreshes/birrifugio-roma-20261120.json`.
It preserves the website, legacy EUR prices, customer observations, venue rows,
fees, and the other app-menu offers. It never reads credentials from disk.

## Why there is one public visibility write

Cloudflare [documents D1 Worker `batch()` as a transaction with rollback](https://developers.cloudflare.com/d1/worker-api/d1-database/).
The [D1 REST query API](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/)
accepts batches but does not make that same atomicity guarantee. This tool uses
REST for **single SQL statements only**. SQLite gives each such statement an
atomic commit. D1 [documents its SQLite SQL behavior](https://developers.cloudflare.com/d1/sql-api/sql-statements/)
and [`json_each` bound-parameter support](https://developers.cloudflare.com/d1/sql-api/query-json/).

The five new offers first enter as `review`; the public app endpoint shows only
`active` offers. If staging is interrupted, the public menu still has its 266
previous offers. The only publication statement is one guarded `UPDATE` of the
seven reviewed old IDs and five staged IDs. It must return exactly twelve
changed rows and leave exactly 264 active. A lost response causes readback,
never an immediate second write. A later `verify` tag is read-only.

The publication statement checks the complete sorted set of 266 active IDs,
all 12 target rows and their exact fields, the old and new approved source
snapshots, zero venue moderation/reports, no customer observation referencing
one of the 12 changed offers, and an unchanged customer-entry count. The
preflight also checks every baseline offer against the SHA-pinned old seed,
the current public static venue, OSM node version and address, and two exact
hashes of the current owner menu. It aborts on a changed source, an extra or
missing active offer, or a partial/unrecognized publication state.

## Controlled workflow

There is no production write on a pull request. The PR workflow checks the
source hash and SQLite guard-race tests. Once the candidate and this tool have
both been reviewed and merged to Roberto's `main`, create a **lightweight**
audit tag on the exact reviewed main commit:

`mobile-menu-v2-refresh-audit/<candidate-file-sha256>`

This produces a read-only receipt artifact. Inspect its exact source and OSM
pins, 266 baseline ID digest, customer counts, and `complete: true` / `pre`.
Only then create a separate lightweight apply tag on the **same commit**:

`mobile-menu-v2-refresh-apply/<candidate-file-sha256>-<successful-audit-run-id>-<audit-run-attempt>`

The apply workflow verifies the main ancestry, file and code hashes, successful
exact audit run, artifact, and receipt freshness (24 hours) before any staging.
The script repeats the full public and private preflight immediately before
the one publication statement. A network failure after commit may leave a
failure receipt; compare the recorded `state`, and run the read-only verify
tag for public endpoint proof:

`mobile-menu-v2-refresh-verify/<candidate-file-sha256>`

If the publication guard returns no rows or public readback fails, do not
create a different write path or edit D1 manually. Investigate the receipt and
current owner menu. A new source version requires a newly reviewed candidate.

Run focused local checks from this repository:

`python -I -S -B -m unittest discover -s mobile-apps/tools/mobile-menu-v2-refresh -p 'test_*.py' -v`

The receipt records only counts and hashes for customer state; it does not
contain customer rows, credentials, source HTML, or private keys.
