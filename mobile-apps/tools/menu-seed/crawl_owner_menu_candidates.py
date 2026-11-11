"""Bounded, read-only research of owner menu links for existing Italian venues.

This produces candidate evidence only. It cannot create a v2 seed or publish a price.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation
import hashlib
from html.parser import HTMLParser
import http.client
import ipaddress
import json
from pathlib import Path
import re
import shutil
import socket
import ssl
import subprocess
import sys
import time
from urllib.parse import urljoin, urlsplit, urlunsplit
from urllib.robotparser import RobotFileParser


QUEUE_LIMIT = 2 * 1024 * 1024
HTML_LIMIT = 1024 * 1024
PDF_LIMIT = 4 * 1024 * 1024
TEXT_LIMIT = 2 * 1024 * 1024
CITY_ORDER = ("Milano", "Roma", "Torino", "Napoli")
MENU_WORDS = re.compile(r"menu|men[uù]|drink|cocktail|birr|wine|vino|listino|beverage|carta", re.I)
PRICE = re.compile(r"(?<![\w\d])(?:€\s*(?P<before>\d{1,4}(?:[.,]\d{1,2})?)|(?P<after>\d{1,4}(?:[.,]\d{1,2})?)\s*€)")
SERVING = re.compile(r"\b\d{1,4}(?:[.,]\d+)?\s*(?:ml|cl|l)\b", re.I)
FEE_WORDS = re.compile(r"\b(?:coperto|servizio|service|cover|table\s+service)\b", re.I)
DRINK_WORDS = re.compile(r"\b(?:birra|beer|spritz|negroni|gin|vino|wine|prosecco|cocktail|drink|acqua|water|whisk(?:e)?y|rum|vodka|amaro|vermouth|aperitivo|analcolico|soft\s+drink)\b", re.I)
THIRD_PARTY = (
    "facebook.com", "instagram.com", "google.com", "google.it", "tripadvisor.com",
    "thefork.com", "deliveroo.com", "justeat.it", "ubereats.com", "linktr.ee",
    "leggimenu.it", "yhop.it", "metropolita.it", "junglejuice.it",
    "dishcovery.menu", "mycia.it", "wixsite.com", "wordpress.com",
    "blogspot.com", "square.site",
)
UA = "DoveBevo-MenuCandidateResearch/1.0 (https://www.dovebevo.com)"


class Held(ValueError):
    """A bounded research item cannot be trusted or fetched."""


class RunLimit(Held):
    """The page budget ended before this venue was fully examined."""


@dataclass(frozen=True)
class Page:
    url: str
    kind: str
    raw: bytes


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def host_for(url: str, *, allow_http_upgrade: bool = False) -> tuple[str, str]:
    if not isinstance(url, str) or not 1 <= len(url) <= 2048 or any(ord(c) < 33 or ord(c) == 127 for c in url) or "\\" in url:
        raise Held("invalid_url")
    parts = urlsplit(url)
    try:
        port = parts.port
    except ValueError:
        raise Held("invalid_port") from None
    if parts.scheme == "http" and allow_http_upgrade:
        parts = parts._replace(scheme="https")
    if parts.scheme != "https" or parts.username is not None or parts.password is not None or port not in (None, 443) or parts.fragment:
        raise Held("unsafe_url")
    hostname = parts.hostname
    if not hostname or "%" in hostname or hostname.endswith("."):
        raise Held("invalid_host")
    try:
        host = hostname.encode("idna").decode("ascii").lower()
    except UnicodeError:
        raise Held("invalid_host") from None
    if not re.fullmatch(r"[a-z0-9.-]{4,253}", host) or "." not in host or any(not re.fullmatch(r"(?!-)[a-z0-9-]{1,63}(?<!-)", part) for part in host.split(".")):
        raise Held("invalid_host")
    try:
        ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        raise Held("ip_literal")
    if host.endswith((".local", ".localhost", ".internal", ".invalid", ".test", ".example")) or host in ("localhost",):
        raise Held("private_host")
    path = parts.path or "/"
    return host, urlunsplit(("https", host, path, parts.query, ""))


def owner_host(host: str) -> bool:
    return not any(host == suffix or host.endswith("." + suffix) for suffix in THIRD_PARTY)


def same_host(left: str, right: str) -> bool:
    return left.removeprefix("www.") == right.removeprefix("www.")


class PinnedHTTPSConnection(http.client.HTTPSConnection):
    def __init__(self, host: str, address: str, timeout: float):
        super().__init__(host, port=443, timeout=timeout, context=ssl.create_default_context())
        self._address = address

    def connect(self):
        plain = socket.create_connection((self._address, 443), self.timeout)
        try:
            self.sock = self._context.wrap_socket(plain, server_hostname=self.host)
        except BaseException:
            plain.close()
            raise


def public_addresses(host: str) -> list[str]:
    try:
        answers = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    except OSError:
        raise Held("dns_unavailable") from None
    addresses = sorted({answer[4][0] for answer in answers})
    if not addresses or any(not ipaddress.ip_address(address).is_global for address in addresses):
        raise Held("non_public_dns")
    return addresses


def fetch_page(url: str, *, timeout: float = 8.0) -> Page:
    host, clean = host_for(url)
    if not owner_host(host):
        raise Held("third_party_host")
    address = public_addresses(host)[0]
    parts = urlsplit(clean)
    target = parts.path + (("?" + parts.query) if parts.query else "")
    connection = PinnedHTTPSConnection(host, address, timeout)
    try:
        connection.request("GET", target, headers={"Host": host, "User-Agent": UA,
                            "Accept": "text/html,application/pdf,text/plain", "Accept-Encoding": "identity"})
        response = connection.getresponse()
        if response.status in (301, 302, 303, 307, 308):
            location = response.getheader("Location")
            if not location:
                raise Held("redirect_without_location")
            next_host, destination = host_for(urljoin(clean, location))
            if not same_host(host, next_host) or not owner_host(next_host):
                raise Held("redirect_crosses_owner_host")
            return Page(destination, "redirect", b"")
        if response.status != 200:
            raise Held("http_" + str(response.status))
        if response.getheader("Content-Encoding", "identity").lower() != "identity":
            raise Held("compressed_response")
        kind = response.getheader("Content-Type", "").split(";", 1)[0].strip().lower()
        if kind in ("text/html", "application/xhtml+xml"):
            kind, limit = "html", HTML_LIMIT
        elif kind == "application/pdf":
            kind, limit = "pdf", PDF_LIMIT
        elif parts.path == "/robots.txt" and kind == "text/plain":
            kind, limit = "robots", 100 * 1024
        else:
            raise Held("unsupported_media_type")
        length = response.getheader("Content-Length")
        if length is not None and (not length.isdecimal() or int(length) > limit):
            raise Held("body_limit")
        raw = response.read(limit + 1)
        if not raw or len(raw) > limit or (kind == "pdf" and not raw.startswith(b"%PDF-")):
            raise Held("body_limit_or_invalid_pdf")
        return Page(clean, kind, raw)
    except (OSError, TimeoutError, ssl.SSLError, http.client.HTTPException):
        raise Held("fetch_unavailable") from None
    finally:
        connection.close()


class VisibleHTML(HTMLParser):
    BLOCKS = frozenset(("p", "div", "li", "tr", "td", "th", "section", "article", "br", "h1", "h2", "h3", "h4", "h5", "h6"))
    HIDDEN = frozenset(("script", "style", "noscript", "template", "svg"))
    VOID = frozenset(("area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"))

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.links: list[tuple[str, str]] = []
        self._open: list[tuple[str, bool]] = []
        self._hidden = 0
        self._anchor: tuple[str, list[str]] | None = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        hidden_here = (tag in self.HIDDEN or "hidden" in attrs or attrs.get("aria-hidden") == "true"
                       or "display:none" in (attrs.get("style") or "").replace(" ", "").lower())
        if tag not in self.VOID:
            self._open.append((tag, hidden_here))
        if hidden_here and tag not in self.VOID:
            self._hidden += 1
        if tag in self.BLOCKS and not self._hidden:
            self.parts.append("\n")
        if tag == "a" and not self._hidden:
            self._anchor = (attrs.get("href") or "", [])

    def handle_endtag(self, tag):
        if tag == "a" and self._anchor is not None:
            href, words = self._anchor
            self.links.append((href, " ".join(words)))
            self._anchor = None
        for i in range(len(self._open) - 1, -1, -1):
            if self._open[i][0] == tag:
                self._hidden -= sum(hidden for _, hidden in self._open[i:])
                del self._open[i:]
                break
        if tag in self.BLOCKS and not self._hidden:
            self.parts.append("\n")

    def handle_data(self, data):
        if not self._hidden:
            self.parts.append(data)
            if self._anchor is not None:
                self._anchor[1].append(data)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in self.VOID:
            self.handle_endtag(tag)

    @property
    def text(self) -> str:
        return "\n".join(" ".join(line.split()) for line in "".join(self.parts).splitlines() if line.strip())


def html_text(raw: bytes) -> tuple[str, list[tuple[str, str]]]:
    try:
        source = raw.decode("utf-8-sig")
    except UnicodeError:
        raise Held("html_not_utf8") from None
    parser = VisibleHTML()
    parser.feed(source)
    text = parser.text
    if len(text.encode("utf-8")) > TEXT_LIMIT:
        raise Held("text_limit")
    return text, parser.links


def pdf_text(raw: bytes, converter: str | None) -> str:
    if converter is None:
        raise Held("pdf_converter_unavailable")
    try:
        result = subprocess.run([converter, "-layout", "-", "-"], input=raw,
                                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=20, check=False)
    except (OSError, subprocess.TimeoutExpired):
        raise Held("pdf_conversion_failed") from None
    if result.returncode or not result.stdout or len(result.stdout) > TEXT_LIMIT:
        raise Held("pdf_conversion_failed")
    try:
        return result.stdout.decode("utf-8")
    except UnicodeError:
        raise Held("pdf_text_not_utf8") from None


def normalize(value: str) -> str:
    import unicodedata
    return " ".join(unicodedata.normalize("NFKC", value).casefold().split())


def prices_from(text: str, source_url: str = "") -> list[dict]:
    found = []
    lines = [" ".join(line.split()) for line in text.splitlines() if line.strip()]
    drink_page = bool(re.search(r"(?:^|[/_-])drinks?(?:[/_.-]|$)", urlsplit(source_url).path, re.I))
    for index, line in enumerate(lines):
        if len(line) > 500:
            continue
        matches = list(PRICE.finditer(line))
        for match in matches:
            literal = match.group(0)
            number = match.group("before") or match.group("after")
            try:
                amount = Decimal(number.replace(",", "."))
            except InvalidOperation:
                continue
            if not 0 < amount <= 10000:
                continue
            before = line[max(0, match.start() - 110):match.start()].strip(" -–—·|:.")
            after = line[match.end():match.end() + 50].strip()
            item = before or (lines[index - 1][:110] if index and not PRICE.search(lines[index - 1]) else "")
            serving = SERVING.search(line)
            context = line[:250]
            is_fee = bool(FEE_WORDS.search(context))
            named_drink = bool(DRINK_WORDS.search(context))
            found.append({
                "line": index + 1,
                "line_excerpt": context,
                "item_guess": item[:110] or None,
                "amount_literal": literal,
                "currency": "EUR",
                "amount_minor_guess": int(amount * 100),
                "serving_literal": serving.group(0) if serving else None,
                "kind_guess": "fee" if is_fee else "drink" if named_drink or drink_page else "unclassified",
                "uncertainty": ["review_required", "menu_item_pairing_unverified", "source_use_unreviewed"] +
                               (["multiple_prices_on_line"] if len(matches) > 1 else []) +
                               (["item_from_previous_line"] if not before and item else []) +
                               (["drink_context_only"] if drink_page and not named_drink and not is_fee else []),
                "trailing_context": after[:50] or None,
            })
            if len(found) >= 200:
                return found
    return found


def menu_links(links: list[tuple[str, str]], base: str, owner: str) -> list[str]:
    found = []
    for href, label in links:
        if not MENU_WORDS.search(href + " " + label):
            continue
        try:
            host, clean = host_for(urljoin(base, href))
        except (Held, ValueError):
            continue
        if same_host(host, owner) and clean not in found:
            found.append(clean)
        if len(found) >= 12:
            break
    return sorted(found, key=lambda link: (not link.lower().split("?", 1)[0].endswith(".pdf"), link))


def linked_pdfs(links: list[tuple[str, str]], base: str, owner: str) -> tuple[list[str], list[str]]:
    """Only PDF URLs linked by an owner menu page; foreign hosts are leads, not fetches."""
    local, foreign = [], []
    for href, _ in links:
        try:
            host, clean = host_for(urljoin(base, href))
        except (Held, ValueError):
            continue
        if not urlsplit(clean).path.lower().endswith(".pdf"):
            continue
        target = local if same_host(host, owner) else foreign
        if clean not in target:
            target.append(clean)
        if len(local) + len(foreign) >= 12:
            break
    return local, foreign


def queue_rows(raw: bytes) -> tuple[dict, list[dict]]:
    if len(raw) > QUEUE_LIMIT:
        raise Held("queue_limit")
    def unique(pairs):
        out = {}
        for key, value in pairs:
            if key in out:
                raise Held("duplicate_json_key")
            out[key] = value
        return out
    try:
        doc = json.loads(raw.decode("utf-8"), object_pairs_hook=unique,
                         parse_constant=lambda _: (_ for _ in ()).throw(Held("nonfinite_json")))
    except (UnicodeError, json.JSONDecodeError):
        raise Held("bad_queue_json") from None
    if not isinstance(doc, dict):
        raise Held("bad_queue")
    rows = doc.get("candidates")
    if doc.get("schema_version") != 1 or not isinstance(rows, list) or len(rows) > 5000 or doc.get("source_candidates") != len(rows):
        raise Held("bad_queue")
    seen = set()
    for row in rows:
        if (not isinstance(row, dict) or not re.fullmatch(r"[nwr][1-9][0-9]{0,14}", str(row.get("key", "")))
                or row["key"] in seen or row.get("state") != "candidate" or row.get("city") not in CITY_ORDER
                or not isinstance(row.get("name"), str) or not row["name"] or not isinstance(row.get("url_tags"), dict)
                or not isinstance(row.get("cell"), str) or not re.fullmatch(r"[0123456789bcdefghjkmnpqrstuvwxyz]{5}", row["cell"])):
            raise Held("bad_candidate")
        seen.add(row["key"])
    return doc, rows


def select(rows: list[dict], maximum: int, offset: int = 0) -> list[dict]:
    """Return a stable round-robin page without changing the source queue."""
    buckets = {city: [] for city in CITY_ORDER}
    for row in rows:
        buckets[row["city"]].append(row)
    for bucket in buckets.values():
        bucket.sort(key=lambda row: ("website:menu" not in row["url_tags"], row["key"]))
    result = []
    while len(result) < offset + maximum and any(buckets.values()):
        for city in CITY_ORDER:
            if buckets[city] and len(result) < offset + maximum:
                result.append(buckets[city].pop(0))
    return result[offset:]


def crawl(raw_queue: bytes, *, maximum: int = 12, offset: int = 0, max_requests: int = 36, max_seconds: int = 240,
          fetch=fetch_page, convert_pdf=pdf_text, pdf_converter: str | None = None,
          clock=time.monotonic, sleep=time.sleep, today=date.today) -> tuple[dict, dict[str, bytes]]:
    if not 1 <= maximum <= 30 or not 0 <= offset <= 5000 or not 1 <= max_requests <= 120 or not 10 <= max_seconds <= 600:
        raise Held("invalid_limits")
    queue, rows = queue_rows(raw_queue)
    if offset > len(rows):
        raise Held("offset_past_queue_end")
    chosen = select(rows, maximum, offset)
    deadline = clock() + max_seconds
    attempts = 0
    source_bytes: dict[str, bytes] = {}
    records = []
    last_host_time: dict[str, float] = {}
    host_delay: dict[str, float] = {}
    robots: dict[str, RobotFileParser | None] = {}

    def bounded_fetch(url: str) -> Page:
        nonlocal attempts
        current = url
        for redirect_number in range(3):
            if clock() >= deadline or attempts >= max_requests:
                raise RunLimit("run_limit")
            host, clean = host_for(current, allow_http_upgrade=True)
            if not owner_host(host):
                raise Held("third_party_host")
            since = clock() - last_host_time.get(host, -1e9)
            required_gap = max(1.0, host_delay.get(host, 1.0))
            if since < required_gap:
                sleep(required_gap - since)
            if clock() >= deadline:
                raise RunLimit("run_limit")
            attempts += 1
            last_host_time[host] = clock()
            page = fetch(clean)
            if page.kind != "redirect":
                return page
            next_host, next_url = host_for(page.url)
            if not same_host(host, next_host) or not owner_host(next_host):
                raise Held("redirect_crosses_owner_host")
            if redirect_number == 2:
                raise Held("redirect_limit")
            if urlsplit(clean).path != "/robots.txt":
                robots_allows(next_url)
            current = next_url
        raise Held("redirect_limit")

    def robots_allows(url: str) -> None:
        host, clean = host_for(url)
        if host not in robots:
            try:
                page = bounded_fetch("https://" + host + "/robots.txt")
            except RunLimit:
                raise
            except Held as error:
                if str(error) != "http_404":
                    raise Held("robots_unavailable_" + str(error)) from None
                robots[host] = None
            else:
                if page.kind != "robots":
                    raise Held("robots_invalid")
                try:
                    lines = page.raw.decode("utf-8-sig").splitlines()
                except UnicodeError:
                    raise Held("robots_invalid") from None
                policy = RobotFileParser()
                policy.parse(lines)
                delay = policy.crawl_delay(UA)
                if delay is not None and delay > 3:
                    raise Held("robots_crawl_delay_exceeds_budget")
                if delay is not None:
                    host_delay[host] = float(delay)
                robots[host] = policy
        if robots[host] is not None and not robots[host].can_fetch(UA, clean):
            raise Held("robots_disallow")

    for row in chosen:
        result = {"venue_key": row["key"], "venue_name": row["name"], "city": row["city"], "cell": row["cell"],
                  "queue_catalogue_version": queue.get("catalogue_version"), "queue_checked_on": queue.get("checked_on"),
                  "identity_state": "historical_queue_only", "status": "held", "reason": None, "sources": []}
        records.append(result)
        website = row["url_tags"].get("website") or row["url_tags"].get("contact:website")
        direct = row["url_tags"].get("website:menu") or row["url_tags"].get("contact:menu")
        if not website and direct:
            try:
                direct_host, _ = host_for(direct, allow_http_upgrade=True)
                if owner_host(direct_host):
                    website = "https://" + direct_host + "/"
            except Held:
                pass
        if not website:
            result["reason"] = "owner_website_missing"
            continue
        try:
            host, landing_url = host_for(website, allow_http_upgrade=True)
            if not owner_host(host):
                raise Held("third_party_website")
            robots_allows(landing_url)
            landing = bounded_fetch(landing_url)
            if landing.kind != "html":
                raise Held("landing_not_html")
            landing_text, anchors = html_text(landing.raw)
            if normalize(row["name"]) not in normalize(landing_text):
                raise Held("venue_name_not_on_owner_site")
            result["identity_state"] = "owner_page_name_seen_current_catalogue_pending"
            host, landing_url = host_for(landing.url)
            links = menu_links(anchors, landing_url, host)
            if direct:
                direct_host, direct_url = host_for(direct, allow_http_upgrade=True)
                if same_host(direct_host, host) and direct_url not in links:
                    links.insert(0, direct_url)
            candidates = [landing_url] + links[:2]
            followed_pdf = False
            for url in candidates:
                try:
                    robots_allows(url)
                    page = landing if url == landing_url else bounded_fetch(url)
                    body_text, page_links = html_text(page.raw) if page.kind == "html" else (convert_pdf(page.raw, pdf_converter), [])
                    digest = sha(page.raw)
                    if digest in source_bytes and source_bytes[digest] != page.raw:
                        raise Held("hash_collision")
                    source_bytes[digest] = page.raw
                    prices = prices_from(body_text, page.url)
                    result["sources"].append({"url": page.url, "format": page.kind, "raw_sha256": digest,
                                              "raw_bytes": len(page.raw), "text_sha256": sha(body_text.encode("utf-8")),
                                              "checked_on": today().isoformat(), "first_party_basis": "same_host_and_venue_name_on_landing",
                                              "link_depth": 0 if url == landing_url else 2 if url not in links else 1,
                                              "review_state": "candidate_only", "price_candidates": prices})
                    if url != landing_url and page.kind == "html" and url in links:
                        local_pdfs, foreign_pdfs = linked_pdfs(page_links, page.url, host)
                        for pdf in foreign_pdfs[:6]:
                            result["sources"].append({"url": pdf, "linked_from": page.url, "status": "held",
                                                      "reason": "cross_host_pdf_requires_manual_review",
                                                      "review_state": "manual_source_review_required"})
                        if not followed_pdf:
                            next_pdf = next((pdf for pdf in local_pdfs if pdf not in candidates), None)
                            if next_pdf:
                                candidates.append(next_pdf)
                                followed_pdf = True
                except RunLimit:
                    result["status"] = "incomplete"
                    result["reason"] = "run_limit"
                    break
                except Held as error:
                    result["sources"].append({"url": url, "status": "held", "reason": str(error)})
            if result["status"] != "incomplete":
                result["status"] = "candidate" if any(
                    price["kind_guess"] == "drink"
                    for source in result["sources"] for price in source.get("price_candidates", [])
                ) else "held"
                result["reason"] = None if result["status"] == "candidate" else "no_explicit_drink_candidates"
        except RunLimit:
            result["status"] = "incomplete"
            result["reason"] = "run_limit"
        except (Held, ValueError) as error:
            result["reason"] = str(error)
        if result["status"] == "incomplete":
            break
    completed = sum(row["status"] != "incomplete" for row in records)
    next_offset = offset + completed
    page_complete = completed == len(chosen)
    report = {"schema_version": 1, "purpose": "review_only_existing_italian_venues", "checked_on": today().isoformat(),
              "queue_sha256": sha(raw_queue), "queue_inventory_complete": queue.get("inventory_complete") is True,
              "queue_candidates": len(rows), "selected_offset": offset,
              "selected_venues": len(chosen), "recorded_venues": len(records), "completed_venues": completed,
              "page_complete": page_complete, "next_offset": next_offset,
              "retry_offset": None if page_complete else next_offset,
              "remaining_candidates": len(rows) - next_offset,
              "request_attempts": attempts, "max_requests": max_requests,
              "max_seconds": max_seconds, "candidate_venues": sum(row["status"] == "candidate" for row in records),
              "raw_price_candidates": sum(len(source.get("price_candidates", [])) for row in records for source in row["sources"]),
              "drink_price_candidates": sum(price["kind_guess"] == "drink" for row in records for source in row["sources"]
                                             for price in source.get("price_candidates", [])),
              "publication_blocked": True, "public_imports": 0, "records": records}
    return report, source_bytes


def project_root() -> Path:
    repo = Path(__file__).resolve().parents[3]
    if repo.parent.name == "worktrees":
        return repo.parent.parent
    if repo.name == "repository":
        return repo.parent
    raise Held("not_selected_workspace")


def write_report(output: Path, root: Path, report: dict, sources: dict[str, bytes]) -> None:
    destination = output.resolve()
    project = root.resolve()
    expected_parent = (project / ".task-tmp").resolve()
    if expected_parent.parent != project:
        raise Held("project_temp_points_outside_workspace")
    if destination.parent != expected_parent or not re.fullmatch(r"menu-candidates-[a-z0-9-]{1,60}", destination.name) or destination.exists():
        raise Held("output_must_be_new_selected_project_temp_child")
    expected_parent.mkdir(parents=True, exist_ok=True)
    destination.mkdir(exist_ok=False)
    (destination / "sources").mkdir()
    for digest, raw in sources.items():
        if sha(raw) != digest:
            raise Held("source_digest_mismatch")
        (destination / "sources" / (digest + ".bin")).write_bytes(raw)
    with (destination / "report.json").open("x", encoding="utf-8", newline="\n") as stream:
        json.dump(report, stream, ensure_ascii=False, sort_keys=True, indent=2)
        stream.write("\n")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--queue", default="mobile-apps/data/italy-full-city-menu-source-queue-20261102.json")
    parser.add_argument("--output", required=True)
    parser.add_argument("--max-venues", type=int, default=12)
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--max-requests", type=int, default=36)
    parser.add_argument("--max-seconds", type=int, default=240)
    parser.add_argument("--pdftotext", default=shutil.which("pdftotext"))
    args = parser.parse_args(argv)
    try:
        path = Path(args.queue)
        if path.stat().st_size > QUEUE_LIMIT:
            raise Held("queue_limit")
        report, sources = crawl(path.read_bytes(), maximum=args.max_venues, offset=args.offset,
                                max_requests=args.max_requests, max_seconds=args.max_seconds,
                                pdf_converter=args.pdftotext)
        write_report(Path(args.output), project_root(), report, sources)
        print(json.dumps({"selected_venues": report["selected_venues"], "completed_venues": report["completed_venues"],
                          "page_complete": report["page_complete"], "next_offset": report["next_offset"],
                          "retry_offset": report["retry_offset"],
                          "remaining_candidates": report["remaining_candidates"], "request_attempts": report["request_attempts"],
                          "candidate_venues": report["candidate_venues"], "publication_blocked": True}))
        return 0
    except (Held, OSError, ValueError) as error:
        print("candidate crawl held: " + str(error), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
