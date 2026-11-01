#!/usr/bin/env python3
"""Guarded, manifest-pinned one-off importer. Defaults to a read-only dry run."""
import argparse
import datetime
import hashlib
from html.parser import HTMLParser
import ipaddress
import json
import math
import os
from pathlib import Path
import re
import sys
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler

DATABASE = "d2d4f6d4-b2fb-435b-9f9e-a2961d9c9839"
SITE = "https://www.dovebevo.com"
LIMITS = {"beer_draft": (250, 1200), "spritz": (250, 1500), "negroni": (400, 2000),
          "sbagliato": (400, 2000), "gin_tonic": (400, 2000), "gin_lemon": (400, 2000),
          "wine_glass": (200, 1500), "alcohol_free": (200, 1200), "water": (50, 600)}
RECORD_FIELDS = set("venue_key name cell city lat lon drink hh cents source_url source_sha256 google_reviews google_url identity_note".split())
MAX_SOURCE_BYTES = 8 * 1024 * 1024
MAX_HTML_TEXT = 1024 * 1024
INSERT = """INSERT INTO prices_current (venue_key, drink, hh, cell, city, price_cents, observed_on, confirmations, status, source)
SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, 'active', 'manual'
WHERE NOT EXISTS (SELECT 1 FROM prices_current WHERE venue_key=?1 AND drink=?2 AND hh=?3)
AND NOT EXISTS (SELECT 1 FROM price_obs WHERE venue_key=?1 AND drink=?2 AND hh=?3)
AND NOT EXISTS (SELECT 1 FROM reports WHERE venue_key=?1)
AND NOT EXISTS (SELECT 1 FROM venues_hidden WHERE venue_key=?1)
RETURNING venue_key, drink, hh, cell, city, price_cents, observed_on, confirmations, status, source"""
INVALIDATE = """INSERT INTO cell_snapshot (cell, v, at, body) VALUES (?1, 1, 0, NULL)
ON CONFLICT (cell) DO UPDATE SET v = v + 1, at = 0, body = NULL"""
PRESENCE = """SELECT
(SELECT COUNT(*) FROM prices_current WHERE venue_key=?1 AND drink=?2 AND hh=?3) AS current_count,
(SELECT COUNT(*) FROM price_obs WHERE venue_key=?1 AND drink=?2 AND hh=?3) AS history_count,
(SELECT COUNT(*) FROM reports WHERE venue_key=?1) AS report_count,
(SELECT COUNT(*) FROM venues_hidden WHERE venue_key=?1) AS hidden_count"""
CURRENT = "SELECT venue_key, drink, hh, cell, city, price_cents, observed_on, confirmations, status, source FROM prices_current WHERE venue_key=?1 AND drink=?2 AND hh=?3"

class Error(Exception):
    pass

