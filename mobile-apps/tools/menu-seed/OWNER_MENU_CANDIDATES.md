# Existing-venue owner-menu candidates (review only)

`crawl_owner_menu_candidates.py` examines the dated Italian source queue for **existing Roberto venue keys**. It produces evidence for a human to review; it has no public write path and does not create a mobile price manifest. The 2026-11-02 queue contains 368 URL candidates, including 31 direct menu tags, but its `inventory_complete` flag is false. Neither that queue nor a matching owner page proves that a venue still exists in the current catalogue.

Run from this repository's root. Give each run a new output directory immediately under the selected project folder's `.task-tmp`:

```powershell
python mobile-apps/tools/menu-seed/crawl_owner_menu_candidates.py `
  --offset 0 --max-venues 30 --max-requests 100 --max-seconds 180 `
  --output 'C:\Users\stefa\OneDrive\Dove Bevo\.task-tmp\menu-candidates-review-001'
```

Use `next_offset` from the report for the next run, with a **new output directory**. For example, the next 30 start at `--offset 30` if the first report says `next_offset: 30`. Stop when `remaining_candidates` is zero. Each city prioritizes direct menu tags and then sorts by existing venue key; pages visit Milano, Roma, Torino and Napoli round-robin. A given queue produces disjoint, stable pages. Compare `queue_sha256` across runs. If that hash changes, the source queue has changed and offsets from the older queue must not be combined with the new one. An offset equal to the queue length produces an empty exhaustion report; an offset past the end is rejected.

The default is 12 venues, 36 attempts and 240 seconds; hard CLI maxima are 30 venues, 120 attempts and 600 seconds. Each response is capped at 1 MiB HTML, 4 MiB PDF, or 100 KiB robots.txt. The process follows at most two redirects within the same owner host (allowing the `www` variant), at most two discovered menu links per venue, and waits at least one second between attempts to a host or longer if robots.txt requests it. It reads robots.txt and obeys disallow rules; a robots error other than 404 or a crawl delay above three seconds holds that host. HTTP URLs from the dated OSM queue are upgraded to HTTPS. DNS answers must all be public, and the connection pins the checked address while verifying the TLS hostname. It never follows social, menu-platform, or other cross-host links.

The crawler normally requires the venue name to appear on an owner landing page before it visits menu links. For a direct owner-domain menu tag without a separate website tag, it checks the same domain's home page first. Redirects, inaccessible sites, non-UTF-8 pages, unsupported media types, missing converters and name mismatches are held with reasons. Only explicit euro amounts become numeric candidates. A nearby item and serving are guesses; fee classification and line pairing require review. Generic numbers are `unclassified`; lines on a URL explicitly named `drink` may be labelled `drink` with `drink_context_only` uncertainty. The headline `candidate_venues` count requires at least one likely drink line. The raw response SHA-256, extracted text SHA-256, source URL, date, and original bytes are recorded under the private output directory. The report labels every price `review_required`, and sets `publication_blocked: true` and `public_imports: 0`.

PDF text extraction needs an installed Poppler `pdftotext` executable, supplied by `--pdftotext` or found on PATH. It reads PDF bytes from standard input and writes no PDF temp file outside OneDrive. Without it, PDF source evidence is held as `pdf_converter_unavailable`.

Before any separate import, a reviewer must check the live venue key and city against Roberto's current catalogue; inspect each original owner page or PDF and its hash; distinguish drinks from food, service fees and promotions; verify serving, date, currency and exact price-to-item pairing; and decide whether the source may be used. An extraction candidate is not a customer-submitted price or a verified live menu. Do not copy raw menu files or candidate reports into the Git repository, publish them to the website, or change public data directly from this tool.

Offline checks:

```powershell
python -m unittest discover -s mobile-apps/tools/menu-seed -p test_crawl_owner_menu_candidates.py -v
```
