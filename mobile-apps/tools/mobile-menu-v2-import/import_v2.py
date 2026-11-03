"""Guarded import of reviewed app-only named drink-menu facts.

Legacy customer prices and Roberto's website are never written by this module.
"""
import argparse
import datetime as dt
import decimal
import hashlib
import importlib.util
import ipaddress
import json
import math
import os
from pathlib import Path
import re
import socket
import subprocess
import sys
import unicodedata
from urllib.parse import urlsplit

LEGACY_PATH = Path(__file__).resolve().parents[1] / "menu-seed" / "live_import.py"
_spec = importlib.util.spec_from_file_location("_dovebevo_v1_transport", LEGACY_PATH)
legacy = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(legacy)

SITE = legacy.SITE
CARICO_RENDERER_URL = "https://www.carico.io/js/app.js"
CARICO_RENDERER_SHA256 = "02f10b32d3e52033d57d30ab6ce3e321dc1da4849a70c3380cfbcbf4626fbe05"
HEX = re.compile(r"^[0-9a-f]{64}$")
OSM = re.compile(r"^[nwr][1-9][0-9]{0,17}$")
OWNER = re.compile(r"^m[0-9a-f]{24}$")
CELL = re.compile(r"^[0123456789bcdefghjkmnpqrstuvwxyz]{5}$")
ID = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")
CATEGORIES = {"beer_draft","spritz","negroni","sbagliato","gin_tonic",
              "gin_lemon","wine_glass","alcohol_free","water"}
BLOCKED = ("leggimenu.it","yhop.beer","metropolita.it",
           "junglejuicebrewing.com","google.com","googleapis.com")
TABLES = ("mobile_menu_v2_venues","mobile_menu_v2_sources","mobile_menu_v2_offers",
          "mobile_menu_v2_fees","mobile_menu_v2_fee_coverage","venues_hidden",
          "mobile_venues_moderation","reports","prices_current","price_obs",
          "venues_user")
MAX_MANIFEST = 2*1024*1024
MAX_SOURCE = 8*1024*1024

class Error(Exception):
    pass

def pairs(items):
    out={}
    for key,value in items:
        if key in out: raise Error("duplicate JSON key")
        out[key]=value
    return out

def constant(_):
    raise Error("non-finite JSON number")

def fields(obj,required):
    if not isinstance(obj,dict) or set(obj)!=set(required):
        raise Error("invalid object fields")

def text(value,minimum=1,maximum=512):
    if not isinstance(value,str) or not minimum<=len(value)<=maximum or any(ord(c)<32 or ord(c)==127 for c in value):
        raise Error("invalid text")
    return value

def nullable_text(value,maximum):
    return None if value is None else text(value,1,maximum)

def integer(value,minimum,maximum):
    if type(value) is not int or not minimum<=value<=maximum:
        raise Error("invalid integer")
    return value

def nullable_integer(value,minimum,maximum):
    return None if value is None else integer(value,minimum,maximum)

def day(value):
    if not isinstance(value,str) or len(value)!=10: raise Error("invalid date")
    try:
        if dt.date.fromisoformat(value).isoformat()!=value: raise ValueError()
    except ValueError: raise Error("invalid date") from None
    return value

def digest(value):
    if not isinstance(value,str) or not HEX.fullmatch(value):
        raise Error("invalid sha256")
    return value

def identifier(value):
    if not isinstance(value,str) or not ID.fullmatch(value): raise Error("invalid id")
    return value

def venue_key(value):
    if not isinstance(value,str) or not (OSM.fullmatch(value) or OWNER.fullmatch(value)):
        raise Error("invalid venue key")
    return value

def cell(value):
    if not isinstance(value,str) or not CELL.fullmatch(value):
        raise Error("invalid cell")
    return value

def https(value,source=False):
    text(value,12,1500)
    parsed=urlsplit(value)
    host=parsed.hostname
    try: port=parsed.port
    except ValueError: raise Error("invalid URL port") from None
    if (parsed.scheme!="https" or not host or parsed.username or parsed.password
        or port not in (None,443) or parsed.fragment or "." not in host
        or host.startswith(".") or host.endswith(".")
        or not re.fullmatch(r"[A-Za-z0-9.-]+",host)
        or (source and any(host==bad or host.endswith("."+bad) for bad in BLOCKED))):
        raise Error("invalid or restricted URL")
    try:
        ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        raise Error("IP-literal source URL")
    if host in ("localhost","localdomain") or host.endswith((".local",".internal")):
        raise Error("private source hostname")
    return value

def public_fetch(transport,address,maximum,content_kind=None,resolver=None):
    https(address)
    host=urlsplit(address).hostname
    if resolver is not None or isinstance(transport,legacy.Transport):
        try:
            answers=(resolver or socket.getaddrinfo)(host,443,type=socket.SOCK_STREAM)
            ips=[answer[4][0] for answer in answers]
            if not ips or any(not ipaddress.ip_address(ip).is_global for ip in ips):
                raise Error("source resolves to non-public address")
        except (OSError,ValueError,IndexError,TypeError) as exc:
            raise Error("source DNS validation failed") from exc
    try:
        raw=transport.fetch(address,maximum)  # v1 Transport uses a no-redirect opener.
    except legacy.Error as exc:
        raise Error(str(exc)) from None
    if type(raw) is not bytes or not 1<=len(raw)<=maximum:
        raise Error("invalid public response size")
    header=raw[:8192].lower().lstrip()
    if content_kind=="html" and b"<html" not in header and b"<!doctype html" not in header:
        raise Error("unexpected HTML source content")
    if content_kind=="pdf" and not raw.startswith(b"%PDF-"):
        raise Error("unexpected PDF source content")
    if content_kind=="xml" and b"<osm" not in header:
        raise Error("unexpected OSM XML content")
    if content_kind=="json" and not header.startswith(b"{"):
        raise Error("unexpected JSON source content")
    return raw