class HTMLTextV1(HTMLParser):
    """Extract markup text, not browser-visible text; never execute the source."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.ignored = 0
        self.length = 0
    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"): self.ignored += 1
    def handle_endtag(self, tag):
        if tag in ("script", "style"): self.ignored = max(0, self.ignored - 1)
    def handle_data(self, data):
        if not self.ignored:
            self.length += len(data) + 1
            if self.length > MAX_HTML_TEXT: raise Error("HTML text exceeds limit")
            self.parts.append(data)


def source_digest(raw, source_format="raw"):
    if len(raw) > MAX_SOURCE_BYTES: raise Error("source exceeds limit")
    if source_format == "raw": return hashlib.sha256(raw).hexdigest()
    if source_format != "html_text_v1": raise Error("invalid source format")
    try:
        parser = HTMLTextV1()
        parser.feed(raw.decode("utf-8", errors="strict"))
        parser.close()
        canonical = re.sub(r"\s+", " ", " ".join(parser.parts)).strip().encode("utf-8")
    except UnicodeError:
        raise Error("invalid HTML source encoding") from None
    if not canonical: raise Error("empty HTML text")
    if len(canonical) > MAX_HTML_TEXT: raise Error("HTML text exceeds limit")
    return hashlib.sha256(canonical).hexdigest()


def strict_json(raw):
    def pairs(p):
        result = {}
        for key, value in p:
            if key in result: raise Error("duplicate JSON field")
            result[key] = value
        return result
    try:
        return json.loads(raw, object_pairs_hook=pairs, parse_constant=lambda _: (_ for _ in ()).throw(Error("invalid number")))
    except (ValueError, UnicodeError, RecursionError):
        raise Error("invalid JSON")

def text(value, maximum):
    return isinstance(value, str) and 0 < len(value) <= maximum and not any(ord(c) < 32 or ord(c) == 127 for c in value)

def url(value):
    if not text(value, 2048): raise Error("invalid source URL")
    try:
        p = urlsplit(value)
        if (p.scheme != "https" or not p.hostname or p.username or p.password or p.query or p.fragment
                or p.port not in (None, 443) or not re.fullmatch(r"[A-Za-z0-9.-]+", p.hostname)
                or "." not in p.hostname or p.hostname.endswith((".", ".local", ".localhost", ".invalid"))):
            raise Error("invalid source URL")
        try: ipaddress.ip_address(p.hostname)
        except ValueError: pass
        else: raise Error("literal IP prohibited")
        return p.hostname.lower()
    except ValueError:
        raise Error("invalid source URL")

def geo(lat, lon):
    boxes = [[-180., 180.], [-90., 90.]]
    bits = []
    for i in range(25):
        axis = i % 2
        midpoint = sum(boxes[axis]) / 2
        high = (lon if axis == 0 else lat) >= midpoint
        bits.append(int(high))
        boxes[axis][0 if high else 1] = midpoint
    alphabet = "0123456789bcdefghjkmnpqrstuvwxyz"
    return "".join(alphabet[sum(bits[i+j] << (4-j) for j in range(5))] for i in range(0, 25, 5))

def validate(raw):
    if len(raw) > 1024 * 1024: raise Error("manifest too large")
    doc = strict_json(raw)
    if not isinstance(doc, dict) or set(doc) != {"schema_version", "batch_id", "checked_on", "data_version", "records"} or type(doc["schema_version"]) is not int or doc["schema_version"] not in (1, 2):
        raise Error("invalid manifest schema")
    if not text(doc["batch_id"], 80) or not re.fullmatch(r"[A-Za-z0-9._-]+", doc["batch_id"]): raise Error("invalid batch id")
    if not isinstance(doc["data_version"], str) or not re.fullmatch(r"[0-9]{8}", doc["data_version"]): raise Error("invalid data version")
    try:
        day = datetime.date.fromisoformat(doc["checked_on"])
        if day.isoformat() != doc["checked_on"] or day > datetime.date.today(): raise ValueError()
    except (ValueError, TypeError): raise Error("invalid checked date")
    if not isinstance(doc["records"], list) or not 1 <= len(doc["records"]) <= 200: raise Error("invalid record count")
    seen = set()
    for r in doc["records"]:
        fields = RECORD_FIELDS | {"source_format"} if doc["schema_version"] == 2 else RECORD_FIELDS
        if not isinstance(r, dict) or set(r) != fields: raise Error("invalid record schema")
        if doc["schema_version"] == 2 and r["source_format"] not in ("raw", "html_text_v1"): raise Error("invalid source format")
        if not isinstance(r["venue_key"], str) or not re.fullmatch(r"[nwr][1-9][0-9]{0,14}", r["venue_key"]): raise Error("invalid OSM key")
        if not text(r["name"], 240) or not text(r["identity_note"], 1000): raise Error("missing venue identity evidence")
        if not isinstance(r["cell"], str) or not re.fullmatch(r"[0-9bcdefghjkmnpqrstuvwxyz]{5}", r["cell"]): raise Error("invalid cell")
        if r["city"] is not None and (type(r["city"]) is not int or not 0 < r["city"] <= 10**15): raise Error("invalid city")
        for k, lo, hi in (("lat", -90, 90), ("lon", -180, 180)):
            if type(r[k]) not in (int, float) or not math.isfinite(r[k]) or not lo <= r[k] <= hi: raise Error("invalid coordinates")
        if geo(r["lat"], r["lon"]) != r["cell"]: raise Error("cell mismatch")
        if not isinstance(r["drink"], str) or r["drink"] not in LIMITS or type(r["cents"]) is not int or not LIMITS[r["drink"]][0] <= r["cents"] <= LIMITS[r["drink"]][1] or type(r["hh"]) is not int or r["hh"] not in (0, 1): raise Error("invalid drink price")
        if type(r["google_reviews"]) is not int or not 100 < r["google_reviews"] <= 100000000: raise Error("invalid review count")
        url(r["source_url"])
        if not re.fullmatch(r"(?:www\.|maps\.)?google\.(?:com|it|fr|de|es|co\.uk)", url(r["google_url"])): raise Error("invalid Google URL")
        if not isinstance(r["source_sha256"], str) or not re.fullmatch(r"[0-9a-f]{64}", r["source_sha256"]): raise Error("invalid source hash")
        key = (r["venue_key"], r["drink"], r["hh"])
        if key in seen: raise Error("duplicate record")
        seen.add(key)
    return doc

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args): return None

class Transport:
    def __init__(self, account, token):
        if not account or not token or not re.fullmatch(r"[0-9a-fA-F]{32}", account): raise Error("Cloudflare credentials unavailable")
        self.account, self.token = account, token
        self.opener = build_opener(NoRedirect())
    def fetch(self, address, maximum=MAX_SOURCE_BYTES):
        try:
            with self.opener.open(Request(address, headers={"User-Agent": "DoveBevoMenuAudit/1"}), timeout=20) as response:
                raw = response.read(maximum + 1)
            if len(raw) > maximum: raise Error("response exceeds limit")
            return raw
        except Exception: raise Error("public source fetch failed") from None
    def provider_get(self, suffix):
        endpoint = f"https://api.cloudflare.com/client/v4/accounts/{self.account}" + suffix
        try:
            request = Request(endpoint, headers={"Authorization": "Bearer " + self.token})
            with self.opener.open(request, timeout=30) as response:
                raw = response.read(2 * 1024 * 1024 + 1)
            if len(raw) > 2 * 1024 * 1024: raise Error("provider response too large")
            payload = strict_json(raw)
            if not isinstance(payload, dict) or payload.get("success") is not True: raise Error("provider read failed")
            return payload.get("result")
        except Exception:
            raise Error("provider binding attestation failed") from None
    def attest_binding(self):
        settings = self.provider_get("/workers/scripts/dovebevo-staging/settings")
        domains = self.provider_get("/workers/domains?hostname=www.dovebevo.com&service=dovebevo-staging")
        database = self.provider_get("/d1/database/" + DATABASE + "?fields=uuid,name")
        bindings = settings.get("bindings") if isinstance(settings, dict) else None
        if not isinstance(bindings, list) or sum(isinstance(b, dict) and b.get("name") == "DB" and b.get("type") == "d1" and b.get("id") == DATABASE for b in bindings) != 1:
            raise Error("provider binding attestation failed")
        if not isinstance(domains, list) or not any(isinstance(d, dict) and d.get("hostname") == "www.dovebevo.com" and d.get("service") == "dovebevo-staging" and d.get("environment") == "production" and d.get("enabled") is not False for d in domains):
            raise Error("provider binding attestation failed")
        if not isinstance(database, dict) or database.get("uuid") != DATABASE or database.get("name") != "dovebevo-staging":
            raise Error("provider binding attestation failed")
        return {"domain": "www.dovebevo.com", "worker": "dovebevo-staging", "database": DATABASE, "binding": "DB", "name": "dovebevo-staging", "environment": "production", "verified": True}
    def query(self, sql, params):
        endpoint = f"https://api.cloudflare.com/client/v4/accounts/{self.account}/d1/database/{DATABASE}/query"
        body = json.dumps({"sql": sql, "params": params}).encode()
        try:
            request = Request(endpoint, data=body, headers={"Authorization": "Bearer " + self.token, "Content-Type": "application/json"}, method="POST")
            with self.opener.open(request, timeout=30) as response: payload = strict_json(response.read(2*1024*1024 + 1))
            if not payload.get("success") or len(payload.get("result", [])) != 1 or not payload["result"][0].get("success"): raise Error("D1 query failed")
            rows = payload["result"][0].get("results")
            if not isinstance(rows, list): raise Error("D1 response invalid")
            return rows
        except Exception: raise Error("D1 query failed") from None

def run(raw, transport, apply=False, approved=None):
    doc = validate(raw)
    manifest_hash = hashlib.sha256(raw).hexdigest()
    if apply and (not isinstance(approved, str) or not re.fullmatch(r"[0-9a-f]{64}", approved) or approved != manifest_hash): raise Error("manifest approval hash mismatch")
    health = strict_json(transport.fetch(SITE + "/api/health", 65536))
    if not isinstance(health, dict) or health.get("status") != "ok" or health.get("data_version") != doc["data_version"]: raise Error("public site version mismatch")
    cells, sources = {}, {}
    for r in doc["records"]:
        if r["cell"] not in cells:
            cells[r["cell"]] = strict_json(transport.fetch(SITE + "/data/" + doc["data_version"] + "/v/" + r["cell"] + ".json"))
        data = cells[r["cell"]]
        if not isinstance(data, dict) or not isinstance(data.get("v"), list): raise Error("invalid live cell")
        found = [v for v in data["v"] if isinstance(v, list) and len(v) == 7 and v[0] == r["venue_key"]]
        if len(found) != 1 or found[0][1] != r["name"] or type(found[0][2]) is not int or found[0][2] not in range(5) or found[0][3:5] != [r["lat"], r["lon"]]: raise Error("live catalogue identity mismatch")
        city_index = found[0][6]
        if type(city_index) is not int or city_index < -1 or not isinstance(data.get("c"), list) or city_index >= len(data["c"]): raise Error("invalid catalogue city")
        if city_index >= 0 and (not isinstance(data["c"][city_index], list) or len(data["c"][city_index]) != 2 or type(data["c"][city_index][0]) is not int): raise Error("invalid catalogue city")
        expected_city = None if city_index == -1 else data["c"][city_index][0]
        if expected_city != r["city"]: raise Error("catalogue city mismatch")
        source_format = r.get("source_format", "raw")
        source_key = (r["source_url"], source_format)
        if source_key not in sources: sources[source_key] = source_digest(transport.fetch(r["source_url"]), source_format)
        if sources[source_key] != r["source_sha256"]: raise Error("source hash mismatch")
    attestation = transport.attest_binding()
    expected_attestation = {"domain": "www.dovebevo.com", "worker": "dovebevo-staging", "database": DATABASE, "binding": "DB", "name": "dovebevo-staging", "environment": "production", "verified": True}
    if attestation != expected_attestation: raise Error("provider binding attestation failed")
    receipt = {"binding_attestation": expected_attestation, "schema_version": 1, "batch_id": doc["batch_id"], "manifest_sha256": manifest_hash, "mode": "apply" if apply else "dry_run", "provenance": "online_menu", "complete": False, "records": [], "cache_invalidated": [], "errors": []}
    affected = set()
    for r in doc["records"]:
        key = [r["venue_key"], r["drink"], r["hh"]]
        result = {"venue_key": key[0], "drink": key[1], "hh": key[2], "before": None, "after": None, "outcome": "not_attempted"}
        receipt["records"].append(result)
        try:
            result["before"] = transport.query(PRESENCE, key)[0]
            current = transport.query(CURRENT, key)
            if apply:
                # Add before sending: an interrupted request may have committed.
                previously_affected = r["cell"] in affected
                affected.add(r["cell"])
                result["outcome"] = "indeterminate"
                inserted = transport.query(INSERT, key + [r["cell"], r["city"], r["cents"], doc["checked_on"]])
                if len(inserted) > 1: raise Error("unexpected insert response")
                result["outcome"] = "inserted" if inserted else "skipped_existing_or_guarded"
                # Keep invalidation for matching existing manual rows on reruns.
                if not inserted and not any(c.get("source") == "manual" and c.get("cell") == r["cell"] and c.get("price_cents") == r["cents"] and c.get("observed_on") == doc["checked_on"] for c in current):
                    if not previously_affected:
                        affected.discard(r["cell"])
            else:
                result["outcome"] = "eligible_at_read" if not any(result["before"].values()) else "guarded_at_read"
            result["before_current"] = current
            result["after"] = transport.query(PRESENCE, key)[0]
            result["after_current"] = transport.query(CURRENT, key)
        except Exception:
            receipt["errors"].append("record_operation_failed")
            break
    if apply:
        for cell in sorted(affected):
            try:
                transport.query(INVALIDATE, [cell])
                receipt["cache_invalidated"].append(cell)
            except Exception:
                receipt["errors"].append("cache_invalidation_failed")
    receipt["complete"] = not receipt["errors"] and len(receipt["records"]) == len(doc["records"])
    return receipt

def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--receipt", required=True, help="new receipt path")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--approved-sha256")
    args = parser.parse_args(argv)
    try:
        with Path(args.manifest).open("rb") as f: raw = f.read(1024*1024 + 1)
        validate(raw)
        if args.apply and args.approved_sha256 != hashlib.sha256(raw).hexdigest(): raise Error("manifest approval hash mismatch")
        # Reserve the receipt before any query or mutation; never overwrite.
        with Path(args.receipt).open("x", encoding="utf-8") as output:
            transport = Transport(os.environ.get("CLOUDFLARE_ACCOUNT_ID"), os.environ.get("CLOUDFLARE_API_TOKEN"))
            result = run(raw, transport, args.apply, args.approved_sha256)
            json.dump(result, output, sort_keys=True, ensure_ascii=False)
            output.write("\n")
        print(json.dumps({"complete": result["complete"], "mode": result["mode"], "manifest_sha256": result["manifest_sha256"]}))
        return 0 if result["complete"] else 2
    except (Error, OSError, ValueError):
        print("importer: validation, transport or receipt failure", file=sys.stderr)
        return 2

if __name__ == "__main__": sys.exit(main())
