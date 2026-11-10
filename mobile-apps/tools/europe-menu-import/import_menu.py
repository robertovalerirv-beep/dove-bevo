#!/usr/bin/env python3
"""Audit, or explicitly apply, a reviewed app-only European menu manifest."""
import argparse
import datetime as dt
import hashlib
import importlib.util
import ipaddress
import json
import math
import os
from pathlib import Path
import re
import sys
import uuid
from urllib.parse import urlsplit, urljoin
from urllib.request import Request

_spec = importlib.util.spec_from_file_location(
    "legacy_menu_transport", Path(__file__).resolve().parents[1] / "menu-seed" / "live_import.py")
legacy = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(legacy)
Error = legacy.Error
SITE = legacy.SITE
DATABASE = legacy.DATABASE
MAX_SOURCE_BYTES = 8 * 1024 * 1024
MAX_CATALOG_BYTES = 2 * 1024 * 1024
PK = "venue_key=?1 AND drink=?2 AND hh=?3 AND currency=?4 AND serving_key=?5"
EUR = legacy.LIMITS
GBP = {k: ((100, 3000) if k in ('beer_draft', 'alcohol_free') else
           (1, 1500) if k == 'water' else (100, 5000)) for k in EUR}
EXPECTED_ATTESTATION = {
    "domain": "www.dovebevo.com", "worker": "dovebevo-staging", "database": DATABASE,
    "binding": "DB", "name": "dovebevo-staging", "environment": "production", "verified": True}

# These predicates execute inside the same D1 transaction as all three inserts.
# Current/history are protected for this exact variant in ANY status. Legacy and
# moderation/report state protect the whole venue, matching the backend contract.
SAFE = f"""NOT EXISTS (SELECT 1 FROM venues_hidden WHERE venue_key=?1)
AND NOT EXISTS (SELECT 1 FROM mobile_venues_moderation WHERE venue_key=?1)
AND NOT EXISTS (SELECT 1 FROM reports WHERE venue_key=?1)
AND NOT EXISTS (SELECT 1 FROM prices_current WHERE venue_key=?1)
AND NOT EXISTS (SELECT 1 FROM price_obs WHERE venue_key=?1)
AND NOT EXISTS (SELECT 1 FROM mobile_price_reports WHERE venue_key=?1)
AND NOT EXISTS (SELECT 1 FROM mobile_prices_current WHERE {PK})
AND NOT EXISTS (SELECT 1 FROM mobile_price_obs WHERE {PK})
AND (SELECT COUNT(*) FROM mobile_prices_current WHERE venue_key=?1)<100"""
PRESENCE = f"""SELECT
(SELECT COUNT(*) FROM mobile_prices_current WHERE {PK}) AS current_count,
(SELECT COUNT(*) FROM mobile_price_obs WHERE {PK}) AS history_count,
(SELECT COUNT(*) FROM mobile_price_reports WHERE venue_key=?1) AS mobile_reports,
(SELECT COUNT(*) FROM mobile_venues_moderation WHERE venue_key=?1) AS moderation,
(SELECT COUNT(*) FROM venues_hidden WHERE venue_key=?1) AS hidden,
(SELECT COUNT(*) FROM reports WHERE venue_key=?1) AS legacy_reports,
(SELECT COUNT(*) FROM prices_current WHERE venue_key=?1) AS legacy_current,
(SELECT COUNT(*) FROM price_obs WHERE venue_key=?1) AS legacy_history,
(SELECT COUNT(*) FROM mobile_prices_current WHERE venue_key=?1) AS venue_variants"""
CURRENT = f"SELECT * FROM mobile_prices_current WHERE {PK}"


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def strict_json(raw):
    try:
        if isinstance(raw,(bytes,bytearray)):
            raw=bytes(raw).decode('utf-8',errors='strict')
        return legacy.strict_json(raw)
    except UnicodeError:
        raise Error('invalid UTF-8 JSON') from None


def valid_text(value, maximum):
    return (isinstance(value, str) and 0 < len(value.encode('utf-16-le', errors='surrogatepass')) // 2 <= maximum
            and value.strip() and not any(ord(c) < 32 or 127 <= ord(c) <= 159 or
                                        0xd800 <= ord(c) <= 0xdfff for c in value))


