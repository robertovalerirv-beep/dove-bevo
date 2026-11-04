"""Guarded importer tests using a synthetic raster-only, one-page menu PDF."""
import copy
import hashlib
from pathlib import Path
import subprocess
import unittest
from unittest import mock

import import_v2 as core
from test_import_v2 import Fake, manifest, raw


FIXTURE=Path(__file__).parent/"fixtures"/"image-only-menu.pdf"
MENU_PDF=FIXTURE.read_bytes()
LINE="Classic Spritz | EUR 7.50"


def image_manifest():
    doc=manifest()
    source=doc["sources"][0]
    source["source_format"]="pdf_image_v1"
    source["source_sha256"]=hashlib.sha256(MENU_PDF).hexdigest()
    source["page_count"]=1
    source["image_evidence"]=[{"offer_id":"offer-test-1","page":1,"line":LINE}]
    source["source_text_sha256"]=core.image_review_digest(
        source["source_sha256"],source["image_evidence"])
    doc["offers"][0]["evidence_ref"]="PDF page 1: "+LINE
    return doc


def transport_with_pdf(pdf=MENU_PDF):
    transport=Fake()
    transport.public["https://example.org/menu"]=pdf
    return transport


class ImagePdfTests(unittest.TestCase):
    def test_review_digest_is_independent_of_evidence_order(self):
        entries=[{"offer_id":"one","page":1,"line":"Spritz EUR 7.50"},
                 {"offer_id":"two","page":2,"line":"Beer EUR 5.00"}]
        pdf_hash=hashlib.sha256(MENU_PDF).hexdigest()
        self.assertEqual(core.image_review_digest(pdf_hash,entries),
                         core.image_review_digest(pdf_hash,list(reversed(entries))))

    def test_fixture_is_image_only_and_dry_run_is_repeatable_without_writes(self):
        text=subprocess.run(["pdftotext","-layout","-enc","UTF-8","-","-"],
                            input=MENU_PDF,capture_output=True,timeout=30,check=True)
        self.assertFalse(text.stdout.strip())
        self.assertEqual(core.pdf_page_count(MENU_PDF),1)
        doc=image_manifest()
        payload=raw(doc)
        transport=transport_with_pdf()
        first=core.execute(payload,transport)
        second=core.execute(payload,transport)
        for receipt in (first,second):
            self.assertTrue(receipt["complete"],receipt["errors"])
            self.assertEqual([row["outcome"] for row in receipt["rows"]],
                             ["eligible_at_read"]*2)
            self.assertEqual(receipt["sources"][0]["status"],"verified")
        self.assertEqual(first["rows"],second["rows"])
        self.assertEqual(transport.db.execute(
            "SELECT COUNT(*) FROM mobile_menu_v2_sources").fetchone()[0],0)
        self.assertEqual(transport.db.execute(
            "SELECT COUNT(*) FROM mobile_menu_v2_offers").fetchone()[0],0)

    def test_exact_pdf_bytes_and_page_count_are_pinned(self):
        doc=image_manifest()
        transport=transport_with_pdf(MENU_PDF+b"\n% changed fixture bytes\n")
        result=core.execute(raw(doc),transport)
        self.assertFalse(result["complete"])
        self.assertEqual(result["errors"],[{"phase":"source","code":"source hash mismatch"}])
        self.assertEqual(result["rows"],[])
        self.assertEqual(transport.db.execute(
            "SELECT COUNT(*) FROM mobile_menu_v2_offers").fetchone()[0],0)

        doc["sources"][0]["page_count"]=2
        result=core.execute(raw(doc),transport_with_pdf())
        self.assertFalse(result["complete"])
        self.assertEqual(result["errors"],[{"phase":"source","code":"image PDF page count mismatch"}])
        self.assertEqual(result["rows"],[])

    def test_changed_pdf_with_same_source_id_cannot_reuse_immutable_row(self):
        first=image_manifest()
        original=raw(first)
        transport=transport_with_pdf()
        inserted=core.execute(original,transport,True,hashlib.sha256(original).hexdigest())
        self.assertTrue(inserted["complete"],inserted["errors"])
        before=transport.db.execute(
            "SELECT source_text_sha256 FROM mobile_menu_v2_sources WHERE id=?",
            (first["sources"][0]["id"],)).fetchone()[0]

        changed_pdf=MENU_PDF+b"\n% changed fixture bytes\n"
        transport.public["https://example.org/menu"]=changed_pdf
        next_doc=image_manifest()
        next_source=next_doc["sources"][0]
        next_source["source_sha256"]=hashlib.sha256(changed_pdf).hexdigest()
        next_source["source_text_sha256"]=core.image_review_digest(
            next_source["source_sha256"],next_source["image_evidence"])
        self.assertNotEqual(before,next_source["source_text_sha256"])
        updated=raw(next_doc)
        result=core.execute(updated,transport,True,hashlib.sha256(updated).hexdigest())
        self.assertFalse(result["complete"])
        self.assertEqual(result["errors"],[
            {"phase":"private_preflight","code":"conflicting existing v2 row"}])
        self.assertEqual(transport.db.execute(
            "SELECT source_text_sha256 FROM mobile_menu_v2_sources WHERE id=?",
            (first["sources"][0]["id"],)).fetchone()[0],before)
        self.assertEqual(transport.db.execute(
            "SELECT COUNT(*) FROM mobile_menu_v2_offers").fetchone()[0],1)

    def test_manifest_evidence_is_exact_complete_and_bounded(self):
        mutations=[]
        def add(label,change):
            doc=image_manifest();change(doc);mutations.append((label,doc))
        def change_line(doc,line):
            source=doc["sources"][0]
            source["image_evidence"][0]["line"]=line
            source["source_text_sha256"]=core.image_review_digest(
                source["source_sha256"],source["image_evidence"])
            doc["offers"][0]["evidence_ref"]="PDF page 1: "+line
        add("stale evidence digest",lambda d:d["sources"][0].update(
            source_text_sha256="0"*64))
        add("wrong evidence page",lambda d:d["sources"][0]["image_evidence"][0].update(page=2))
        add("missing offer evidence",lambda d:d["sources"][0].update(image_evidence=[
            {"offer_id":"another-offer","page":1,"line":LINE}]))
        add("duplicate offer evidence",lambda d:d["sources"][0]["image_evidence"].append(
            copy.deepcopy(d["sources"][0]["image_evidence"][0])))
        add("wrong page reference",lambda d:d["offers"][0].update(
            evidence_ref="PDF page 2: "+LINE))
        add("name absent",lambda d:d["offers"][0].update(name="Negroni"))
        add("serving absent",lambda d:d["offers"][0].update(serving_label="large"))
        add("serving ml absent",lambda d:d["offers"][0].update(serving_ml=500))
        add("price absent",lambda d:d["offers"][0].update(amount_minor=850))
        add("price token extended",lambda d:change_line(d,"Classic Spritz | EUR 7.50.00"))
        add("conditional price",lambda d:d["offers"][0].update(
            price_context="happy_hour",condition_text="Only before 19:00"))
        add("unexpected field",lambda d:d["sources"][0]["image_evidence"][0].update(ocr_guess=True))
        for label,doc in mutations:
            with self.subTest(label=label):
                with self.assertRaises(core.Error):
                    core.validate(raw(doc))

    def test_text_pdf_is_not_misclassified_as_reviewed_image(self):
        doc=image_manifest()
        with mock.patch.object(core.subprocess,"run",return_value=subprocess.CompletedProcess(
            ["pdftotext"],0,b"Classic Spritz EUR 7.50",b"")):
            with self.assertRaisesRegex(core.Error,"extractable text"):
                core.source_digests(MENU_PDF,"pdf_image_v1",
                                    doc["sources"][0]["image_evidence"],1)

    def test_existing_pdf_text_hash_contract_is_unchanged(self):
        visible=b"Classic Spritz EUR 7.50\nAnother Beer EUR 5.00\n"
        with mock.patch.object(core.subprocess,"run",return_value=subprocess.CompletedProcess(
            ["pdftotext"],0,visible,b"")):
            raw_hash,text_hash=core.source_digests(MENU_PDF,"pdf_text_v1")
        self.assertEqual(raw_hash,hashlib.sha256(MENU_PDF).hexdigest())
        self.assertEqual(text_hash,hashlib.sha256(b"Classic Spritz EUR 7.50 "
                                                b"Another Beer EUR 5.00").hexdigest())


if __name__=="__main__":
    unittest.main()
