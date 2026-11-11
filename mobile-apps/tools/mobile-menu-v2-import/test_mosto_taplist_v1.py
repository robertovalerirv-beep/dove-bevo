"""The Mosto adapter pins live Alvino data, never page fallbacks or credentials."""
import copy
import hashlib
import json
from pathlib import Path
import unittest
from unittest.mock import patch

import import_v2 as core

ROOT=Path(__file__).resolve().parents[3]
MANIFEST=ROOT/"mobile-apps"/"data"/"mobile-menu-v2-seeds"/"8056b42188ccedc8ff768a5ca87d7cccf9660a897fce33e67a02b0dd848a02b6.json"


def data():
    branches=[{"id":1,"nome":"CHIAIA"},{"id":2,"nome":"ALVINO"}]
    taps=[
        {"id":12,"numero":1,"tipo":"co2","taplist":{
            "birra_id":743,"birre":{"id":743,"nome":"Briù 003",
                "nome_visualizzato_mobile":None,"no_alcol":False,
                "prezzo_s":5,"prezzo_m":6,"prezzo_l":7}}},
        {"id":13,"numero":2,"tipo":"handpump","taplist":{
            "birra_id":82,"birre":{"id":82,"nome":"Beer Zero",
                "nome_visualizzato_mobile":"Zero Beer","no_alcol":True,
                "prezzo_s":None,"prezzo_m":"6.50","prezzo_l":None}}},
        {"id":14,"numero":3,"tipo":"co2","taplist":None},
    ]
    return (json.dumps(branches).encode(),json.dumps(taps).encode())


def renderer():
    return (b"<html><script>const SUPABASE_URL = '"+core.MOSTO_API_URL.encode()+
            b"'; const SUPABASE_ANON_KEY = 'sb_publishable_"+b"A"*24+
            b"';</script></html>")


def offers(snapshot):
    _,entries=core.mosto_entries(*snapshot)
    result=[]
    for index,(_,entry) in enumerate(entries.items(),1):
        name,amount,category,size,number,beer_id=entry
        result.append({"source_id":"src-mosto-test","evidence_ref":
            f"Mosto Alvino tap {number} beer {beer_id} {size}",
            "name":name,"amount_minor":amount,"category":category,
            "serving_label":size,"serving_ml":None,"currency":"EUR",
            "currency_exponent":2,"price_context":"regular","condition_text":None})
    return result


class Response:
    headers={"Content-Type":"application/json; charset=utf-8"}
    def __init__(self,body): self.body=body
    def __enter__(self): return self
    def __exit__(self,*_): return False
    def read(self,_): return self.body


class Opener:
    def __init__(self,snapshot): self.snapshot=snapshot;self.requests=[]
    def open(self,request,timeout):
        self.requests.append(request)
        return Response(self.snapshot[0] if request.full_url.endswith("lista_locali")
                        else self.snapshot[1])


class Transport:
    def __init__(self,source,owner): self.source=source;self.owner=owner;self.urls=[]
    def fetch(self,url,maximum):
        self.urls.append(url)
        return self.source if url==core.MOSTO_SOURCE_URL else self.owner


