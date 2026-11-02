#!/usr/bin/env python3
"""Best-effort, bounded crash metadata from the temporary hosted Mac only."""

import argparse
import json
import os
from pathlib import Path
import re
import stat
import sys
import time

MAX_ENTRIES = 256
MAX_REPORTS = 12
MAX_BYTES = 2 * 1024 * 1024
NAMES = re.compile(r"^(?P<kind>(?:com\.apple\.)?WebKit(?:\.WebContent)?|WebContent|DoveBevo|Jetsam(?:Event)?)[-_].+\.ips$", re.IGNORECASE)
PROCESSES = {"DoveBevo", "WebContent", "WebKit", "com.apple.WebKit.WebContent", "com.apple.WebKit.Networking"}
EXCEPTIONS = {"EXC_BAD_ACCESS", "EXC_BAD_INSTRUCTION", "EXC_ARITHMETIC", "EXC_EMULATION", "EXC_SOFTWARE", "EXC_BREAKPOINT", "EXC_SYSCALL", "EXC_MACH_SYSCALL", "EXC_RPC_ALERT", "EXC_CRASH", "EXC_RESOURCE", "EXC_GUARD", "EXC_CORPSE_NOTIFY"}
SIGNALS = {"SIGABRT", "SIGBUS", "SIGFPE", "SIGILL", "SIGINT", "SIGKILL", "SIGPIPE", "SIGSEGV", "SIGSTOP", "SIGSYS", "SIGTERM", "SIGTRAP", "SIGXCPU", "SIGXFSZ"}
NAMESPACES = {"SIGNAL", "CODESIGNING", "DYLD", "FRONTBOARD", "RUNNINGBOARD", "WATCHDOG", "WEBKIT", "JETSAM", "RESOURCE", "GUARD", "LIBSYSTEM", "TCC", "SANDBOX"}
INDICATORS = {"Killed: 9", "Abort trap: 6", "Segmentation fault: 11", "Bus error: 10", "Trace/BPT trap: 5", "highwater", "per-process-limit", "vm-pageshortage"}
MEMORY_KEYS = {"pageSize", "compressorSize", "compressions", "decompressions", "zoneMapSize", "zoneMapCap", "largestZoneSize", "physicalPages", "freeMemory", "availableMemory", "memoryLimit"}
PAGE_KEYS = {"active", "free", "inactive", "wired", "purgeable", "fileBacked", "anonymous", "compressor", "throttled", "speculative"}


def number(value):
    return type(value) is int and 0 <= value <= (1 << 64) - 1


def codes(value):
    if isinstance(value, list) and 0 < len(value) <= 4 and all(number(item) for item in value):
        return value
    if isinstance(value, str) and len(value) <= 90:
        parts = [item.strip() for item in value.split(",")]
        if 0 < len(parts) <= 4 and all(re.fullmatch(r"0x[0-9a-fA-F]{1,16}|[0-9]{1,20}", item) for item in parts):
            if all(int(item, 16 if item.startswith("0x") else 10) <= (1 << 64) - 1 for item in parts):
                return parts
    return None


def sanitize(header, body):
    """Never copy arbitrary messages, reasons, filenames, stacks or paths."""
    result = {}
    process = body.get("procName", header.get("app_name"))
    if isinstance(process, str) and process in PROCESSES:
        result["processName"] = process
    for section, allowed in [("exception", {"type": EXCEPTIONS, "signal": SIGNALS}),
                             ("termination", {"namespace": NAMESPACES, "indicator": INDICATORS})]:
        raw = body.get(section)
        if not isinstance(raw, dict):
            continue
        fields = {key: value for key, options in allowed.items()
                  if isinstance(value := raw.get(key), str) and value in options}
        if section == "exception":
            value = codes(raw.get("codes"))
            if value is not None:
                fields["codes"] = value
        elif number(raw.get("code")):
            fields["code"] = raw["code"]
        if fields:
            result[section] = fields
    version = body.get("osVersion")
    if isinstance(version, dict):
        fields = {}
        train, build = version.get("train"), version.get("build")
        if isinstance(train, str) and re.fullmatch(r"(?:macOS|iOS|iPhone OS) [0-9]{1,2}(?:\.[0-9]{1,3}){0,2}", train):
            fields["train"] = train
        if isinstance(build, str) and re.fullmatch(r"[0-9]{2}[A-Z][0-9]{1,6}[a-z]?", build):
            fields["build"] = build
        if fields:
            result["osVersion"] = fields
    memory = body.get("memoryStatus")
    if isinstance(memory, dict):
        fields = {key: memory[key] for key in MEMORY_KEYS if number(memory.get(key))}
        pages = memory.get("memoryPages")
        if isinstance(pages, dict):
            safe_pages = {key: pages[key] for key in PAGE_KEYS if number(pages.get(key))}
            if safe_pages:
                fields["memoryPages"] = safe_pages
        if fields:
            result["memoryStatus"] = fields
    return result


