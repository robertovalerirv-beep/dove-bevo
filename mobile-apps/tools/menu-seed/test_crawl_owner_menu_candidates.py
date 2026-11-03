"""Offline safety and evidence tests for the first-party candidate crawler."""

from datetime import date
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import crawl_owner_menu_candidates as c


def queue(*rows):
    candidates = list(rows)
    return json.dumps({"schema_version": 1, "checked_on": "2026-11-02",
                       "catalogue_version": "20261101", "inventory_complete": False,
                       "source_candidates": len(candidates), "candidates": candidates}).encode()


def row(key="n1", city="Milano", **url_tags):
    return {"key": key, "name": "Bar Uno", "city": city, "cell": "u0nd8",
            "state": "candidate", "url_tags": url_tags or {"website": "https://bar-uno.it/"}}


class CandidateCrawlerTests(unittest.TestCase):
    def test_url_and_owner_guards(self):
        rejected = ["file:///etc/passwd", "http://bar-uno.it/", "https://127.0.0.1/",
                    "https://localhost.local/", "https://bar-uno.it:8443/menu",
                    "https://user@bar-uno.it/", "https://bar-uno.it/hi#fragment",
                    "https://bar-uno.it/a b", "https://bar-uno.it/\\evil",
                    "https://bar-uno.it/%0a\nfoo"]
        for value in rejected:
            with self.subTest(value=value), self.assertRaises(c.Held):
                c.host_for(value)
        self.assertEqual(c.host_for("http://bar-uno.it/", allow_http_upgrade=True),
                         ("bar-uno.it", "https://bar-uno.it/"))
        self.assertFalse(c.owner_host("instagram.com"))
        self.assertFalse(c.owner_host("shop.facebook.com"))
        self.assertFalse(c.owner_host("dishcovery.menu"))
        self.assertFalse(c.owner_host("bibendumenoteca.wixsite.com"))
        self.assertTrue(c.owner_host("bar-uno.it"))

    def test_dns_rejects_mixed_private_answer(self):
        answers = [(2, 1, 6, "", ("93.184.216.34", 443)),
                   (2, 1, 6, "", ("127.0.0.1", 443))]
        with patch.object(c.socket, "getaddrinfo", return_value=answers), self.assertRaisesRegex(c.Held, "non_public_dns"):
            c.public_addresses("bar-uno.it")

    def test_visible_html_omits_hidden_content_and_collects_links(self):
        source = ('<h1>Bar Uno</h1><div hidden>Spritz 99,00 €</div>'
                  '<script>Beer 88,00 €</script><p>Birra media 5,00 €</p>'
                  '<a href="/menu.pdf">Menu drink</a>').encode("utf-8")
        text, links = c.html_text(source)
        self.assertIn("Birra media 5,00", text)
        self.assertNotIn("99,00", text)
        self.assertNotIn("88,00", text)
        self.assertEqual(links, [("/menu.pdf", "Menu drink")])

    def test_first_party_menu_links_only(self):
        links = [("/menu.pdf", "Menu"), ("https://evil.it/menu", "Menu"),
                 ("https://bar-uno.it:8443/drinks", "Drinks"),
                 ("//shop.bar-uno.it/drink", "Drinks"),
                 ("/about", "About")]
        self.assertEqual(c.menu_links(links, "https://bar-uno.it/", "bar-uno.it"),
                         ["https://bar-uno.it/menu.pdf"])

    def test_price_candidates_are_explicit_and_uncertain(self):
        prices = c.prices_from("Spritz 5,50 € 20 cl\nCoperto 2,00 €\nBirra 4,00 € / 6,00 €\nGin tonic without amount")
        self.assertEqual([p["amount_minor_guess"] for p in prices], [550, 200, 400, 600])
        self.assertEqual(prices[0]["serving_literal"], "20 cl")
        self.assertEqual(prices[0]["kind_guess"], "drink")
        self.assertEqual(prices[1]["kind_guess"], "fee")
        self.assertIn("multiple_prices_on_line", prices[2]["uncertainty"])
        self.assertTrue(all("review_required" in p["uncertainty"] for p in prices))
        self.assertEqual(c.prices_from("No menu prices here"), [])
        context_only = c.prices_from("Genepi 5,00 € 6 cl", "https://bar-uno.it/drink/menu")
        self.assertEqual(context_only[0]["kind_guess"], "drink")
        self.assertIn("drink_context_only", context_only[0]["uncertainty"])
        self.assertEqual(c.prices_from("Torta 50 €")[0]["kind_guess"], "unclassified")

    def test_pdf_conversion_uses_memory_and_is_bounded(self):
        result = subprocess.CompletedProcess([], 0, b"Spritz 5,50 \xe2\x82\xac\n", b"")
        with patch.object(c.subprocess, "run", return_value=result) as run:
            self.assertEqual(c.pdf_text(b"%PDF-foo", "pdftotext"), "Spritz 5,50 €\n")
            self.assertEqual(run.call_args.kwargs["input"], b"%PDF-foo")
            self.assertEqual(run.call_args.args[0], ["pdftotext", "-layout", "-", "-"])
        with self.assertRaisesRegex(c.Held, "pdf_converter_unavailable"):
            c.pdf_text(b"%PDF-foo", None)

    def test_queue_rejects_duplicate_identity_and_nonfinite(self):
        with self.assertRaisesRegex(c.Held, "bad_candidate"):
            c.queue_rows(queue(row(), row()))
        with self.assertRaisesRegex(c.Held, "nonfinite_json"):
            c.queue_rows(queue(row()).replace(b'"source_candidates": 1', b'"source_candidates": NaN'))
        self.assertEqual(c.select([row("n1", "Milano"), row("n2", "Roma"),
                                   row("n3", "Milano")], 3)[0]["key"], "n1")

    def test_live_flow_is_read_only_bounded_and_honors_robots(self):
        calls = []
        clock_value = [0.0]

        def fake_clock():
            return clock_value[0]

        def fake_sleep(seconds):
            clock_value[0] += seconds

        def fake_fetch(url):
            calls.append(url)
            if url == "https://bar-uno.it/robots.txt":
                return c.Page(url, "robots", b"User-agent: *\nDisallow: /private\n")
            if url == "https://bar-uno.it/":
                return c.Page(url, "html", b'<h1>Bar Uno</h1><a href="/menu">Drink menu</a>'
                              b'<a href="/private/menu">Private menu</a>'
                              b'<a href="https://evil.it/menu">Drink menu</a>')
            if url == "https://bar-uno.it/menu":
                return c.Page(url, "html", "<h1>Bar Uno</h1><p>Spritz 5,50 €</p>".encode())
            self.fail("unapproved request: " + url)

        report, sources = c.crawl(queue(row()), maximum=1, max_requests=3, max_seconds=30,
                                  fetch=fake_fetch, clock=fake_clock, sleep=fake_sleep,
                                  today=lambda: date(2026, 11, 3))
        self.assertEqual(calls, ["https://bar-uno.it/robots.txt", "https://bar-uno.it/",
                                 "https://bar-uno.it/menu"])
        self.assertEqual(report["request_attempts"], 3)
        self.assertEqual(report["candidate_venues"], 1)
        self.assertEqual(report["public_imports"], 0)
        self.assertTrue(report["publication_blocked"])
        self.assertEqual(len(sources), 2)
        record = report["records"][0]
        self.assertEqual(record["venue_key"], "n1")
        self.assertEqual(record["identity_state"], "owner_page_name_seen_current_catalogue_pending")
        self.assertTrue(any(source.get("reason") == "robots_disallow" for source in record["sources"]))
        self.assertTrue(any(source.get("price_candidates") for source in record["sources"]))
        self.assertTrue(all(source.get("raw_sha256") in sources for source in record["sources"] if "raw_sha256" in source))

    def test_landing_identity_fail_stops_menu_requests(self):
        calls = []

        def fetch(url):
            calls.append(url)
            if url.endswith("robots.txt"):
                raise c.Held("http_404")
            return c.Page(url, "html", b'<h1>Another Business</h1><a href="/menu">Menu</a>')

        report, sources = c.crawl(queue(row()), maximum=1, max_requests=3, max_seconds=30,
                                  fetch=fetch, sleep=lambda _: None)
        self.assertEqual(len(calls), 2)
        self.assertEqual(report["records"][0]["reason"], "venue_name_not_on_owner_site")
        self.assertEqual(sources, {})

    def test_owner_redirect_counts_requests_and_rechecks_robots(self):
        calls = []

        def fetch(url):
            calls.append(url)
            if url.endswith("/robots.txt"):
                raise c.Held("http_404")
            if url == "https://bar-uno.it/":
                return c.Page("https://www.bar-uno.it/", "redirect", b"")
            if url == "https://www.bar-uno.it/":
                return c.Page(url, "html", b"<h1>Bar Uno</h1>")
            self.fail("unapproved request: " + url)

        report, _ = c.crawl(queue(row()), maximum=1, max_requests=4, max_seconds=30,
                            fetch=fetch, sleep=lambda _: None)
        self.assertEqual(report["request_attempts"], 4)
        self.assertEqual(calls, ["https://bar-uno.it/robots.txt", "https://bar-uno.it/",
                                 "https://www.bar-uno.it/robots.txt", "https://www.bar-uno.it/"])
        self.assertEqual(report["records"][0]["sources"][0]["url"], "https://www.bar-uno.it/")

    def test_redirect_cannot_escape_owner_domain(self):
        def fetch(url):
            if url.endswith("robots.txt"):
                raise c.Held("http_404")
            return c.Page("https://evil.it/menu", "redirect", b"")
        report, _ = c.crawl(queue(row()), maximum=1, max_requests=4, max_seconds=30,
                            fetch=fetch, sleep=lambda _: None)
        self.assertEqual(report["records"][0]["reason"], "redirect_crosses_owner_host")
        self.assertEqual(report["request_attempts"], 2)

    def test_robots_crawl_delay_is_honored(self):
        now = [0.0]
        waits = []

        def fetch(url):
            if url.endswith("robots.txt"):
                return c.Page(url, "robots", b"User-agent: *\nCrawl-delay: 2\n")
            return c.Page(url, "html", b"<h1>Bar Uno</h1>")

        def sleep(seconds):
            waits.append(seconds)
            now[0] += seconds

        c.crawl(queue(row()), maximum=1, max_requests=2, max_seconds=30,
                fetch=fetch, sleep=sleep, clock=lambda: now[0])
        self.assertEqual(waits, [2.0])

    def test_direct_menu_tag_supplies_owner_root_when_website_absent(self):
        calls = []

        def fetch(url):
            calls.append(url)
            if url.endswith("robots.txt"):
                raise c.Held("http_404")
            if url == "https://bar-uno.it/":
                return c.Page(url, "html", b"<h1>Bar Uno</h1>")
            if url == "https://bar-uno.it/drink-menu":
                return c.Page(url, "html", "<p>Spritz 5,50 €</p>".encode())
            self.fail("unapproved request: " + url)

        report, _ = c.crawl(queue(row(**{"website:menu": "https://bar-uno.it/drink-menu"})),
                            maximum=1, max_requests=3, max_seconds=30, fetch=fetch, sleep=lambda _: None)
        self.assertEqual(report["candidate_venues"], 1)
        self.assertEqual(calls, ["https://bar-uno.it/robots.txt", "https://bar-uno.it/",
                                 "https://bar-uno.it/drink-menu"])

    def test_report_stays_in_selected_project_temp(self):
        selected = c.project_root()
        task_temp = selected / ".task-tmp"
        task_temp.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=task_temp) as temporary:
            root = Path(temporary)
            (root / ".task-tmp").mkdir()
            report = {"publication_blocked": True, "public_imports": 0}
            content = b"<h1>Bar Uno</h1>"
            output = root / ".task-tmp" / "menu-candidates-test"
            c.write_report(output, root, report, {c.sha(content): content})
            self.assertEqual(json.loads((output / "report.json").read_text()), report)
            self.assertEqual((output / "sources" / (c.sha(content) + ".bin")).read_bytes(), content)
            with self.assertRaisesRegex(c.Held, "output_must_be_new"):
                c.write_report(output, root, report, {})
            with self.assertRaisesRegex(c.Held, "output_must_be_new"):
                c.write_report(root / "wrong" / "menu-candidates-test", root, report, {})


if __name__ == "__main__":
    unittest.main()
