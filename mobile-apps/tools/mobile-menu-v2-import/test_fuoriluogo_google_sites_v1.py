import copy
import hashlib
import json
from pathlib import Path
import unittest
from unittest import mock

import import_v2 as core


MENU = "FUORILUOGO VINYL ART CAFE - MENU BIRRE ALLA SPINA € 5,5 BIONDA TUBORG MEDIA " \
       "COCKTAIL € 7 NEGRONI CAFFETTERIA € 2 TE' CALDI E TISANE Page updated"
HTML = ("<html><body><h1>" + MENU + "</h1></body></html>").encode("utf-8")
WITH_COOKIE = ("<html><body><h1>" + MENU + "</h1><aside>" +
               core.GOOGLE_SITES_COOKIE_NOTICE + "</aside></body></html>").encode("utf-8")
EXPECTED = hashlib.sha256(MENU.encode("utf-8")).hexdigest()
MANIFEST = (Path(__file__).resolve().parents[2] / "data" / "mobile-menu-v2-seeds" /
            "da66a119cedca76761d929233b16d6c62faa39949c499b8659163e72a92db1de.json")


class FuoriLuogoGoogleSitesTests(unittest.TestCase):
    def test_only_exact_optional_cookie_footer_is_excluded(self):
        self.assertEqual(core.source_digests(HTML,"fuoriluogo_google_sites_v1"),
                         (EXPECTED,EXPECTED))
        self.assertEqual(core.source_digests(WITH_COOKIE,"fuoriluogo_google_sites_v1"),
                         (EXPECTED,EXPECTED))
        self.assertNotEqual(core.source_digests(HTML,"html_text_v1"),
                            core.source_digests(WITH_COOKIE,"html_text_v1"))
        self.assertNotEqual(core.source_digests(
            WITH_COOKIE.replace(b"5,5",b"6,5"),"fuoriluogo_google_sites_v1")[0],
            EXPECTED)
        self.assertNotEqual(core.source_digests(
            WITH_COOKIE.replace(b"Got it",b"Got one"),"fuoriluogo_google_sites_v1")[0],
            EXPECTED)

    def test_source_identity_rejects_changed_menu_even_with_cookie(self):
        source={"id":"src-test","source_url":core.FUORILUOGO_MENU_URL,
                "source_format":"fuoriluogo_google_sites_v1",
                "source_sha256":EXPECTED,"source_text_sha256":EXPECTED,
                "use_review_status":"approved"}
        for body in (HTML,WITH_COOKIE):
            with self.subTest(body=body is WITH_COOKIE), \
                 mock.patch.object(core,"public_fetch",return_value=body):
                self.assertEqual(core.source_identity(source,object(),{},[]),"verified")
        with mock.patch.object(core,"public_fetch",return_value=WITH_COOKIE.replace(b"5,5",b"6,5")):
            with self.assertRaisesRegex(core.Error,"source hash mismatch"):
                core.source_identity(source,object(),{},[])

    def test_exact_owner_url_and_manifest_are_required(self):
        raw=MANIFEST.read_bytes()
        self.assertEqual(hashlib.sha256(raw).hexdigest(),MANIFEST.stem)
        doc=core.validate(raw)
        self.assertEqual(len(doc["offers"]),52)
        self.assertEqual(len(doc["sources"]),1)
        source=doc["sources"][0]
        self.assertEqual(source["source_sha256"],
                         "441f4e8d1b621b4f7ee4d101de9bc91f720b305b831926f7833b09d40a9be17d")
        self.assertEqual(source["source_format"],"fuoriluogo_google_sites_v1")
        venues={doc["venues"][0]["venue_key"]:doc["venues"][0]}
        other=copy.deepcopy(source)
        other["source_url"]="https://other.example/menu"
        with self.assertRaisesRegex(core.Error,"unreviewed FuoriLuogo Google Sites source"):
            core.validate_source(other,venues,doc["checked_on"])

    def test_corrected_manifest_preserves_all_52_factual_offers(self):
        old=MANIFEST.with_name(
            "703077eb375b6ae39ec07ba20d1ac820560e76b6fdfef3a4f50927869c9de61e.json")
        before=json.loads(old.read_bytes())
        after=json.loads(MANIFEST.read_bytes())
        self.assertEqual(before["venues"],after["venues"])
        self.assertEqual(before["fees"],after["fees"])
        self.assertEqual(before["fee_coverage"],after["fee_coverage"])
        self.assertEqual(len(after["offers"]),52)
        for original,corrected in zip(before["offers"],after["offers"]):
            self.assertEqual({k:v for k,v in original.items() if k!="source_id"},
                             {k:v for k,v in corrected.items() if k!="source_id"})


if __name__=="__main__":
    unittest.main()