def parse_report(data):
    # Apple .ips files commonly contain a one-line header plus a JSON body.
    text = data.decode("utf-8").strip()
    decoder = json.JSONDecoder()
    first, offset = decoder.raw_decode(text)
    remainder = text[offset:].strip()
    if remainder:
        body, offset = decoder.raw_decode(remainder)
        if remainder[offset:].strip():
            raise ValueError("Unexpected trailing report data")
        header = first
    else:
        header, body = {}, first
    if not isinstance(header, dict) or not isinstance(body, dict):
        raise ValueError("Unexpected report structure")
    return sanitize(header, body)


def collect(since, roots):
    candidates = []
    counts = {"scannedEntries": 0, "scanLimitReached": False, "oversizeReports": 0, "unreadableOrInvalidReports": 0}
    for root in roots:
        try:
            if any(path.is_symlink() for path in (root, *root.parents)) or not root.is_dir():
                continue
            with os.scandir(root) as entries:
                for index, entry in enumerate(entries):
                    if index >= MAX_ENTRIES:
                        counts["scanLimitReached"] = True
                        break
                    counts["scannedEntries"] += 1
                    match = NAMES.fullmatch(entry.name)
                    if not match or entry.is_symlink():
                        continue
                    info = os.stat(entry.path, follow_symlinks=False)
                    if not stat.S_ISREG(info.st_mode) or info.st_mtime < since:
                        continue
                    if info.st_size > MAX_BYTES:
                        counts["oversizeReports"] += 1
                        continue
                    kind = match["kind"].casefold()
                    kind = "jetsam" if kind.startswith("jetsam") else "dovebevo" if kind == "dovebevo" else "webkit"
                    candidates.append((info.st_mtime, Path(entry.path), info, kind))
        except OSError:
            counts["unreadableOrInvalidReports"] += 1
    reports = []
    for _, path, original, kind in sorted(candidates, key=lambda item: item[0], reverse=True)[:MAX_REPORTS]:
        try:
            descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
            with os.fdopen(descriptor, "rb") as stream:
                current = os.fstat(stream.fileno())
                if (current.st_dev, current.st_ino) != (original.st_dev, original.st_ino) or not stat.S_ISREG(current.st_mode) or current.st_mtime < since:
                    raise ValueError("Report identity changed")
                data = stream.read(MAX_BYTES + 1)
                if len(data) > MAX_BYTES:
                    raise ValueError("Report exceeded its read limit")
            report = parse_report(data)
            if report:
                reports.append({"reportKind": kind, **report})
        except (OSError, ValueError, UnicodeError, RecursionError):
            counts["unreadableOrInvalidReports"] += 1
    return {"schemaVersion": 1, "bestEffort": True, "reports": reports, "counts": counts,
            "reportLimitReached": len(candidates) > MAX_REPORTS}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--since", type=int, required=True)
    args = parser.parse_args()
    if not (sys.platform == "darwin" and os.environ.get("GITHUB_ACTIONS") == "true"
            and os.environ.get("RUNNER_ENVIRONMENT") == "github-hosted" and os.environ.get("RUNNER_OS") == "macOS"):
        print("Host crash metadata collection skipped outside the temporary hosted Mac.")
        return
    if not 0 < args.since <= time.time() + 60:
        raise ValueError("Invalid test start time")
    roots = [Path.home() / "Library/Logs/DiagnosticReports", Path("/Library/Logs/DiagnosticReports")]
    summary = collect(args.since, roots)
    output = Path(__file__).resolve().parents[1] / ".build/SimulatorDiagnostics/crash-summary.json"
    if output.parent.is_symlink() or output.parent.parent.is_symlink():
        raise ValueError("Diagnostic output must not be a symlink")
    # Preserve any prior result; never overwrite or export the original reports.
    with output.open("x", encoding="utf-8") as stream:
        json.dump(summary, stream, indent=2, sort_keys=True)
        stream.write("\n")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        # Do not expose raw parser/OS exceptions: reports can contain private data.
        print("Host crash metadata collection was unavailable; test status is retained.", file=sys.stderr)
        sys.exit(1)
