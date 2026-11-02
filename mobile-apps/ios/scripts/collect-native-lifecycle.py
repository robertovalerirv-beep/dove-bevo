#!/usr/bin/env python3
"""Stream only fixed app lifecycle events; never retain raw simulator logs."""

import argparse
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import time
import uuid

MAX_LINE = 8192
MAX_EVENTS = 128
PREDICATE = ('process == "DoveBevo" AND (eventMessage BEGINSWITH "DoveBevo: " OR '
             'eventMessage CONTAINS "WebProcessProxy::processDidTerminateOrFailedToLaunch: " OR '
             'eventMessage CONTAINS "WebPageProxy::processDidTerminate: " OR '
             'eventMessage CONTAINS "WebPageProxy::dispatchProcessDidTerminate: ")')
EVENTS = {
    "navigation provisional-start": "provisional_start",
    "navigation commit": "commit",
    "navigation finish": "finish",
    "renderer terminated recovered=no": "renderer_terminated_first",
    "renderer terminated recovered=yes": "renderer_terminated_repeated",
}
MESSAGE = re.compile(r"\bDoveBevo: (navigation provisional-start|navigation commit|navigation finish|"
                     r"renderer terminated recovered=(?:yes|no)|navigation failed code=-?[0-9]{1,19})$")
# Observed string names only. Header values are not mapped to the installed
# WebKit binary, and numeric codes remain uninterpreted signed 64-bit values.
# https://github.com/WebKit/WebKit/blob/main/Source/WebKit/Shared/ProcessTerminationReason.h
WEBKIT_REASONS = frozenset({
    "ExceededMemoryLimit", "ExceededCPULimit", "RequestedByClient", "IdleExit", "Unresponsive", "Crash",
    "ExceededProcessCountLimit", "NavigationSwap", "RequestedByNetworkProcess", "RequestedByGPUProcess",
    "RequestedByModelProcess", "GPUProcessCrashedTooManyTimes", "ModelProcessCrashedTooManyTimes",
    "NonMainFrameWebContentProcessCrash",
})
# Exact witnessed message endings; prefixes/PIDs are never copied to evidence.
# https://developer.apple.com/forums/thread/794606
REASON = r"([A-Za-z][A-Za-z0-9]*|-?[0-9]{1,19})\Z"
WEBKIT_MESSAGES = (
    ("WebProcessProxy", re.compile(r"\bWebProcessProxy::processDidTerminateOrFailedToLaunch: reason=" + REASON)),
    ("WebPageProxy", re.compile(r"\bWebPageProxy::processDidTerminate: \(pid [0-9]{1,10}\), reason=" + REASON)),
    ("WebPageProxy", re.compile(r"\bWebPageProxy::dispatchProcessDidTerminate: reason=" + REASON)),
)


def event_from_line(line):
    """Copy neither the log prefix nor arbitrary message strings into evidence."""
    if len(line) > MAX_LINE or not line.endswith(b"\n"):
        return None
    text = line[:-1].removesuffix(b"\r").decode("utf-8", "replace")
    match = MESSAGE.search(text)
    if match:
        message = match[1]
        if message in EVENTS:
            return {"event": EVENTS[message]}
        code = int(message.rsplit("=", 1)[1])
        if -(1 << 63) <= code < (1 << 63):
            return {"event": "navigation_failed", "code": code}
        return None
    for source, pattern in WEBKIT_MESSAGES:
        match = pattern.search(text)
        if not match:
            continue
        reason = match[1]
        if reason in WEBKIT_REASONS:
            return {"event": "webkit_process_terminated", "source": source, "reason": reason}
        if re.fullmatch(r"-?[0-9]{1,19}", reason):
            code = int(reason)
            if -(1 << 63) <= code < (1 << 63):
                return {"event": "webkit_process_terminated", "source": source, "reasonCode": code}
        return None
    return None


def read_events(pipe, summary, write):
    while True:
        line = pipe.readline(MAX_LINE + 1)
        if not line:
            return
        if len(line) > MAX_LINE or not line.endswith(b"\n"):
            summary["oversizeOrIncompleteLines"] += 1
            while line and not line.endswith(b"\n"):
                line = pipe.readline(MAX_LINE + 1)
            continue
        event = event_from_line(line)
        if event is None:
            summary["discardedLines"] += 1
            continue
        if len(summary["events"]) == MAX_EVENTS:
            summary["droppedEvents"] += 1
            continue
        # This is when the collector observed a line, not the exact event time
        # and not an assertion of causal alignment with XCTest/video frames.
        event["observedAtUnixSeconds"] = round(time.time(), 3)
        summary["events"].append(event)
        write()


def stop_owned_group(process):
    for sig in (signal.SIGTERM, signal.SIGKILL):
        try:
            os.killpg(process.pid, sig)
        except ProcessLookupError:
            return True
        try:
            process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            continue
        try:
            os.killpg(process.pid, 0)
        except ProcessLookupError:
            return True
    return False


def collect(device, output):
    summary = {"schemaVersion": 1, "bestEffort": True, "collectionState": "starting",
               "events": [], "discardedLines": 0, "oversizeOrIncompleteLines": 0,
               "droppedEvents": 0, "cleanupSucceeded": None, "streamReturnCode": None}
    process = None
    with output.open("x", encoding="utf-8") as destination:
        def write():
            destination.seek(0)
            json.dump(summary, destination, indent=2)
            destination.write("\n")
            destination.truncate()
            destination.flush()

        write()
        try:
            process = subprocess.Popen(
                ["xcrun", "simctl", "spawn", device, "log", "stream", "--style", "compact",
                 "--level", "debug", "--predicate", PREDICATE],
                stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
            summary["collectionState"] = "streaming"
            write()
            read_events(process.stdout, summary, write)
            summary["collectionState"] = "stream_ended"
        except KeyboardInterrupt:
            summary["collectionState"] = "stopped"
        except OSError:
            summary["collectionState"] = "unavailable"
        finally:
            if process is not None:
                try:
                    summary["cleanupSucceeded"] = stop_owned_group(process)
                except OSError:
                    summary["cleanupSucceeded"] = False
                summary["streamReturnCode"] = process.poll()
                process.stdout.close()
            else:
                summary["cleanupSucceeded"] = True
            write()
    return summary


def interrupt(_signal, _frame):
    raise KeyboardInterrupt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--device", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    uuid.UUID(args.device)
    signal.signal(signal.SIGTERM, interrupt)
    signal.signal(signal.SIGINT, interrupt)
    result = collect(args.device, args.output)
    ended_cleanly = result["collectionState"] == "stopped" or result["streamReturnCode"] == 0
    return 0 if result["cleanupSucceeded"] and ended_cleanly else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError):
        print("Native lifecycle collection unavailable; no raw log output retained.", file=sys.stderr)
        sys.exit(1)
