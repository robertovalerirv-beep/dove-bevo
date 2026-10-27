#!/usr/bin/env python3
"""Exercise the installed live-service app on an owned ephemeral CI emulator."""
import json
import os
from pathlib import Path
import re
import shutil
import signal
import socket
import stat
import subprocess
import sys
import tempfile
import threading
import time
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / "mobile-apps/evidence/android"
SDK = None
ADB = None
ENV = None
RUNTIME = None
RUNTIME_ID = None
ADB_OWNER = None
FAILURES = []
STARTUP = {}
DIAGNOSTIC_ERRORS = []
DIAGNOSTIC_LIMIT = 16_384
SERIAL = "emulator-5554"


def safe_text(value):
    """Bound diagnostics, omit environment/key dumps, and conceal private paths."""
    raw = value if isinstance(value, bytes) else str(value).encode("utf-8", "replace")
    text = raw[:DIAGNOSTIC_LIMIT].decode("utf-8", "replace")
    text = re.sub(r"-----BEGIN [^\n]*KEY-----[\s\S]*?(?:-----END [^\n]*KEY-----|$)",
                  "[private key block omitted]", text)
    text = "\n".join("[sensitive diagnostic line omitted]" if re.search(
        r"private.?key|\btoken\b|authorization:|BEGIN .*KEY|ADB_TRACE|ADB_VENDOR_KEYS", line, re.I
    ) else line for line in text.splitlines())
    for path, label in ((RUNTIME, "<private-runtime>"), (ROOT, "<checkout>")):
        if path is not None:
            text = text.replace(str(path), label)
    return text.encode("utf-8")[:DIAGNOSTIC_LIMIT].decode("utf-8", "ignore")


def run(*args, timeout=30, check=True, input=None):
    try:
        completed = subprocess.run(args, env=ENV, input=input, stdin=subprocess.DEVNULL if input is None else None,
                                   capture_output=True, timeout=timeout, check=False)
    except (subprocess.SubprocessError, OSError) as error:
        record_failure(args, error, getattr(error, "stdout", b""), getattr(error, "stderr", b""))
        raise
    if completed.returncode:
        record_failure(args, f"exit {completed.returncode}", completed.stdout, completed.stderr)
        if check:
            raise subprocess.CalledProcessError(completed.returncode, args, completed.stdout, completed.stderr)
    return completed


def record_failure(args, error, stdout=b"", stderr=b""):
    FAILURES.append({"command": [safe_text(arg) for arg in args], "error": safe_text(error),
                     "stdout": safe_text(stdout or b""), "stderr": safe_text(stderr or b"")})
    del FAILURES[:-32]
    try:
        (EVIDENCE / "command-failures.json").write_text(json.dumps(FAILURES, indent=2) + "\n")
    except OSError as error:
        # Never mask the original failing tool with a diagnostic write error.
        DIAGNOSTIC_ERRORS.append(safe_text(error))