def canonical_owner_url(value):
    https(value)
    parsed=urlsplit(value)
    path=parsed.path.rstrip("/") or "/"
    return "https://"+parsed.hostname.lower()+path

def normalized_address(value):
    return re.sub(r"\s+"," ",unicodedata.normalize("NFKC",text(value,5,512)).strip()).lower()

def owner_address_visible(address,visible):
    # Owner pages may place one comma between the same street and civic number.
    # Keep the canonical m-key and OSM address comparison unchanged.
    exact=normalized_address(address)
    if re.search(r"(?<![\w])"+re.escape(exact)+r"(?![a-z0-9/]|\s*[-/])",visible):
        return True
    match=re.fullmatch(r"(.+\S) ([1-9][0-9]*(?:/[0-9a-z]+|[a-z])?)",exact)
    if not match: return False
    comma=match.group(1)+", "+match.group(2)
    return bool(re.search(r"(?<![\w])"+re.escape(comma)+r"(?![a-z0-9/]|\s*[-/])",visible))

def normalized_name(value):
    return re.sub(r"\s+"," ",unicodedata.normalize("NFKC",text(value,2,512)).strip()).lower()

def owner_fingerprint(url,address):
    payload="dovebevo-v2-owner-it\n"+canonical_owner_url(url)+"\n"+normalized_address(address)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()

def osm_identity_url(key):
    kind={"n":"node","w":"way","r":"relation"}[key[0]]
    return f"https://www.openstreetmap.org/{kind}/{key[1:]}"

def validate_venue(row,checked):
    required=("venue_key","cell","name","kind","lat","lon","address","city","country",
              "identity_kind","identity_url","identity_checked_on","identity_fingerprint",
              "owner_page_sha256","geo_reference_url","geo_reference_sha256","geo_reference_hash_basis","static_city_id")
    fields(row,required)
    key=venue_key(row["venue_key"])
    cell(row["cell"]);text(row["name"],2,512);integer(row["kind"],0,4)
    for attr,lo,hi in (("lat",-90,90),("lon",-180,180)):
        value=row[attr]
        if type(value) not in (int,float) or not math.isfinite(value) or not lo<=value<=hi:
            raise Error("invalid coordinates")
    if legacy.geo(row["lat"],row["lon"])!=row["cell"]: raise Error("venue geohash mismatch")
    nullable_text(row["address"],512);text(row["city"],2,200)
    if not isinstance(row["country"],str) or not re.fullmatch(r"[A-Z]{2}",row["country"]):
        raise Error("invalid country")
    if day(row["identity_checked_on"])>checked: raise Error("future identity check")
    if key[0]=="m":
        if row["country"]!="IT" or row["identity_kind"]!="owner_verified" or not row["address"]:
            raise Error("owner key requires Italian verified address")
        https(row["identity_url"],True)
        fingerprint=owner_fingerprint(row["identity_url"],row["address"])
        if row["identity_fingerprint"]!=fingerprint or key!="m"+fingerprint[:24]:
            raise Error("owner key/fingerprint mismatch")
        digest(row["owner_page_sha256"])
        https(row["geo_reference_url"])
        if not re.fullmatch(r"https://www\.openstreetmap\.org/node/[1-9][0-9]*",row["geo_reference_url"]):
            raise Error("owner geo reference must be OSM address node")
        digest(row["geo_reference_sha256"])
        if row["geo_reference_hash_basis"]!="osm_node_v1": raise Error("unsupported geo hash basis")
        if row["static_city_id"] is not None: raise Error("owner key cannot claim static city")
    else:
        if row["identity_url"]!=osm_identity_url(key): raise Error("OSM URL mismatch")
        if any(row[k] is not None for k in ("identity_fingerprint","owner_page_sha256",
                                           "geo_reference_url","geo_reference_sha256","geo_reference_hash_basis")):
            raise Error("OSM identity has owner-only fields")
        if row["country"]=="IT":
            if row["identity_kind"]!="osm_static": raise Error("Italian OSM key must be static")
            integer(row["static_city_id"],1,2147483647)
        elif row["identity_kind"]!="osm_external" or row["static_city_id"] is not None or key[0]!="n":
            raise Error("foreign registry requires OSM node")

def validate_source(row,venues,checked):
    fields(row,("id","venue_key","cell","source_url","source_format","source_sha256",
                "source_text_sha256","source_checked_on","use_review_status",
                "use_review_basis","use_review_reference","use_reviewed_on"))
    identifier(row["id"])
    key=venue_key(row["venue_key"])
    if key not in venues or cell(row["cell"])!=venues[key]["cell"]:
        raise Error("source venue mismatch")
    https(row["source_url"],True)
    if row["source_format"] not in ("html_text_v1","pdf_text_v1","json_menu_v1"):
        raise Error("unsupported source format")
    digest(row["source_sha256"]);digest(row["source_text_sha256"])
    if row["source_format"]=="json_menu_v1" and (row["source_url"]!="https://www.carico.io/api/menu"
        or row["use_review_reference"]!=CARICO_RENDERER_URL):
        raise Error("unreviewed JSON menu endpoint or renderer")
    if row["source_format"] in ("html_text_v1","json_menu_v1") and row["source_sha256"]!=row["source_text_sha256"]:
        raise Error("HTML text hashes differ")
    if day(row["source_checked_on"])>checked or day(row["use_reviewed_on"])>checked:
        raise Error("future source review")
    if row["use_review_status"] not in ("approved","held"):
        raise Error("invalid use-review status")
    text(row["use_review_basis"],3,500);https(row["use_review_reference"])

