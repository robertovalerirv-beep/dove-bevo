#!/usr/bin/env python3
"""Read-only Dove Bevo customer flow on a separately started hidden Windows emulator.

Use only an exact CI debug APK and emulator-5554. This script never starts a
window, creates an AVD, logs in, posts a price, or interacts with a challenge.
"""

import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from uuid import uuid4


ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / ".task-tmp" / "android-local-live"
spec = importlib.util.spec_from_file_location("dove_android_smoke", Path(__file__).with_name("android-smoke.py"))
smoke = importlib.util.module_from_spec(spec)
spec.loader.exec_module(smoke)


class ChallengeBlocked(RuntimeError):
    pass


def sha256_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def validate_apk(path, expected):
    if not re.fullmatch(r"[0-9a-f]{64}", expected) or not path.is_file():
        raise ValueError("An existing APK and exact lowercase SHA-256 are required")
    actual = sha256_file(path)
    if actual != expected:
        raise ValueError("APK SHA-256 does not match the exact gated artifact")
    return actual


def run(adb_binary, apk_sha, apk_path):
    stage = "device"
    result = {"result": "failed", "stage": stage, "apk_sha256": apk_sha, "checks": []}
    evidence = EVIDENCE / (datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid4().hex[:8])
    evidence.mkdir(parents=True, exist_ok=False)

    def adb(*args, timeout=25, check=True):
        command = [str(adb_binary), "-s", "emulator-5554", *args]
        completed = subprocess.run(command, capture_output=True, timeout=timeout, check=False)
        if check and completed.returncode:
            raise RuntimeError(f"ADB {args[0]} failed with status {completed.returncode}")
        return completed

    def tree():
        adb("shell", "uiautomator", "dump", "/sdcard/dove-ui.xml")
        xml = adb("exec-out", "cat", "/sdcard/dove-ui.xml").stdout
        if not xml or len(xml) > 2_000_000:
            raise RuntimeError("Missing or oversized Android UI hierarchy")
        (evidence / "latest-ui.xml").write_bytes(xml)
        ui = ET.fromstring(xml)
        if smoke.cloudflare_challenge(ui):
            smoke.screenshot("public-blocked.png")
            raise ChallengeBlocked("Cloudflare challenge on local emulator; no interaction attempted")
        return ui

    smoke.adb, smoke.tree, smoke.EVIDENCE = adb, tree, evidence
    try:
        if adb("shell", "getprop", "ro.kernel.qemu").stdout.strip() != b"1":
            raise RuntimeError("Target must be a virtual emulator, not a physical phone")
        if adb("shell", "getprop", "ro.build.version.sdk").stdout.strip() != b"36":
            raise RuntimeError("The approved API 36 image is required")
        adb("install", "-r", str(apk_path), timeout=90)
        adb("shell", "am", "start", "-W", "-n", "com.dovebevo.app/.MainActivity")
        stage = "rules"
        smoke.tap(smoke.wait_for("18+ rules gate", lambda: smoke.find("Ho almeno 18 anni e accetto"), 20))
        stage = "home"
        smoke.wait_for("public app search", lambda: smoke.find("Cerca città o bar"), 60)
        smoke.screenshot("01-live-home.png")
        result["checks"].append("18+ rules accepted on isolated emulator; public app home loaded")
        stage = "search"
        smoke.tap(smoke.find("Cerca città o bar"))
        edit = smoke.wait_for("city search input", lambda: next((node for node in tree().iter("node")
            if node.get("class") == "android.widget.EditText" and node.get("enabled") == "true"), None), 20)
        smoke.tap(edit)
        adb("shell", "input", "text", "Milano")
        smoke.tap(smoke.wait_for("actual Milano city result",
             lambda: smoke.city_result(tree(), "Milano"), 30))
        stage = "map"
        smoke.wait_for("live Milano map", smoke.map_ready, 45)
        smoke.screenshot("02-milano-map.png")
        stage = "list"
        smoke.tap(smoke.wait_for("Elenco control", lambda: smoke.find("Elenco"), 15))
        row, venue_name, menu_count = smoke.wait_for("positive verified menu venue",
             lambda: smoke.menu_venue_row(tree()), 30)
        stage = "venue"
        smoke.tap(row)
        detail = smoke.wait_for_menu_detail(venue_name)
        smoke.screenshot("03-verified-venue-menu.png")
        result["checks"].append("matching live venue, owner-menu amount and dated source")
        stage = "back"
        back = smoke.wait_for("enabled native Back", lambda: next((node for node in tree().iter("node")
             if node.get("content-desc") == "Indietro" and node.get("enabled") == "true"), None), 15)
        smoke.tap(back)
        smoke.wait_for("Milano map restored", lambda: smoke.map_after_venue_back(tree()), 30)
        smoke.screenshot("04-map-after-back.png")
        result.update(result="passed", stage=stage, venue=detail["venue"],
                      menu_count_in_list=menu_count, menu_price=detail["menu_price"])
        result["checks"].append("native Back restored the live map")
    except BaseException as error:
        result.update(result="blocked" if isinstance(error, ChallengeBlocked) else "failed",
                      stage=stage, error=str(error)[:200])
        try:
            smoke.screenshot("last-state.png")
        except (OSError, RuntimeError, subprocess.SubprocessError):
            pass
    finally:
        result["screenshots"] = {path.name: sha256_file(path) for path in evidence.glob("*.png")}
        (evidence / "receipt.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        result["receipt_path"] = str(evidence / "receipt.json")
        try:
            adb("shell", "am", "force-stop", "com.dovebevo.app", check=False)
        except (OSError, RuntimeError, subprocess.SubprocessError):
            pass
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apk", type=Path, required=True)
    parser.add_argument("--sha256", required=True)
    parser.add_argument("--adb", type=Path, required=True)
    args = parser.parse_args()
    apk = args.apk.resolve(strict=True)
    adb = args.adb.resolve(strict=True)
    if not adb.is_file() or adb.name.lower() != "adb.exe":
        parser.error("Use the installed Android SDK adb.exe")
    apk_sha = validate_apk(apk, args.sha256)
    result = run(adb, apk_sha, apk)
    print(json.dumps({key: result.get(key) for key in ("result", "stage", "venue", "menu_price", "receipt_path")}, ensure_ascii=False))
    return 0 if result["result"] == "passed" else 2


if __name__ == "__main__":
    sys.exit(main())