def https(value):
    if not valid_text(value, 2048) or any(c.isspace() for c in value):
        raise Error('invalid public HTTPS URL')
    try:
        p = urlsplit(value)
        if (p.scheme != 'https' or not p.hostname or p.username or p.password or p.fragment
                or p.port is not None or not re.fullmatch(r'[A-Za-z0-9.-]+', p.hostname)
                or '.' not in p.hostname or p.hostname.endswith(('.', '.local', '.localhost', '.internal', '.invalid'))):
            raise ValueError()
        try:
            ipaddress.ip_address(p.hostname)
        except ValueError:
            return value
    except ValueError:
        pass
    raise Error('invalid public HTTPS URL')


def digest(raw, fmt):
    if not raw or len(raw) > MAX_SOURCE_BYTES:
        raise Error('source size invalid')
    if fmt == 'pdf_raw_v1':
        if not raw.startswith(b'%PDF-'):
            raise Error('source is not PDF')
        return sha(raw)
    if fmt == 'html_text_v1':
        if b'<html' not in raw[:65536].lower() and b'<!doctype html' not in raw[:65536].lower():
            raise Error('source is not HTML')
        return legacy.source_digest(raw, 'html_text_v1')
    raise Error('invalid source representation')


def index_has_link(raw, index_url, target):
    class Links(legacy.HTMLParser):
        def __init__(self):
            super().__init__(convert_charrefs=True)
            self.urls=[]
        def handle_starttag(self,tag,attrs):
            if tag=='a':
                self.urls.extend(urljoin(index_url,value) for key,value in attrs if key=='href' and value)
    try:
        parser=Links()
        parser.feed(raw.decode('utf-8',errors='strict'))
        parser.close()
        return target in parser.urls
    except UnicodeError:
        raise Error('invalid current menu index') from None


def day(value):
    try:
        if not isinstance(value, str) or dt.date.fromisoformat(value).isoformat() != value:
            raise ValueError()
        if value > dt.datetime.now(dt.timezone.utc).date().isoformat():
            raise ValueError()
    except ValueError:
        raise Error('invalid evidence day') from None


def exact(value, fields, label):
    if not isinstance(value, dict) or set(value) != set(fields.split()):
        raise Error('invalid ' + label + ' schema')


def serving_key(drink, serving):
    if not isinstance(serving, dict) or set(serving) not in ({'unit'}, {'unit', 'ml'}):
        raise Error('invalid serving')
    unit = serving['unit']
    volume = serving.get('ml')
    if unit not in ('drink', 'glass', 'ml') or ('ml' in serving and
            (type(volume) is not int or not 1 <= volume <= 2000)):
        raise Error('invalid serving')
    if drink in ('beer_draft', 'water'):
        if unit != 'ml' or volume is None:
            raise Error('explicit ml required')
    elif drink == 'wine_glass':
        if unit != 'glass':
            raise Error('wine glass required')
    elif unit != 'drink' or volume is not None:
        raise Error('single drink required')
    return unit + ':' + (str(volume) if volume is not None else '')