def link(row,venues,sources):
    key=venue_key(row["venue_key"])
    src=sources.get(identifier(row["source_id"]))
    if key not in venues or cell(row["cell"])!=venues[key]["cell"] or not src:
        raise Error("row source/venue absent")
    if src["venue_key"]!=key or src["cell"]!=row["cell"] or src["use_review_status"]!="approved":
        raise Error("held or mismatched source")

def validate_offer(row,venues,sources):
    fields(row,("id","venue_key","cell","source_id","name","category","serving_label",
                "serving_ml","amount_minor","currency","currency_exponent",
                "price_context","condition_text","evidence_ref"))
    identifier(row["id"]);link(row,venues,sources);text(row["name"],1,512)
    if row["category"] is not None and (not isinstance(row["category"],str) or row["category"] not in CATEGORIES):
        raise Error("invalid drink category")
    nullable_text(row["serving_label"],256);nullable_integer(row["serving_ml"],1,10000)
    integer(row["amount_minor"],1,100000000)
    if not isinstance(row["currency"],str) or not re.fullmatch(r"[A-Z]{3}",row["currency"]):
        raise Error("invalid currency")
    integer(row["currency_exponent"],0,3)
    if row["price_context"] not in ("regular","happy_hour","conditional"):
        raise Error("invalid price context")
    if row["price_context"]=="regular":
        if row["condition_text"] is not None: raise Error("regular price has condition")
    else: text(row["condition_text"],3,500)
    text(row["evidence_ref"],3,300)

def validate_fee(row,venues,sources):
    fields(row,("id","venue_key","cell","source_id","label","fee_kind","basis",
                "amount_minor","currency","currency_exponent","rate_bps",
                "applicability","condition_text","evidence_ref"))
    identifier(row["id"]);link(row,venues,sources);text(row["label"],1,512)
    if row["fee_kind"] not in ("fixed","percent") or row["basis"] not in ("person","table","bill","unspecified"):
        raise Error("invalid fee kind/basis")
    if row["fee_kind"]=="fixed":
        integer(row["amount_minor"],1,100000000)
        if not isinstance(row["currency"],str) or not re.fullmatch(r"[A-Z]{3}",row["currency"]):
            raise Error("invalid fee currency")
        integer(row["currency_exponent"],0,3)
        if row["rate_bps"] is not None: raise Error("fixed fee has rate")
    else:
        if row["basis"]!="bill" or any(row[k] is not None for k in ("amount_minor","currency","currency_exponent")):
            raise Error("percent fee has fixed amount")
        integer(row["rate_bps"],1,10000)
    if row["applicability"] not in ("all_orders","conditional","unknown"):
        raise Error("invalid applicability")
    if row["applicability"]=="conditional": text(row["condition_text"],3,500)
    elif row["condition_text"] is not None: raise Error("fee has unpaired condition")
    text(row["evidence_ref"],3,300)

def validate_coverage(row,venues,sources,fees):
    fields(row,("venue_key","cell","source_id","status","evidence_ref"))
    link(row,venues,sources)
    if row["status"] not in ("documented_partial","explicit_no_fee"):
        raise Error("invalid fee coverage")
    text(row["evidence_ref"],3,300)
    own=[fee for fee in fees if fee["venue_key"]==row["venue_key"]]
    if (row["status"]=="explicit_no_fee" and own) or (row["status"]=="documented_partial" and not own):
        raise Error("fee coverage contradicts fee rows")

def validate(raw):
    if not isinstance(raw,bytes) or not 1<=len(raw)<=MAX_MANIFEST: raise Error("manifest size")
    try: doc=json.loads(raw.decode("utf-8"),object_pairs_hook=pairs,parse_constant=constant)
    except (UnicodeError,ValueError) as exc: raise Error("invalid manifest JSON") from exc
    fields(doc,("schema_version","batch_id","checked_on","data_version","venues",
                "sources","offers","fees","fee_coverage"))
    if type(doc["schema_version"]) is not int or doc["schema_version"]!=1:
        raise Error("invalid manifest version")
    if not isinstance(doc["batch_id"],str) or not re.fullmatch(r"[a-z0-9][a-z0-9-]{3,80}",doc["batch_id"]):
        raise Error("invalid batch ID")
    checked=day(doc["checked_on"])
    if checked>dt.date.today().isoformat(): raise Error("future manifest")
    if not isinstance(doc["data_version"],str) or not re.fullmatch(r"[0-9]{8}",doc["data_version"]):
        raise Error("invalid catalogue version")
    for attr,limit in (("venues",100),("sources",100),("offers",1000),
                       ("fees",200),("fee_coverage",100)):
        if not isinstance(doc[attr],list) or len(doc[attr])>limit:
            raise Error("invalid collection")
    if not doc["venues"] or not doc["sources"] or not (doc["offers"] or doc["fees"] or doc["fee_coverage"]):
        raise Error("empty seed")
    venues={}
    for row in doc["venues"]:
        validate_venue(row,checked)
        if row["venue_key"] in venues: raise Error("duplicate venue")
        venues[row["venue_key"]]=row
    sources={}
    for row in doc["sources"]:
        validate_source(row,venues,checked)
        if row["id"] in sources: raise Error("duplicate source")
        sources[row["id"]]=row
    for attr,check in (("offers",validate_offer),("fees",validate_fee)):
        seen=set()
        for row in doc[attr]:
            check(row,venues,sources)
            if row["id"] in seen: raise Error("duplicate item ID")
            seen.add(row["id"])
    seen=set()
    for row in doc["fee_coverage"]:
        validate_coverage(row,venues,sources,doc["fees"])
        if row["venue_key"] in seen: raise Error("duplicate fee coverage")
        seen.add(row["venue_key"])
    for src in sources.values():
        if src["use_review_status"]=="approved" and not any(
            row["source_id"]==src["id"]
            for attr in ("offers","fees","fee_coverage") for row in doc[attr]):
            raise Error("approved source without evidence row")
    return doc

