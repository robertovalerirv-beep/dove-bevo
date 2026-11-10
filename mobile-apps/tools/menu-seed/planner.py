#!/usr/bin/env python3
"""Bounded, offline menu evidence planner. No publication or import capability."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
from html.parser import HTMLParser
import ipaddress
import json
import math
from pathlib import Path, PurePosixPath
import re
import stat
import sys
import unicodedata
from urllib.parse import unquote, urlsplit


MAX_INPUT_BYTES = 2 * 1024 * 1024
MAX_FILE_BYTES = 8 * 1024 * 1024
MAX_TOTAL_BYTES = 64 * 1024 * 1024
MAX_TEXT = 2 * 1024 * 1024
MAX_SOURCES = 64
MAX_CELLS = 32
MAX_CANDIDATES = 64
MAX_ROWS = 512
LIMITS = {
    "beer_draft": (250, 1200), "spritz": (250, 1500),
    "negroni": (400, 2000), "sbagliato": (400, 2000),
    "gin_tonic": (400, 2000), "gin_lemon": (400, 2000),
    "wine_glass": (200, 1500), "alcohol_free": (200, 1200),
    "water": (50, 600),
}
REVIEW_LABEL = (r"(?:reviews?|recension(?:i|e)|avis|bewertungen?|"
                r"rezension(?:en)?|reseñas?|resenas?)")
REVIEW_COUNT_CANDIDATE = r"(?P<count>\d[\d., ]{0,24})"
REVIEW_COUNT_PATTERNS = (
    re.compile(rf"(?<![\d.,]){REVIEW_COUNT_CANDIDATE}\s+(?:Google\s+)?{REVIEW_LABEL}\b", re.I),
    re.compile(rf"\b{REVIEW_LABEL}\b(?:\s*\(\s*|\s*[:\-–]\s*|\s+){REVIEW_COUNT_CANDIDATE}", re.I),
)
BLOCKERS = [
    "offline_planner_has_no_publication_capability",
    "current_written_backend_boundary_does_not_authorize_menu_price_import",
    "live_customer_price_history_removed_and_moderation_preservation_not_proven",
    "public_get_is_not_a_complete_preservation_snapshot",
    "manual_post_would_fabricate_confirmations_or_overwrite_customer_state",
    "worldwide_comparability_not_proven_android_52_is_italy_bounded",
]


class InputError(ValueError):
    """Invalid or unsafe input; no output should be written."""


def canonical(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True,
                       separators=(",", ":"), allow_nan=False) + "\n").encode("utf-8")


def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def obj(value, fields, label):
    if not isinstance(value, dict) or set(value) != set(fields.split()):
        raise InputError(f"{label}: exact fields required: {fields}")
    return value


def string(value, label, maximum=240, empty=False):
    if not isinstance(value, str) or len(value) > maximum or (not value and not empty):
        raise InputError(f"{label}: invalid bounded string")
    if any(unicodedata.category(ch).startswith("C") for ch in value):
        raise InputError(f"{label}: control characters forbidden")
    return value


def integer(value, label, minimum=0, maximum=10**9):
    if type(value) is not int or not minimum <= value <= maximum:
        raise InputError(f"{label}: bounded integer required")
    return value


def sequence(value, label, maximum):
    if not isinstance(value, list) or len(value) > maximum:
        raise InputError(f"{label}: bounded array required")
    return value


def date(value, label):
    string(value, label, 10)
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise InputError(f"{label}: ISO date required")
    try:
        return dt.date.fromisoformat(value)
    except ValueError as exc:
        raise InputError(f"{label}: invalid date") from exc


def normalize(value):
    text = unicodedata.normalize("NFKD", value).casefold()
    return " ".join("".join(ch if ch.isalnum() else " " for ch in text
                            if not unicodedata.combining(ch)).split())


def norm_space(value):
    return " ".join(value.split())


def https_url(value):
    string(value, "url", 2048)
    try:
        parsed = urlsplit(value)
        if (parsed.scheme != "https" or not parsed.hostname or parsed.username
                or parsed.password or parsed.fragment or parsed.port not in (None, 443)):
            raise InputError("url: public HTTPS URL without credentials or fragment required")
        # This tool never follows URLs. Query strings are forbidden rather than
        # attempting an incomplete list of secret parameter names.
        if parsed.query or "@" in unquote(parsed.netloc) or "%" in parsed.netloc:
            raise InputError("url: query strings and encoded authority forbidden")
        if (not re.fullmatch(r"[A-Za-z0-9.-]+", parsed.hostname)
                or "." not in parsed.hostname or parsed.hostname.endswith(".")
                or parsed.hostname.endswith((".local", ".localhost", ".invalid"))):
            raise InputError("url: invalid hostname")
        try:
            ipaddress.ip_address(parsed.hostname)
        except ValueError:
            pass
        else:
            raise InputError("url: literal IP addresses forbidden")
    except ValueError as exc:
        raise InputError("url: invalid URL") from exc
    return parsed


def no_link(path):
    try:
        info = path.lstat()
    except OSError as exc:
        raise InputError("local evidence path unavailable") from exc
    if stat.S_ISLNK(info.st_mode) or getattr(info, "st_file_attributes", 0) & 0x400:
        raise InputError("symlink or reparse path forbidden")


def contained(root, relative):
    string(relative, "path", 240)
    part = PurePosixPath(relative)
    if (part.is_absolute() or "\\" in relative or ":" in relative
            or any(x in ("", ".", "..") for x in relative.split("/"))):
        raise InputError("path: relative POSIX path without traversal required")
    path = root
    no_link(path)
    for component in part.parts:
        path = path / component
        no_link(path)
    resolved = path.resolve(strict=True)
    if not resolved.is_relative_to(root.resolve(strict=True)) or not resolved.is_file():
        raise InputError("path escapes evidence root or is not a regular file")
    return resolved


def strict_json(raw):
    def pairs(entries):
        result = {}
        for key, value in entries:
            if key in result:
                raise InputError("duplicate JSON key")
            result[key] = value
        return result
    def bad_constant(_):
        raise InputError("non-finite JSON number")
    try:
        return json.loads(raw, object_pairs_hook=pairs, parse_constant=bad_constant)
    except (UnicodeError, ValueError, RecursionError) as exc:
        raise InputError("invalid strict JSON") from exc


class VisibleText(HTMLParser):
    """Deterministic text extraction, independent of unpinned text sidecars.

    This is HTML text evidence, not a rendered-page visibility attestation.
    External CSS, images and JavaScript are never executed.
    """

    VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input",
            "link", "meta", "param", "source", "track", "wbr"}
    HIDDEN = {"script", "style", "template", "noscript", "head"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.parts = []
        self.length = 0

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        style = re.sub(r"\s+", "", attrs.get("style", "").casefold())
        hidden = (tag in self.HIDDEN or "hidden" in attrs
                  or attrs.get("aria-hidden", "").casefold() == "true"
                  or "display:none" in style or "visibility:hidden" in style
                  or bool(self.stack and self.stack[-1][1]))
        if tag not in self.VOID:
            self.stack.append((tag, hidden))
            if len(self.stack) > 256:
                raise InputError("HTML nesting bound exceeded")
        self.add(" ")

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in self.VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index][0] == tag:
                del self.stack[index:]
                break
        self.add(" ")

    def add(self, data):
        self.length += len(data)
        if self.length > MAX_TEXT:
            raise InputError("HTML text bound exceeded")
        self.parts.append(data)

    def handle_data(self, data):
        if not self.stack or not self.stack[-1][1]:
            self.add(data)

    def result(self):
        return norm_space("".join(self.parts))


def html_text(raw):
    try:
        decoded = raw.decode("utf-8-sig", errors="strict")
        parser = VisibleText()
        parser.feed(decoded)
        parser.close()
        return parser.result()
    except (UnicodeError, RecursionError) as exc:
        raise InputError("HTML must be bounded UTF-8") from exc


def geohash5(lat, lon):
    ranges = [[-180.0, 180.0], [-90.0, 90.0]]
    bits = []
    for index in range(25):
        axis = index % 2
        value = lon if axis == 0 else lat
        middle = sum(ranges[axis]) / 2
        high = value >= middle
        bits.append(int(high))
        ranges[axis][0 if high else 1] = middle
    alphabet = "0123456789bcdefghjkmnpqrstuvwxyz"
    return "".join(alphabet[sum(bits[start + offset] << (4 - offset)
                               for offset in range(5))] for start in range(0, 25, 5))


class Reader:
    def __init__(self, root):
        self.root = Path(root).absolute()
        no_link(self.root)
        self.total = 0
        self.seen = set()

    def pinned(self, spec):
        string(spec["sha256"], "sha256", 64)
        if not re.fullmatch("[0-9a-f]{64}", spec["sha256"]):
            raise InputError("lowercase SHA256 required")
        expected = integer(spec["bytes"], "bytes", 1, MAX_FILE_BYTES)
        path = contained(self.root, spec["path"])
        if path in self.seen:
            raise InputError("each pinned evidence file must have a unique path")
        self.seen.add(path)
        self.total += path.stat().st_size
        if self.total > MAX_TOTAL_BYTES:
            raise InputError("total evidence byte bound exceeded")
        with path.open("rb") as stream:
            raw = stream.read(MAX_FILE_BYTES + 1)
        if len(raw) != expected or hashlib.sha256(raw).hexdigest() != spec["sha256"]:
            raise InputError("pinned evidence hash or byte length mismatch")
        return raw


def read_sources(items, reader, as_of):
    sources = {}
    for spec in sequence(items, "sources", MAX_SOURCES):
        obj(spec, "id path sha256 bytes url media_type representation checked_on published_on published_excerpt", "source")
        identifier = string(spec["id"], "source id", 80)
        if identifier in sources:
            raise InputError("duplicate source id")
        url = https_url(spec["url"])
        checked = date(spec["checked_on"], "checked_on")
        if checked > as_of:
            raise InputError("source retrieval date is after as_of")
        if spec["media_type"] not in ("text/html", "application/pdf", "text/plain"):
            raise InputError("unsupported media_type")
        expected_representation = "browser_visible_text" if spec["media_type"] == "text/plain" else "raw_http"
        if spec["representation"] != expected_representation:
            raise InputError("media_type and evidence representation disagree")
        raw = reader.pinned(spec)
        if spec["media_type"] == "text/html":
            text = html_text(raw)
        elif spec["media_type"] == "text/plain":
            try:
                text = norm_space(raw.decode("utf-8-sig", errors="strict"))
            except UnicodeError as exc:
                raise InputError("browser text must be UTF-8") from exc
            if len(text) > MAX_TEXT:
                raise InputError("browser text bound exceeded")
        else:
            text = None
        reasons = []
        if text is None:
            reasons.append("pdf_extraction_not_independently_audited")
        if spec["published_on"] is None:
            if spec["published_excerpt"] is not None:
                raise InputError("null published_on requires null published_excerpt")
        else:
            published = date(spec["published_on"], "published_on")
            if published > checked:
                raise InputError("published_on is after actual retrieval")
            excerpt = string(spec["published_excerpt"], "published_excerpt", 240)
            if (text is None or excerpt not in text or spec["published_on"] not in excerpt
                    or not re.search(r"\b(published|pubblicato|pubblicata|publie|veroffentlicht)\b",
                                     normalize(excerpt))):
                reasons.append("publication_date_not_explicitly_evidenced")
        sources[identifier] = {"spec": spec, "text": text, "host": url.hostname,
                               "reasons": reasons}
    return sources


def read_catalogue(spec, reader):
    obj(spec, "data_version cells", "catalogue")
    version = string(spec["data_version"], "data_version", 80)
    if not re.fullmatch(r"[A-Za-z0-9._-]+", version):
        raise InputError("invalid catalogue version")
    venues = {}
    cells = set()
    for cell_spec in sequence(spec["cells"], "catalogue cells", MAX_CELLS):
        obj(cell_spec, "cell path sha256 bytes", "catalogue cell")
        cell = string(cell_spec["cell"], "cell", 5)
        if not re.fullmatch(r"[0-9bcdefghjkmnpqrstuvwxyz]{5}", cell) or cell in cells:
            raise InputError("duplicate or invalid geohash5 cell")
        cells.add(cell)
        raw = strict_json(reader.pinned(cell_spec))
        obj(raw, "c v", "published catalogue snapshot")
        cities = sequence(raw["c"], "catalogue cities", 5000)
        for city in cities:
            if not isinstance(city, list) or len(city) != 2:
                raise InputError("invalid published city tuple")
            integer(city[0], "city id", 0, 10**18)
            string(city[1], "city name", 240)
        for row in sequence(raw["v"], "catalogue venues", 50000):
            if not isinstance(row, list) or len(row) != 7:
                raise InputError("exact seven-element published venue tuple required")
            key, name, kind, lat, lon, addr, city_index = row
            string(key, "catalogue key", 160)
            if not re.fullmatch(r"[nwr][1-9][0-9]{0,14}", key):
                raise InputError("catalogue key must be an OSM node way or relation identity")
            string(name, "catalogue name", 240)
            integer(kind, "catalogue kind", 0, 4)
            string(addr, "catalogue address", 400, empty=True)
            integer(city_index, "city index", -1, len(cities) - 1)
            for value, low, high in ((lat, -90, 90), (lon, -180, 180)):
                if type(value) not in (int, float) or not math.isfinite(value) or not low <= value <= high:
                    raise InputError("invalid catalogue coordinates")
            if geohash5(lat, lon) != cell:
                raise InputError("catalogue venue coordinates disagree with true geohash5 cell")
            if key in venues:
                raise InputError("duplicate canonical venue key")
            venues[key] = {"cell": cell, "name": name, "address": addr,
                           "lat": lat, "lon": lon, "catalogue_version": version}
    return venues


def excerpt_reasons(source, excerpt, maximum=240):
    string(excerpt, "literal excerpt", maximum)
    if source is None:
        return ["unknown_source"]
    reasons = list(source["reasons"])
    if source["text"] is not None and (norm_space(excerpt) != excerpt or excerpt not in source["text"]):
        reasons.append("excerpt_not_in_verified_normalized_html")
    return reasons


def venue_reasons(spec, venues, sources):
    obj(spec, "cell key name address identity_source_id identity_excerpts", "venue")
    for field, cap in (("cell", 5), ("key", 160), ("name", 240), ("address", 400),
                       ("identity_source_id", 80)):
        string(spec[field], f"venue {field}", cap, empty=field == "address")
    source = sources.get(spec["identity_source_id"])
    excerpts = sequence(spec["identity_excerpts"], "identity_excerpts", 2)
    if not excerpts:
        raise InputError("one or two identity_excerpts required")
    reasons = []
    for excerpt in excerpts:
        reasons += excerpt_reasons(source, excerpt, 600)
    if source and source["spec"]["media_type"] != "text/html":
        reasons.append("venue_identity_requires_verified_raw_html")
    venue = venues.get(spec["key"])
    if venue is None:
        reasons.append("canonical_venue_key_not_found")
    else:
        if spec["cell"] != venue["cell"]:
            reasons.append("canonical_venue_cell_mismatch")
        if normalize(spec["name"]) != normalize(venue["name"]):
            reasons.append("canonical_venue_name_mismatch")
        if not spec["address"] or not venue["address"]:
            reasons.append("canonical_venue_address_missing")
        elif normalize(spec["address"]) != normalize(venue["address"]):
            reasons.append("canonical_venue_address_mismatch")
    identity = " " + normalize(" ".join(excerpts)) + " "
    for field in ("name", "address"):
        if not spec[field] or " " + normalize(spec[field]) + " " not in identity:
            reasons.append(f"source_venue_{field}_not_evidenced")
    return reasons


def visible_review_count_literals(text):
    return [match.group("count").strip()
            for pattern in REVIEW_COUNT_PATTERNS for match in pattern.finditer(text)]


def review_reasons(spec, sources, venue):
    fields = ("kind source_id excerpt count"
              if isinstance(spec, dict) and "count" in spec else "kind source_id excerpt")
    obj(spec, fields, "review")
    count = spec.get("count")
    if count is not None:
        integer(count, "review count", 0, 100000000)
    string(spec["source_id"], "review source id", 80)
    if spec["kind"] not in ("google_visible", "publisher_claim", "unverified"):
        raise InputError("invalid review evidence kind")
    source = sources.get(spec["source_id"])
    reasons = excerpt_reasons(source, spec["excerpt"], 1000)
    if spec["kind"] != "google_visible":
        reasons.append("first_party_or_unverified_review_count_is_not_direct_google_evidence")
    if source and not re.fullmatch(r"(?:www\.|maps\.)?google\.(?:com|it|fr|de|es|co\.uk)", source["host"]):
        reasons.append("review_source_is_not_direct_google")
    # Accept an unambiguous adjacent number and review label in either order;
    # never infer a count from a bare number, rating, or publisher claim.
    matches = visible_review_count_literals(spec["excerpt"])
    valid_count = (len(matches) == 1 and
                   re.fullmatch(r"(?:0|[1-9]\d{0,2})(?:(?:,\d{3})+|(?:\.\d{3})+|(?: \d{3})+)?", matches[0]))
    counts = [int(re.sub(r"\D", "", matches[0]))] if valid_count else []
    if count is None:
        # Unknown is distinct from zero: do not suppress a visible count by
        # omitting the field or setting it to null.
        visible = source["text"] if source and source["text"] is not None else spec["excerpt"]
        if visible_review_count_literals(visible):
            reasons.append("visible_google_review_count_not_reported")
    elif counts != [count]:
        reasons.append("visible_google_review_count_not_evidenced")
    proof = " " + normalize(spec["excerpt"]) + " "
    for field in ("name", "address"):
        if not venue[field] or " " + normalize(venue[field]) + " " not in proof:
            reasons.append(f"google_review_venue_{field}_not_evidenced")
    return reasons


def amount_cents(literal):
    # Currency must be literal and explicit; decimal arithmetic stays integral.
    match = re.fullmatch(r"(?:€\s*([0-9]{1,3}(?:[,.][0-9]{1,2})?)|([0-9]{1,3}(?:[,.][0-9]{1,2})?)\s*(?:€|EUR))", literal)
    if not match:
        return None
    value = (match.group(1) or match.group(2)).replace(",", ".")
    units, _, decimals = value.partition(".")
    return int(units) * 100 + int(decimals.ljust(2, "0") or "0")


def valid_happy_hour_times(excerpt):
    times = re.findall(r"\b(\d{1,2})(?::(\d{2}))?\s*[-–]\s*(\d{1,2})(?::(\d{2}))?\b", excerpt)
    return bool(times) and all(int(start_h) <= 23 and int(end_h) <= 23
                               and int(start_m or 0) <= 59 and int(end_m or 0) <= 59
                               for start_h, start_m, end_h, end_m in times)


def oversized_volume(text):
    # Only inspect the explicitly supplied item and context, not unrelated
    # neighbouring menu text. Decimal millilitre conversion is unnecessary:
    # compare decimal strings as exact rational numbers.
    pattern = r"\b(\d{1,6})(?:[.,](\d{1,3}))?\s*(ml|millilit(?:er|re)s?|millilitri|cl|centilit(?:er|re)s?|centilitri|dl|decilit(?:er|re)s?|decilitri)\b"
    factors = {"ml": 1, "cl": 10, "dl": 100}
    for match in re.finditer(pattern, text, re.I):
        whole, fraction, unit = match.groups()
        unit = unit.casefold()
        factor = factors.get(unit, 1 if unit.startswith("milli") else 10 if unit.startswith("centi") else 100)
        scale = 10 ** len(fraction or "")
        numerator = int(whole) * scale + int(fraction or "0")
        if numerator * factor > 500 * scale:
            return True
    return False


def price_reasons(row, sources, venue):
    obj(row, "id drink cents currency hh item serving context source_id excerpt amount_literal hh_excerpt", "price")
    for field, cap in (("id", 80), ("drink", 40), ("currency", 8), ("item", 100),
                       ("serving", 40), ("context", 120), ("source_id", 80),
                       ("amount_literal", 30)):
        string(row[field], f"price {field}", cap, empty=field == "context")
    integer(row["cents"], "cents", 0, 1000000)
    integer(row["hh"], "hh", 0, 1)
    if row["drink"] not in LIMITS:
        raise InputError("unknown drink category")
    source = sources.get(row["source_id"])
    reasons = excerpt_reasons(source, row["excerpt"])
    if source and source["spec"]["media_type"] != "text/html":
        reasons.append("price_requires_verified_raw_html_not_text_sidecar")
    # Each menu source must independently contain the candidate's identity;
    # a shared host or an identity proved by another source is insufficient.
    if source and (source["text"] is None or any(
            norm_space(excerpt) != excerpt or excerpt not in source["text"]
            for excerpt in venue["identity_excerpts"]) or any(
            not field or " " + normalize(field) + " " not in " " + normalize(" ".join(venue["identity_excerpts"])) + " "
            for field in (venue["name"], venue["address"]))):
        reasons.append("price_source_venue_identity_not_evidenced")
    excerpt = row["excerpt"]
    if row["currency"] != "EUR":
        reasons.append("non_eur_no_conversion_permitted")
    low, high = LIMITS[row["drink"]]
    if not low <= row["cents"] <= high:
        reasons.append("price_outside_category_inclusive_cents_limits")
    if amount_cents(row["amount_literal"]) != row["cents"]:
        reasons.append("literal_eur_amount_does_not_equal_cents")
    for field in ("item", "context", "amount_literal"):
        if row[field] not in excerpt:
            reasons.append(f"{field}_not_in_literal_price_excerpt")
    # One localized price only, with enough context to audit item and serving.
    tokens = re.findall(r"(?:€\s*[0-9]+(?:[,.][0-9]{1,2})?|[0-9]+(?:[,.][0-9]{1,2})?\s*(?:€|EUR))", excerpt)
    if tokens != [row["amount_literal"]]:
        reasons.append("multiple_or_ambiguous_price_tokens")
    words = normalize(excerpt)
    labels = {
        "beer_draft": r"beer|birra|biere|bier",
        "spritz": r"spritz",
        "negroni": r"negroni", "sbagliato": r"sbagliato",
        "gin_tonic": r"gin tonic|gin and tonic|gin e tonic|gin tonica",
        "gin_lemon": r"gin lemon|gin and lemon|gin e lemon",
        "wine_glass": r"wine|vino|vin|wein",
        "alcohol_free": r"alcohol free|analcolico|analcolici|non alcoholic|soft drink|soft drinks|coca cola|cola|lemonade|limonata|aranciata|fanta|sprite|juice|succo",
        "water": r"water|acqua|eau|wasser|agua",
    }
    item_context = normalize(row["item"] + " " + row["context"])
    if not re.search(r"\b(?:" + labels[row["drink"]] + r")\b", item_context):
        reasons.append("drink_category_not_explicit_in_item_or_context")
    if row["drink"] != "alcohol_free" and re.search(
            r"\b(?:alcohol free|alcoholfree|non alcoholic|nonalcoholic|no alcohol|zero alcohol|analcolic[oaie]|senza alcol|virgin|mocktail)\b", words):
        reasons.append("alcohol_free_conflicts_with_drink_category")
    if re.search(r"\b(?:xxl|xl|large format|magnum|jug|carafe|caraffa|litre|litres|liter|liters|litro|litri)\b", words) or re.search(
            r"\b\d+(?:[.,]\d+)?\s*(?:l|litres?|liters?|litri|litro)\b|\b(?:for|per|pour|fur)\s+\d+\s*(?:people|persons?|persone|personnes|personen)\b", words):
        reasons.append("large_or_shared_serving_held")
    if row["serving"] == "single" and oversized_volume(row["item"] + " " + row["context"]):
        reasons.append("large_or_shared_serving_held")
    if row["drink"] == "negroni" and re.search(r"\bsbagliato\b", item_context):
        reasons.append("sbagliato_cannot_be_plain_negroni")
    if (re.search(r"\b(from|starting|range|between|package|bundle|pitcher|cheapest|minimum|or|oppure|choice|selection|a scelta)\b", words)
            or re.search(r"\d\s*[-–—/]\s*\d|\b(?:2|two)\s*(?:for|x)\b", excerpt, re.I)
            or re.search(r"\b(?:da|ab|des|a partir)\s+\d", words)):
        reasons.append("range_package_or_ambiguous_variant_held")
    if row["drink"] != "water" and re.search(r"\b(?:bottle|bottiglia|pint|pinta|bottled)\b", words):
        reasons.append("bottle_or_pint_serving_not_supported")
    expected = "draft_400ml" if row["drink"] == "beer_draft" else "glass" if row["drink"] == "wine_glass" else "single"
    if row["serving"] != expected:
        reasons.append("unsupported_or_ambiguous_serving")
    if row["drink"] == "beer_draft":
        if (not re.search(r"\b(?:draft|draught|spina|pression|fass|vom fass)\b", words)
                or not re.search(r"\b(?:400\s*ml|40\s*cl|0[.,]4\s*l)\b", excerpt, re.I)
                or re.search(r"\b(?:250|500|330)\s*ml|\b(?:25|50|33)\s*cl\b", excerpt, re.I)):
            reasons.append("beer_requires_explicit_exact_400ml_draft_evidence")
    if row["drink"] == "wine_glass" and not re.search(r"\b(?:glass|calice|bicchiere|verre|glas)\b", words):
        reasons.append("wine_requires_explicit_glass_evidence")
    if row["hh"] == 1:
        string(row["hh_excerpt"], "hh_excerpt", 240)
        reasons += excerpt_reasons(sources.get(row["source_id"]), row["hh_excerpt"])
        if (row["item"] not in row["hh_excerpt"]
                or row["amount_literal"] not in row["hh_excerpt"]
                or not re.search(r"\b(?:happy hour|aperitivo)\b", normalize(row["hh_excerpt"]))
                or not valid_happy_hour_times(row["hh_excerpt"])):
            reasons.append("happy_hour_item_amount_and_time_conditions_not_explicit")
    elif row["hh_excerpt"] is not None:
        raise InputError("hh 0 requires null hh_excerpt")
    elif re.search(r"\b(?:happy hour|aperitivo)\b", words):
        reasons.append("happy_hour_context_cannot_be_regular_price")
    return reasons


def plan(document, evidence_root):
    obj(document, "schema_version batch_id as_of catalogue sources candidates", "batch")
    if type(document["schema_version"]) is not int or document["schema_version"] != 1:
        raise InputError("schema_version must be integer 1")
    batch_id = string(document["batch_id"], "batch_id", 80)
    if not re.fullmatch(r"[A-Za-z0-9._-]+", batch_id):
        raise InputError("batch_id must be a plain identifier")
    as_of = date(document["as_of"], "as_of")
    reader = Reader(evidence_root)
    sources = read_sources(document["sources"], reader, as_of)
    venues = read_catalogue(document["catalogue"], reader)
    results = []
    candidate_ids = set()
    row_ids = set()
    for candidate in sequence(document["candidates"], "candidates", MAX_CANDIDATES):
        obj(candidate, "id venue review prices", "candidate")
        identifier = string(candidate["id"], "candidate id", 80)
        if identifier in candidate_ids:
            raise InputError("duplicate candidate id")
        candidate_ids.add(identifier)
        common = venue_reasons(candidate["venue"], venues, sources)
        common += review_reasons(candidate["review"], sources, candidate["venue"])
        for row in sequence(candidate["prices"], "prices", MAX_ROWS):
            reasons = common + price_reasons(row, sources, candidate["venue"])
            if row["id"] in row_ids:
                raise InputError("duplicate price id")
            row_ids.add(row["id"])
            if len(row_ids) > MAX_ROWS:
                raise InputError("total price row bound exceeded")
            venue = venues.get(candidate["venue"]["key"])
            inside_italy = bool(venue and 35.2 <= venue["lat"] <= 47.2 and 6.5 <= venue["lon"] <= 18.6)
            results.append({"candidate_id": identifier, "venue": candidate["venue"],
                            "review": candidate["review"], "price": row,
                            "catalogue_version": document["catalogue"]["data_version"],
                            "android_52_italy_bounds_contains_venue": inside_italy,
                            "worldwide_comparability": "not_proven",
                            "hold_reasons": sorted(set(reasons))})
    groups = {}
    for result in results:
        row = result["price"]
        group = (result["venue"]["key"], row["drink"], row["hh"])
        groups.setdefault(group, []).append(result)
    for group in groups.values():
        # Do not select cheapest item, variant or source; an offline reviewer
        # must resolve competing rows even when their declared amounts match.
        if len(group) > 1:
            for result in group:
                result["hold_reasons"] = sorted(set(result["hold_reasons"] + ["conflicting_rows_same_venue_drink_hh"]))
    for result in results:
        result["status"] = "held" if result["hold_reasons"] else "evidence_qualified"
    results.sort(key=lambda result: (result["candidate_id"], result["price"]["id"]))
    report = {"schema_version": 1, "kind": "offline_menu_evidence_plan",
              "batch_id": batch_id, "as_of": document["as_of"],
              "input_digest": digest(document), "publication_blocked": True,
              "public_imports": 0, "publication_blockers": BLOCKERS,
              "catalogue": document["catalogue"],
              "source_pins": [sources[key]["spec"] for key in sorted(sources)],
              "summary": {"candidates": len(candidate_ids), "rows": len(results),
                          "evidence_qualified": sum(row["status"] == "evidence_qualified" for row in results),
                          "held": sum(row["status"] == "held" for row in results)},
              "rows": results}
    report["plan_digest"] = digest(report)
    return report


def write_report(report, output_dir):
    path = Path(output_dir).absolute()
    # Reject links in all existing ancestors, then create a NEW directory in
    # one operation. No --force, overwrite, cleanup, or partial-resume mode.
    for parent in [path.parent, *path.parent.parents]:
        no_link(parent)
    try:
        path.mkdir(exist_ok=False)
    except OSError as exc:
        raise InputError("output directory must be new and its parent must exist") from exc
    with (path / "report.json").open("xb") as stream:
        stream.write(canonical(report))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, help="local strict v1 batch JSON")
    parser.add_argument("--evidence-root", required=True, help="root containing pinned local files")
    parser.add_argument("--output-dir", required=True, help="new directory; never overwritten")
    args = parser.parse_args(argv)
    try:
        input_path = Path(args.input).absolute()
        for path in [input_path, *input_path.parents]:
            no_link(path)
        with input_path.open("rb") as stream:
            raw = stream.read(MAX_INPUT_BYTES + 1)
        if len(raw) > MAX_INPUT_BYTES:
            raise InputError("input byte bound exceeded")
        report = plan(strict_json(raw), args.evidence_root)
        write_report(report, args.output_dir)
    except (InputError, OSError) as exc:
        # Do not echo raw inputs, URLs or filesystem exception messages.
        message = str(exc) if isinstance(exc, InputError) else "local filesystem operation failed"
        print(f"planner: {message}", file=sys.stderr)
        return 2
    print(json.dumps({"plan_digest": report["plan_digest"], "publication_blocked": True,
                      "public_imports": 0, "summary": report["summary"]}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