def validate(raw):
    if len(raw) > 1024 * 1024:
        raise Error('manifest too large')
    doc = strict_json(raw)
    exact(doc, 'schema_version batch_id catalog sources records', 'manifest')
    if type(doc['schema_version']) is not int or doc['schema_version'] != 1:
        raise Error('unsupported manifest version')
    if not isinstance(doc['batch_id'], str) or not re.fullmatch(r'[A-Za-z0-9._-]{1,100}', doc['batch_id']):
        raise Error('invalid batch id')
    cat = doc['catalog']
    exact(cat, 'url sha256 version schema_version', 'catalog pin')
    if cat['url'] != SITE + '/mobile-data/catalog.json' or type(cat['schema_version']) is not int or cat['schema_version'] != 1:
        raise Error('invalid catalog pin')
    if not isinstance(cat['version'], str) or not re.fullmatch(r'[A-Za-z0-9._-]{1,100}', cat['version']):
        raise Error('invalid catalog version')
    if not isinstance(cat['sha256'], str) or not re.fullmatch('[a-f0-9]{64}', cat['sha256']):
        raise Error('invalid catalog hash')
    if not isinstance(doc['sources'], list) or not 1 <= len(doc['sources']) <= 20:
        raise Error('invalid source count')
    sources = {}
    for source in doc['sources']:
        exact(source, 'id url fetch_url index_url format sha256 raw_evidence_sha256 checked_on identity_note', 'source')
        if not isinstance(source['id'], str) or not re.fullmatch(r'[A-Za-z0-9._-]{1,100}', source['id']) or source['id'] in sources:
            raise Error('invalid source id')
        for key in ('url', 'fetch_url', 'index_url'):
            https(source[key])
        if source['format'] not in ('pdf_raw_v1', 'html_text_v1'):
            raise Error('invalid source format')
        for key in ('sha256', 'raw_evidence_sha256'):
            if not isinstance(source[key], str) or not re.fullmatch('[a-f0-9]{64}', source[key]):
                raise Error('invalid source hash')
        day(source['checked_on'])
        if not valid_text(source['identity_note'], 1000):
            raise Error('missing source identity evidence')
        sources[source['id']] = source
    if not isinstance(doc['records'], list) or not 1 <= len(doc['records']) <= 200:
        raise Error('invalid record count')
    seen = set()
    for r in doc['records']:
        exact(r, 'venue cell drink hh currency serving amount_minor source_id menu_item conditions', 'record')
        if not isinstance(r['venue'], str) or not re.fullmatch(r'[nwr][1-9][0-9]{0,14}', r['venue']):
            raise Error('invalid venue')
        if not isinstance(r['cell'], str) or not re.fullmatch(r'[0-9bcdefghjkmnpqrstuvwxyz]{5}', r['cell']):
            raise Error('invalid cell')
        if r['currency'] not in ('EUR', 'GBP') or type(r['hh']) is not int or r['hh'] not in (0, 1):
            raise Error('invalid currency or band')
        bounds = (EUR if r['currency'] == 'EUR' else GBP).get(r['drink']) if isinstance(r['drink'], str) else None
        if not bounds or type(r['amount_minor']) is not int or not bounds[0] <= r['amount_minor'] <= bounds[1]:
            raise Error('invalid native currency amount')
        key = (r['venue'], r['drink'], r['hh'], r['currency'], serving_key(r['drink'], r['serving']))
        if key in seen:
            raise Error('duplicate price variant')
        seen.add(key)
        if not isinstance(r['source_id'], str) or r['source_id'] not in sources:
            raise Error('unknown source')
        if not valid_text(r['menu_item'], 240) or not valid_text(r['conditions'], 1000):
            raise Error('missing menu context')
    if set(sources) != {r['source_id'] for r in doc['records']}:
        raise Error('unused source')
    return doc