def source_digests(raw,fmt):
    if len(raw)>MAX_SOURCE: raise Error("source too large")
    if fmt=="html_text_v1":
        result=legacy.source_digest(raw,"html_text_v1")
        return result,result
    if fmt=="json_menu_v1":
        json_menu_entries(raw)
        result=hashlib.sha256(raw).hexdigest()
        return result,result
    if fmt!="pdf_text_v1" or not raw.startswith(b"%PDF-"): raise Error("invalid PDF")
    try:
        proc=subprocess.run(["pdftotext","-layout","-enc","UTF-8","-","-"],
                            input=raw,capture_output=True,timeout=30,check=True)
        canonical=re.sub(r"\s+"," ",proc.stdout.decode("utf-8")).strip().encode()
    except (OSError,subprocess.SubprocessError,UnicodeError) as exc:
        raise Error("PDF text extraction failed") from exc
    if not 10<=len(canonical)<=2*1024*1024: raise Error("PDF text unavailable")
    return hashlib.sha256(raw).hexdigest(),hashlib.sha256(canonical).hexdigest()

def json_menu_entries(raw):
    """Extract only the priced drinks visible in Carico's first-party menu UI."""
    try:
        doc=json.loads(raw.decode("utf-8"),object_pairs_hook=pairs,parse_constant=constant)
    except (UnicodeError,ValueError) as exc:
        raise Error("invalid JSON menu") from exc
    if not isinstance(doc,dict) or not isinstance(doc.get("categories"),list):
        raise Error("invalid JSON menu structure")
    allowed={"cucina","pizza","cocktail","gin-tonic","vini","birre","distillati"}
    drink=allowed-{"cucina","pizza"}
    seen=set()
    entries={}
    for category in doc["categories"]:
        if not isinstance(category,dict) or category.get("id") not in allowed:
            raise Error("unknown JSON menu category")
        if category["id"] in seen: raise Error("duplicate JSON menu category")
        seen.add(category["id"])
        if category.get("hidden") is True or category["id"] not in drink: continue
        subgroups=category.get("subgroups")
        if not isinstance(subgroups,list): raise Error("invalid JSON menu subgroups")
        for subgroup in subgroups:
            if not isinstance(subgroup,dict): raise Error("invalid JSON menu subgroup")
            if subgroup.get("hidden") is True: continue
            items=subgroup.get("items")
            if not isinstance(items,list): raise Error("invalid JSON menu items")
            for item in items:
                if not isinstance(item,dict): raise Error("invalid JSON menu item")
                item_id=item.get("id")
                if not isinstance(item_id,str) or not re.fullmatch(r"[A-Za-z0-9-]{1,128}",item_id):
                    raise Error("invalid JSON menu item ID")
                if item_id in entries: raise Error("duplicate JSON menu item")
                if item.get("available") is False: continue
                name=item.get("name")
                if not isinstance(name,dict) or not isinstance(name.get("it"),str):
                    raise Error("invalid JSON menu item name")
                name=text(name["it"].strip(),1,512)
                price=item.get("price")
                if price is None or price=="": continue
                if not isinstance(price,str) or not re.fullmatch(r"[0-9]{1,6}(?:[.,][0-9]{1,2})?",price.strip()):
                    raise Error("ambiguous JSON menu price")
                amount=decimal.Decimal(price.strip().replace(",","."))*100
                if amount!=amount.to_integral_value() or not 1<=amount<=100000000:
                    raise Error("invalid JSON menu amount")
                group=subgroup.get("id")
                if not isinstance(group,str): raise Error("invalid JSON menu group")
                category_id=category["id"]
                offer_category=None
                serving=None
                if category_id=="gin-tonic": offer_category="gin_tonic"
                elif category_id=="cocktail":
                    if group=="analcolici": offer_category="alcohol_free"
                    elif name.casefold()=="negroni": offer_category="negroni"
                elif category_id=="vini":
                    serving="Calice" if group=="calice" else "Bottiglia"
                    if group=="calice": offer_category="wine_glass"
                elif category_id=="birre":
                    if group=="sec-mv9d11mj65ua":
                        offer_category="beer_draft"
                        if name.endswith(" Media"): serving="Media"
                        elif name.endswith(" Piccola"): serving="Piccola"
                        else: raise Error("unknown draft beer size")
                    else:
                        serving="Bottiglia"
                        if "0.0" in name: offer_category="alcohol_free"
                entries[item_id]=(name,int(amount),offer_category,serving)
    if seen!=allowed: raise Error("JSON menu categories changed")
    if not entries: raise Error("JSON menu has no priced drinks")
    return entries

def verify_json_menu_offers(raw,source,offers):
    entries=json_menu_entries(raw)
    matched=set()
    prefix="Carico API item "
    for row in offers:
        if row["source_id"]!=source["id"]: continue
        evidence=row["evidence_ref"]
        if not evidence.startswith(prefix): raise Error("JSON offer evidence absent")
        item_id=evidence[len(prefix):]
        if item_id not in entries or item_id in matched:
            raise Error("JSON offer missing or duplicated")
        matched.add(item_id)
        name,amount,category,serving=entries[item_id]
        if (row["name"]!=name or row["amount_minor"]!=amount
            or row["category"]!=category or row["serving_label"]!=serving
            or row["serving_ml"] is not None or row["currency"]!="EUR"
            or row["currency_exponent"]!=2 or row["price_context"]!="regular"
            or row["condition_text"] is not None):
            raise Error("JSON offer/source mismatch")
    if matched!=set(entries): raise Error("JSON priced drink coverage incomplete")

