# 0042 — One-time sourced venue and menu-price seed

29 October 2026. The owner requests automatic venue discovery and official-menu price import across major European cities once; ordinary customers then add and update observations. This narrowly supersedes the older app-only data restriction for this seed. Roberto's business plan, layout and ordinary contribution flow remain intact.

## Contract

- Use a frozen, auditable source manifest and deterministic importer. No recurring crawler, monitor or AI API spend.
- Independently sourced OSM venue identities and coordinates remain separate from menu-price evidence. Persist the bounded venue input in the existing catalogue build so the next deployment cannot remove it.
- Retain the requested greater-than-100 Google-review filter using an explicit claim published on the venue's official site. Record this as a publisher claim and its retrieval date, never as an independently queried Google attestation. Do not scrape Google Maps.
- Import only clear individual prices matching the existing nine drink categories, EUR and existing price limits. Preserve item, serving and context; reject ambiguity, packages, ranges, bottled beer mapped as draft and incompatible serving sizes. Foreign currencies remain candidates without conversion.
- Seed rows have distinct menu provenance and zero invented confirmations. Never overwrite any customer row, history or moderation barrier, including quarantined/removed rows. All eligibility guards belong inside the atomic SQL mutation.
- Preserve the seven-element legacy price tuple and existing cell response keys. Public source metadata is served separately and matched exactly to the current menu row. The existing price row gets a small source label/link; customer updates supersede menu attribution normally.
- Apply the exact frozen seed once through the existing green-main deployment/migration path. No new privileged HTTP write endpoint or Cloudflare resource. Idempotent replay performs zero data writes. Rollback is conditional on untouched importer ownership and never removes customer work.
- European catalogue coordinates require a narrow Android comparison validator update while preserving the exact-cell geohash check.

## Verification

Prove source parsing, threshold and category/currency failures, duplicate identity handling, exact-cell attribution, SQL idempotency, existing/customer-race preservation, schema row/index preservation, source visibility, stale response fencing and legacy payload compatibility. Read public health, catalogue, prices and source metadata after deployment. Report the real inserted/skipped counts and cities; do not claim exhaustive Europe coverage or current menu validity from an undated page.

## Ownership

Root integrates in the selected OneDrive seed worktree. An isolated web writer owns the source display and tests; an isolated Android writer owns only its coordinate compatibility repair. Independent explorers/reviewers verify the final patches. Credentials remain in existing protected stores. GitHub is canonical, OneDrive a working copy/mirror.
