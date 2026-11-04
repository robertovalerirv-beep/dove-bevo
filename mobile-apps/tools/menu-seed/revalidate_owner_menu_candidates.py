"""Rank crawler leads against the current public catalogue for manual review.

This reads existing research reports and public Dove Bevo data only. It never
creates a menu manifest, approves a price, or sends a contribution.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import sys

import crawl_owner_menu_candidates as crawl
import inventory_city_prices as inventory


ROOT = Path(__file__).resolve().parents[3]
QUEUE = ROOT / "mobile-apps/data/italy-full-city-menu-source-queue-20261102.json"
SEEDS = ROOT / "mobile-apps/data/mobile-menu-v2-seeds"
MAX_REPORT_BYTES = 2 * 1024 * 1024
MAX_SEED_BYTES = 4 * 1024 * 1024
MAX_REPORTS = 32
SHA = re.compile(r"[0-9a-f]{64}")
RUN_DATE = re.compile(r"20[0-9]{6}")


class Held(ValueError):
    """The review ranking could not be completed safely."""


def digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise Held("duplicate_json_field")
        result[key] = value
    return result


def json_object(raw: bytes, limit: int) -> dict:
    if not raw or len(raw) > limit:
        raise Held("input_size_limit")
    try:
        doc = json.loads(
            raw.decode("utf-8"),
            object_pairs_hook=unique_object,
            parse_constant=lambda _: (_ for _ in ()).throw(Held("nonfinite_json")),
        )
    except (UnicodeError, json.JSONDecodeError):
        raise Held("invalid_json") from None
    if not isinstance(doc, dict):
        raise Held("expected_object")
    return doc


def report_paths(root: Path, run_date: str) -> list[Path]:
    if not RUN_DATE.fullmatch(run_date) or not root.is_dir():
        raise Held("invalid_report_selection")
    first = root / f"menu-candidates-sample-{run_date}-final" / "report.json"
    offsets = []
    for child in root.iterdir():
        match = re.fullmatch(rf"menu-candidates-{run_date}-offset([0-9]+)", child.name)
        if match and child.is_dir():
            offsets.append((int(match.group(1)), child / "report.json"))
    offsets.sort()
    if first.is_file():
        paths = [first] + [path for _, path in offsets]
    else:
        paths = [path for _, path in offsets]
    if not paths or len(paths) > MAX_REPORTS or len({offset for offset, _ in offsets}) != len(offsets):
        raise Held("invalid_report_selection")
    if any(not path.is_file() or path.is_symlink() for path in paths):
        raise Held("missing_report")
    return paths


def seed_keys(directory: Path) -> tuple[set[str], str, int]:
    if not directory.is_dir():
        raise Held("missing_seed_directory")
    files = sorted(directory.glob("*.json"))
    if len(files) > 1000:
        raise Held("seed_limit")
    keys = set()
    fingerprints = []
    for path in files:
        if not SHA.fullmatch(path.stem):
            raise Held("invalid_seed_filename")
        raw = path.read_bytes()
        if len(raw) > MAX_SEED_BYTES or digest(raw) != path.stem:
            raise Held("invalid_seed_digest")
        doc = json_object(raw, MAX_SEED_BYTES)
        venues = doc.get("venues")
        if not isinstance(venues, list) or not 1 <= len(venues) <= 20:
            raise Held("invalid_seed_venues")
        for venue in venues:
            key = venue.get("venue_key") if isinstance(venue, dict) else None
            if not isinstance(key, str) or not re.fullmatch(r"(?:[nwr][1-9][0-9]{0,14}|m[0-9a-f]{24})", key):
                raise Held("invalid_seed_venue_key")
            keys.add(key)
        fingerprints.append(path.stem)
    return keys, digest("\n".join(fingerprints).encode("ascii")), len(files)


def _source_summary(record: dict) -> tuple[int, list[str]]:
    sources = record.get("sources")
    if not isinstance(sources, list) or len(sources) > 3:
        raise Held("invalid_candidate_sources")
    count, urls = 0, []
    for source in sources:
        if not isinstance(source, dict) or source.get("review_state") != "candidate_only":
            continue
        url = source.get("url")
        try:
            host, clean = crawl.host_for(url)
        except (crawl.Held, TypeError):
            raise Held("invalid_candidate_url") from None
        if not crawl.owner_host(host) or source.get("first_party_basis") != "same_host_and_venue_name_on_landing":
            raise Held("invalid_candidate_owner_basis")
        if not SHA.fullmatch(str(source.get("raw_sha256", ""))):
            raise Held("invalid_candidate_source_digest")
        prices = source.get("price_candidates")
        if not isinstance(prices, list) or len(prices) > 500:
            raise Held("invalid_candidate_guesses")
        drink_guesses = sum(isinstance(price, dict) and price.get("kind_guess") == "drink" for price in prices)
        if drink_guesses:
            count += drink_guesses
            urls.append(clean)
    return count, sorted(set(urls))


def rank(queue_raw: bytes, reports: list[dict], seeded: set[str], seed_digest: str,
         fetch=inventory.public_json) -> dict:
    try:
        queue, rows = crawl.queue_rows(queue_raw)
    except crawl.Held:
        raise Held("invalid_queue") from None
    if not SHA.fullmatch(seed_digest) or len(reports) > MAX_REPORTS:
        raise Held("invalid_inputs")
    queue_by_key = {}
    for row in rows:
        if (not inventory.coordinates(row.get("lat"), row.get("lon"))
                or inventory.geohash(row["lat"], row["lon"]) != row["cell"]
                or not inventory.integer(row.get("cityID"), 1, 10**15)
                or not inventory.text(row.get("address"), empty=True)):
            raise Held("invalid_queue_identity")
        queue_by_key[row["key"]] = row

    seen = {}
    queue_sha = digest(queue_raw)
    for report in reports:
        if (not isinstance(report, dict) or report.get("schema_version") != 1
                or report.get("purpose") != "review_only_existing_italian_venues"
                or report.get("queue_sha256") != queue_sha
                or report.get("publication_blocked") is not True
                or type(report.get("public_imports")) is not int or report["public_imports"] != 0
                or report.get("queue_inventory_complete") is not (queue.get("inventory_complete") is True)):
            raise Held("invalid_report_contract")
        records = report.get("records")
        if (not isinstance(records, list) or len(records) > 30
                or type(report.get("selected_venues")) is not int
                or report["selected_venues"] != len(records)):
            raise Held("invalid_report_records")
        if report.get("page_complete") is not True:
            raise Held("incomplete_report_page")
        for record in records:
            if not isinstance(record, dict):
                raise Held("invalid_report_record")
            key = record.get("venue_key")
            if not isinstance(key, str):
                raise Held("invalid_report_venue_key")
            expected = queue_by_key.get(key)
            if (not expected or key in seen or record.get("venue_name") != expected["name"]
                    or record.get("city") != expected["city"] or record.get("cell") != expected["cell"]
                    or record.get("status") not in ("candidate", "held", "incomplete")):
                raise Held("report_queue_identity_mismatch")
            seen[key] = record

    cohort_complete = len(seen) == len(rows) and all(
        record["status"] != "incomplete" for record in seen.values())
    candidates = [seen[key] for key in sorted(seen) if seen[key]["status"] == "candidate" and key not in seeded]
    cells = sorted({record["cell"] for record in candidates})
    errors = []
    live = {}
    try:
        initial_version = inventory.version(fetch(inventory.ORIGIN + "/api/health"))
    except Exception:
        initial_version = None
        errors.append("health_unavailable")
    if initial_version:
        for cell in cells:
            try:
                venues, venue_errors = inventory.cell_venues(
                    fetch(inventory.ORIGIN + f"/data/{initial_version}/v/{cell}.json"), cell)
                _, hidden, price_errors = inventory.cell_prices(fetch(inventory.ORIGIN + f"/api/prices/{cell}"))
                if venue_errors or price_errors:
                    raise Held("invalid_public_cell")
                live[cell] = (venues, hidden)
            except Exception:
                errors.append(f"cell_unavailable:{cell}")
        try:
            if inventory.version(fetch(inventory.ORIGIN + "/api/health")) != initial_version:
                errors.append("catalogue_version_changed")
        except Exception:
            errors.append("final_health_unavailable")

    ranked = []
    held_counts = {}
    for record in candidates:
        key = record["venue_key"]
        expected = queue_by_key[key]
        cell_data = live.get(record["cell"])
        if not cell_data:
            reason = "public_cell_unavailable"
        else:
            venue = cell_data[0].get(key)
            if venue is None:
                reason = "venue_not_in_current_catalogue"
            elif key in cell_data[1]:
                reason = "venue_hidden"
            elif (crawl.normalize(venue["name"]) != crawl.normalize(expected["name"])
                  or venue["city"] != expected["cityID"]
                  or abs(venue["lat"] - expected["lat"]) > 0.0001
                  or abs(venue["lon"] - expected["lon"]) > 0.0001
                  or (venue["address"] and expected["address"]
                      and crawl.normalize(venue["address"]) != crawl.normalize(expected["address"]))):
                reason = "current_catalogue_identity_mismatch"
            else:
                reason = None
        if reason is None:
            guesses, urls = _source_summary(record)
            if not guesses or not urls:
                reason = "no_reviewable_drink_guesses"
        if reason:
            held_counts[reason] = held_counts.get(reason, 0) + 1
            continue
        ranked.append({
            "venue_key": key, "venue_name": venue["name"], "city": record["city"],
            "cell": record["cell"], "owner_source_urls": urls,
            "heuristic_drink_price_lines": guesses,
            "identity_state": "current_catalogue_exact",
            "review_state": "manual_source_and_price_review_required",
        })
    ranked.sort(key=lambda item: (-item["heuristic_drink_price_lines"],
                                   crawl.CITY_ORDER.index(item["city"]), item["venue_key"]))
    if not cohort_complete:
        errors.append("queue_report_coverage_incomplete")
    if errors:
        ranked = []
    return {
        "schema_version": 1,
        "purpose": "review_only_current_catalogue_menu_candidates",
        "publication_blocked": True,
        "approved_prices": 0,
        "queue_sha256": queue_sha,
        "queue_inventory_complete": queue.get("inventory_complete") is True,
        "queue_candidates": len(rows),
        "reported_venues": len(seen),
        "cohort_complete": cohort_complete,
        "catalogue_data_version": initial_version,
        "seed_snapshot_sha256": seed_digest,
        "excluded_seeded_candidates": sum(record["status"] == "candidate" and key in seeded
                                          for key, record in seen.items()),
        "held_candidate_reasons": dict(sorted(held_counts.items())),
        "candidates": ranked,
        "errors": sorted(errors),
        "complete": cohort_complete and not errors,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reports-root", type=Path, required=True)
    parser.add_argument("--run-date", required=True, help="YYYYMMDD crawler cohort")
    parser.add_argument("--queue", type=Path, default=QUEUE)
    parser.add_argument("--seed-dir", type=Path, default=SEEDS)
    args = parser.parse_args()
    try:
        queue_raw = args.queue.read_bytes()
        paths = report_paths(args.reports_root, args.run_date)
        reports = [json_object(path.read_bytes(), MAX_REPORT_BYTES) for path in paths]
        seeded, seed_digest, seed_files = seed_keys(args.seed_dir)
        result = rank(queue_raw, reports, seeded, seed_digest)
        result["reports_read"] = len(paths)
        result["seed_manifest_files"] = seed_files
    except (Held, OSError) as error:
        result = {"schema_version": 1, "purpose": "review_only_current_catalogue_menu_candidates",
                  "publication_blocked": True, "approved_prices": 0, "complete": False,
                  "candidates": [], "errors": [str(error) if isinstance(error, Held) else "input_unavailable"]}
    print(json.dumps(result, ensure_ascii=False, sort_keys=True, separators=(",", ":")))
    return 0 if result["complete"] else 1


if __name__ == "__main__":
    sys.exit(main())