def osm_node_v1(raw):
    """Hash semantic OSM node evidence, excluding server generator and XML ordering."""
    import decimal
    import xml.etree.ElementTree as ET
    if not isinstance(raw,bytes) or not 1<=len(raw)<=65536 or b"<!DOCTYPE" in raw.upper() or b"<!ENTITY" in raw.upper():
        raise Error("OSM node XML invalid")
    try:
        root=ET.fromstring(raw)
        if root.tag!="osm" or len(root)!=1 or root[0].tag!="node":
            raise ValueError("expected one OSM node")
        node=root[0]
        ident=node.attrib["id"]
        version=node.attrib["version"]
        if not re.fullmatch(r"[1-9][0-9]{0,19}",ident) or not re.fullmatch(r"[1-9][0-9]{0,9}",version):
            raise ValueError("invalid OSM node identity")
        if node.attrib.get("visible")=="false": raise ValueError("deleted OSM node")
        coordinates=[]
        for field,limit in (("lat",90),("lon",180)):
            coord=node.attrib[field]
            if not re.fullmatch(r"-?[0-9]{1,3}(?:\.[0-9]{1,15})?",coord):
                raise ValueError("invalid OSM coordinate syntax")
            value=decimal.Decimal(coord)
            if not value.is_finite() or abs(value)>limit: raise ValueError("invalid OSM coordinate")
            coordinates.append("0" if value==0 else format(value.normalize(),"f"))
        tags={}
        for child in node:
            if child.tag!="tag" or set(child.attrib)!={"k","v"} or not child.attrib["k"]:
                raise ValueError("invalid OSM tag")
            if child.attrib["k"] in tags: raise ValueError("duplicate OSM tag")
            tags[child.attrib["k"]]=child.attrib["v"]
        canonical=json.dumps({"id":ident,"version":str(int(version)),"lat":coordinates[0],"lon":coordinates[1],"tags":tags},
                             sort_keys=True,separators=(",",":"),ensure_ascii=False).encode("utf-8")
        return hashlib.sha256(canonical).hexdigest(),ident,float(coordinates[0]),float(coordinates[1]),tags
    except (ET.ParseError,KeyError,ValueError,decimal.InvalidOperation,OverflowError,UnicodeError) as exc:
        raise Error("OSM node XML invalid") from exc

def distance_m(lat1,lon1,lat2,lon2):
    import math
    earth=6371000
    a=math.sin(math.radians(lat2-lat1)/2)**2
    a+=math.cos(math.radians(lat1))*math.cos(math.radians(lat2))*math.sin(math.radians(lon2-lon1)/2)**2
    return 2*earth*math.asin(min(1,math.sqrt(a)))

def static_cell(transport,version,code,cache):
    if code not in cache:
        data=legacy.strict_json(public_fetch(transport,f"{SITE}/data/{version}/v/{code}.json",2*1024*1024))
        if not isinstance(data,dict) or not isinstance(data.get("v"),list) or not isinstance(data.get("c"),list):
            raise Error("invalid published catalogue")
        cache[code]=data
    return cache[code]

def static_identity(row,data):
    hits=[v for v in data["v"] if isinstance(v,list) and len(v)==7 and v[0]==row["venue_key"]]
    if len(hits)!=1: raise Error("Italian venue absent or duplicated")
    item=hits[0]
    if item[1:5]!=[row["name"],row["kind"],row["lat"],row["lon"]]:
        raise Error("published venue tuple mismatch")
    if row["address"] is not None and item[5]!=row["address"]:
        raise Error("published venue address mismatch")
    index=item[6]
    if type(index) is not int or not 0<=index<len(data["c"]):
        raise Error("published city absent")
    if data["c"][index]!=[row["static_city_id"],row["city"]]:
        raise Error("published city tuple mismatch")

def duplicate_near(row,name,lat,lon):
    metres=distance_m(row["lat"],row["lon"],lat,lon)
    return metres<15 or (normalized_name(name)==normalized_name(row["name"]) and metres<50)

def public_identity(row,transport,version,cells):
    key=row["venue_key"]
    if row["identity_kind"]=="osm_static":
        static_identity(row,static_cell(transport,version,row["cell"],cells))
        return
    if row["identity_kind"]=="owner_verified":
        # A 50m duplicate search is safe within one static cell only.
        if {legacy.geo(row["lat"]+a,row["lon"]+b)
            for a in (-0.0006,0,0.0006) for b in (-0.0008,0,0.0008)}!={row["cell"]}:
            raise Error("owner venue near cell boundary needs multi-cell review")
        page=public_fetch(transport,row["identity_url"],MAX_SOURCE,"html")
        if legacy.source_digest(page,"html_text_v1")!=row["owner_page_sha256"]:
            raise Error("owner location source hash mismatch")
        parser=legacy.HTMLTextV1()
        try:
            parser.feed(page.decode("utf-8"));parser.close()
            visible=re.sub(r"\s+"," ",unicodedata.normalize("NFKC"," ".join(parser.parts)).strip()).lower()
        except (UnicodeError,ValueError) as exc:
            raise Error("owner location text invalid") from exc
        if normalized_name(row["name"]) not in visible or not owner_address_visible(row["address"],visible):
            raise Error("owner location name/address absent")
        node_id=row["geo_reference_url"].rsplit("/",1)[1]
        xml=public_fetch(transport,f"https://api.openstreetmap.org/api/0.6/node/{node_id}",65536,"xml")
        geo_hash,actual_id,lat,lon,tags=osm_node_v1(xml)
        if geo_hash!=row["geo_reference_sha256"]:
            raise Error("OSM address reference changed")
        if actual_id!=node_id or distance_m(row["lat"],row["lon"],lat,lon)>50:
            raise Error("owner venue not near OSM address")
        mapped=" ".join([tags.get("addr:street",""),tags.get("addr:housenumber","")]).strip()
        if not mapped or normalized_address(mapped)!=normalized_address(row["address"]):
            raise Error("OSM address reference mismatch")
        data=static_cell(transport,version,row["cell"],cells)
        for venue in data["v"]:
            if isinstance(venue,list) and len(venue)==7 and duplicate_near(row,venue[1],venue[3],venue[4]):
                raise Error("possible duplicate static venue")
        return
    # Foreign registry entries use exact OSM node identity, not invented Google counts.
    import xml.etree.ElementTree as ET
    xml=public_fetch(transport,f"https://api.openstreetmap.org/api/0.6/node/{key[1:]}",65536,"xml")
    try:
        node=ET.fromstring(xml).find("node")
        tags={t.attrib["k"]:t.attrib["v"] for t in node.findall("tag")}
        lat,lon=float(node.attrib["lat"]),float(node.attrib["lon"])
    except (AttributeError,KeyError,TypeError,ValueError,ET.ParseError) as exc:
        raise Error("foreign OSM node invalid") from exc
    if (node.attrib.get("id")!=key[1:] or tags.get("name")!=row["name"]
        or abs(row["lat"]-lat)>0.0000001 or abs(row["lon"]-lon)>0.0000001):
        raise Error("foreign OSM node mismatch")

