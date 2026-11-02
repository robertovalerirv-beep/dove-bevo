"""Offline identity join. Never creates a venue from a name guess or writes a price."""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
from difflib import SequenceMatcher
import hashlib
import json
import math
from pathlib import Path
import re
import unicodedata
from urllib.parse import urlsplit

CITIES = {
    "london": ("London", "GB", "GBP", 51.5074, -.1278),
    "paris": ("Paris", "FR", "EUR", 48.8566, 2.3522),
    "madrid": ("Madrid", "ES", "EUR", 40.4168, -3.7038),
    "berlin": ("Berlin", "DE", "EUR", 52.52, 13.405),
    "milano": ("Milano", "IT", "EUR", 45.4642, 9.19),
    "roma": ("Roma", "IT", "EUR", 41.9028, 12.4964),
    "torino": ("Torino", "IT", "EUR", 45.0703, 7.6869),
    "firenze": ("Firenze", "IT", "EUR", 43.7696, 11.2558),
}
KINDS = {"bar": 1, "pub": 2, "biergarten": 3, "nightclub": 4}

def supported_name(value):
    if not isinstance(value, str) or not value.strip():
        return False
    try:
        units = len(value.encode("utf-16-le", errors="strict")) // 2
    except UnicodeEncodeError:
        return False
    return 2 <= units <= 120 and not any(ord(c) < 32 or 127 <= ord(c) <= 159 for c in value)

def normalized(name):
    return "".join(c for c in unicodedata.normalize("NFKD", name).casefold() if c.isalnum() and not unicodedata.combining(c))

def website(value):
    if not isinstance(value, str) or len(value) > 2048:
        return None
    try:
        url = urlsplit(value)
        if url.scheme not in {"http", "https"} or not url.hostname or url.username or url.password or url.fragment:
            return None
        host = url.hostname.lower().removeprefix("www.")
        if not re.fullmatch(r"[a-z0-9.-]+", host) or host in {"instagram.com", "facebook.com", "linktr.ee", "google.com"}:
            return None
        return host + url.path.rstrip("/")
    except ValueError:
        return None

