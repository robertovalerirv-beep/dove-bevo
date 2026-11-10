"""Direct owner-linked JPEG menu sources require exact bytes and reviewed rows."""
import base64
import copy
import hashlib
import unittest

import import_v2 as core
from test_import_v2 import Fake, manifest, raw


# Synthetic 2x2 white JPEG; no venue image or menu content is copied into source.
JPEG=base64.b64decode('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==')
URL="https://example.org/menu.jpg"
LINE="Classic Spritz | EUR 7.50"


def jpeg_manifest():
    doc=manifest()
    source=doc["sources"][0]
    source["source_url"]=URL
    source["source_format"]="jpeg_image_v1"
    source["source_sha256"]=hashlib.sha256(JPEG).hexdigest()
    source["image_evidence"]=[{"offer_id":"offer-test-1","line":LINE}]
    source["source_text_sha256"]=core.jpeg_review_digest(
        source["source_sha256"],source["image_evidence"])
    doc["offers"][0]["evidence_ref"]="JPEG image: "+LINE
    return doc


class JpegFake(Fake):
    def __init__(self,body=JPEG):
        super().__init__()
        self.public[URL]=body
    def fetch(self,url,maximum=None):
        self.last_fetch_content_type="image/jpeg" if url==URL else None
        return super().fetch(url,maximum)


