"""The single owner-linked Yellow Bar PDF does not widen Google source access."""
import copy
import unittest
from urllib.error import HTTPError

import import_v2 as core


def source():
    return {
        "id": "yellow-bar-pdf", "venue_key": "n2244964954", "cell": "sr2yk",
        "source_url": core.YELLOW_BAR_MENU_URL, "source_format": "pdf_text_v1",
        "source_sha256": core.YELLOW_BAR_RAW_SHA256,
        "source_text_sha256": core.YELLOW_BAR_TEXT_SHA256,
        "source_checked_on": "2026-11-11", "use_review_status": "approved",
        "use_review_basis": "Owner-linked current drink menu PDF",
        "use_review_reference": core.YELLOW_BAR_OWNER_URL,
        "use_reviewed_on": "2026-11-11",
    }


VENUES = {"n2244964954": {"cell": "sr2yk"},
          "n2244964955": {"cell": "sr2yk"}}


class YellowBarDriveSourceTests(unittest.TestCase):
    def test_only_exact_owner_linked_pdf_is_allowed(self):
        core.validate_source(source(), VENUES, "2026-11-11")
        core.https(core.YELLOW_BAR_MENU_URL, source=True)
        rejected_urls = (
            core.YELLOW_BAR_MENU_URL + "&extra=1",
            core.YELLOW_BAR_MENU_URL.replace("drive.usercontent.google.com", "drive.google.com"),
            core.YELLOW_BAR_MENU_URL.replace("15wX_FusoJscsC_S4WMUJhoukDx6ligee", "other-id"),
            "https://drive.usercontent.google.com/download?id=another&export=download",
            "https://www.google.com/menus/yellow-bar.pdf",
        )
        for url in rejected_urls:
            with self.subTest(url=url), self.assertRaisesRegex(core.Error, "restricted URL"):
                core.https(url, source=True)

    def test_document_venue_format_owner_and_both_hashes_are_pinned(self):
        variants = {
            "venue_key": "n2244964955", "cell": "u0nd3",
            "source_format": "html_text_v1",
            "use_review_reference": "https://example.org/owner",
            "source_sha256": "0" * 64, "source_text_sha256": "0" * 64,
        }
        for field, changed in variants.items():
            row = copy.deepcopy(source())
            row[field] = changed
            with self.subTest(field=field), self.assertRaises(core.Error):
                core.validate_source(row, VENUES, "2026-11-11")

    def test_pdf_fetch_requires_public_dns_bounded_bytes_and_pdf_magic(self):
        class Transport:
            def __init__(self, body, media_type="application/octet-stream"):
                self.body = body
                self.last_fetch_content_type = media_type
            def fetch(self, address, maximum):
                self.address, self.maximum = address, maximum
                return self.body

        public = lambda *args, **kwargs: [(None, None, None, None, ("1.1.1.1", 443))]
        private = lambda *args, **kwargs: [(None, None, None, None, ("127.0.0.1", 443))]
        transport = Transport(b"%PDF-1.7\nmock")
        self.assertEqual(core.public_fetch(transport, core.YELLOW_BAR_MENU_URL,
                                           core.MAX_SOURCE, "pdf", public),
                         transport.body)
        self.assertEqual(transport.address, core.YELLOW_BAR_MENU_URL)
        self.assertEqual(transport.maximum, core.MAX_SOURCE)
        with self.assertRaisesRegex(core.Error, "non-public"):
            core.public_fetch(transport, core.YELLOW_BAR_MENU_URL,
                              core.MAX_SOURCE, "pdf", private)
        for body, error in ((b"<html>login</html>", "unexpected PDF"),
                            (b"%PDF-" + b"x" * core.MAX_SOURCE, "response size")):
            with self.subTest(error=error), self.assertRaisesRegex(core.Error, error):
                core.public_fetch(Transport(body), core.YELLOW_BAR_MENU_URL,
                                  core.MAX_SOURCE, "pdf", public)
        for media_type in ("text/html", "application/json", ""):
            with self.subTest(media_type=media_type), self.assertRaisesRegex(
                    core.Error, "unexpected Yellow Bar PDF media type"):
                core.public_fetch(Transport(b"%PDF-1.7\nmock", media_type),
                                  core.YELLOW_BAR_MENU_URL, core.MAX_SOURCE, "pdf", public)

    def test_redirect_response_is_not_followed(self):
        class RedirectOpener:
            def open(self, request, timeout):
                raise HTTPError(request.full_url, 302, "Found",
                                {"Location": "https://127.0.0.1/private"}, None)

        transport = core.legacy.Transport("0" * 32, "test-token")
        transport.opener = RedirectOpener()
        public = lambda *args, **kwargs: [(None, None, None, None, ("1.1.1.1", 443))]
        with self.assertRaisesRegex(core.Error, "public source HTTP 302"):
            core.public_fetch(transport, core.YELLOW_BAR_MENU_URL,
                              core.MAX_SOURCE, "pdf", public)


if __name__ == "__main__":
    unittest.main()