def metres(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    value = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2
    return 6371000 * 2 * math.asin(math.sqrt(min(1, value)))

def geohash(lat, lon):
    south, north, west, east = -90., 90., -180., 180.
    value, result = 0, ""
    for bit in range(25):
        longitude = bit % 2 == 0
        middle = (west+east)/2 if longitude else (south+north)/2
        high = (lon if longitude else lat) >= middle
        value = (value << 1) | int(high)
        if longitude:
            if high: west = middle
            else: east = middle
        elif high: south = middle
        else: north = middle
        if bit % 5 == 4:
            result += "0123456789bcdefghjkmnpqrstuvwxyz"[value]
            value = 0
    return result

def coordinates(obj):
    point = obj.get("center", obj)
    values = point.get("lat"), point.get("lon")
    if not all(type(n) in (float, int) and math.isfinite(n) for n in values):
        return None
    if not (-90 <= values[0] <= 90 and -180 <= values[1] <= 180):
        return None
    return values

def join_city(slug, provider, osm, today):
    city, country, currency, lat, lon = CITIES[slug]
    if provider.get("provider") != "firecrawl-maps" or provider.get("capability") != "businesses/search":
        raise ValueError("Unrecognized business source")
    observed = provider.get("observed_at_ms")
    if type(observed) is not int:
        raise ValueError("Missing source observation timestamp")
    checked = datetime.fromtimestamp(observed / 1000, timezone.utc).date()
    if not 0 <= (today-checked).days <= 7:
        raise ValueError("Review counts need a fresh nonfuture source")
    if provider.get("country") != country or provider.get("currency") != currency or provider.get("city") != city:
        raise ValueError("Business city or currency identity mismatch")
    if osm.get("remark") or not isinstance(osm.get("elements"), list):
        raise ValueError("Partial OSM response")
    accepted, held = [], []
    for business in provider["venues"]:
        name = business.get("name")
        count = business.get("review_count")
        point = coordinates({"lat": business.get("latitude"), "lon": business.get("longitude")})
        if type(count) is not int or count <= 100 or not isinstance(name, str) or not point or metres(point, (lat, lon)) > 40000:
            held.append({"name": name, "reason": "review threshold or location identity"})
            continue
        feature = business.get("feature_id", "")
        if not re.fullmatch(r"0x[0-9a-fA-F]{1,16}:0x[0-9a-fA-F]{1,16}", feature):
            held.append({"name": name, "reason": "missing Maps business identity"})
            continue
        matches = []
        for element in osm["elements"]:
            tags, location = element.get("tags", {}), coordinates(element)
            other = tags.get("name")
            if not location or not isinstance(other, str) or tags.get("amenity") not in KINDS:
                continue
            distance = metres(point, location)
            exact = normalized(name) == normalized(other)
            domain = website(business.get("website"))
            same_site = domain is not None and domain == website(tags.get("website") or tags.get("contact:website"))
            similar = SequenceMatcher(None, normalized(name), normalized(other)).ratio() >= .8
            if (exact and distance <= 60) or (same_site and similar and distance <= 40):
                matches.append((element, location, distance, "exact name" if exact else "official website plus similar name"))
        if len(matches) != 1:
            held.append({"name": name, "reason": "ambiguous OSM identity" if matches else "no corroborated OSM identity", "matches": len(matches)})
            continue
        element, location, distance, match = matches[0]
        prefix = {"node": "n", "way": "w", "relation": "r"}.get(element.get("type"))
        identity = element.get("id")
        if not prefix or type(identity) is not int or not 0 < identity <= 999999999999999:
            raise ValueError("Invalid OSM identity")
        name = element["tags"]["name"]
        if not supported_name(name):
            held.append({"name": name, "reason": "unsupported catalogue name"})
            continue
        latitude, longitude = (round(value, 5) for value in location)
        venue = {"key": prefix+str(identity), "name": name, "kind": KINDS[element["tags"]["amenity"]], "lat": latitude, "lon": longitude, "cell": geohash(latitude, longitude), "city": city, "country": country, "currency": currency, "google": {"url": "https://www.google.com/maps?cid="+str(int(feature.split(":")[1], 16)), "review_count": count, "checked_on": checked.isoformat()}}
        accepted.append((venue, {"key": venue["key"], "business_name": business["name"], "match": match, "distance_m": round(distance, 2), "official_website": business.get("website"), "osm_url": f"https://www.openstreetmap.org/{element['type']}/{identity}", "osm_timestamp": osm.get("osm3s", {}).get("timestamp_osm_base")}))
    keys = [v[0]["key"] for v in accepted]
    duplicates = {k for k in keys if keys.count(k) > 1}
    for venue, evidence in accepted:
        if venue["key"] in duplicates:
            held.append({"name": evidence["business_name"], "reason": "duplicate Maps listings for one OSM venue"})
    return [v for v in accepted if v[0]["key"] not in duplicates], held

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--inputs", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    args = parser.parse_args()
    rows, evidence, held = [], [], {}
    for slug in CITIES:
        provider, osm = args.inputs / (slug+".json"), args.inputs / (slug+"-osm.json")
        if not provider.exists() or not osm.exists():
            held[slug] = [{"reason": "missing complete business or OSM snapshot"}]
            continue
        accepted, held[slug] = join_city(slug, json.loads(provider.read_bytes()), json.loads(osm.read_bytes()), datetime.now(timezone.utc).date())
        for venue, proof in accepted:
            if any(row["key"] == venue["key"] for row in rows):
                raise ValueError("Cross-city duplicate OSM identity requires review")
            rows.append(venue)
            evidence.append({**proof, "provider_sha256": hashlib.sha256(provider.read_bytes()).hexdigest(), "osm_sha256": hashlib.sha256(osm.read_bytes()).hexdigest()})
    rows.sort(key=lambda row: (row["country"], row["city"], row["key"]))
    version = hashlib.sha256(json.dumps(rows, sort_keys=True, separators=(",", ":")).encode()).hexdigest()[:16]
    for path, value in [(args.output, {"schema_version": 1, "version": version, "venues": rows}), (args.evidence, {"schema_version": 1, "catalogue_version": version, "accepted": evidence, "held": held})]:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value, ensure_ascii=False, indent=2)+"\n", encoding="utf-8", newline="\n")
    print(json.dumps({"version": version, "accepted": len(rows), "held": {slug: len(items) for slug, items in held.items()}}))

if __name__ == "__main__":
    main()
