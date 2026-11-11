"""Bounded one-off OSM menu-link discovery. Never accepts or publishes prices."""
import argparse
from datetime import date
import ipaddress
import json
import math
import re
import time
import unicodedata
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler

from inventory_city_prices import city_cells, places

ORIGIN = "https://www.dovebevo.com"
CORE = "https://api.openstreetmap.org"
CELLS = {"u0nd9": 62505581, "sr2yk": 72959652, "u0j2q": 63621589, "sr60k": 428339558}
OSM_TYPES = {"n": ("node", "nodes"), "w": ("way", "ways"), "r": ("relation", "relations")}
TAGS = frozenset(("website", "contact:website", "website:menu", "contact:menu", "menu"))
LIMIT = 2 * 1024 * 1024
UA = "DoveBevo-OneOff-MenuDiscovery/1.0 (https://www.dovebevo.com)"

class Invalid(ValueError):
    pass

def text(value, cap=255):
    return isinstance(value, str) and 0 < len(value) <= cap and not any(ord(c) < 32 or ord(c) == 127 for c in value)

def finite(value):
    return type(value) in (int, float) and math.isfinite(value)

def name_key(value):
    return " ".join(unicodedata.normalize("NFKC", value).casefold().split())

def safe_link(value):
    if not text(value, 2048) or any(c.isspace() for c in value) or "\\" in value:
        raise Invalid("invalid_url")
    parts = urlsplit(value)
    try: port = parts.port
    except ValueError: raise Invalid("invalid_port") from None
    host = parts.hostname
    if parts.scheme not in ("http", "https") or not host or parts.username is not None or parts.password is not None:
        raise Invalid("invalid_url")
    if port not in (None, 80 if parts.scheme == "http" else 443):
        raise Invalid("nonstandard_port")
    host = host.rstrip(".").lower()
    if "%" in host or host in ("localhost", "localhost.localdomain") or host.endswith((".local", ".localhost", ".internal")):
        raise Invalid("private_host")
    try: address = ipaddress.ip_address(host)
    except ValueError:
        try: ascii_host = host.encode("idna").decode("ascii")
        except UnicodeError: raise Invalid("invalid_host") from None
        if "." not in ascii_host or not all(re.fullmatch(r"(?!-)[a-z0-9-]{1,63}(?<!-)", part) for part in ascii_host.split(".")):
            raise Invalid("invalid_host")
        if not re.search(r"[a-z]", ascii_host.rsplit(".", 1)[-1]):
            raise Invalid("ambiguous_numeric_host")
    else:
        if not address.is_global: raise Invalid("private_host")
    return value

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args): return None

def request_allowed(value):
    try:
        parts = urlsplit(value)
        if parts.fragment or parts.username is not None or parts.password is not None or parts.port is not None or parts.scheme != "https":
            return False
        if parts.netloc == "www.dovebevo.com":
            return not parts.query and (parts.path == "/api/health" or bool(re.fullmatch(r"/data/[0-9]{8}/(?:places|v/[0123456789bcdefghjkmnpqrstuvwxyz]{5})\.json", parts.path)))
        match = re.fullmatch(r"/api/0\.6/(nodes|ways|relations)\.json", parts.path)
        return (parts.netloc == "api.openstreetmap.org" and match is not None
                and bool(re.fullmatch(match[1] + r"=[1-9][0-9]*(?:,[1-9][0-9]*){0,99}", parts.query)))
    except ValueError: return False

def get_json(value):
    if not request_allowed(value): raise Invalid("request_not_allowed")
    request = Request(value, headers={"User-Agent": UA, "Accept": "application/json"})
    with build_opener(NoRedirect()).open(request, timeout=20) as response:
        if response.status != 200: raise Invalid("http_status")
        kind = response.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
        size = response.headers.get("Content-Length")
        if size and (not size.isdecimal() or int(size) > LIMIT): raise Invalid("body_limit")
        raw = response.read(LIMIT + 1)
        if len(raw) > LIMIT: raise Invalid("body_limit")
    if kind == "text/html" and re.fullmatch(r"/data/[0-9]{8}/v/[0123456789bcdefghjkmnpqrstuvwxyz]{5}\.json", urlsplit(value).path):
        # The published site serves its exact app shell for an unpopulated cell.
        if raw.lstrip().lower().startswith(b"<!doctype html>") and b"<title>Dove bevo</title>" in raw:
            return {"c": [], "v": []}
    if kind not in ("application/json", "text/json"): raise Invalid("not_json")
    def unique(pairs):
        result = {}
        for key, item in pairs:
            if key in result: raise Invalid("duplicate_json_key")
            result[key] = item
        return result
    def reject(_): raise Invalid("nonfinite_json")
    return json.loads(raw.decode("utf-8"), object_pairs_hook=unique, parse_constant=reject)

