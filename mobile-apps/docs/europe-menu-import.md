# Reviewed app-only European menu import

This separate importer targets only `mobile_menu_sources`, `mobile_prices_current`
and `mobile_price_obs`. It never edits the original website price tables, caches,
schema, catalogue or contributions. It does not run migrations or deploy a Worker.
Backend migration `0010_mobile_europe_prices.sql` and the reviewed app catalogue
must already be deployed before a live audit can succeed.

The reviewed manifest is `mobile-apps/data/europe-menu-seed-20261101.json`:

- SHA-256 `55a98e7350478c9f9a2c4944a76d1a3e3f353cbbf894051fd945924bf2831c07`.
- Catalogue schema 1, version `c8cfbf1e0e5231a9`, exact raw SHA-256
  `3e7bcc7f44ed3a52d22c666db5febb433ddb343379b96a4085d191f5c811c497`.
- 21 variants at four catalogue venues: Little Temple Bar (8), The Escapologist
  (4), Viva Madrid (2), Le Carlie (7). Six official menu sources, checked on
  1 November 2026. This is menu evidence, not a customer visit or payment.
- EUR and GBP remain separate native currencies. Explicit ml, unspecified glass,
  140 ml glass, 175 ml glass and 250 ml glass remain separate serving identities.
- Only non-Italian catalogue venues are supported by this initial batch. Italian
  legacy-cell exclusion is deliberately unsupported and fails closed.

## Reviewed source representations

Every source body is capped at 8 MiB before parsing; the catalogue is capped at
2 MiB. JSON rejects duplicate keys, non-finite values, malformed UTF-8, unexpected
fields and SPA fallback. HTTPS fetches do not follow redirects. The manifest
separately pins a previously reviewed `fetch_url`; Little Temple's official link
redirects to its exact reviewed filesusr PDF location. This is not an open-ended
redirect allowlist. Current official index HTML must still contain the official
PDF URL before any DB access. Le Carlie's directly linked menu pages are their
own current official menu indexes.

`pdf_raw_v1` hashes the entire response byte-for-byte and requires PDF magic.
`html_text_v1` uses the existing importer's bounded HTML parser: discard script
and style text, decode UTF-8 and HTML entities, join text nodes with spaces,
collapse whitespace, trim, hash the UTF-8 result. It is a reproducible markup-text
representation, **not proof of browser visibility or semantic price meaning**.
The source's independently reviewed raw response SHA is retained separately as
`raw_evidence_sha256`; the stored source SHA is the selected representation's
digest. A price-text change fails the live digest comparison. No PDF, full menu
images, customer reviews, provider response bodies or credentials are committed.

Named menu items, exact native amounts and serving/context were reviewed before
freezing this manifest. Generic unnamed classic-cocktail prices, water without
volume, unclear UK pint conversion, and the Escapologist two-identical-cocktails
for GBP 16 promotion are excluded. The pair price must never become an
unconditional GBP 8 single-drink price.

Google counts and identity facts come from the separately reviewed catalogue.
The importer validates their primary Google URL, date and threshold above 100;
it does not fetch reviews or claim to independently prove those facts.

## Audit and apply

The default is read-only audit. Each audit DB request uses the same documented
D1 REST batch envelope as apply, containing only two SELECT statements. A live
audit therefore provides a read-only provider test of the REST response shape;
SQLite and mocked HTTP tests alone do not prove that a live provider accepts it.

```powershell
python -B mobile-apps/tools/europe-menu-import/import_menu.py --manifest mobile-apps/data/europe-menu-seed-20261101.json --receipt NEW-OUTSIDE-SOURCE-RECEIPT.json
```

Credentials come only from the existing authorized Cloudflare runtime/workflow
environment. Never copy them into source, a receipt, OneDrive or memory. The
importer reuses the existing provider read-back that binds `www.dovebevo.com` to
Worker `dovebevo-staging`, its `DB` binding and exact D1 UUID/name. It then uses
that same verified account/database for all batch requests.

The new workflow mirrors the existing repository-secret pattern; it introduces
no new environment approval flow or provider resources. It accepts only these
two exact tags in `robertovalerirv-beep/dove-bevo`, checks out the event commit,
checks the fixed reviewed manifest hash, and runs preservation/transaction tests:

- `mobile-europe-menu-audit/20261101-v1`: read-only.
- `mobile-europe-menu-seed/20261101-v1`: guarded apply with the fixed SHA argument.

The coordinator must verify the green audit receipt and provider batch shape
before pushing the separate seed tag. Tags are one-off and must not be moved or
reused. A changed manifest requires code review, new fixed hash and new tag names.
Creating this workflow does not assert that an audit, import or public release
has occurred. Action dependencies are pinned to exact commits. Credential-bearing
steps use only the repository's protected Cloudflare secrets, as the existing
menu-import workflow does; no new credentials are requested or created.

## Transaction and preservation contract

[Cloudflare's REST query schema](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/)
accepts `{batch: [{sql, params}, ...]}` and an ordered result array.
[D1 batch transaction semantics](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)
roll back the sequence on a statement error. Each price uses **one HTTP request**
with five statements: before-presence SELECT, guarded immutable source insert,
guarded current insert, linked observation insert, current SELECT. This is atomic
per variant. The whole manifest is not one transaction: earlier successful
variants remain if a later variant fails. No three-HTTP-call substitute exists.

SQL predicates inside the transaction refuse existing current/history for the
exact currency/serving variant, in every status. Whole-venue reports, app
moderation, hidden state and any legacy website price/history/report also block
insertion. The 100-variant cap is checked inside the transaction. A racing
customer or moderator committed before the transaction wins. Existing rows are
never updated, deleted, relabelled or given artificial confirmations. Source
rows are content addressed; DB immutability triggers still apply.

Fresh source rows have `observed_on: null`, `confirmed_on: null`, zero
confirmations and `source_kind: online_menu`; the actual source-check day is
stored independently. A new UUID identifies each attempted transaction. Reruns
skip existing state without changes. The app API already uses `no-store`, so the
website cache is neither invalidated nor touched.

## Receipts and recovery

The CLI reserves a new receipt before network calls and never overwrites an
existing receipt. It flushes and fsyncs a checkpoint before each mutation request,
recording `indeterminate` and the attempt revision. It stores each ordered
read-back and whether a variant was inserted or guarded. Source/index/catalogue
drift, invalid provider binding or malformed batch results fail closed. Error
text intentionally excludes provider bodies and credentials.

A lost response may mean a committed transaction. The importer does not retry
automatically and does not claim rollback from a transport exception. Preserve
the incomplete receipt; inspect the attempt revision in the app-only current and
observation tables through the trusted operator. A separately reviewed rerun is
safe against overwrite but must not be used to conceal an uncertain prior result.
The workflow always attempts receipt upload, including incomplete receipts.

## Local verification

```powershell
python -B -m unittest discover -s mobile-apps/tools/europe-menu-import -p test_import_menu.py -v
```

Tests use the real repository migration schema in in-memory SQLite, foreign keys,
transaction rollback injection, racing customer state, all existing statuses,
history/report/moderation/hidden/legacy guards, independent serving variants,
source/catalogue drift and strict mocked HTTP batch envelopes. They perform no
provider access and no public writes. The coordinator owns independent review,
fresh integrated tests, live audit and any later publication.
