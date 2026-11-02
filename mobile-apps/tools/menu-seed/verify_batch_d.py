#!/usr/bin/env python3
"""Read back only actual newly inserted rows; never submit public content."""
import argparse
import hashlib
import json
from pathlib import Path
from urllib.request import Request, build_opener
import live_import as core

def validate_receipt(doc, raw, receipt):
    expected = {(r["venue_key"], r["drink"], r["hh"]) for r in doc["records"]}
    if (receipt.get("complete") is not True or receipt.get("mode") != "apply"
            or receipt.get("manifest_sha256") != hashlib.sha256(raw).hexdigest()
            or receipt.get("batch_id") != doc["batch_id"] or receipt.get("errors") != []):
        raise ValueError("Receipt is not bound to this completed apply")
    rows = receipt.get("records")
    if not isinstance(rows, list) or len(rows) != len(expected):
        raise ValueError("Incomplete receipt record set")
    keys = [(r["venue_key"], r["drink"], r["hh"]) for r in rows]
    if len(set(keys)) != len(keys) or set(keys) != expected:
        raise ValueError("Receipt keys differ from the manifest")
    if any(r.get("outcome") not in ("inserted", "skipped_existing_or_guarded") for r in rows):
        raise ValueError("Indeterminate or unaudited outcome")
    return [r for r in rows if r["outcome"] == "inserted"]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--receipt", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    raw = Path(args.manifest).read_bytes()
    doc = core.validate(raw)
    receipt = json.loads(Path(args.receipt).read_text(encoding="utf-8"))
    targets = {(r["venue_key"], r["drink"], r["hh"]): r for r in doc["records"]}
    inserted = validate_receipt(doc, raw, receipt)
    opener = build_opener(core.NoRedirect())
    cells = {}
    result = {"batch_id": doc["batch_id"], "inserted": len(inserted), "public_verified": [], "public_unverified": [], "guarded_or_existing": len(receipt["records"]) - len(inserted)}
    for item in inserted:
        key = (item["venue_key"], item["drink"], item["hh"])
        target = targets[key]
        try:
            if target["cell"] not in cells:
                request = Request(core.SITE + "/api/prices/" + target["cell"], headers={"User-Agent": "DoveBevoMenuAudit/1", "Cache-Control": "no-cache"})
                with opener.open(request, timeout=20) as response: raw = response.read(core.MAX_SOURCE_BYTES + 1)
                if len(raw) > core.MAX_SOURCE_BYTES: raise ValueError("oversize")
                cells[target["cell"]] = core.strict_json(raw)
            matches = [row for row in cells[target["cell"]]["p"] if isinstance(row, list) and len(row) == 7 and tuple(row[:3]) == key]
            if len(matches) != 1 or matches[0][3] != target["cents"] or matches[0][4] != doc["checked_on"] or matches[0][6] != 0:
                raise ValueError("not the inserted active row")
            result["public_verified"].append(list(key))
        except Exception:
            result["public_unverified"].append(list(key))
    with Path(args.output).open("x", encoding="utf-8") as output:
        json.dump(result, output, sort_keys=True); output.write("\n")
    print(json.dumps({"inserted": result["inserted"], "public_verified": len(result["public_verified"]), "public_unverified": len(result["public_unverified"]), "guarded_or_existing": result["guarded_or_existing"]}))
    return 0 if not result["public_unverified"] else 2

if __name__ == "__main__": raise SystemExit(main())