def version_from(health):
    if not isinstance(health, dict) or health.get("status") != "ok" or not isinstance(health.get("data_version"), str) or not re.fullmatch(r"[0-9]{8}", health["data_version"]):
        raise Invalid("health_unavailable")
    return health["data_version"]

def catalogue_rows(doc, cell):
    if not isinstance(doc, dict) or not isinstance(doc.get("c"), list) or not isinstance(doc.get("v"), list):
        raise Invalid("bad_catalogue")
    cities = doc["c"]
    for city in cities:
        if not isinstance(city, list) or len(city) != 2 or type(city[0]) is not int or city[0] <= 0 or not text(city[1]):
            raise Invalid("bad_city")
    out, seen = [], set()
    for row in doc["v"]:
        if (not isinstance(row, list) or len(row) != 7 or not text(row[0]) or not re.fullmatch(r"[nwr][1-9][0-9]{0,14}", row[0])
                or row[0] in seen or not text(row[1]) or type(row[2]) is not int or row[2] not in range(5)
                or not finite(row[3]) or not -90 <= row[3] <= 90 or not finite(row[4]) or not -180 <= row[4] <= 180
                or not isinstance(row[5], str) or len(row[5]) > 1024 or type(row[6]) is not int or not -1 <= row[6] < len(cities)):
            raise Invalid("bad_catalogue_row")
        seen.add(row[0])
        city_id, city = (None, None) if row[6] == -1 else cities[row[6]]
        out.append(dict(key=row[0], name=row[1], kind=row[2], lat=row[3], lon=row[4], address=row[5], cell=cell, cityID=city_id, city=city))
    return out