def source_identity(row,transport,cache,offers,diagnostics=None):
    if row["use_review_status"]=="held": return "held"
    key=(row["source_url"],row["source_format"])
    if key not in cache:
        content_kind={"html_text_v1":"html","pdf_text_v1":"pdf","json_menu_v1":"json"}[row["source_format"]]
        # Re-resolve the public address on one bounded retry of a transport timeout.
        # Redirects, HTTP errors, and changed content are never retried or accepted.
        for attempt in range(2):
            try:
                source_raw=public_fetch(transport,row["source_url"],MAX_SOURCE,content_kind)
                break
            except Error as exc:
                if str(exc)!="public source timeout" or attempt:
                    raise
        content_type=getattr(transport,"last_fetch_content_type",None)
        cache[key]=(source_digests(source_raw,row["source_format"]),
                    source_raw,content_type)
    hashes,source_raw,content_type=cache[key]
    if hashes!=(row["source_sha256"],row["source_text_sha256"]):
        if diagnostics is not None and row["source_format"]=="pdf_text_v1":
            media_type=(content_type or "").split(";",1)[0].strip().lower()
            if not re.fullmatch(r"[a-z0-9.+-]+/[a-z0-9.+-]+",media_type):
                media_type=None
            version=None
            try:
                proc=subprocess.run(["pdftotext","-v"],capture_output=True,
                                    timeout=5,check=False)
                match=re.search(rb"pdftotext version ([0-9]+(?:\.[0-9]+){1,3})",
                                proc.stdout+proc.stderr)
                if match: version=match.group(1).decode("ascii")
            except (OSError,subprocess.SubprocessError):
                pass
            diagnostics.append({
                "source_id":row["id"],"bytes":len(source_raw),
                "content_type":media_type,
                "raw_sha256":hashes[0],"pdf_magic":source_raw.startswith(b"%PDF-"),
                "extractor_version":version,"text_sha256":hashes[1],
                "raw_matches_manifest":hashes[0]==row["source_sha256"],
                "text_matches_manifest":hashes[1]==row["source_text_sha256"],
            })
        raise Error("source hash mismatch")
    if row["source_format"]=="json_menu_v1":
        renderer=public_fetch(transport,CARICO_RENDERER_URL,MAX_SOURCE)
        if hashlib.sha256(renderer).hexdigest()!=CARICO_RENDERER_SHA256:
            raise Error("Carico renderer hash mismatch")
        verify_json_menu_offers(source_raw,row,offers)
    return "verified"

def one(transport,sql,params):
    result=transport.query(sql,params)
    if not isinstance(result,list) or len(result)!=1 or not isinstance(result[0],dict):
        raise Error("invalid private read")
    return result[0]

def tables_exist(transport):
    marks=",".join("?" for _ in TABLES)
    rows=transport.query(f"SELECT name FROM sqlite_master WHERE type='table' AND name IN ({marks})",list(TABLES))
    if {r.get("name") for r in rows if isinstance(r,dict)}!=set(TABLES):
        raise Error("v2 migration or guard table absent")

def require_owner_geo_schema(transport):
    schema=one(transport,"SELECT sql FROM sqlite_master WHERE type='table' AND name=?",["mobile_menu_v2_venues"]).get("sql")
    if not isinstance(schema,str) or "osm_node_v1" not in schema:
        raise Error("OSM node hash basis migration absent")

def customer_price_digest(transport,key):
    # Legacy table has no personal columns; keep only a count and digest in receipts.
    rows=transport.query("SELECT * FROM prices_current WHERE venue_key=?",[key])
    if not isinstance(rows,list) or any(not isinstance(row,dict) for row in rows):
        raise Error("invalid customer price digest rows")
    canonical="\n".join(sorted(json.dumps(row,sort_keys=True,separators=(",",":"),
                                          ensure_ascii=False) for row in rows))
    return {"count":len(rows),
            "sha256":hashlib.sha256(canonical.encode("utf-8")).hexdigest()}

def presence(transport,key):
    return one(transport,
      "SELECT (SELECT COUNT(*) FROM venues_hidden WHERE venue_key=?1) AS hidden,"
      "(SELECT COUNT(*) FROM mobile_venues_moderation WHERE venue_key=?1) AS moderated,"
      "(SELECT COUNT(*) FROM reports WHERE venue_key=?1) AS reports,"
      "(SELECT COUNT(*) FROM prices_current WHERE venue_key=?1) AS customer_current,"
      "(SELECT COUNT(*) FROM price_obs WHERE venue_key=?1) AS customer_history",[key])

