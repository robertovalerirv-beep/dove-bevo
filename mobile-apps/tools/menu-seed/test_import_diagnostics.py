import io
import json
import unittest
from unittest.mock import patch
import run_import_with_diagnostics as diag

class TraceTests(unittest.TestCase):
    def fake(self):
        class Base:
            def __init__(self, *args, **kwargs): self.arguments = (args, kwargs)
            def fetch(self, *args, **kwargs): self.fetch_arguments = (args, kwargs); return b"unchanged"
            def provider_get(self, suffix): self.suffix = suffix; return {"unchanged": True}
            def attest_binding(self): return {"unchanged": True}
            def query(self, sql, params): return (sql, params)
        return Base
    def test_preserves_constructor_fetch_and_query(self):
        events = []
        traced = diag.traced_transport(self.fake(), {"https://menu.example": 0}, lambda *args: events.append(args))
        value = traced("SECRET", credential="TOKEN")
        self.assertEqual(value.arguments, (("SECRET",), {"credential":"TOKEN"}))
        self.assertEqual(value.fetch("https://menu.example", 42), b"unchanged")
        self.assertEqual(value.fetch_arguments, (("https://menu.example", 42), {}))
        self.assertEqual(value.query("SQL", ["PRIVATE"]), ("SQL", ["PRIVATE"]))
        packed = json.dumps(events)
        for text in ("SECRET", "TOKEN", "PRIVATE", "menu.example", "SQL"): self.assertNotIn(text, packed)
        self.assertIn(("menu_source", "succeeded", 0), events)
    def test_failure_reports_phase_without_exception_or_credentials(self):
        class Base(self.fake()):
            def fetch(self, *args, **kwargs): raise OSError("SECRET TOKEN RESPONSE BODY")
        events = []
        value = diag.traced_transport(Base, {"https://menu.example":1}, lambda *args: events.append(args))()
        with self.assertRaises(OSError): value.fetch("https://menu.example")
        self.assertEqual(events[-1], ("menu_source", "failed", 1))
        self.assertNotIn("SECRET", json.dumps(events))
    def test_provider_and_binding_results_are_unchanged(self):
        events = []
        value = diag.traced_transport(self.fake(), {}, lambda *args: events.append(args))()
        self.assertEqual(value.provider_get("/workers/scripts/x/settings"), {"unchanged": True})
        self.assertEqual(value.provider_get("/workers/domains?ACCOUNT_SECRET"), {"unchanged": True})
        self.assertEqual(value.provider_get("/d1/database/PRIVATE?fields=uuid,name"), {"unchanged": True})
        self.assertEqual(value.attest_binding(), {"unchanged": True})
        self.assertNotIn("ACCOUNT_SECRET", json.dumps(events))
        self.assertNotIn("PRIVATE", json.dumps(events))
        self.assertEqual({e[0] for e in events}, {"transport","worker_settings","domain_binding","database_binding","binding_attestation"})
    def test_provider_failure_never_logs_raw_body(self):
        class Base(self.fake()):
            def provider_get(self, suffix): raise ValueError("secret header and body")
        events=[]
        value=diag.traced_transport(Base, {}, lambda *args:events.append(args))()
        with self.assertRaises(ValueError):value.provider_get("/workers/scripts/PRIVATE/settings")
        self.assertEqual(events[-1], ("worker_settings","failed"))
        self.assertNotIn("secret",json.dumps(events))
    def test_constructor_failure_is_safe(self):
        class Base:
            def __init__(self, *args): raise ValueError("SECRET")
        events=[]
        with self.assertRaises(ValueError):diag.traced_transport(Base, {}, lambda *args:events.append(args))("TOKEN")
        self.assertEqual(events,[("transport","started"),("transport","failed")])
    def test_existing_diagnostic_blocks_importer_before_transport(self):
        manifest = io.BytesIO(b"{}")
        with patch.object(diag.core, "validate", return_value={"records":[]}), patch.object(diag.Path, "open", side_effect=[manifest, FileExistsError()]), patch.object(diag.core, "main") as execute:
            self.assertEqual(diag.main(["--manifest","example.json","--receipt","existing.json"]), 2)
            execute.assert_not_called()

if __name__=="__main__":unittest.main()