def select_rows(rows, maximum):
    if type(maximum) is not int or not 1 <= maximum <= 1000: raise Invalid("bad_max_venues")
    ordered = sorted(rows, key=lambda row: (row["key"][0], int(row["key"][1:])))
    if len(ordered) <= maximum: return ordered
    # A bounded sample must not silently drop ways and relations behind nodes.
    first = [next(row for row in ordered if row["key"].startswith(prefix))
             for prefix in OSM_TYPES if any(row["key"].startswith(prefix) for row in ordered)][:maximum]
    remaining = [row for row in ordered if row not in first]
    count = maximum - len(first)
    return sorted(first + [remaining[i * len(remaining) // count] for i in range(count)],
                  key=lambda row: (row["key"][0], int(row["key"][1:])))

def joined(refs, doc):
    if not isinstance(doc, dict) or not isinstance(doc.get("elements"), list): raise Invalid("bad_osm_response")
    expected = {row["key"]: row for row in refs}
    if len(expected) != len(refs): raise Invalid("duplicate_requested_id")
    elements = {}
    for item in doc["elements"]:
        if not isinstance(item, dict) or item.get("type") not in ("node", "way", "relation") or type(item.get("id")) is not int: raise Invalid("bad_osm_element")
        key = next(prefix for prefix, value in OSM_TYPES.items() if value[0] == item["type"]) + str(item["id"])
        if key not in expected or key in elements: raise Invalid("unexpected_or_duplicate_osm_id")
        elements[key] = item
    out = []
    for key, row in expected.items():
        result = dict(row, state="held", reason="missing_osm_element")
        item = elements.get(key)
        if item is None: out.append(result); continue
        if item.get("visible") is False: result["reason"] = "deleted_osm_element"; out.append(result); continue
        tags = item.get("tags", {})
        if not isinstance(tags, dict): raise Invalid("bad_osm_tags")
        name = tags.get("name")
        if not text(name): result["reason"] = "missing_osm_name"; out.append(result); continue
        result.update(osm_name=name, name_agreement=name_key(name) == name_key(row["name"]))
        if not result["name_agreement"]: result["reason"] = "changed_osm_name"; out.append(result); continue
        if key.startswith("n"):
            if not finite(item.get("lat")) or not finite(item.get("lon")): result["reason"] = "missing_osm_coordinates"; out.append(result); continue
            if abs(item["lat"] - row["lat"]) > 0.000011 or abs(item["lon"] - row["lon"]) > 0.000011:
                result["reason"] = "changed_osm_coordinates"; out.append(result); continue
            result["geometry_state"] = "node_coordinates_match_catalogue"
        else:
            # OSM's multi-fetch omits geometry for ways and relations. A menu lead
            # remains a review candidate, never an approved venue identity.
            result["geometry_state"] = "way_or_relation_geometry_not_checked"
        links, rejected = {}, []
        for tag in sorted(TAGS):
            if tag not in tags: continue
            try: links[tag] = safe_link(tags[tag])
            except (Invalid, ValueError): rejected.append(tag)
        result.update(url_tags=links, rejected_url_tags=rejected, state="candidate" if links else "held",
                      reason="unverified_primary_links" if links else "invalid_url_tags" if rejected else "no_url_tags")
        out.append(result)
    return out

def collect(max_nodes=25, fetch=get_json, sleep=time.sleep, full_city=False):
    version = version_from(fetch(ORIGIN + "/api/health"))
    refs = []
    if full_city:
        city_table = places(fetch(ORIGIN + "/data/" + version + "/places.json"))
        missing = set(CELLS.values()) - city_table.keys()
        if missing: raise Invalid("city_not_in_places")
        per_city = {city_id: [] for city_id in CELLS.values()}
        cells = sorted(set().union(*(set(city_cells(city_table[city_id][2], city_table[city_id][3])[1])
                                     for city_id in CELLS.values())))
        if len(cells) > 400: raise Invalid("city_cell_limit")
        for cell in cells:
            rows = catalogue_rows(fetch(ORIGIN + "/data/" + version + "/v/" + cell + ".json"), cell)
            for row in rows:
                if row["cityID"] in per_city: per_city[row["cityID"]].append(row)
        if any(len(per_city[city_id]) != city_table[city_id][4] for city_id in CELLS.values()):
            raise Invalid("city_count_mismatch")
        for city_id in CELLS.values(): refs.extend(select_rows(per_city[city_id], max_nodes))
    else:
        for cell, city_id in CELLS.items():
            rows = catalogue_rows(fetch(ORIGIN + "/data/" + version + "/v/" + cell + ".json"), cell)
            refs.extend(select_rows([row for row in rows if row["cityID"] == city_id], max_nodes))
    if len({row["key"] for row in refs}) != len(refs): raise Invalid("cross_cell_duplicate_id")
    results = []
    batches = [(prefix, group[offset:offset + 100])
               for prefix in OSM_TYPES
               for group in [[row for row in refs if row["key"].startswith(prefix)]]
               for offset in range(0, len(group), 100)]
    for index, (prefix, batch) in enumerate(batches):
        if index: sleep(1.1)
        try:
            plural = OSM_TYPES[prefix][1]
            results.extend(joined(batch, fetch(CORE + "/api/0.6/" + plural + ".json?" + plural + "=" + ",".join(row["key"][1:] for row in batch))))
        except (OSError, Invalid, ValueError):
            results.extend(dict(row, state="held", reason="osm_batch_unavailable") for row in batch)
            results.extend(dict(row, state="held", reason="not_requested_after_batch_failure")
                           for _, pending in batches[index + 1:] for row in pending)
            break
    if version_from(fetch(ORIGIN + "/api/health")) != version: raise Invalid("catalogue_version_changed")
    return dict(schema=1, purpose="one_off_menu_discovery", catalogue_version=version,
                scope="four_full_city_cell_sets" if full_city else "four_city_centre_cells",
                inventory_complete=(full_city and all(len([r for r in refs if r["cityID"] == city_id]) < max_nodes
                                                     for city_id in CELLS.values())
                                    and not any(r.get("reason") in ("osm_batch_unavailable", "not_requested_after_batch_failure")
                                                for r in results)),
                requested=len(refs),
                candidates=sum(row["state"] == "candidate" for row in results), held=sum(row["state"] == "held" for row in results), records=results)

def crawler_queue(report, checked_on=None):
    if report.get("schema") != 1 or not isinstance(report.get("records"), list): raise Invalid("bad_discovery_report")
    candidates = [row for row in report["records"] if row.get("state") == "candidate"]
    return dict(schema_version=1, purpose="review_only_existing_italian_venues",
                checked_on=(checked_on or date.today()).isoformat(), catalogue_version=report["catalogue_version"],
                inventory_complete=report["inventory_complete"], source_candidates=len(candidates),
                candidates=candidates)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--max-venues-per-city", "--max-nodes-per-city", type=int, default=25, choices=range(1, 1001))
    parser.add_argument("--full-city", action="store_true", help="read all mapped cells in the four Italian city areas")
    parser.add_argument("--crawler-queue", action="store_true", help="print a review-only input queue for the owner-menu crawler")
    args = parser.parse_args()
    report = collect(args.max_venues_per_city, full_city=args.full_city)
    print(json.dumps(crawler_queue(report) if args.crawler_queue else report, ensure_ascii=True, separators=(",", ":")))

if __name__ == "__main__": main()