def validate_catalog(raw, pin):
    if len(raw) > MAX_CATALOG_BYTES or sha(raw) != pin['sha256']:
        raise Error('live catalog hash mismatch')
    catalog = strict_json(raw)
    exact(catalog, 'schema_version version venues', 'live catalog')
    if type(catalog['schema_version']) is not int or catalog['schema_version'] != pin['schema_version'] or catalog['version'] != pin['version']:
        raise Error('live catalog version mismatch')
    if not isinstance(catalog['venues'], list) or len(catalog['venues']) > 5000:
        raise Error('invalid catalog venue count')
    found = {}
    boxes = {'IT': (35,48,6,19), 'GB': (49.8,61,-8.8,2.1), 'FR': (41,51.6,-5.5,10),
             'ES': (27.5,44,-18.5,4.5), 'DE': (47.2,55.2,5.5,15.6)}
    for v in catalog['venues']:
        exact(v, 'key name kind lat lon cell city country currency google', 'catalog venue')
        if not isinstance(v['key'], str) or not re.fullmatch(r'[nwr][1-9][0-9]{0,14}', v['key']) or v['key'] in found:
            raise Error('invalid catalog identity')
        if not valid_text(v['name'],120) or not valid_text(v['city'],120) or len(v['name'].strip()) < 2 or len(v['city'].strip()) < 2:
            raise Error('invalid catalog text')
        if type(v['kind']) is not int or not 1 <= v['kind'] <= 4 or v['country'] not in boxes:
            raise Error('invalid catalog country or kind')
        if any(type(v[k]) not in (int,float) or not math.isfinite(v[k]) for k in ('lat','lon')):
            raise Error('invalid catalog coordinates')
        south,north,west,east = boxes[v['country']]
        if not south <= v['lat'] <= north or not west <= v['lon'] <= east or legacy.geo(v['lat'],v['lon']) != v['cell']:
            raise Error('invalid catalog geography')
        if v['currency'] != ('GBP' if v['country'] == 'GB' else 'EUR'):
            raise Error('catalog currency mismatch')
        g = v['google']
        if not isinstance(g, dict) or set(g) not in (
                {'url', 'checked_on'}, {'url', 'review_count', 'checked_on'}):
            raise Error('invalid Google proof schema')
        https(g['url'])
        if not re.fullmatch(r'(?:www\.|maps\.)?google\.(?:com|it|fr|de|es|co\.uk)', urlsplit(g['url']).hostname):
            raise Error('invalid Google source')
        count = g.get('review_count')
        if count is not None and (type(count) is not int or not 0 <= count <= 100000000):
            raise Error('invalid Google review count')
        day(g['checked_on'])
        found[v['key']] = v
    return found


class Transport(legacy.Transport):
    def batch(self, statements):
        """One REST request; never substitute multiple mutation HTTP calls."""
        endpoint = f'https://api.cloudflare.com/client/v4/accounts/{self.account}/d1/database/{DATABASE}/query'
        body = json.dumps({'batch': statements}, separators=(',', ':')).encode()
        try:
            req = Request(endpoint, data=body, headers={'Authorization': 'Bearer '+self.token,
                          'Content-Type': 'application/json'}, method='POST')
            with self.opener.open(req, timeout=30) as response:
                raw = response.read(2*1024*1024+1)
            if len(raw) > 2*1024*1024:
                raise Error('D1 batch response too large')
            value = strict_json(raw)
            results = value.get('result') if isinstance(value, dict) else None
            if value.get('success') is not True or not isinstance(results, list) or len(results) != len(statements):
                raise Error('D1 batch envelope invalid')
            if any(not isinstance(r,dict) or r.get('success') is not True or not isinstance(r.get('results'),list) for r in results):
                raise Error('D1 batch result invalid')
            return [r['results'] for r in results]
        except Exception:
            # A lost response does NOT imply rollback. No automatic retry.
            raise Error('D1 batch failed or outcome indeterminate') from None


def statement(sql, params):
    return {'sql': sql, 'params': params}


def key_values(r):
    return [r['venue'],r['drink'],r['hh'],r['currency'],serving_key(r['drink'],r['serving'])]


def eligible(presence):
    fields = {'current_count','history_count','mobile_reports','moderation','hidden',
              'legacy_reports','legacy_current','legacy_history','venue_variants'}
    if (not isinstance(presence,dict) or set(presence)!=fields or
            any(type(n) is not int or n<0 for n in presence.values())):
        raise Error('invalid presence response')
    return not any(v for k,v in presence.items() if k!='venue_variants') and presence['venue_variants']<100