def private_owner_duplicate(row,transport):
    if row["identity_kind"]!="owner_verified": return
    lat,lon=row["lat"],row["lon"]
    candidates=transport.query(
      "SELECT name,lat,lon FROM venues_user WHERE status IN ('approved','pending')"
      " AND lat BETWEEN ?1 AND ?2 AND lon BETWEEN ?3 AND ?4",
      [lat-0.001,lat+0.001,lon-0.0015,lon+0.0015])
    candidates+=transport.query(
      "SELECT name,lat,lon FROM mobile_menu_v2_venues WHERE venue_key<>?1"
      " AND lat BETWEEN ?2 AND ?3 AND lon BETWEEN ?4 AND ?5",
      [row["venue_key"],lat-0.001,lat+0.001,lon-0.0015,lon+0.0015])
    if any(duplicate_near(row,r["name"],r["lat"],r["lon"]) for r in candidates):
        raise Error("possible duplicate user or registry venue")

FIELDS={
  "venue":("venue_key","cell","name","kind","lat","lon","address","city","country",
           "identity_kind","identity_url","identity_fingerprint","identity_checked_on",
           "identity_text_sha256","identity_geo_url","identity_geo_text_sha256",
           "identity_geo_hash_basis"),
  "source":("id","venue_key","cell","source_url","source_text_sha256","source_checked_on",
            "use_review_status","use_review_basis","use_review_reference","use_reviewed_on"),
  "offer":("id","venue_key","cell","name","category","serving_label","serving_ml",
           "amount_minor","currency","currency_exponent","price_context","condition_text",
           "status","source_id"),
  "fee":("id","venue_key","cell","label","fee_kind","basis","amount_minor",
         "currency","currency_exponent","rate_bps","applicability","condition_text",
         "status","source_id"),
  "coverage":("venue_key","cell","status","source_id"),
}
TABLE={"venue":"mobile_menu_v2_venues","source":"mobile_menu_v2_sources",
       "offer":"mobile_menu_v2_offers","fee":"mobile_menu_v2_fees",
       "coverage":"mobile_menu_v2_fee_coverage"}

def rows_for_import(doc):
    rows=[]
    for source in doc["venues"]:
        if source["identity_kind"]=="osm_static": continue
        row={key:source[key] for key in FIELDS["venue"] if key in source}
        row["identity_kind"]="owner_verified" if source["identity_kind"]=="owner_verified" else "osm"
        row["identity_text_sha256"]=source["owner_page_sha256"]
        row["identity_geo_url"]=source["geo_reference_url"]
        row["identity_geo_text_sha256"]=source["geo_reference_sha256"]
        row["identity_geo_hash_basis"]=source["geo_reference_hash_basis"]
        rows.append(("venue",row))
    for row in doc["sources"]:
        if row["use_review_status"]=="approved":
            rows.append(("source",{key:row[key] for key in FIELDS["source"]}))
    for kind,attr in (("offer","offers"),("fee","fees"),("coverage","fee_coverage")):
        for source in doc[attr]:
            row={key:source[key] for key in FIELDS[kind] if key!="status"}
            row["status"]="active" if kind in ("offer","fee") else source["status"]
            rows.append((kind,row))
    return rows

def existing(transport,kind,row):
    if kind=="coverage":
        where,params="venue_key=?1 AND cell=?2",[row["venue_key"],row["cell"]]
    elif kind=="venue":
        where,params="venue_key=?1",[row["venue_key"]]
    else:
        where,params="id=?1",[row["id"]]
    sql=f"SELECT {','.join(FIELDS[kind])} FROM {TABLE[kind]} WHERE {where} LIMIT 2"
    result=transport.query(sql,params)
    if not isinstance(result,list) or len(result)>1: raise Error("invalid existing-row read")
    return result[0] if result else None

def same(found,kind,row):
    return found is not None and all(found.get(key)==row[key] for key in FIELDS[kind])

def insert(transport,kind,row):
    columns=FIELDS[kind]
    marks=",".join("?" for _ in columns)
    guard=(" NOT EXISTS (SELECT 1 FROM venues_hidden WHERE venue_key=?)"
           " AND NOT EXISTS (SELECT 1 FROM mobile_venues_moderation WHERE venue_key=?)"
           " AND NOT EXISTS (SELECT 1 FROM reports WHERE venue_key=?)")
    sql=(f"INSERT INTO {TABLE[kind]} ({','.join(columns)}) SELECT {marks} WHERE"+guard+
         " ON CONFLICT DO NOTHING RETURNING "+("venue_key" if kind in ("venue","coverage") else "id"))
    params=[row[key] for key in columns]+[row["venue_key"]]*3
    result=transport.query(sql,params)
    if not isinstance(result,list) or len(result)>1: raise Error("invalid insert result")
    return bool(result)