class MostoTaplistTests(unittest.TestCase):
    def test_reviewed_candidate_manifest_is_exact_source_only(self):
        raw=MANIFEST.read_bytes()
        self.assertEqual(hashlib.sha256(raw).hexdigest(),MANIFEST.stem)
        doc=core.validate(raw)
        self.assertEqual(doc["batch_id"],"mosto-alvino-taplist-2026-11-11")
        self.assertEqual([row["venue_key"] for row in doc["venues"]],["n13739499391"])
        self.assertEqual(doc["venues"][0]["cell"],"sr607")
        self.assertEqual(len(doc["offers"]),48)
        self.assertEqual({row["serving_label"] for row in doc["offers"]},{"S","M","L"})
        self.assertTrue(all(row["serving_ml"] is None and row["currency"]=="EUR"
                            and row["price_context"]=="regular" for row in doc["offers"]))
        self.assertEqual(doc["fees"],[])
        self.assertEqual(doc["fee_coverage"],[])

    def test_explicit_prices_only_and_exact_coverage(self):
        snapshot=data()
        source_hash,entries=core.mosto_entries(*snapshot)
        self.assertEqual(len(entries),4)
        self.assertEqual(entries["12:743:M"],("Briù 003",600,"beer_draft","M",1,743))
        self.assertEqual(entries["13:82:M"],("Zero Beer",650,"alcohol_free","M",2,82))
        self.assertNotIn("13:82:S",entries)  # the page renderer's fallback is not a fact
        reviewed=offers(snapshot)
        core.verify_mosto_offers(snapshot,{"id":"src-mosto-test"},reviewed)
        with self.assertRaisesRegex(core.Error,"coverage incomplete"):
            core.verify_mosto_offers(snapshot,{"id":"src-mosto-test"},reviewed[:-1])
        changed=copy.deepcopy(reviewed);changed[0]["amount_minor"]+=1
        with self.assertRaisesRegex(core.Error,"mismatch"):
            core.verify_mosto_offers(snapshot,{"id":"src-mosto-test"},changed)
        rotated=copy.deepcopy(json.loads(snapshot[1]));rotated[0]["taplist"]["birre"]["prezzo_m"]=6.5
        rotated_snapshot=(snapshot[0],json.dumps(rotated).encode())
        self.assertNotEqual(core.mosto_entries(*rotated_snapshot)[0],source_hash)
        with self.assertRaisesRegex(core.Error,"mismatch"):
            core.verify_mosto_offers(rotated_snapshot,{"id":"src-mosto-test"},reviewed)

    def test_branch_duplicates_and_unreviewed_data_fail_closed(self):
        branches,taps=data()
        bad_branches=json.dumps([{"id":3,"nome":"ALVINO"}]).encode()
        with self.assertRaisesRegex(core.Error,"branch identity"):
            core.mosto_entries(bad_branches,taps)
        bad=json.loads(taps);bad[0]["taplist"]["birre"]["prezzo_m"]=None
        self.assertNotIn("12:743:M",core.mosto_entries(branches,json.dumps(bad).encode())[1])
        bad=json.loads(taps);bad[1]["numero"]=1
        with self.assertRaisesRegex(core.Error,"duplicate Mosto tap"):
            core.mosto_entries(branches,json.dumps(bad).encode())
        with self.assertRaisesRegex(core.Error,"duplicate JSON key"):
            core.mosto_entries(branches,b'[{"id":1,"id":2}]')

    def test_public_key_is_transient_and_query_is_branch_scoped(self):
        snapshot=data();opener=Opener(snapshot)
        resolver=lambda *_args,**_kwargs: [(None,None,None,None,("8.8.8.8",443))]
        self.assertEqual(core.mosto_public_snapshot(renderer(),opener=opener,resolver=resolver),snapshot)
        self.assertEqual(len(opener.requests),2)
        self.assertTrue(opener.requests[1].full_url.startswith(core.MOSTO_API_URL+"/rest/v1/spine?"))
        self.assertIn("locale_id=eq.2",opener.requests[1].full_url)
        self.assertTrue(all("sb_publishable_" not in request.full_url for request in opener.requests))
        self.assertTrue(all(request.get_header("Apikey").startswith("sb_publishable_")
                            for request in opener.requests))
        with self.assertRaisesRegex(core.Error,"non-public"):
            core.mosto_public_snapshot(renderer(),opener=opener,
                resolver=lambda *_a,**_kw:[(None,None,None,None,("127.0.0.1",443))])
        with self.assertRaisesRegex(core.Error,"binding changed"):
            core.mosto_public_snapshot(renderer().replace(b"sb_publishable_",b"other_key_"),
                                        opener=opener,resolver=resolver)

    def test_source_identity_requires_owner_link_renderer_pin_and_data_pin(self):
        snapshot=data();raw=renderer();source_hash,_=core.mosto_entries(*snapshot)
        owner=b'<html><a href="https://mo5.it/m/alvino">Alvino taps</a></html>'
        source={"id":"src-mosto-test","source_url":core.MOSTO_SOURCE_URL,
                "source_format":"mosto_taplist_v1","source_sha256":source_hash,
                "source_text_sha256":source_hash,
                "renderer_sha256":hashlib.sha256(raw).hexdigest(),
                "use_review_status":"approved"}
        reviewed=offers(snapshot)
        with patch.object(core,"mosto_public_snapshot",return_value=snapshot):
            transport=Transport(raw,owner)
            self.assertEqual(core.source_identity(source,transport,{},reviewed),"verified")
            self.assertEqual(transport.urls,[core.MOSTO_SOURCE_URL,core.MOSTO_OWNER_URL])
            bad={**source,"renderer_sha256":"0"*64}
            with self.assertRaisesRegex(core.Error,"renderer hash mismatch"):
                core.source_identity(bad,Transport(raw,owner),{},reviewed)
            with self.assertRaisesRegex(core.Error,"owner page no longer links"):
                core.source_identity(source,Transport(raw,b"<html>No link</html>"),{},reviewed)
            bad={**source,"source_sha256":"0"*64}
            with self.assertRaisesRegex(core.Error,"source hash mismatch"):
                core.source_identity(bad,Transport(raw,owner),{},reviewed)


if __name__=="__main__": unittest.main()