def seed_statements(doc, r, source, manifest_hash, revision, at):
    seed = {'batch_id':doc['batch_id'], 'manifest_sha256':manifest_hash,
            'catalog_version':doc['catalog']['version'], **r,
            'source_url':source['url'], 'source_sha256':source['sha256'],
            'source_checked_on':source['checked_on']}
    source_id = sha(json.dumps(seed, sort_keys=True, separators=(',',':'), ensure_ascii=False).encode())
    key = key_values(r)
    return [
        statement(f"""INSERT OR IGNORE INTO mobile_menu_sources
        (venue_key,drink,hh,currency,serving_key,id,batch_id,manifest_sha256,catalog_version,
         amount_minor,source_url,source_sha256,source_checked_on,menu_item)
        SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14 WHERE {SAFE}""",
        key+[source_id,doc['batch_id'],manifest_hash,doc['catalog']['version'],r['amount_minor'],
             source['url'],source['sha256'],source['checked_on'],r['menu_item']]),
        statement(f"""INSERT INTO mobile_prices_current
        (venue_key,drink,hh,currency,serving_key,cell,amount_minor,observed_on,confirmed_on,
         confirmations,status,source_kind,source_id,revision,changed_at)
        SELECT ?1,?2,?3,?4,?5,?6,amount_minor,NULL,NULL,0,'active','online_menu',id,?8,?9
        FROM mobile_menu_sources WHERE id=?7 AND {SAFE} RETURNING *""",
        key+[r['cell'],source_id,revision,at]),
        statement(f"""INSERT INTO mobile_price_obs
        (venue_key,drink,hh,currency,serving_key,amount_minor,observed_on,source_kind,source_id,status,revision,changed_at)
        SELECT venue_key,drink,hh,currency,serving_key,amount_minor,observed_on,source_kind,source_id,status,revision,changed_at
        FROM mobile_prices_current WHERE {PK} AND revision=?6 RETURNING revision""",key+[revision])]


def preflight(doc, transport):
    # Every source, index and target is checked before the first possible mutation.
    catalog = validate_catalog(transport.fetch(doc['catalog']['url'], MAX_CATALOG_BYTES),doc['catalog'])
    for r in doc['records']:
        v = catalog.get(r['venue'])
        if not v or v['cell'] != r['cell'] or v['currency'] != r['currency']:
            raise Error('catalog record mismatch')
        # This initial batch deliberately contains only non-Italian venues. Italian
        # legacy-cell exclusion requires a separate reviewed extension, never assume
        # that an unavailable legacy cell proves an Italian venue is new.
        if v['country'] == 'IT':
            raise Error('Italian legacy scope unsupported by this batch')
    fetched = {}
    for s in doc['sources']:
        if s['fetch_url'] not in fetched:
            fetched[s['fetch_url']] = transport.fetch(s['fetch_url'],MAX_SOURCE_BYTES)
        if digest(fetched[s['fetch_url']],s['format']) != s['sha256']:
            raise Error('live source digest mismatch')
        if s['index_url'] != s['url']:
            if s['index_url'] not in fetched:
                fetched[s['index_url']] = transport.fetch(s['index_url'],MAX_SOURCE_BYTES)
            # Inspect the current link, never a search-engine cached menu alone.
            if not index_has_link(fetched[s['index_url']],s['index_url'],s['url']):
                raise Error('menu no longer linked by current official index')
    if transport.attest_binding() != EXPECTED_ATTESTATION:
        raise Error('provider binding mismatch')


