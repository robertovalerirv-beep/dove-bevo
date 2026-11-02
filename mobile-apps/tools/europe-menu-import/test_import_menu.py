import copy
import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('europe_import', Path(__file__).with_name('import_menu.py'))
m = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)
ROOT = Path(__file__).resolve().parents[3]


class ReviewedMenuContextTests(unittest.TestCase):
    def test_happy_hour_windows_are_in_the_public_menu_item_not_only_private_evidence(self):
        doc = m.validate((ROOT / 'mobile-apps/data/europe-menu-seed-20261101.json').read_bytes())
        hours = {'n329135152': 'Happy hour: lun-ven 17:00-20:00',
                 'n5602730924': 'Happy hour: 16:00-23:00'}
        rows = [row for row in doc['records'] if row['hh'] == 1]
        self.assertEqual(len(rows), 6)
        for row in rows:
            self.assertIn(hours[row['venue']], row['menu_item'])


class SQLiteTransport:
    """Real migration schema + a transaction, with a fake network boundary."""
    def __init__(self):
        self.db = sqlite3.connect(':memory:')
        self.db.row_factory = sqlite3.Row
        for migration in sorted((ROOT / 'migrations').glob('*.sql')):
            self.db.executescript(migration.read_text(encoding='utf-8'))
        self.db.execute('PRAGMA foreign_keys=ON')
        self.cell = m.legacy.geo(48.85,2.34)
        self.menu = b'%PDF-1.4 synthetic fixture only'
        self.catalog = {'schema_version':1,'version':'fixture-v1','venues':[
            {'key':'n123','name':'Example bar','kind':1,'lat':48.85,'lon':2.34,'cell':self.cell,
             'city':'Paris','country':'FR','currency':'EUR','google':{'url':'https://www.google.com/maps?cid=123',
             'review_count':101,'checked_on':'2026-01-01'}}]}
        self.calls=[]
        self.before_batch=None
        self.inject_failure=None
        self.lose_response=False
        self.attestation=m.EXPECTED_ATTESTATION
    def fetch(self,url,maximum):
        if url==m.SITE+'/mobile-data/catalog.json':
            return json.dumps(self.catalog).encode()
        if url=='https://example.com/':
            return b'<html><a href="https://example.com/menu.pdf">Menu</a></html>'
        return self.menu
    def attest_binding(self):
        return self.attestation
    def customer(self, status='active', drink='spritz', serving='drink:', revision='customer-rev'):
        self.db.execute('''INSERT INTO mobile_prices_current
          (venue_key,drink,hh,currency,serving_key,cell,amount_minor,observed_on,confirmed_on,
          confirmations,status,source_kind,source_id,revision,changed_at)
          VALUES ('n123',?,0,'EUR',?,?,999,'2026-01-01','2026-01-02',7,?,'customer',NULL,?,'2026-01-02')''',
          [drink,serving,self.cell,status,revision])
    def batch(self,ops):
        self.calls.append(copy.deepcopy(ops))
        if self.before_batch:
            callback,self.before_batch=self.before_batch,None
            callback(self)
        self.db.commit()
        result=[]
        with self.db:
            for i,op in enumerate(ops):
                if self.inject_failure==i:
                    raise sqlite3.IntegrityError('synthetic batch failure')
                cursor=self.db.execute(op['sql'],op['params'])
                result.append([dict(r) for r in cursor.fetchall()])
        if self.lose_response:
            raise m.Error('synthetic committed response loss')
        return result


