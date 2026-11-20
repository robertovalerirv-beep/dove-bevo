"""Attribute-aware HTML pin for reviewed first-party image-labelled menus."""
import hashlib
import unittest

import import_v2 as core
from test_import_v2 import Fake, manifest, raw


PAGE = (b'<html><body><h2>Vino Rosso</h2><p>EUR 6</p>'
        b'<img alt="Prezzo a bicchiere" src="/glass.svg">'
        b'<p>EUR 24</p><img alt="Prezzo a bottiglia" src="/bottle.svg">'
        b'</body></html>')


class HTMLTextImagesPinTests(unittest.TestCase):
    def test_alt_and_src_change_pin_but_not_existing_text_mode(self):
        bottle = PAGE.replace(b'alt="Prezzo a bicchiere"', b'alt="Prezzo a bottiglia"', 1)
        changed_src = PAGE.replace(b'/glass.svg', b'/bottle.svg', 1)
        legacy = core.legacy.source_digest(PAGE, "html_text_v1")
        self.assertEqual(legacy, core.legacy.source_digest(bottle, "html_text_v1"))
        self.assertEqual(legacy, core.legacy.source_digest(changed_src, "html_text_v1"))
        pinned = core.source_digests(PAGE, "html_text_images_v1")
        self.assertEqual(pinned, (pinned[0], pinned[0]))
        self.assertNotEqual(pinned, core.source_digests(bottle, "html_text_images_v1"))
        self.assertNotEqual(pinned, core.source_digests(changed_src, "html_text_images_v1"))

    def test_unrelated_markup_can_change_without_changing_pin(self):
        equivalent = (b'<html><body data-request="nonce"><h2><span>Vino Rosso</span></h2>'
                      b'<p class="menu"> EUR 6 </p>'
                      b'<img src="/glass.svg" alt="Prezzo a bicchiere">'
                      b'<p>EUR 24</p><img src="/bottle.svg" alt="Prezzo a bottiglia">'
                      b'<script>dynamic nonce</script></body></html>')
        self.assertEqual(core.source_digests(PAGE, "html_text_images_v1"),
                         core.source_digests(equivalent, "html_text_images_v1"))

    def test_image_moved_across_text_changes_pin(self):
        moved = PAGE.replace(b'<p>EUR 24</p><img alt="Prezzo a bottiglia" src="/bottle.svg">',
                             b'<img alt="Prezzo a bottiglia" src="/bottle.svg"><p>EUR 24</p>')
        self.assertNotEqual(core.source_digests(PAGE, "html_text_images_v1"),
                            core.source_digests(moved, "html_text_images_v1"))

    def test_duplicate_image_attributes_are_held(self):
        malformed = PAGE.replace(b'alt="Prezzo a bicchiere"',
                                 b'alt="Prezzo a bicchiere" alt="Prezzo a bottiglia"', 1)
        with self.assertRaises(core.Error):
            core.source_digests(malformed, "html_text_images_v1")

    def test_protected_audit_holds_changed_alt_without_writes(self):
        doc = manifest()
        source = doc["sources"][0]
        source["source_format"] = "html_text_images_v1"
        source["source_sha256"], source["source_text_sha256"] = (
            core.source_digests(PAGE, "html_text_images_v1"))
        doc["offers"][0]["name"] = "Vino Rosso"
        doc["offers"][0]["category"] = "wine_glass"
        doc["offers"][0]["serving_label"] = "bicchiere"
        payload = raw(doc)
        transport = Fake()
        transport.public[source["source_url"]] = PAGE
        audit = core.execute(payload, transport)
        self.assertTrue(audit["complete"], audit["errors"])
        self.assertEqual(transport.db.execute(
            "SELECT COUNT(*) FROM mobile_menu_v2_offers").fetchone()[0], 0)

        transport.public[source["source_url"]] = PAGE.replace(
            b'alt="Prezzo a bicchiere"', b'alt="Prezzo a bottiglia"', 1)
        transport.attest_binding = lambda: self.fail(
            "changed image meaning must fail before provider attestation")
        held = core.execute(payload, transport, True, hashlib.sha256(payload).hexdigest())
        self.assertFalse(held["complete"])
        self.assertTrue(held["errors"])
        self.assertEqual(transport.db.execute(
            "SELECT COUNT(*) FROM mobile_menu_v2_offers").fetchone()[0], 0)
        self.assertEqual(transport.db.execute(
            "SELECT COUNT(*) FROM mobile_menu_v2_sources").fetchone()[0], 0)

        transport.public[source["source_url"]] = PAGE.replace(
            b'alt="Prezzo a bicchiere"',
            b'alt="Prezzo a bicchiere" alt="Prezzo a bottiglia"', 1)
        malformed = core.execute(payload, transport, True, hashlib.sha256(payload).hexdigest())
        self.assertFalse(malformed["complete"])
        self.assertEqual(malformed["errors"][0]["code"],
                         "duplicate image alt or src attribute")
        self.assertEqual(transport.db.execute(
            "SELECT COUNT(*) FROM mobile_menu_v2_sources").fetchone()[0], 0)

    def test_new_mode_keeps_restricted_source_and_html_gates(self):
        doc = manifest()
        source = doc["sources"][0]
        source["source_format"] = "html_text_images_v1"
        source["source_sha256"], source["source_text_sha256"] = (
            core.source_digests(PAGE, "html_text_images_v1"))
        source["source_url"] = "https://www.google.com/menu"
        with self.assertRaises(core.Error):
            core.validate(raw(doc))
        source["source_url"] = "https://example.org/menu"
        transport = Fake()
        transport.public[source["source_url"]] = b"Vino Rosso EUR 6"
        held = core.execute(raw(doc), transport)
        self.assertFalse(held["complete"])
        self.assertTrue(held["errors"])


if __name__ == "__main__":
    unittest.main()
