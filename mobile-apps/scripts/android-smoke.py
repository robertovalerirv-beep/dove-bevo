#!/usr/bin/env python3
"""Exercise the installed live-service app on an owned ephemeral CI emulator."""
import json
import os
from pathlib import Path
import re
import subprocess
import time
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / "mobile-apps/evidence/android"
HOME = EVIDENCE / "device-home"
SDK = Path(os.environ.get("ANDROID_HOME") or os.environ["ANDROID_SDK_ROOT"])
ADB = str(SDK / "platform-tools/adb")
ENV = dict(os.environ, ANDROID_USER_HOME=str(HOME), ANDROID_AVD_HOME=str(HOME / "avd"),
           ANDROID_EMULATOR_HOME=str(HOME), ADB_SERVER_SOCKET="tcp:127.0.0.1:5041",
           ANDROID_ADB_SERVER_PORT="5041")
SERIAL = "emulator-5554"


def run(*args, timeout=30, check=True):
    return subprocess.run(args, env=ENV, capture_output=True, timeout=timeout, check=check)


def adb(*args, timeout=30, check=True):
    return run(ADB, "-P", "5041", "-s", SERIAL, *args, timeout=timeout, check=check)


def wait_for(description, probe, timeout=70):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            result = probe()
            if result is not None and result is not False:
                return result
        except (subprocess.SubprocessError, ET.ParseError, OSError):
            pass
        time.sleep(2)
    raise RuntimeError(f"Timed out: {description}")


def tree():
    adb("shell", "uiautomator", "dump", "/sdcard/dove-ui.xml", timeout=20)
    data = adb("exec-out", "cat", "/sdcard/dove-ui.xml").stdout
    (EVIDENCE / "latest-ui.xml").write_bytes(data)
    return ET.fromstring(data)


def find(label, exact=True):
    for node in tree().iter("node"):
        values = (node.get("text", ""), node.get("content-desc", ""))
        if any(value.casefold() == label.casefold() if exact else label.casefold() in value.casefold() for value in values):
            return node
    return None