def prepare_runtime():
    global ENV, RUNTIME, RUNTIME_ID, SDK, ADB
    if (sys.platform != "linux" or os.environ.get("GITHUB_ACTIONS") != "true"
            or os.environ.get("RUNNER_ENVIRONMENT") != "github-hosted"):
        raise RuntimeError("Android smoke requires an ephemeral GitHub-hosted Linux runner")
    sdk_root = os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT")
    if not sdk_root or not Path(sdk_root).is_absolute():
        raise RuntimeError("An absolute Android SDK location is required")
    SDK = Path(sdk_root)
    ADB = str(SDK / "platform-tools/adb")
    base = Path(os.environ.get("RUNNER_TEMP", ""))
    if not base.is_absolute() or base.is_symlink():
        raise RuntimeError("RUNNER_TEMP must be an absolute non-symlink directory")
    base_info = base.stat()
    base = base.resolve(strict=True)
    if not stat.S_ISDIR(base_info.st_mode) or base_info.st_uid != os.getuid() or base.is_relative_to(ROOT.resolve()):
        raise RuntimeError("RUNNER_TEMP must be runner-owned and outside the checkout")
    RUNTIME = Path(tempfile.mkdtemp(prefix="dovebevo-android-", dir=base))
    RUNTIME.chmod(0o700)
    info = RUNTIME.lstat()
    if (not stat.S_ISDIR(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o700
            or info.st_uid != os.getuid() or RUNTIME.resolve() != RUNTIME):
        raise RuntimeError("Cannot establish private runtime ownership and permissions")
    RUNTIME_ID = (info.st_dev, info.st_ino, info.st_uid)
    for name in ("home", "avd", "android", "keys", "tmp", "config", "cache", "data"):
        (RUNTIME / name).mkdir(mode=0o700)
    ENV = dict(os.environ, HOME=str(RUNTIME / "home"), ANDROID_USER_HOME=str(RUNTIME / "android"),
               ANDROID_AVD_HOME=str(RUNTIME / "avd"), ANDROID_EMULATOR_HOME=str(RUNTIME / "android"),
               ADB_VENDOR_KEYS=str(RUNTIME / "keys"),
               TMPDIR=str(RUNTIME / "tmp"), XDG_CONFIG_HOME=str(RUNTIME / "config"),
               XDG_CACHE_HOME=str(RUNTIME / "cache"), XDG_DATA_HOME=str(RUNTIME / "data"),
               ADB_SERVER_SOCKET="tcp:127.0.0.1:5041", ANDROID_ADB_SERVER_ADDRESS="127.0.0.1",
               ANDROID_ADB_SERVER_PORT="5041",
               ADB_MDNS_AUTO_CONNECT="0")
    # avdmanager rejects conflicting legacy and modern preferences locations.
    # Keep the private ANDROID_USER_HOME authoritative, including on hosts that
    # inherited the deprecated parent-of-.android variable.
    ENV.pop("ANDROID_SDK_HOME", None)
    # Startup logs must not inherit verbose authentication/key diagnostics.
    ENV.pop("ADB_TRACE", None)


def port_open(port):
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.3):
            return True
    except ConnectionRefusedError:
        return False


def adb_ready():
    if ADB_OWNER.poll() is not None:
        raise RuntimeError(f"Owned private ADB server exited: {ADB_OWNER.returncode}")
    ready = port_open(5041)
    if ADB_OWNER.poll() is not None:
        raise RuntimeError(f"Owned private ADB server exited: {ADB_OWNER.returncode}")
    return ready


class BoundedLog:
    """Continuously drain both live pipes; retain only a fixed prefix of each."""
    def __init__(self, process, label):
        self.process = process
        self.label = label
        self.parts = {}
        self.threads = []
        for name, stream in (("stdout", process.stdout), ("stderr", process.stderr)):
            part = {"data": bytearray(), "bytes": 0, "eof": False, "error": None}
            self.parts[name] = part
            thread = threading.Thread(target=self.drain, args=(stream, part), daemon=True)
            thread.start()
            self.threads.append(thread)

    @staticmethod
    def drain(stream, part):
        try:
            while True:
                block = stream.read(4096)
                if not block:
                    part["eof"] = True
                    break
                part["bytes"] += len(block)
                part["data"].extend(block[:max(0, DIAGNOSTIC_LIMIT - len(part["data"]))])
        except (OSError, ValueError) as error:
            part["error"] = safe_text(error)
        finally:
            stream.close()

    def finish(self):
        for thread in self.threads:
            thread.join(timeout=2)
        output = {name: {"text": safe_text(bytes(part["data"])), "bytes": part["bytes"],
                         "truncated_bytes": max(0, part["bytes"] - len(part["data"])),
                         "eof": part["eof"], "error": part["error"]}
                  for name, part in self.parts.items()}
        STARTUP[self.label] = {"returncode": self.process.poll(), "streams": output}
        (EVIDENCE / "emulator-startup.json").write_text(json.dumps(STARTUP, indent=2) + "\n")
        if any(thread.is_alive() for thread in self.threads) or any(not part["eof"] or part["error"] for part in self.parts.values()):
            raise RuntimeError("Emulator diagnostic streams did not complete after cleanup")


