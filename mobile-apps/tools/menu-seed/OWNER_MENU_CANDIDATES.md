# Existing-venue owner-menu candidates (review only)

`crawl_owner_menu_candidates.py` examines the dated Italian source queue for **existing Roberto venue keys**. It produces evidence for a human to review; it has no public write path and does not create a mobile price manifest. The 2026-11-02 queue contains 368 URL candidates, including 31 direct menu tags, but its `inventory_complete` flag is false. Neither that queue nor a matching owner page proves that a venue still exists in the current catalogue.

To make a fresh review queue from the current public map catalogue, run the separate bounded discovery step. It reads the four 15 km mapped city areas, checks current OpenStreetMap node, way and relation name/URL tags, and does **not** visit the venue websites or import prices. Ways and relations have no coordinates in the OSM multi-fetch response; their geometry stays explicitly unverified for manual identity review. The queue is a snapshot: repeat discovery before later research, keep its catalogue version and checksum with any crawl report, and never combine offsets from different queues. The `--max-venues-per-city` cap of 1000 covers the current four city counts, but if a city grows beyond the cap the queue correctly reports `inventory_complete: false`. A restricted centre-cell or smaller sample also reports incomplete.

```powershell
python -B mobile-apps/tools/menu-seed/discover_menu_links.py `
  --full-city --max-venues-per-city 1000 --crawler-queue `
  > 'C:\Users\stefa\OneDrive\Dove Bevo\.task-tmp\menu-source-queue-current.json'

python -B mobile-apps/tools/menu-seed/crawl_owner_menu_candidates.py `
  --queue 'C:\Users\stefa\OneDrive\Dove Bevo\.task-tmp\menu-source-queue-current.json' `
  --offset 0 --max-venues 30 --max-requests 100 --max-seconds 180 `
  --output 'C:\Users\stefa\OneDrive\Dove Bevo\.task-tmp\menu-candidates-review-001'
```

The discovery limit is 400 static map cells, 1000 venues per city, and 100 IDs per OSM request, with a 1.1 second gap between OSM batches. A failed OSM batch holds that batch and all remaining IDs; it never silently presents a partial queue as complete. The dated queue remains available for historical comparison only.

Run from this repository's root. Give each run a new output directory immediately under the selected project folder's `.task-tmp`:

```powershell
python mobile-apps/tools/menu-seed/crawl_owner_menu_candidates.py `
  --offset 0 --max-venues 30 --max-requests 100 --max-seconds 180 `
  --output 'C:\Users\stefa\OneDrive\Dove Bevo\.task-tmp\menu-candidates-review-001'
```

Use `next_offset` from the report for the next run, with a **new output directory**. For example, the next 30 start at `--offset 30` if the first report says `next_offset: 30`. Stop when `remaining_candidates` is zero. If the request or time budget ends during a venue, the report marks it `incomplete`, sets `page_complete: false`, and leaves `next_offset` and `retry_offset` at that venue. Retry from that offset, optionally with fewer venues per page or a larger bounded budget. Do not advance by `selected_venues`: that is the planned page size, which may exceed `completed_venues`. Earlier completed venues are not revisited by the retry cursor; evidence recorded for the incomplete venue is partial and should be replaced by the retry result. Each city prioritizes direct menu tags and then sorts by existing venue key; pages visit Milano, Roma, Torino and Napoli round-robin. A given queue produces disjoint, stable pages. Compare `queue_sha256` across runs. If that hash changes, the source queue has changed and offsets from the older queue must not be combined with the new one. An offset equal to the queue length produces an empty exhaustion report; an offset past the end is rejected.

The default is 12 venues, 36 attempts and 240 seconds; hard CLI maxima are 30 venues, 120 attempts and 600 seconds. Each response is capped at 1 MiB HTML, 4 MiB PDF, or 100 KiB robots.txt. The process follows at most two redirects within the same owner host (allowing the `www` variant), at most two discovered first-level menu links and one additional PDF linked from an owner menu page per venue, and waits at least one second between attempts to a host or longer if robots.txt requests it. The additional PDF gets the same robots and request-budget checks. A cross-host PDF URL found on an owner menu page is recorded only as a held lead for independent manual source review; its bytes are never fetched. The process reads robots.txt and obeys disallow rules; a robots error other than 404 or a crawl delay above three seconds holds that host. HTTP URLs from OSM are upgraded to HTTPS. DNS answers must all be public, and the connection pins the checked address while verifying the TLS hostname. It never follows social, menu-platform, or other cross-host links.

The crawler normally requires the venue name to appear on an owner landing page before it visits menu links. For a direct owner-domain menu tag without a separate website tag, it checks the same domain's home page first. Redirects, inaccessible sites, non-UTF-8 pages, unsupported media types, missing converters and name mismatches are held with reasons. Only explicit euro amounts become numeric candidates. A nearby item and serving are guesses; fee classification and line pairing require review. Generic numbers are `unclassified`; lines on a URL explicitly named `drink` may be labelled `drink` with `drink_context_only` uncertainty. The headline `candidate_venues` count requires at least one likely drink line. The raw response SHA-256, extracted text SHA-256, source URL, date, and original bytes are recorded under the private output directory. The report labels every price `review_required`, and sets `publication_blocked: true` and `public_imports: 0`.

PDF text extraction needs an installed Poppler `pdftotext` executable, supplied by `--pdftotext` or found on PATH. It reads PDF bytes from standard input and writes no PDF temp file outside OneDrive. Without it, PDF source evidence is held as `pdf_converter_unavailable`.

Before any separate import, a reviewer must check the live venue key and city against Roberto's current catalogue; inspect each original owner page or PDF and its hash; distinguish drinks from food, service fees and promotions; verify serving, date, currency and exact price-to-item pairing; and decide whether the source may be used. An extraction candidate is not a customer-submitted price or a verified live menu. Do not copy raw menu files or candidate reports into the Git repository, publish them to the website, or change public data directly from this tool.

Offline checks:

```powershell
python -m unittest discover -s mobile-apps/tools/menu-seed -p test_crawl_owner_menu_candidates.py -v
python -m unittest discover -s mobile-apps/tools/menu-seed -p test_menu_discovery.py -v
```
