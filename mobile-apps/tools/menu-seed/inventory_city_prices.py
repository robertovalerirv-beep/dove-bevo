"""Bounded, read-only inventory of existing public Italian catalogue prices.

Catalogue cities mean nearest OSM city/town within 15 km, not municipal borders.
No authentication, writes, redirects, retries, menu discovery or eligibility claims.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
import json
import math
import re
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

ORIGIN = "https://www.dovebevo.com"
DEFAULT_CITIES = (62505581, 72959652, 63621589, 428339558)
DRINKS = ("beer_draft", "wine_glass", "spritz", "negroni", "sbagliato",
          "gin_tonic", "gin_lemon", "alcohol_free", "water")
LIMIT = 2 * 1024 * 1024
TIMEOUT = 20
MAX_CELLS = 100
MAX_CITIES = 4
WORKERS = 3
CELL = r"[0-9b-hjkmnp-z]{5}"
KEY = r"[nwr][1-9][0-9]*"
STEP = 360 / 8192


class Invalid(ValueError):
    pass


def integer(value, low=0, high=100_000):
    return type(value) is int and low <= value <= high


def finite(value):
    return type(value) in (int, float) and math.isfinite(value)


def text(value, cap=255, empty=False):
    return (isinstance(value, str) and (empty or bool(value)) and len(value) <= cap
            and not any(ord(c) < 32 or ord(c) == 127 for c in value))


def coordinates(lat, lon):
    return finite(lat) and finite(lon) and 35 <= lat <= 47.5 and 6 <= lon <= 19


def geohash(lat, lon):
    boxes, bits = [[-180., 180.], [-90., 90.]], []
    for i in range(25):
        axis = i % 2
        middle = sum(boxes[axis]) / 2
        high = (lon if axis == 0 else lat) >= middle
        bits.append(int(high))
        boxes[axis][0 if high else 1] = middle
    alphabet = "0123456789bcdefghjkmnpqrstuvwxyz"
    return "".join(alphabet[sum(bits[i+j] << (4-j) for j in range(5))]
                   for i in range(0, 25, 5))


def city_cells(lat, lon):
    if not coordinates(lat, lon):
        raise Invalid("invalid_city_coordinates")
    # Original import rounds venue coordinates to 5 decimals after assignment.
    # Ten extra metres conservatively cover that sub-metre rounding displacement.
    angle = 15.01 / 6371
    latitude = math.degrees(angle)
    longitude = math.degrees(math.asin(math.sin(angle) / math.cos(math.radians(lat))))
    bounds = dict(south=lat-latitude, north=lat+latitude,
                  west=lon-longitude, east=lon+longitude)
    south = math.floor((bounds["south"] + 90) / STEP)
    north = math.floor((bounds["north"] + 90) / STEP)
    west = math.floor((bounds["west"] + 180) / STEP)
    east = math.floor((bounds["east"] + 180) / STEP)
    if (north-south+1) * (east-west+1) > MAX_CELLS:
        raise Invalid("city_cell_limit")
    cells = sorted(geohash((i+.5)*STEP-90, (j+.5)*STEP-180)
                   for i in range(south, north+1) for j in range(west, east+1))
    return bounds, cells


def allowed_url(url):
    if not isinstance(url, str) or not url.startswith(ORIGIN + "/") or any(c.isspace() or ord(c) < 32 for c in url):
        return False
    try:
        parts = urlsplit(url)
        return (parts.scheme == "https" and parts.netloc == "www.dovebevo.com"
                and parts.username is None and parts.password is None
                and not parts.query and not parts.fragment
                and bool(re.fullmatch(r"/api/health|/api/prices/" + CELL
                                     + r"|/data/[0-9]{8}/places\.json|/data/[0-9]{8}/v/"
                                     + CELL + r"\.json", parts.path)))
    except ValueError:
        return False


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise Invalid("duplicate_json_field")
        result[key] = value
    return result


def public_json(url):
    if not allowed_url(url):
        raise Invalid("request_not_allowed")
    # Disable environment proxies; no ambient proxy credentials or cookie handlers.
    opener = build_opener(ProxyHandler({}), NoRedirect())
    request = Request(url, headers={"Accept": "application/json"}, method="GET")
    with opener.open(request, timeout=TIMEOUT) as response:
        if response.status != 200 or response.geturl() != url:
            raise Invalid("unexpected_http_response")
        if response.headers.get_content_type() != "application/json":
            raise Invalid("non_json_response")
        raw = response.read(LIMIT + 1)
    if len(raw) > LIMIT:
        raise Invalid("body_limit")
    return json.loads(raw.decode("utf-8"), object_pairs_hook=unique_object,
                      parse_constant=lambda _: (_ for _ in ()).throw(Invalid("nonfinite_json")))


def version(doc):
    if not isinstance(doc, dict) or not isinstance(doc.get("data_version"), str) or not re.fullmatch(r"[0-9]{8}", doc["data_version"]):
        raise Invalid("invalid_health_version")
    return doc["data_version"]


def places(doc):
    if not isinstance(doc, list) or len(doc) > 20_000:
        raise Invalid("invalid_places")
    result = {}
    for row in doc:
        if (not isinstance(row, list) or len(row) != 5 or not integer(row[0], 1, 10**15)
                or not text(row[1]) or not coordinates(row[2], row[3])
                or not integer(row[4]) or row[0] in result):
            raise Invalid("invalid_place_row")
        result[row[0]] = row
    return result


def cell_venues(doc, cell):
    errors, result = [], {}
    if not isinstance(doc, dict) or not isinstance(doc.get("c"), list) or not isinstance(doc.get("v"), list):
        return result, ["invalid_cell_file"]
    cities = doc["c"]
    if any(not isinstance(c, list) or len(c) != 2 or not integer(c[0], 1, 10**15)
           or not text(c[1]) for c in cities) or len({c[0] for c in cities}) != len(cities):
        return result, ["invalid_cell_city_table"]
    for index, row in enumerate(doc["v"]):
        if (not isinstance(row, list) or len(row) != 7 or not isinstance(row[0], str)
                or not re.fullmatch(KEY, row[0]) or not text(row[1], 120)
                or not integer(row[2], 0, 4) or not coordinates(row[3], row[4])
                or not text(row[5], empty=True) or not integer(row[6], -1, len(cities)-1)
                or geohash(row[3], row[4]) != cell):
            errors.append(f"invalid_venue_row:{index}")
            continue
        if row[0] in result:
            errors.append(f"duplicate_venue_key:{row[0]}")
            continue
        result[row[0]] = {"key": row[0], "name": row[1], "kind": row[2],
                          "lat": row[3], "lon": row[4], "address": row[5],
                          "city": cities[row[6]][0] if row[6] >= 0 else 0, "cell": cell}
    return result, errors


def cell_prices(doc):
    if (not isinstance(doc, dict) or not isinstance(doc.get("p"), list)
            or not isinstance(doc.get("h"), list)):
        return [], set(), ["invalid_prices_file"]
    errors, rows, hidden, seen = [], [], set(), set()
    for key in doc["h"]:
        if not isinstance(key, str) or not re.fullmatch(KEY, key):
            errors.append("invalid_hidden_key")
        else:
            hidden.add(key)
    for index, row in enumerate(doc["p"]):
        valid = (isinstance(row, list) and len(row) == 7 and isinstance(row[0], str)
                 and bool(re.fullmatch(KEY, row[0])) and row[1] in DRINKS
                 and integer(row[2], 0, 1) and integer(row[3])
                 and isinstance(row[4], str) and bool(re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", row[4]))
                 and integer(row[5]) and integer(row[6], 0, 1))
        if valid:
            try:
                date.fromisoformat(row[4])
            except ValueError:
                valid = False
        if not valid:
            # User prices are outside this inventory, not malformed OSM evidence.
            if isinstance(row, list) and row and isinstance(row[0], str) and re.fullmatch(r"u[1-9][0-9]*", row[0]):
                continue
            errors.append(f"invalid_price_row:{index}")
            continue
        identity = tuple(row[:3])
        if identity in seen:
            errors.append(f"duplicate_price_tuple:{index}")
            continue
        seen.add(identity)
        if row[6] == 0:
            rows.append(row)
    return rows, hidden, errors


def inventory(city_ids=DEFAULT_CITIES, fetch=public_json):
    if (not city_ids or len(city_ids) > MAX_CITIES or len(set(city_ids)) != len(city_ids)
            or any(not integer(x, 1, 10**15) for x in city_ids)):
        raise Invalid("invalid_city_selection")
    result = {"schema_version": 1, "checked_at": datetime.now(timezone.utc).isoformat(),
              "scope": "existing static OSM catalogue nearest city within 15 km",
              "remaining_menu_eligible": None, "complete": False, "errors": [], "cities": []}

    def read(path):
        try:
            return fetch(ORIGIN + path), None
        except Exception:
            # Do not print arbitrary exception strings, request headers or credentials.
            return None, "fetch_or_json_error"

    health, error = read("/api/health")
    try:
        start = version(health)
    except Invalid:
        result["errors"].append({"path": "/api/health", "error": error or "invalid_health_version"})
        return result
    result["data_version"] = start
    raw_places, error = read(f"/data/{start}/places.json")
    try:
        city_table = places(raw_places)
    except Invalid:
        result["errors"].append({"path": f"/data/{start}/places.json", "error": error or "invalid_places"})
        return result
    selections = {}
    for city_id in city_ids:
        if city_id not in city_table:
            result["errors"].append({"city": city_id, "error": "city_not_in_places"})
            continue
        row = city_table[city_id]
        bounds, cells = city_cells(row[2], row[3])
        selections[city_id] = set(cells)
        result["cities"].append({"city": city_id, "name": row[1], "center": row[2:4],
                                 "expected_static_venues": row[4], "bounds": bounds,
                                 "requested_cells": cells, "errors": [], "venues": []})
    all_cells = sorted(set().union(*selections.values()))
    static, prices_by_cell, errors_by_cell = {}, {}, {}
    with ThreadPoolExecutor(max_workers=WORKERS) as executor:
        for cell, (doc, error) in zip(all_cells, executor.map(lambda c: read(f"/data/{start}/v/{c}.json"), all_cells)):
            rows, errors = cell_venues(doc, cell) if not error else ({}, [error])
            static[cell], errors_by_cell[cell] = rows, errors
        locations = {}
        for cell in all_cells:
            for key in static[cell]:
                if key in locations:
                    errors_by_cell[cell].append(f"duplicate_cross_cell_key:{key}")
                    errors_by_cell[locations[key]].append(f"duplicate_cross_cell_key:{key}")
                else:
                    locations[key] = cell
        priced_cells = [c for c in all_cells if any(v["city"] in selections for v in static[c].values())]
        for cell, (doc, error) in zip(priced_cells, executor.map(lambda c: read(f"/api/prices/{c}"), priced_cells)):
            rows, hidden, errors = cell_prices(doc) if not error else ([], set(), [error])
            prices_by_cell[cell] = (rows, hidden)
            errors_by_cell[cell].extend(errors)
    finish, error = read("/api/health")
    try:
        end = version(finish)
    except Invalid:
        end = None
    result["final_data_version"] = end
    if end != start:
        result["errors"].append({"path": "/api/health", "error": error or "data_version_changed_or_invalid"})
    for city in result["cities"]:
        seen, by_drink, active_venues, active_rows, hidden_count = {}, {d: set() for d in DRINKS}, set(), 0, 0
        for cell in city["requested_cells"]:
            city["errors"].extend({"cell": cell, "error": e} for e in errors_by_cell[cell])
            rows, hidden = prices_by_cell.get(cell, ([], set()))
            for key, venue in static[cell].items():
                if venue["city"] != city["city"]:
                    continue
                if key in seen:
                    city["errors"].append({"cell": cell, "error": "duplicate_city_venue_key", "key": key})
                    continue
                seen[key] = venue
                own = [r for r in rows if r[0] == key and key not in hidden]
                venue = dict(venue, hidden=key in hidden if cell in prices_by_cell and not errors_by_cell[cell] else None,
                             price_read_complete=cell in prices_by_cell and not errors_by_cell[cell],
                             current_prices=own)
                city["venues"].append(venue)
                hidden_count += int(key in hidden)
                for price in own:
                    active_venues.add(key)
                    by_drink[price[1]].add(key)
                    active_rows += 1
        city["venues"].sort(key=lambda v: v["key"])
        city["valid_static_venues"] = len(seen)
        city["count_matches_places"] = len(seen) == city["expected_static_venues"]
        if not city["count_matches_places"]:
            city["errors"].append({"error": "catalogue_count_mismatch"})
        city.update(hidden_venues=hidden_count, current_priced_venues=len(active_venues),
                    current_price_rows=active_rows,
                    current_priced_venues_by_drink={d: len(keys) for d, keys in by_drink.items()},
                    complete=not city["errors"] and not result["errors"] and end == start)
    result["complete"] = (len(result["cities"]) == len(city_ids) and not result["errors"]
                          and all(c["complete"] for c in result["cities"]))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--city", action="append", type=int, help="OSM place ID, up to four; defaults to Milano Roma Torino Napoli")
    args = parser.parse_args()
    try:
        result = inventory(args.city or DEFAULT_CITIES)
    except Invalid as error:
        result = {"complete": False, "errors": [{"error": str(error)}]}
    print(json.dumps(result, ensure_ascii=False, allow_nan=False, sort_keys=True))
    return 0 if result["complete"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