def execute(raw,transport,apply=False,approved_sha256=None):
    receipt={"schema_version":1,"batch_id":None,
             "manifest_sha256":hashlib.sha256(raw).hexdigest() if isinstance(raw,bytes) else None,
             "mode":"apply" if apply else "dry_run","complete":False,
             "binding_attestation":None,"sources":[],"source_diagnostics":[],
             "source_fetch_diagnostics":[],"venues":[],"rows":[],
             "customer_presence":{},"customer_price_digests":{},"errors":[],"legacy_prices_modified":False,
             "public_data_version":None}
    phase="manifest"
    try:
        doc=validate(raw);receipt["batch_id"]=doc["batch_id"]
        if apply and approved_sha256!=receipt["manifest_sha256"]:
            raise Error("seed manifest hash mismatch")
        if any(s["use_review_status"]!="approved" for s in doc["sources"]):
            raise Error("held source is unseedable")
        phase="public_site"
        health=legacy.strict_json(public_fetch(transport,SITE+"/api/health",65536))
        if not isinstance(health,dict) or health.get("status")!="ok":
            raise Error("public site unhealthy")
        live_version=health.get("data_version")
        if not isinstance(live_version,str) or not re.fullmatch(r"[0-9]{8}",live_version):
            raise Error("invalid public catalogue version")
        if live_version<doc["data_version"]:
            raise Error("public catalogue older than reviewed manifest")
        receipt["public_data_version"]=live_version
        cells={}
        for venue in doc["venues"]:
            if live_version!=doc["data_version"] and venue["identity_kind"]=="osm_external":
                raise Error("external venue needs current-version review")
            # The reviewed manifest is the pinned identity. Historical public
            # catalogue URLs can disappear after deploy; verify the exact
            # venue against the current live version before any private write.
            public_identity(venue,transport,live_version,cells)
            receipt["venues"].append({"venue_key":venue["venue_key"],"cell":venue["cell"],
                                      "identity":"verified"})
        phase="source"
        cache={}
        for source in doc["sources"]:
            if hasattr(transport,"last_fetch_failure"):
                transport.last_fetch_failure=None
            try:
                status=source_identity(source,transport,cache,doc["offers"],receipt["source_diagnostics"])
            except Error as exc:
                failure=getattr(transport,"last_fetch_failure",None)
                if isinstance(failure,dict) and str(exc).startswith("public source "):
                    receipt["source_fetch_diagnostics"].append({"source_id":source["id"],**failure})
                raise
            receipt["sources"].append({"id":source["id"],"venue_key":source["venue_key"],
                                       "status":status})
        phase="binding"
        attestation=transport.attest_binding()
        if attestation!={"domain":"www.dovebevo.com","worker":"dovebevo-staging",
                         "database":legacy.DATABASE,"binding":"DB","name":"dovebevo-staging",
                         "environment":"production","verified":True}:
            raise Error("production binding mismatch")
        receipt["binding_attestation"]=attestation
        phase="private_preflight"
        tables_exist(transport)
        if any(v["identity_kind"]=="owner_verified" for v in doc["venues"]):
            require_owner_geo_schema(transport)
        for venue in doc["venues"]:
            key=venue["venue_key"]
            private_owner_duplicate(venue,transport)
            state=presence(transport,key)
            receipt["customer_presence"][key]=state
            if any(state.get(flag,0) for flag in ("hidden","moderated","reports")):
                raise Error("reported or hidden venue")
            if state["customer_current"]:
                digest=customer_price_digest(transport,key)
                if digest["count"]!=state["customer_current"]:
                    raise Error("customer price digest count mismatch")
                receipt["customer_price_digests"][key]=digest
        rows=rows_for_import(doc)
        for kind,row in rows:
            found=existing(transport,kind,row)
            if found is not None and not same(found,kind,row):
                raise Error("conflicting existing v2 row")
            receipt["rows"].append({"kind":kind,"id":row.get("id",row["venue_key"]),
                                    "venue_key":row["venue_key"],
                                    "before":"identical" if found else "absent",
                                    "outcome":"not_attempted"})
        if not apply:
            for result in receipt["rows"]:
                result["outcome"]="identical_at_read" if result["before"]=="identical" else "eligible_at_read"
            receipt["complete"]=True
            return receipt
        phase="write"
        for (kind,row),result in zip(rows,receipt["rows"]):
            if result["before"]=="identical":
                result["outcome"]="existing_identical"
                continue
            result["outcome"]="indeterminate"
            insert(transport,kind,row)
            if not same(existing(transport,kind,row),kind,row):
                raise Error("guarded or incomplete v2 insert")
            result["outcome"]="inserted"
        for key,before in receipt["customer_price_digests"].items():
            if customer_price_digest(transport,key)!=before:
                # A concurrent customer update is possible; fail without attribution
                # or automatic retry because the v2 apply is not transactional.
                receipt["legacy_prices_modified"]=True
                raise Error("customer price digest changed")
        receipt["complete"]=True
    except Error as exc:
        receipt["errors"].append({"phase":phase,"code":str(exc)})
    except Exception:
        receipt["errors"].append({"phase":phase,"code":"unexpected_failure"})
    return receipt

def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest",required=True)
    parser.add_argument("--receipt",required=True)
    parser.add_argument("--apply",action="store_true")
    parser.add_argument("--approved-sha256")
    args=parser.parse_args(argv)
    try:
        raw=Path(args.manifest).read_bytes()
        transport=legacy.Transport(os.environ.get("CLOUDFLARE_ACCOUNT_ID"),
                                   os.environ.get("CLOUDFLARE_API_TOKEN"))
        receipt=execute(raw,transport,args.apply,args.approved_sha256)
    except (OSError,legacy.Error):
        receipt={"schema_version":1,"mode":"apply" if args.apply else "dry_run",
                 "complete":False,"errors":[{"phase":"startup","code":"unavailable"}]}
    path=Path(args.receipt)
    path.parent.mkdir(parents=True,exist_ok=True)
    with path.open("x",encoding="utf-8") as stream:
        json.dump(receipt,stream,ensure_ascii=True,sort_keys=True,indent=2)
        stream.write("\n")
    print(json.dumps({"mode":receipt.get("mode"),"complete":receipt["complete"],
                      "rows":len(receipt.get("rows",[])),"errors":receipt["errors"]},
                     sort_keys=True))
    return 0 if receipt["complete"] else 2

if __name__=="__main__":
    sys.exit(main())
