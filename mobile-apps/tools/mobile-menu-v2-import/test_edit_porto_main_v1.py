import copy
import hashlib
import unittest
from unittest import mock

import import_v2 as core


MAIN = "BEER SELECTION IPA 6,00 € COPERTO/PANE/SERVIZIO 2,00 €"
HTML = ("<html><head><title>EDIT</title></head><body><main><h1>BEER SELECTION</h1>"
        "<p>IPA 6,00 €</p><p>COPERTO/PANE/SERVIZIO 2,00 €</p></main>"
        "<footer>Newsletter order A</footer></body></html>").encode("utf-8")
WITH_NEW_FOOTER = HTML.replace(b"Newsletter order A", b"Newsletter order B")
EXPECTED = hashlib.sha256(MAIN.encode("utf-8")).hexdigest()


def source():
    return {
        "id": "src-edit-test",
        "venue_key": core.EDIT_PORTO_VENUE_KEY,
        "cell": core.EDIT_PORTO_CELL,
        "source_url": core.EDIT_PORTO_MENU_URL,
        "source_format": "edit_porto_urbano_main_v1",
        "source_sha256": EXPECTED,
        "source_text_sha256": EXPECTED,
        "source_checked_on": "2026-11-20",
        "use_review_status": "approved",
        "use_review_basis": "Owner menu and venue hub reviewed",
        "use_review_reference": core.EDIT_PORTO_OWNER_URL,
        "use_reviewed_on": "2026-11-20",
    }


class EditPortoMainTests(unittest.TestCase):
    def test_only_one_complete_main_is_required(self):
        for body in (
            HTML.replace(b"<main>", b"<section>").replace(b"</main>", b"</section>"),
            HTML.replace(b"</main>", b"</main><main>second</main>"),
            HTML.replace(b"<main>", b"<main><main>").replace(b"</main>", b"</main></main>"),
            HTML.replace(b"</main>", b""),
            HTML.replace(b"<main>", b"<main/>").replace(b"</main>", b""),
        ):
            with self.subTest(body=body[:80]), self.assertRaisesRegex(core.Error, "EDIT main section"):
                core.source_digests(body, "edit_porto_urbano_main_v1")

    def test_footer_changes_do_not_change_the_pinned_menu(self):
        self.assertEqual(core.source_digests(HTML, "edit_porto_urbano_main_v1"),
                         (EXPECTED, EXPECTED))
        self.assertEqual(core.source_digests(WITH_NEW_FOOTER, "edit_porto_urbano_main_v1"),
                         (EXPECTED, EXPECTED))
        self.assertNotEqual(core.source_digests(HTML, "html_text_v1"),
                            core.source_digests(WITH_NEW_FOOTER, "html_text_v1"))

    def test_changed_drink_or_fee_fails_the_source_identity(self):
        for body in (HTML, WITH_NEW_FOOTER):
            with self.subTest(footer=body is WITH_NEW_FOOTER), \
                 mock.patch.object(core, "public_fetch", return_value=body):
                self.assertEqual(core.source_identity(source(), object(), {}, []), "verified")
        for changed in (HTML.replace(b"IPA", b"STOUT"),
                        HTML.replace(b"6,00", b"7,00"),
                        HTML.replace(b"2,00", b"3,00")):
            with self.subTest(changed=changed[:80]), \
                 mock.patch.object(core, "public_fetch", return_value=changed), \
                 self.assertRaisesRegex(core.Error, "source hash mismatch"):
                core.source_identity(source(), object(), {}, [])

    def test_script_and_style_text_in_main_are_ignored_as_with_html_text_v1(self):
        body = HTML.replace(b"<p>IPA", b"<script>rolling = 10</script><style>.price{color:red}</style><p>IPA")
        self.assertEqual(core.source_digests(body, "edit_porto_urbano_main_v1"),
                         (EXPECTED, EXPECTED))

    def test_format_is_bound_to_exact_owner_venue_and_cell(self):
        venues = {
            core.EDIT_PORTO_VENUE_KEY: {"cell": core.EDIT_PORTO_CELL},
            "n12345": {"cell": core.EDIT_PORTO_CELL},
        }
        core.validate_source(source(), venues, "2026-11-20")
        for field, value in (
            ("source_url", "https://editspace.com/menu-edit-porto-urbano?copy=1"),
            ("use_review_reference", "https://editspace.com/hubs/other"),
            ("venue_key", "n12345"),
        ):
            changed = copy.deepcopy(source())
            changed[field] = value
            with self.subTest(field=field), self.assertRaisesRegex(core.Error, "unreviewed EDIT Porto Urbano source"):
                core.validate_source(changed, venues, "2026-11-20")
        changed = source()
        changed["cell"] = "u0j2s"
        with self.assertRaisesRegex(core.Error, "source venue mismatch"):
            core.validate_source(changed, venues, "2026-11-20")
        changed = source()
        changed["source_text_sha256"] = "0" * 64
        with self.assertRaisesRegex(core.Error, "HTML text hashes differ"):
            core.validate_source(changed, venues, "2026-11-20")


if __name__ == "__main__":
    unittest.main()