class JpegImageTests(unittest.TestCase):
    def test_synthetic_image_is_structurally_valid_and_dry_run_is_read_only(self):
        self.assertEqual(core.jpeg_dimensions(JPEG),(2,2))
        payload=raw(jpeg_manifest())
        transport=JpegFake()
        for _ in range(2):
            result=core.execute(payload,transport)
            self.assertTrue(result["complete"],result["errors"])
            self.assertEqual(result["sources"][0]["status"],"verified")
            self.assertEqual([r["outcome"] for r in result["rows"]],["eligible_at_read"]*2)
        self.assertEqual(transport.db.execute(
            "SELECT COUNT(*) FROM mobile_menu_v2_offers").fetchone()[0],0)

    def test_changed_bytes_mime_and_non_jpeg_fail_before_any_write(self):
        payload=raw(jpeg_manifest())
        changed=JpegFake(JPEG[:-4]+b"\x00\x00\xff\xd9")
        result=core.execute(payload,changed)
        self.assertFalse(result["complete"])
        self.assertEqual(result["errors"],[{"phase":"source","code":"source hash mismatch"}])
        self.assertEqual(changed.db.execute(
            "SELECT COUNT(*) FROM mobile_menu_v2_sources").fetchone()[0],0)
        for media,body in (("text/html",JPEG),("image/jpeg",b"<html>not a JPEG</html>")):
            with self.subTest(media=media,body=body[:8]):
                transport=JpegFake(body)
                transport.fetch=lambda url,maximum=None,media=media,transport=transport: (
                    setattr(transport,"last_fetch_content_type",media) or
                    Fake.fetch(transport,url,maximum))
                result=core.execute(payload,transport)
                self.assertFalse(result["complete"])
                self.assertEqual(result["errors"],[{"phase":"source","code":"unexpected JPEG source content"}
                                                    if media!="image/jpeg" else
                                                   {"phase":"source","code":"invalid JPEG"}])

    def test_redirect_and_private_or_indirect_urls_are_rejected(self):
        for url in ("http://example.org/menu.jpg","https://127.0.0.1/menu.jpg",
                    "https://example.org/menu","https://example.org/menu.jpg?next=1"):
            with self.subTest(url=url):
                doc=jpeg_manifest();doc["sources"][0]["source_url"]=url
                with self.assertRaises(core.Error): core.validate(raw(doc))
        transport=JpegFake()
        def redirect_at_image(url,maximum=None):
            if url==URL: raise core.legacy.Error("public source redirect refused")
            return Fake.fetch(transport,url,maximum)
        transport.fetch=redirect_at_image
        result=core.execute(raw(jpeg_manifest()),transport)
        self.assertFalse(result["complete"])
        self.assertEqual(result["errors"],[{"phase":"source","code":"public source redirect refused"}])

    def test_evidence_covers_exact_offer_and_source_digest(self):
        doc=jpeg_manifest()
        mutations=[]
        def add(label,change):
            changed=copy.deepcopy(doc);change(changed);mutations.append((label,changed))
        add("stale digest",lambda d:d["sources"][0].update(source_text_sha256="0"*64))
        add("missing offer",lambda d:d["sources"][0].update(image_evidence=[
            {"offer_id":"other","line":LINE}]))
        add("duplicate evidence",lambda d:d["sources"][0]["image_evidence"].append(
            copy.deepcopy(d["sources"][0]["image_evidence"][0])))
        add("wrong reference",lambda d:d["offers"][0].update(evidence_ref="JPEG image: other"))
        add("wrong name",lambda d:d["offers"][0].update(name="Negroni"))
        add("wrong price",lambda d:d["offers"][0].update(amount_minor=850))
        add("missing serving",lambda d:d["offers"][0].update(serving_label="25 cl"))
        add("conditional price",lambda d:d["offers"][0].update(
            price_context="conditional",condition_text="with dinner"))
        add("fee not reviewed",lambda d:d["fee_coverage"].append({
            "venue_key":d["venues"][0]["venue_key"],"cell":d["venues"][0]["cell"],
            "source_id":d["sources"][0]["id"],"status":"explicit_no_fee",
            "evidence_ref":"No fee"}))
        for label,changed in mutations:
            with self.subTest(label=label):
                with self.assertRaises(core.Error): core.validate(raw(changed))

    def test_digest_is_stable_for_evidence_order_and_changes_with_image(self):
        entries=[{"offer_id":"b","line":"Beer EUR 5.00"},
                 {"offer_id":"a","line":"Spritz EUR 7.00"}]
        original=hashlib.sha256(JPEG).hexdigest()
        self.assertEqual(core.jpeg_review_digest(original,entries),
                         core.jpeg_review_digest(original,list(reversed(entries))))
        changed=hashlib.sha256(JPEG+b"other").hexdigest()
        self.assertNotEqual(core.jpeg_review_digest(original,entries),
                            core.jpeg_review_digest(changed,entries))

    def test_changed_image_cannot_reuse_immutable_source_id(self):
        doc=jpeg_manifest()
        payload=raw(doc)
        transport=JpegFake()
        inserted=core.execute(payload,transport,True,hashlib.sha256(payload).hexdigest())
        self.assertTrue(inserted["complete"],inserted["errors"])
        before=transport.db.execute(
            "SELECT source_text_sha256 FROM mobile_menu_v2_sources WHERE id=?",
            (doc["sources"][0]["id"],)).fetchone()[0]
        changed=JPEG[:-4]+b"\x00\x00\xff\xd9"
        transport.public[URL]=changed
        revised=jpeg_manifest()
        source=revised["sources"][0]
        source["source_sha256"]=hashlib.sha256(changed).hexdigest()
        source["source_text_sha256"]=core.jpeg_review_digest(
            source["source_sha256"],source["image_evidence"])
        self.assertNotEqual(before,source["source_text_sha256"])
        next_payload=raw(revised)
        blocked=core.execute(next_payload,transport,True,hashlib.sha256(next_payload).hexdigest())
        self.assertFalse(blocked["complete"])
        self.assertEqual(blocked["errors"],[{"phase":"private_preflight",
                                             "code":"conflicting existing v2 row"}])
        self.assertEqual(transport.db.execute(
            "SELECT source_text_sha256 FROM mobile_menu_v2_sources WHERE id=?",
            (doc["sources"][0]["id"],)).fetchone()[0],before)


if __name__=="__main__": unittest.main()
