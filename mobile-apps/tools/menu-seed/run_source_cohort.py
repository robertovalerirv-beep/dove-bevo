"""Source-isolated, manifest-pinned one-off audits and explicitly selected imports."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import time

_spec = importlib.util.spec_from_file_location("_menu_trace", Path(__file__).with_name("run_import_with_diagnostics.py"))
trace = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(trace)
core = trace.core

def split(raw):
    doc = core.validate(raw)
    buckets, identities = {}, {}
    for record in doc["records"]:
        url = record["source_url"]
        identity = (record.get("source_format", "raw"), record["source_sha256"])
        if url in identities and identities[url] != identity: raise core.Error("conflicting source representations")
        identities[url] = identity
        buckets.setdefault(url, []).append(record)
    result = []
    for index, records in enumerate(buckets.values()):
        group = dict(doc, batch_id=doc["batch_id"]+"-g"+str(index), records=records)
        data = (json.dumps(group, ensure_ascii=False, indent=2)+"\n").encode("utf-8")
        core.validate(data)
        result.append(data)
    return result

def approved_indexes(value, total):
    if not isinstance(value, str) or not value: raise core.Error("explicit approved source indexes required")
    pieces = value.split(",")
    if any(not piece.isascii() or not piece.isdecimal() or str(int(piece)) != piece for piece in pieces): raise core.Error("invalid approved source indexes")
    indexes = [int(piece) for piece in pieces]
    if len(set(indexes)) != len(indexes) or any(index >= total for index in indexes): raise core.Error("invalid approved source indexes")
    return set(indexes)

def execute(raw, transport_factory, sink, apply=False, approved=None, indexes=None, sleep=time.sleep):
    groups = split(raw)
    digest = hashlib.sha256(raw).hexdigest()
    if apply and approved != digest: raise core.Error("manifest approval hash mismatch")
    if apply and (not isinstance(indexes, set) or not indexes or any(type(i) is not int or not 0 <= i < len(groups) for i in indexes)): raise core.Error("invalid approved source indexes")
    if not apply and indexes is not None: raise core.Error("audit cannot select approved groups")
    summary = {"schema_version":1,"manifest_sha256":digest,"mode":"apply" if apply else "dry_run","complete":True,"groups":[]}
    for index, group_raw in enumerate(groups):
        if apply and index not in indexes:
            summary["groups"].append({"index":index,"selected":False,"complete":False,"outcome":"not_approved"})
            continue
        if index: sleep(0.5)
        group_hash = hashlib.sha256(group_raw).hexdigest()
        record = {"index":index,"selected":True,"manifest_sha256":group_hash,"complete":False}
        try: result = core.run(group_raw, transport_factory(index), apply=apply, approved=group_hash if apply else None)
        except (core.Error, OSError, ValueError):
            result = {"schema_version":1,"batch_id":json.loads(group_raw)["batch_id"],"manifest_sha256":group_hash,"mode":summary["mode"],"complete":False,"records":[],"cache_invalidated":[],"errors":["preflight_or_binding_failed"]}
        record.update(complete=result["complete"],outcome="completed" if result["complete"] else "failed")
        sink(index, group_raw, result)
        summary["groups"].append(record)
        if not result["complete"]: summary["complete"] = False
    return summary

def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--approved-sha256")
    parser.add_argument("--approved-groups")
    args = parser.parse_args(argv)
    try:
        with Path(args.manifest).open("rb") as stream: raw = stream.read(1024*1024+1)
        groups = split(raw)
        indexes = approved_indexes(args.approved_groups, len(groups)) if args.apply else None
        if not args.apply and args.approved_groups is not None: raise core.Error("audit group selection prohibited")
        if args.apply and args.approved_sha256 != hashlib.sha256(raw).hexdigest(): raise core.Error("manifest approval hash mismatch")
        output = Path(args.output_dir)
        output.mkdir(parents=True, exist_ok=False)
        handles, reserved = [], {}
        try:
            for index, group_raw in enumerate(groups):
                if args.apply and index not in indexes: continue
                with (output/("group-"+str(index)+"-manifest.json")).open("xb") as stream: stream.write(group_raw)
                receipt = (output/("group-"+str(index)+"-receipt.json")).open("x", encoding="utf-8")
                handles.append(receipt);reserved[index] = receipt
                log = (output/("group-"+str(index)+"-diagnostic.jsonl")).open("x", encoding="utf-8")
                handles.append(log);reserved[(index,"log")] = log
            def factory(index):
                log = reserved[(index,"log")]
                def emit(phase, status, source_index=None):
                    event = {"phase":phase,"status":status}
                    if source_index is not None: event["source_index"] = source_index
                    log.write(json.dumps(event, sort_keys=True)+"\n");log.flush()
                urls = {r["source_url"]:0 for r in json.loads(groups[index])["records"]}
                cls = trace.traced_transport(core.Transport, urls, emit)
                return cls(os.environ.get("CLOUDFLARE_ACCOUNT_ID"), os.environ.get("CLOUDFLARE_API_TOKEN"))
            def sink(index, group_raw, result):
                stream = reserved[index]
                json.dump(result, stream, sort_keys=True, ensure_ascii=False);stream.write("\n");stream.flush()
            summary = execute(raw, factory, sink, args.apply, args.approved_sha256, indexes)
            with (output/"summary.json").open("x", encoding="utf-8") as stream: json.dump(summary, stream, sort_keys=True);stream.write("\n")
        finally:
            for stream in handles: stream.close()
        print(json.dumps({"complete":summary["complete"],"mode":summary["mode"],"groups":len(summary["groups"])}))
        return 0 if summary["complete"] else 2
    except (core.Error, OSError, ValueError):
        print("cohort: validation or output failure", file=sys.stderr)
        return 2

if __name__ == "__main__": sys.exit(main())
