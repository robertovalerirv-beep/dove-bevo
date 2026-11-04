# Review-only owner-menu shortlist

The revalidate_owner_menu_candidates.py script takes a completed crawler
cohort and checks its venue keys against the **current public static
catalogue**. It rechecks the venue name, five-character cell, city ID and
location, checks the current hidden-venue list, and excludes keys already
present in local v2 seed manifests. It then ranks remaining leads by the
number of crawler-flagged drink-price lines.

From the repository worktree root on the selected OneDrive workspace:

~~~powershell
python -B mobile-apps/tools/menu-seed/revalidate_owner_menu_candidates.py --reports-root 'C:\Users\stefa\OneDrive\Dove Bevo\.task-tmp' --run-date 20261103
~~~

The report reader uses the matching menu-candidates-sample-YYYYMMDD-final
directory for the first 30 venues and menu-candidates-YYYYMMDD-offsetN
directories for the remaining pages. It requires the exact original queue
hash, unique records, a full queue cohort, and a stable public data version.
The current seed digest is included so a later run can detect a changed seed
snapshot. An unavailable public cell or a changing data version clears the
shortlist and makes the command fail.

The output is **not an import plan**. The heuristic_drink_price_lines field
counts unreviewed text matches, which can pair an item with the wrong amount
or describe bottle service. Owner-menu URLs and prices must be fetched and
checked again by a person. A ranked venue is known to exist in the current
static catalogue; its owner menu is **not** certified current by this tool.
Existing seed keys can include unpublished or held manifests, and open pull
requests are not part of this seed snapshot.

The cohort_complete field only means all records in the dated queue were
read. The queue_inventory_complete field may still be false: this process
does not claim to cover every Italian venue. The tool reads public data and
local files only. It never creates a manifest, writes a price, or calls the
protected import.

Focused offline checks:

~~~powershell
python -B -m unittest test_revalidate_owner_menu_candidates -v
~~~
