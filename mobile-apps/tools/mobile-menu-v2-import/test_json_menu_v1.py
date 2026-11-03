"""Fail-closed checks for the first-party Carico JSON menu source."""
import copy
import hashlib
import json
import unittest
import import_v2 as core

def fixture():
    def item(key,name,price,available=True):
        return {"id":key,"name":{"it":name},"price":price,"available":available}
    def category(key,groups):
        return {"id":key,"hidden":False,"subgroups":[
            {"id":name,"hidden":False,"items":items} for name,items in groups]}
    return {"categories":[
        category("cucina",[("food",[item("food","Toast","9")])]),
        category("pizza",[]),
        category("cocktail",[("classici",[item("negroni","Negroni","12"),
                                         item("unpriced","Disaronno Sour",""),
                                         item("sold-out","Sold out","8",False)])]),
        category("gin-tonic",[("gin",[item("gin","Bulldog","10")])]),
        category("vini",[("calice",[item("glass","House wine","6")]),
                          ("bianchi",[item("bottle","House bottle","30")])]),
        category("birre",[("sec-mv9d11mj65ua",[item("draft","Lager Media","6")]),
                           ("bottle",[item("beer","Beer bottle","7")])]),
        category("distillati",[("spirits",[item("spirit","Rum","8")])]),
    ]}

def body(doc):
    return json.dumps(doc,ensure_ascii=False,separators=(",",":")).encode()

def offer(key,name,amount,category,serving):
    return {"source_id":"src-test","evidence_ref":"Carico API item "+key,
            "name":name,"amount_minor":amount,"category":category,
            "serving_label":serving,"serving_ml":None,"currency":"EUR",
            "currency_exponent":2,"price_context":"regular","condition_text":None}

class JsonMenuTests(unittest.TestCase):
    def test_visible_priced_drinks_only_and_exact_offer_match(self):
        raw=body(fixture())
        entries=core.json_menu_entries(raw)
        self.assertEqual(len(entries),7)
        self.assertNotIn("food",entries)
        self.assertNotIn("unpriced",entries)
        self.assertNotIn("sold-out",entries)
        self.assertEqual(entries["negroni"],("Negroni",1200,"negroni",None))
        self.assertEqual(entries["draft"],("Lager Media",600,"beer_draft","Media"))
        self.assertEqual(entries["bottle"],("House bottle",3000,None,"Bottiglia"))
        expected=[offer(key,*value) for key,value in entries.items()]
        self.assertEqual(core.source_digests(raw,"json_menu_v1"),
                         (hashlib.sha256(raw).hexdigest(),)*2)
        core.verify_json_menu_offers(raw,{"id":"src-test"},expected)
        with self.assertRaisesRegex(core.Error,"coverage incomplete"):
            core.verify_json_menu_offers(raw,{"id":"src-test"},expected[:-1])
        wrong=copy.deepcopy(expected);wrong[0]["amount_minor"]+=1
        with self.assertRaisesRegex(core.Error,"mismatch"):
            core.verify_json_menu_offers(raw,{"id":"src-test"},wrong)

    def test_ambiguous_or_changed_menu_fails_closed(self):
        doc=fixture()
        doc["categories"][2]["subgroups"][0]["items"][0]["price"]="from 10"
        with self.assertRaisesRegex(core.Error,"ambiguous"):
            core.json_menu_entries(body(doc))
        doc=fixture();doc["categories"].append({"id":"new-category","subgroups":[]})
        with self.assertRaisesRegex(core.Error,"unknown"):
            core.json_menu_entries(body(doc))
        with self.assertRaisesRegex(core.Error,"duplicate JSON key"):
            core.json_menu_entries(b'{"categories":[],"categories":[]}')
        with self.assertRaisesRegex(core.Error,"invalid JSON"):
            core.json_menu_entries(b"<html>blocked</html>")

    def test_raw_hash_pin_and_carico_endpoint_only(self):
        raw=body(fixture())
        digest=hashlib.sha256(raw).hexdigest()
        source={"id":"src-test","source_url":"https://www.carico.io/api/menu",
                "source_format":"json_menu_v1","source_sha256":digest,
                "source_text_sha256":digest,"use_review_status":"approved"}
        entries=core.json_menu_entries(raw)
        offers=[offer(key,*value) for key,value in entries.items()]
        renderer=b"function formatPrice(p) { return p.trim() + 'EUR'; }"
        class Transport:
            def __init__(self,data): self.data=data
            def fetch(self,url,maximum):
                return renderer if url==core.CARICO_RENDERER_URL else self.data
        original=core.CARICO_RENDERER_SHA256
        core.CARICO_RENDERER_SHA256=hashlib.sha256(renderer).hexdigest()
        try:
            self.assertEqual(core.source_identity(source,Transport(raw),{},offers),"verified")
            changed=body({**fixture(),"updatedAt":"changed"})
            with self.assertRaisesRegex(core.Error,"source hash mismatch"):
                core.source_identity(source,Transport(changed),{},offers)
            core.CARICO_RENDERER_SHA256="0"*64
            with self.assertRaisesRegex(core.Error,"renderer hash mismatch"):
                core.source_identity(source,Transport(raw),{},offers)
        finally:
            core.CARICO_RENDERER_SHA256=original

if __name__=="__main__": unittest.main()
