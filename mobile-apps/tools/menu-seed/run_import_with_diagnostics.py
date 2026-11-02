"""Run the unchanged guarded importer with secret-free phase diagnostics."""
import argparse
import json
from pathlib import Path
import sys
import importlib.util
_spec = importlib.util.spec_from_file_location("_dovebevo_menu_import", Path(__file__).with_name("live_import.py"))
core = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(core)

def traced_transport(base, source_indexes, emit):
    class Traced(base):
        def __init__(self, *args, **kwargs):
            emit("transport", "started")
            try: super().__init__(*args, **kwargs)
            except Exception:
                emit("transport", "failed")
                raise
            emit("transport", "succeeded")
        def fetch(self, address, *args, **kwargs):
            if address == core.SITE + "/api/health": phase, index = "site_health", None
            elif address in source_indexes: phase, index = "menu_source", source_indexes[address]
            else: phase, index = "catalogue", None
            emit(phase, "started", index)
            try: result = super().fetch(address, *args, **kwargs)
            except Exception:
                emit(phase, "failed", index)
                raise
            emit(phase, "succeeded", index)
            return result
        def provider_get(self, suffix):
            if suffix.endswith("/settings"): phase = "worker_settings"
            elif suffix.startswith("/workers/domains?"): phase = "domain_binding"
            elif suffix.startswith("/d1/database/"): phase = "database_binding"
            else: phase = "provider_read"
            emit(phase, "started")
            try: result = super().provider_get(suffix)
            except Exception:
                emit(phase, "failed")
                raise
            emit(phase, "succeeded")
            return result
        def attest_binding(self):
            emit("binding_attestation", "started")
            try: result = super().attest_binding()
            except Exception:
                emit("binding_attestation", "failed")
                raise
            emit("binding_attestation", "succeeded")
            return result
    return Traced

def main(argv=None):
    args_parser = argparse.ArgumentParser(description=__doc__)
    args_parser.add_argument("--manifest", required=True)
    args_parser.add_argument("--receipt", required=True)
    args_parser.add_argument("--apply", action="store_true")
    args_parser.add_argument("--approved-sha256")
    args = args_parser.parse_args(argv)
    try:
        with Path(args.manifest).open("rb") as stream:
            doc = core.validate(stream.read(1024 * 1024 + 1))
        indexes = {}
        for record in doc["records"]:
            if record["source_url"] not in indexes:
                indexes[record["source_url"]] = len(indexes)
        # A fresh diagnostic cannot overwrite an earlier run or receipt.
        with Path(args.receipt + ".diagnostic.jsonl").open("x", encoding="utf-8") as stream:
            def emit(phase, status, source_index=None):
                event = {"phase": phase, "status": status}
                if source_index is not None: event["source_index"] = source_index
                stream.write(json.dumps(event, sort_keys=True) + "\n")
                stream.flush()
            original = core.Transport
            core.Transport = traced_transport(original, indexes, emit)
            try:
                result = core.main(argv)
                emit("run", "succeeded" if result == 0 else "failed")
                return result
            finally:
                core.Transport = original
    except (core.Error, OSError, ValueError):
        print("import diagnostics: validation or output failure", file=sys.stderr)
        return 2

if __name__ == "__main__": sys.exit(main())
