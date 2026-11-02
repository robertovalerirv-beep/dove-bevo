# Queen Victoria reconciliation after partial I writes

This is initially a read-only recovery audit, not a nine-new-price claim. I apply 41484305044 acknowledged seven Queen Victoria inserts, then its current-row read failed after the seventh insert. Its receipt retained all seven inserted outcomes and invalidated the cell; the last water row lacks its final current-row snapshot. Only beer and the named alcohol-free drink were unattempted. Fresh independent public reads matched all seven existing rows.

This manifest copies the exact nine reviewed Queen records without changing any per-record field or source pin. The normal public source was freshly fetched again with its original canonical digest. A new protected read-only audit must reconcile all nine current/history/report/hidden states before any apply decision. Expected state is seven protected existing rows and two eligible gaps; source/customer changes must not be overwritten. Any eventual apply uses the original atomic guards and must skip existing rows. No whole-I rerun, reset, delete or blind replay is authorized by this recovery design.

Manifest SHA256: 0ec141814249b653723f8c70cfa192310aabd9e7925a90bbcdbb2568a4756faf.

## Reconciled audit and guarded recovery approval

Actual read-only run 41487116989 at ea5994d2c7c56223eed14bec8fddc4a0cf453ec8 produced artifact 13162970642, verified ZIP SHA256 59508a9bd979502acb7a5cae3bf563418448cec98835fcfc201230eff5250a89. Its sole subgroup manifest SHA256 a2e53cfcf8b7f44924bd2ca46fddf3b41256d731bdda08756f3852c35bbb4fd9 was independently reconciled. All nine before/after states are identical. Seven guarded rows have exact active manual prices, original check date, zero confirmations and no history/report/hidden barrier. This supplies the water row snapshot missing from I. Only beer and the named alcohol-free drink are eligible, with all four counts zero and empty current arrays. Binding is verified; errors/cache invalidations are empty.

Independent review caught a shared-lock name typo introduced while cloning the I workflow. The historical J audit was read-only and explicitly sequenced after I had terminated. The typo is corrected before any J seed, restoring the exact shared dovebevo-one-off-menu-import lock. A new six-test batch suite includes a regression that fails on the old lock and passes on the corrected job. Manifest, core, tracer and cohort bytes remain unchanged. Only source group zero is approved; existing seven rows must be skipped by the original atomic guards. No recovery result is claimed yet.
