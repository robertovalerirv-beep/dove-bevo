# 0041 · Apps-only shared drink recommendations

- **Status:** approved by the app owner on 2026-10-28; additive backend exception to the app-only boundary.
- **Scope:** shared recommendations in the native apps. Roberto's website interface, price data and existing contribution/session guards remain unchanged.

## Decision

Use the existing Worker and D1, without new resources, dependencies or secrets. A narrow `/api/mobile/venues/:key/recommendations?c=<cell>` API validates a canonical public venue and a catalog drink. GET optionally identifies an installation; POST requires its lowercase UUIDv4, matching endpoint Origin, strict JSON and the existing real-secret and burst guards. No browser session or cookie is copied into native requests. Both successful methods return all nine category counts and own-state flags with `Cache-Control: no-store`.

Migration 0009 adds a persistent, indexed claim table keyed by venue, category and a purpose-separated HMAC of the installation, venue and category. A transactional set/undo plus read snapshot and the unique key prevent duplicate increments or counter drift. Price, date and happy-hour changes do not alter these votes. Counts are calculated from active claims; undo deletes only that installation's claim.

The UUID is an anonymous installation identifier, not proof of one person. Reinstalling/resetting or using another device can create another identity. Neither raw UUID nor raw IP is stored with votes or daily counters. The existing protected `HASH_KEY` is reused with distinct purpose prefixes. Its rotation requires an explicit migration strategy; rotation cannot be described as duplicate-safe continuity.

Addition attempts, including already-selected true requests, have separate Rome-day budgets of 50 per installation and 200 per IP. IP is an abuse budget, never voter uniqueness, so different customers on the same Wi-Fi can each recommend. Undo is daily-budget exempt but still subject to the existing burst limiter. The existing day-salted counters expire through normal cleanup; durable pair claims deliberately do not use the transient dedup table and remain until undo or service withdrawal.

## Verification and delivery

All recommendation writes and abuse/concurrency cases use the owned local D1/workerd fixtures. No public test votes are permitted. Native clients remain responsible for bounded trusted HTTPS transport, frozen venue context, independent private installation storage and Android's read-only automated-environment fence. Privacy disclosures are maintained with the app release work.

This is an additive live migration: the existing green-main deployment lane applies migrations before deploying the Worker. Root integration and exact-head CI/review precede merge; deployed GET and native beta acceptance are separate from local test results. Rolling back the Worker does not require removing the additive table or rewriting existing data.