def cleanup_runtime(emulator, captures):
    global ADB_OWNER
    errors = []
    for process in (emulator, ADB_OWNER):
        if process is None:
            continue
        try:
            for sig, seconds in ((signal.SIGTERM, 10), (signal.SIGKILL, 5)):
                try:
                    os.killpg(process.pid, sig)
                except ProcessLookupError:
                    break
                try:
                    process.wait(timeout=seconds)
                except subprocess.TimeoutExpired:
                    continue
                try:
                    os.killpg(process.pid, 0)
                except ProcessLookupError:
                    break
            else:
                raise RuntimeError("Owned runtime process group did not stop")
        except (OSError, subprocess.SubprocessError, RuntimeError) as error:
            errors.append(safe_text(error))
    ADB_OWNER = None
    try:
        if RUNTIME is not None and any(port_open(port) for port in (5041, 5554, 5555)):
            raise RuntimeError("Runtime listener still present; private state retained")
    except (OSError, ValueError, RuntimeError) as error:
        errors.append(safe_text(error))
    for capture in captures:
        try:
            capture.finish()
        except (OSError, RuntimeError) as error:
            errors.append(safe_text(error))
    if RUNTIME is not None and not errors:
        try:
            info = RUNTIME.lstat()
            if ((info.st_dev, info.st_ino, info.st_uid) != RUNTIME_ID or info.st_uid != os.getuid()
                    or not stat.S_ISDIR(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o700
                    or RUNTIME.is_symlink() or not RUNTIME.name.startswith("dovebevo-android-")
                    or RUNTIME.resolve() != RUNTIME or RUNTIME.is_relative_to(ROOT.resolve())
                    or not shutil.rmtree.avoids_symlink_attacks):
                raise RuntimeError("Private runtime identity changed; state retained")
            shutil.rmtree(RUNTIME)
        except (OSError, RuntimeError) as error:
            errors.append(safe_text(error))
    return errors


def adb(*args, timeout=30, check=True):
    if ADB_OWNER is None or ADB_OWNER.poll() is not None:
        raise RuntimeError("Owned private ADB server is unavailable")
    result = run(ADB, "-H", "127.0.0.1", "-P", "5041", "-s", SERIAL, *args, timeout=timeout, check=check)
    if ADB_OWNER.poll() is not None:
        raise RuntimeError("Owned private ADB server exited during client command")
    return result


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
    global ADB_OWNER
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    result = {"checks": [], "package": "com.dovebevo.app", "result": "failed"}
    emulator = failure = None
    captures = []
    try:
        prepare_runtime()
        if any(port_open(port) for port in (5041, 5554, 5555)):
            raise RuntimeError("Private runtime ports are already occupied")
        manager = SDK / "cmdline-tools/latest/bin/avdmanager"
        # The SDK's normal mode can report only a null creation error. Retain
        # its official verbose exception diagnostics within the existing bounds.
        run(str(manager), "--verbose", "create", "avd", "--force", "--name", "dove-live",
            "--package", "system-images;android-36;google_apis;x86_64", "--device", "pixel_6",
            input=b"no\n", timeout=60)
        # AOSP commandline.cpp rejects -L combined with -H/-P. socket_spec.cpp
        # accepts exact localhost for IPv4 loopback LISTEN, not literal 127.0.0.1.
        # Foreground mode gives cleanup a direct handle; clients retain literal IP.
        ADB_OWNER = subprocess.Popen([ADB, "-L", "tcp:localhost:5041", "server", "nodaemon"],
                                     env=ENV, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                     stderr=subprocess.PIPE, start_new_session=True)
        captures.append(BoundedLog(ADB_OWNER, "adb"))
        wait_for("owned private ADB listener", adb_ready, 15)
        emulator = subprocess.Popen([str(SDK / "emulator/emulator"), "-avd", "dove-live", "-port", "5554",
                                     "-no-window", "-no-audio", "-no-boot-anim", "-no-snapshot",
                                     "-gpu", "swiftshader_indirect", "-memory", "2048"],
                                    env=ENV, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                    stderr=subprocess.PIPE, start_new_session=True)
        captures.append(BoundedLog(emulator, "emulator"))
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
    except BaseException as error:
        result["error"] = safe_text(error)
        failure = error
    finally:
        if emulator is not None and emulator.poll() is None and ADB_OWNER is not None:
            try:
                screenshot("last-state.png")
                tree()
            except (subprocess.SubprocessError, OSError, RuntimeError, ET.ParseError):
                pass
        errors = cleanup_runtime(emulator, captures) + DIAGNOSTIC_ERRORS
        result["cleanup"] = {"result": "failed" if errors else "passed", "errors": errors}
        if errors:
            result["result"] = "failed"
        try:
            (EVIDENCE / "smoke-result.json").write_text(json.dumps(result, indent=2) + "\n")
        except OSError as error:
            result["result"] = "failed"
            result["diagnostic_write_error"] = safe_text(error)
            if failure is None:
                failure = error
    print(json.dumps(result))
    if failure is not None:
        raise failure
    if errors:
        raise RuntimeError("Private Android runtime cleanup failed; see smoke-result.json")


if __name__ == "__main__":
    main()