class ImportTests(unittest.TestCase):
    def setUp(self):
        self.t=SQLiteTransport()
        self.source={'id':'example','url':'https://example.com/menu.pdf','fetch_url':'https://example.com/menu.pdf',
                     'index_url':'https://example.com/','format':'pdf_raw_v1','sha256':m.sha(self.t.menu),
                     'raw_evidence_sha256':m.sha(self.t.menu),'checked_on':'2026-01-01',
                     'identity_note':'Synthetic example identity; not a real public venue.'}
        self.record={'venue':'n123','cell':self.t.cell,'drink':'spritz','hh':0,'currency':'EUR',
                     'serving':{'unit':'drink'},'amount_minor':900,'source_id':'example',
                     'menu_item':'Synthetic spritz','conditions':'Single drink, ordinary price.'}
        self.doc={'schema_version':1,'batch_id':'fixture','catalog':{'url':m.SITE+'/mobile-data/catalog.json',
                  'sha256':m.sha(json.dumps(self.t.catalog).encode()),'version':'fixture-v1','schema_version':1},
                  'sources':[self.source],'records':[self.record]}
    def tearDown(self):
        self.t.db.close()
    def raw(self):
        return json.dumps(self.doc).encode()
    def run_import(self,apply=False,checkpoint=None):
        raw=self.raw()
        return m.run(raw,self.t,apply,m.sha(raw) if apply else None,checkpoint=checkpoint)
    def count(self,table):
        return self.t.db.execute('SELECT count(*) FROM '+table).fetchone()[0]
    def test_audit_is_read_only_and_reports_eligibility(self):
        before='\n'.join(self.t.db.iterdump())
        receipt=self.run_import()
        self.assertTrue(receipt['complete'])
        self.assertEqual(receipt['records'][0]['outcome'],'eligible_at_read')
        self.assertEqual(before,'\n'.join(self.t.db.iterdump()))
        self.assertEqual(len(self.t.calls),1)
        self.assertTrue(all(op['sql'].lstrip().startswith('SELECT') for op in self.t.calls[0]))
    def test_atomic_insert_provenance_and_replay(self):
        result=self.run_import(True)
        self.assertTrue(result['complete'],result)
        self.assertEqual(result['records'][0]['outcome'],'inserted')
        self.assertEqual([self.count(t) for t in ('mobile_menu_sources','mobile_prices_current','mobile_price_obs')],[1,1,1])
        self.assertEqual(len(self.t.calls),1)
        self.assertEqual(len(self.t.calls[0]),5)
        row=self.t.db.execute('SELECT * FROM mobile_prices_current').fetchone()
        self.assertEqual((row['source_kind'],row['observed_on'],row['confirmed_on'],row['confirmations']),('online_menu',None,None,0))
        source=self.t.db.execute('SELECT * FROM mobile_menu_sources').fetchone()
        self.assertEqual((source['source_url'],source['source_sha256'],source['source_checked_on']),
                         (self.source['url'],self.source['sha256'],'2026-01-01'))
        before='\n'.join(self.t.db.iterdump())
        self.assertEqual(self.run_import(True)['records'][0]['outcome'],'skipped_existing_or_guarded')
        self.assertEqual(before,'\n'.join(self.t.db.iterdump()))
    def test_each_existing_status_preserves_customer_and_confirmations(self):
        for status in ['active','quarantined','review','removed']:
            with self.subTest(status=status):
                self.t.db.execute('DELETE FROM mobile_prices_current')
                self.t.customer(status)
                before='\n'.join(self.t.db.iterdump())
                result=self.run_import(True)
                self.assertEqual(result['records'][0]['outcome'],'skipped_existing_or_guarded')
                self.assertEqual(before,'\n'.join(self.t.db.iterdump()))
                self.assertEqual(self.count('mobile_menu_sources'),0)
    def test_history_reports_hidden_moderation_and_legacy_block(self):
        inserts=[
            "INSERT INTO mobile_price_obs(venue_key,drink,hh,currency,serving_key,amount_minor,observed_on,source_kind,status,revision,changed_at) VALUES('n123','spritz',0,'EUR','drink:',800,'2026-01-01','customer','removed','old','old')",
            "INSERT INTO mobile_price_reports(venue_key,target,reason,day) VALUES('n123','venue','wrong_info','2026-01-01')",
            "INSERT INTO mobile_venues_moderation VALUES('n123','review','review')",
            "INSERT INTO venues_hidden VALUES('n123','u09tv','Example','2026-01-01')",
            "INSERT INTO reports(venue_key,reason,day) VALUES('n123','closed','2026-01-01')",
            "INSERT INTO prices_current VALUES('n123','gin_tonic',0,'u09tv',NULL,800,'2026-01-01',0,'active','manual')",
            "INSERT INTO price_obs(venue_key,drink,hh,price_cents,observed_on,source,status) VALUES('n123','gin_tonic',0,800,'2026-01-01','manual','removed')"]
        for sql in inserts:
            with self.subTest(sql=sql):
                self.t.db.close()
                self.t=SQLiteTransport()
                self.t.db.execute(sql)
                before='\n'.join(self.t.db.iterdump())
                receipt=self.run_import(True)
                self.assertTrue(receipt['complete'],receipt)
                self.assertEqual(receipt['records'][0]['outcome'],'skipped_existing_or_guarded')
                self.assertEqual(before,'\n'.join(self.t.db.iterdump()))
    def test_customer_race_before_transaction_wins(self):
        self.t.before_batch=lambda t:t.customer('review')
        receipt=self.run_import(True)
        self.assertEqual(receipt['records'][0]['outcome'],'skipped_existing_or_guarded')
        self.assertEqual(self.count('mobile_menu_sources'),0)
        self.assertEqual(tuple(self.t.db.execute('SELECT amount_minor,confirmations,status FROM mobile_prices_current').fetchone()),(999,7,'review'))
    def test_each_in_transaction_failure_rolls_back_source_current_history(self):
        for i in [1,2,3,4]:
            with self.subTest(index=i):
                self.t.inject_failure=i
                receipt=self.run_import(True)
                self.assertFalse(receipt['complete'])
                self.assertEqual(receipt['records'][0]['outcome'],'indeterminate')
                self.assertEqual([self.count(t) for t in ('mobile_menu_sources','mobile_prices_current','mobile_price_obs')],[0,0,0])
    def test_lost_committed_response_is_indeterminate_and_never_retried(self):
        self.t.lose_response=True
        snapshots=[]
        result=self.run_import(True,lambda value:snapshots.append(copy.deepcopy(value)))
        self.assertFalse(result['complete'])
        self.assertEqual(result['records'][0]['outcome'],'indeterminate')
        self.assertEqual(self.count('mobile_price_obs'),1)
        self.assertEqual(len(self.t.calls),1)
        self.assertTrue(any(s['records'] and s['records'][0]['outcome']=='indeterminate' for s in snapshots))
    def test_distinct_servings_and_currency_are_preserved(self):
        self.record.update(drink='wine_glass',serving={'unit':'glass','ml':175},amount_minor=720)
        other=copy.deepcopy(self.record)
        other.update(serving={'unit':'glass','ml':250},amount_minor=920)
        self.doc['records'].append(other)
        self.assertTrue(self.run_import(True)['complete'])
        self.assertEqual([tuple(r) for r in self.t.db.execute('SELECT serving_key,amount_minor FROM mobile_prices_current ORDER BY serving_key')],
                         [('glass:175',720),('glass:250',920)])
    def test_gbp_bounds_are_native_not_relabelled_euros(self):
        venue=self.t.catalog['venues'][0]
        venue.update(country='GB',currency='GBP',city='London',lat=51.51,lon=-0.13,
                     cell=m.legacy.geo(51.51,-0.13))
        self.doc['catalog']['sha256']=m.sha(json.dumps(self.t.catalog).encode())
        self.record.update(currency='GBP',cell=venue['cell'],amount_minor=1300)
        receipt=self.run_import(True)
        self.assertTrue(receipt['complete'])
        self.assertEqual(tuple(self.t.db.execute('SELECT currency,amount_minor FROM mobile_prices_current').fetchone()),('GBP',1300))
        self.record['amount_minor']=5001
        with self.assertRaises(m.Error):m.validate(self.raw())
    def test_transaction_cap_preserves_all_existing_variants(self):
        for ml in range(1,101):
            self.t.customer(drink='wine_glass',serving='glass:'+str(ml),revision='customer-'+str(ml))
        before='\n'.join(self.t.db.iterdump())
        receipt=self.run_import(True)
        self.assertTrue(receipt['complete'])
        self.assertEqual(receipt['records'][0]['outcome'],'skipped_existing_or_guarded')
        self.assertEqual(before,'\n'.join(self.t.db.iterdump()))
    def test_partial_manifest_receipt_does_not_claim_whole_batch_rollback(self):
        second=copy.deepcopy(self.record)
        second['hh']=1
        self.doc['records'].append(second)
        batch=self.t.batch
        def fail_second(ops):
            if self.t.calls:self.t.inject_failure=3
            return batch(ops)
        self.t.batch=fail_second
        receipt=self.run_import(True)
        self.assertFalse(receipt['complete'])
        self.assertEqual([r['outcome'] for r in receipt['records']],['inserted','indeterminate'])
        self.assertEqual([self.count(t) for t in ('mobile_menu_sources','mobile_prices_current','mobile_price_obs')],[1,1,1])
    def test_duplicate_json_unknown_fields_and_false_schema_rejected(self):
        with self.assertRaises(m.Error):m.validate(b'{"schema_version":1,"schema_version":1}')
        with self.assertRaises(m.Error):m.validate(self.raw().decode().encode('utf-16'))
        self.record['unreviewed']='no'
        with self.assertRaises(m.Error):m.validate(self.raw())
        self.record.pop('unreviewed')
        cat=copy.deepcopy(self.t.catalog)
        cat['schema_version']=True
        raw=json.dumps(cat).encode()
        with self.assertRaises(m.Error):m.validate_catalog(raw,{**self.doc['catalog'],'sha256':m.sha(raw)})
    def test_invalid_manifest_and_approval_fail_before_network(self):
        for field,value in [('hh',True),('currency','USD'),('amount_minor',True),('amount_minor',1501),
                            ('venue','n001'),('serving',{'unit':'drink','ml':100}),('cell','abcde')]:
            with self.subTest(field=field,value=value):
                old=self.record[field]
                self.record[field]=value
                with self.assertRaises(m.Error):m.validate(self.raw())
                self.record[field]=old
        with self.assertRaises(m.Error):m.run(self.raw(),self.t,True,'0'*64)
        self.doc['records'].append(copy.deepcopy(self.record))
        with self.assertRaises(m.Error):m.validate(self.raw())
        self.assertEqual(self.t.calls,[])
    def test_water_beer_and_wine_servings_are_strict(self):
        for code in ['water','beer_draft','wine_glass']:
            with self.subTest(code=code):
                self.record['drink']=code
                with self.assertRaises(m.Error):m.validate(self.raw())
        self.record.update(drink='water',serving={'unit':'ml','ml':0},amount_minor=100)
        with self.assertRaises(m.Error):m.validate(self.raw())
    def test_source_catalog_index_and_binding_drift_precede_db(self):
        cases=[lambda:self.source.update(sha256='0'*64),
               lambda:self.doc['catalog'].update(sha256='0'*64),
               lambda:self.t.catalog['venues'][0].update(currency='GBP'),
               lambda:self.source.update(url='https://example.com/missing.pdf'),
               lambda:setattr(self.t,'attestation',{})]
        for mutate in cases:
            with self.subTest(mutate=mutate):
                old_doc=copy.deepcopy(self.doc)
                old_cat=copy.deepcopy(self.t.catalog)
                mutate()
                self.assertFalse(self.run_import(True)['complete'])
                self.assertEqual(self.t.calls,[])
                self.doc=old_doc
                self.source=self.doc['sources'][0]
                self.record=self.doc['records'][0]
                self.t.catalog=old_cat
                self.t.attestation=m.EXPECTED_ATTESTATION
    def test_source_limit_format_and_normalization(self):
        with self.assertRaises(m.Error):m.digest(b'x'*(m.MAX_SOURCE_BYTES+1),'pdf_raw_v1')
        with self.assertRaises(m.Error):m.digest(b'<html>SPA fallback</html>','pdf_raw_v1')
        one=b'<html><p>Spritz 9 EUR</p><script>nonce1</script></html>'
        two=b'<html><p class="x">Spritz\n 9 EUR</p><script>nonce2</script></html>'
        changed=b'<html><p>Spritz 10 EUR</p></html>'
        self.assertEqual(m.digest(one,'html_text_v1'),m.digest(two,'html_text_v1'))
        self.assertNotEqual(m.digest(one,'html_text_v1'),m.digest(changed,'html_text_v1'))
    def test_current_index_requires_an_anchor_not_a_script_string(self):
        target='https://example.com/menu.pdf'
        self.assertFalse(m.index_has_link(b'<html><script>"https://example.com/menu.pdf"</script></html>',
                                         'https://example.com/',target))
        self.assertTrue(m.index_has_link(b'<html><a href="/menu.pdf">Current menu</a></html>',
                                        'https://example.com/',target))
    def test_catalog_schema_threshold_geography_duplicate_and_italy_fail(self):
        for change in [lambda v:v['google'].update(review_count=100),lambda v:v.update(kind=0),
                       lambda v:v.update(cell='u0000'),lambda v:v.update(name='x'*121),
                       lambda v:v['google'].update(checked_on='2999-01-01')]:
            cat=copy.deepcopy(self.t.catalog)
            change(cat['venues'][0])
            raw=json.dumps(cat).encode()
            pin={**self.doc['catalog'],'sha256':m.sha(raw)}
            with self.assertRaises(m.Error):m.validate_catalog(raw,pin)
        self.t.catalog['venues'][0].update(country='IT',lat=45.4,lon=9.2,cell=m.legacy.geo(45.4,9.2))
        self.record['cell']=self.t.catalog['venues'][0]['cell']
        self.doc['catalog']['sha256']=m.sha(json.dumps(self.t.catalog).encode())
        self.assertFalse(self.run_import(True)['complete'])
        self.assertEqual(self.t.calls,[])
    def test_cli_does_not_overwrite_receipt(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as temp:
            manifest=Path(temp)/'manifest.json'
            receipt=Path(temp)/'receipt.json'
            manifest.write_bytes(self.raw())
            receipt.write_text('preserve')
            self.assertEqual(m.main(['--manifest',str(manifest),'--receipt',str(receipt)]),2)
            self.assertEqual(receipt.read_text(),'preserve')
    def test_cli_writes_valid_incomplete_receipt_after_committed_response_loss(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as temp:
            manifest=Path(temp)/'manifest.json'
            receipt=Path(temp)/'receipt.json'
            manifest.write_bytes(self.raw())
            self.t.lose_response=True
            with patch.object(m,'Transport',return_value=self.t):
                code=m.main(['--manifest',str(manifest),'--receipt',str(receipt),'--apply',
                             '--approved-sha256',m.sha(self.raw())])
            self.assertEqual(code,2)
            saved=json.loads(receipt.read_text(encoding='utf-8'))
            self.assertFalse(saved['complete'])
            self.assertEqual(saved['records'][0]['outcome'],'indeterminate')
            self.assertEqual(self.count('mobile_price_obs'),1)
            self.assertEqual(list(Path(temp).glob('*.tmp')),[])
    def test_cli_initialization_failure_has_reserved_receipt(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as temp:
            manifest=Path(temp)/'manifest.json'
            receipt=Path(temp)/'receipt.json'
            manifest.write_bytes(self.raw())
            with patch.object(m,'Transport',side_effect=m.Error('synthetic unavailable')):
                self.assertEqual(m.main(['--manifest',str(manifest),'--receipt',str(receipt)]),2)
            saved=json.loads(receipt.read_text(encoding='utf-8'))
            self.assertFalse(saved['complete'])
            self.assertEqual(saved['errors'],['transport_not_initialized'])
    def test_reviewed_manifest_and_workflow_fixed_sha_agree(self):
        raw=(ROOT/'mobile-apps/data/europe-menu-seed-20261101.json').read_bytes()
        doc=m.validate(raw)
        self.assertEqual(len(doc['records']),21)
        self.assertEqual(len(doc['sources']),6)
        self.assertEqual(len({r['venue'] for r in doc['records']}),4)
        workflow=(ROOT/'.github/workflows/mobile-europe-menu-import.yml').read_text(encoding='utf-8')
        self.assertIn('MANIFEST_SHA256: '+m.sha(raw),workflow)
        self.assertIn('--apply --approved-sha256 "$MANIFEST_SHA256"',workflow)
        self.assertNotIn('workflow_dispatch',workflow)
    def test_transport_uses_one_documented_batch_request_and_strict_results(self):
        class Response:
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def read(self,limit):return self.raw
        class Opener:
            def open(self,req,timeout):
                self.requests.append(req)
                response=Response()
                response.raw=self.raw
                return response
        t=m.Transport('a'*32,'synthetic-fixture-token')
        opener=Opener()
        opener.requests=[]
        t.opener=opener
        ops=[m.statement('SELECT ? AS first',[1]),m.statement('SELECT ? AS second',[2])]
        opener.raw=json.dumps({'success':True,'result':[
            {'success':True,'results':[{'first':1}]},{'success':True,'results':[{'second':2}]}]}).encode()
        self.assertEqual(t.batch(ops),[[{'first':1}],[{'second':2}]])
        self.assertEqual(len(opener.requests),1)
        req=opener.requests[0]
        self.assertEqual(json.loads(req.data),{'batch':ops})
        self.assertTrue(req.full_url.endswith('/'+m.DATABASE+'/query'))
        for result in [{'success':False}, {'success':True,'result':[]},
                       {'success':True,'result':[{'success':True,'results':[]},{'success':False,'results':[]}]}]:
            opener.raw=json.dumps(result).encode()
            with self.assertRaises(m.Error):t.batch(ops)


if __name__=='__main__':
    unittest.main()