def run(raw, transport, apply=False, approved=None, receipt=None, checkpoint=None):
    doc = validate(raw)
    manifest_hash = sha(raw)
    if apply and approved != manifest_hash:
        raise Error('manifest approval mismatch')
    receipt = receipt if receipt is not None else {}
    receipt.update(schema_version=1, batch_id=doc['batch_id'], manifest_sha256=manifest_hash,
                   catalog=doc['catalog'], mode='apply' if apply else 'audit', complete=False,
                   records=[], errors=[], binding_attestation=None,
                   provenance='online_menu', atomicity='one D1 transaction per variant; whole manifest is not atomic')
    def save():
        if checkpoint:
            checkpoint(receipt)
    save()
    try:
        preflight(doc,transport)
        receipt['binding_attestation'] = EXPECTED_ATTESTATION
        save()
        for r in doc['records']:
            key = key_values(r)
            record = dict(venue=r['venue'],drink=r['drink'],hh=r['hh'],currency=r['currency'],
                          serving=r['serving'],amount_minor=r['amount_minor'],source_id=r['source_id'],
                          outcome='not_attempted')
            receipt['records'].append(record)
            save()
            if not apply:
                rows = transport.batch([statement(PRESENCE,key),statement(CURRENT,key)])
                if len(rows) != 2 or len(rows[0]) != 1:
                    raise Error('invalid audit response')
                record.update(before=rows[0][0],before_current=rows[1])
                p = rows[0][0]
                record['outcome'] = 'eligible_at_read' if eligible(p) else 'guarded_at_read'
            else:
                revision = str(uuid.uuid4())
                at = dt.datetime.now(dt.timezone.utc).isoformat()
                record.update(outcome='indeterminate',attempt_revision=revision)
                save()  # Persist intent BEFORE sending the only mutation request.
                source = next(s for s in doc['sources'] if s['id']==r['source_id'])
                ops = [statement(PRESENCE,key)] + seed_statements(doc,r,source,manifest_hash,revision,at) + [statement(CURRENT,key)]
                rows = transport.batch(ops)
                if len(rows)!=5 or len(rows[0])!=1 or len(rows[2])>1 or len(rows[3])>1 or len(rows[4])>1:
                    raise Error('invalid apply response')
                record.update(before=rows[0][0],after_current=rows[4])
                was_eligible=eligible(rows[0][0])
                if rows[2]:
                    after = rows[4][0] if rows[4] else {}
                    if (not was_eligible or rows[3] != [{'revision':revision}] or after.get('revision')!=revision or
                        after.get('source_kind')!='online_menu' or after.get('amount_minor')!=r['amount_minor'] or
                        [after.get(k) for k in ('venue_key','drink','hh','currency','serving_key')]!=key or
                        after.get('cell')!=r['cell'] or after.get('source_id')!=ops[1]['params'][5] or
                        after.get('observed_on') is not None or after.get('confirmed_on') is not None or after.get('confirmations')!=0):
                        raise Error('apply read-back mismatch')
                    record['outcome']='inserted'
                elif rows[3]:
                    raise Error('unexpected history insertion')
                elif was_eligible:
                    raise Error('unexplained skipped insertion')
                else:
                    record['outcome']='skipped_existing_or_guarded'
            save()
        receipt['complete']=True
    except Exception:
        receipt['errors'].append('preflight_or_record_operation_failed')
    save()
    return receipt


def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--manifest',required=True)
    p.add_argument('--receipt',required=True,help='new, exclusive secret-free audit receipt')
    p.add_argument('--apply',action='store_true')
    p.add_argument('--approved-sha256')
    args=p.parse_args(argv)
    try:
        with Path(args.manifest).open('rb') as f:
            raw=f.read(1024*1024+1)
        validate(raw)
        if args.apply and args.approved_sha256!=sha(raw):
            raise Error('manifest approval mismatch')
        # Reserve before network access. Never truncate an existing receipt.
        receipt_path=Path(args.receipt)
        with receipt_path.open('x',encoding='utf-8'):
            pass
        def checkpoint(value):
            # A same-directory atomic replacement preserves the preceding durable
            # receipt if interrupted while writing the next one (also on Windows).
            temporary=receipt_path.with_name('.'+receipt_path.name+'.'+str(uuid.uuid4())+'.tmp')
            try:
                with temporary.open('x',encoding='utf-8') as output:
                    json.dump(value,output,sort_keys=True,ensure_ascii=False,indent=2)
                    output.write('\n')
                    output.flush()
                    os.fsync(output.fileno())
                os.replace(temporary,receipt_path)
            finally:
                if temporary.exists():
                    temporary.unlink()
        result={'schema_version':1,'manifest_sha256':sha(raw),'complete':False,
                'mode':'apply' if args.apply else 'audit','records':[],
                'errors':['transport_not_initialized']}
        checkpoint(result)
        transport=Transport(os.environ.get('CLOUDFLARE_ACCOUNT_ID'),os.environ.get('CLOUDFLARE_API_TOKEN'))
        result=run(raw,transport,args.apply,args.approved_sha256,receipt=result,checkpoint=checkpoint)
        print(json.dumps({'complete':result['complete'],'mode':result['mode'],'manifest_sha256':result['manifest_sha256']}))
        return 0 if result['complete'] else 2
    except Exception:
        # Never leak provider bodies, bearer tokens, URLs containing credentials or SQL parameters.
        print('Europe importer: validation, transport or receipt failure',file=sys.stderr)
        return 2


if __name__=='__main__':
    sys.exit(main())