def tap(node):
    numbers = [int(value) for value in re.findall(r"\d+", node.attrib["bounds"])]
    if len(numbers) != 4:
        raise RuntimeError("Invalid UI element bounds")
    x1, y1, x2, y2 = numbers
    if x2 <= x1 or y2 <= y1:
        raise RuntimeError("UI element has no visible bounds")
    adb("shell", "input", "tap", str((x1+x2)//2), str((y1+y2)//2))


def screenshot(name):
    data = adb("exec-out", "screencap", "-p").stdout
    if not data.startswith(b"\x89PNG"):
        raise RuntimeError("Screenshot capture returned no PNG")
    (EVIDENCE / name).write_bytes(data)


def map_ready():
    labels = [value for node in tree().iter("node")
              for value in (node.get("text", ""), node.get("content-desc", ""))]
    return ("Mappa interattiva dei bar" in labels
            and "Esplora la mappa" not in labels
            and not any("La mappa non si carica" in value for value in labels))


def city_result(ui, name):
    candidates = []
    for node in ui.iter("node"):
        descendants = list(node.iter("node"))
        if node.get("clickable") != "true" or any(n.get("class") == "android.widget.EditText" for n in descendants):
            continue
        labels = " ".join(value for n in descendants
                          for value in (n.get("text", ""), n.get("content-desc", ""))).casefold()
        if name.casefold() in labels and "città ·" in labels:
            candidates.append((len(descendants), node))
    return min(candidates, key=lambda entry: entry[0])[1] if candidates else None


def main():
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    HOME.mkdir(parents=True, exist_ok=True)
    (HOME / "avd").mkdir(parents=True, exist_ok=True)
    manager = SDK / "cmdline-tools/latest/bin/avdmanager"
    subprocess.run([str(manager), "create", "avd", "--force", "--name", "dove-live",
                    "--package", "system-images;android-36;google_apis;x86_64", "--device", "pixel_6"],
                   input=b"no\n", env=ENV, check=True, timeout=60, capture_output=True)
    run(ADB, "-P", "5041", "-L", "tcp:127.0.0.1:5041", "start-server")
    log = (EVIDENCE / "emulator.log").open("wb")
    emulator = subprocess.Popen([str(SDK / "emulator/emulator"), "-avd", "dove-live", "-port", "5554",
                                 "-no-window", "-no-audio", "-no-boot-anim", "-no-snapshot",
                                 "-gpu", "swiftshader_indirect", "-memory", "2048"],
                                env=ENV, stdout=log, stderr=subprocess.STDOUT)
    result = {"checks": [], "package": "com.dovebevo.app", "result": "failed"}
    try:
        wait_for("emulator boot", lambda: adb("shell", "getprop", "sys.boot_completed", check=False).stdout.strip() == b"1", 150)
        adb("shell", "input", "keyevent", "82")
        apk = ROOT / "mobile-apps/android/app/build/outputs/apk/debug/app-debug.apk"
        adb("install", "-r", str(apk), timeout=60)
        launched = adb("shell", "am", "start", "-W", "-n", "com.dovebevo.app/.MainActivity").stdout.decode()
        if "Error" in launched:
            raise RuntimeError(launched)
        result["checks"].append("production package launched")
        accept_rules = wait_for("native adult usage rules", lambda: find("Ho almeno 18 anni e accetto"), 15)
        if any(n.get("class") == "android.webkit.WebView" for n in tree().iter("node")):
            raise RuntimeError("The online WebView was created before explicit rules acceptance")
        screenshot("00-native-rules.png")
        tap(wait_for("native privacy before acceptance", lambda: find("Privacy"), 10))
        privacy_text = ET.tostring(tree(), encoding="unicode")
        if "dovebevo@gmail.com" not in privacy_text or "Roberto Valeri" not in privacy_text:
            raise RuntimeError("The bundled native privacy text did not load")
        tap(wait_for("close native privacy", lambda: find("Chiudi"), 10))
        tap(wait_for("decline native rules", lambda: find("Esci"), 10))
        adb("shell", "am", "start", "-W", "-n", "com.dovebevo.app/.MainActivity")
        accept_rules = wait_for("declining must not persist acceptance", lambda: find("Ho almeno 18 anni e accetto"), 15)
        if any(n.get("class") == "android.webkit.WebView" for n in tree().iter("node")):
            raise RuntimeError("Declining the rules opened the online service")
        tap(accept_rules)
        result["checks"].append("offline privacy and declined rules retain the gate; explicit acceptance opens service")
        search = wait_for("live website city-search control", lambda: find("Cerca città o bar"), 90)
        result["checks"].append("live website rendered inside WebView")
        screenshot("01-live-home.png")
        tap(search)
        edit = wait_for("city-search input", lambda: next((n for n in tree().iter("node")
                           if n.get("class") == "android.widget.EditText" and n.get("enabled") == "true"), None))
        tap(edit)
        adb("shell", "input", "text", "Milano")
        milano = wait_for("clickable Milano city result", lambda: city_result(tree(), "Milano"))
        screenshot("02-milano-search.png")
        tap(milano)
        wait_for("live map initialized after city selection", map_ready)
        screenshot("03-milano-map.png")
        result["checks"].append("live city search and result selection")
        adb("shell", "input", "keyevent", "3")
        adb("shell", "am", "start", "-W", "-n", "com.dovebevo.app/.MainActivity")
        wait_for("app resumed", lambda: find("Cerca città o bar"))
        result["checks"].append("background and resume")
        adb("shell", "am", "force-stop", "com.dovebevo.app")
        adb("shell", "am", "start", "-W", "-n", "com.dovebevo.app/.MainActivity")
        wait_for("accepted app restarts into live service", lambda: find("Cerca città o bar"), 90)
        if find("Ho almeno 18 anni e accetto") is not None:
            raise RuntimeError("Explicit rules acceptance did not survive a process restart")
        result["checks"].append("accepted rules survive a process restart")
        result["result"] = "passed"
    finally:
        (EVIDENCE / "smoke-result.json").write_text(json.dumps(result, indent=2) + "\n")
        try:
            screenshot("last-state.png")
            tree()
        except (subprocess.SubprocessError, OSError, ET.ParseError):
            pass
        try:
            adb("emu", "kill", timeout=10, check=False)
        except (subprocess.SubprocessError, OSError):
            pass
        try:
            emulator.wait(timeout=15)
        except subprocess.TimeoutExpired:
            emulator.terminate()
            try:
                emulator.wait(timeout=5)
            except subprocess.TimeoutExpired:
                emulator.kill()
                emulator.wait(timeout=5)
        finally:
            try:
                run(ADB, "-P", "5041", "kill-server", timeout=10, check=False)
            except (subprocess.SubprocessError, OSError):
                pass
            log.close()
    print(json.dumps(result))


if __name__ == "__main__":
    main()
