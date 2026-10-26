"""One bounded, isolated Android emulator startup proof; no release signing or deployment.

Only Google's installed SDK tools are used. Setup and startup have separate 480s
budgets and nine-minute workflow caps. Subprocess timeouts are soft OS limits;
the outer margin handles process teardown. No emulator/runtime fallback or retry.
"""

import hashlib
import json
import os
from pathlib import Path
import platform
import re
import secrets
import shutil
import signal
import socket
import stat
import struct
import subprocess
import sys
import tempfile
import time

IDENTITY = "com.dovebevo.app.preview"
ACTIVITY = IDENTITY + ".MainActivity"
COMPONENT = IDENTITY + "/" + ACTIVITY
IMAGE = "system-images;android-36;google_apis;x86_64"
TOTAL_SECONDS = 480
CLEANUP_RESERVE = 60
SETTLE_SECONDS = 25
MAX_LOG_BYTES = 65536
MAX_PNG_BYTES = 24 * 1024 * 1024
HOST = "127.0.0.1"  # Literal IP is deliberate: adb must not auto-start a local daemon.


class LaunchFailure(Exception):
    pass


class WebViewPreparing(LaunchFailure):
    pass


def execute(stage, argv, timeout, env, output=None):
    """Capture only known commands, with EOF stdin and an owned process group.

    Temporary output is not an artifact until the bounded runner log is written.
    Long-lived emulator/server stdout and stderr go to DEVNULL, never logcat.
    """
    with tempfile.TemporaryFile() as stdout, tempfile.TemporaryFile() as stderr:
        process = subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=stdout,
                                   stderr=stderr, env=env, start_new_session=True)
        try:
            process.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            process.wait(timeout=3)
            stdout.seek(0)
            stderr.seek(0)
            raise subprocess.TimeoutExpired(argv, timeout, output=stdout.read(MAX_LOG_BYTES + 1),
                                            stderr=stderr.read(MAX_LOG_BYTES + 1)) from None
        stdout.seek(0)
        stderr.seek(0)
        if output is not None:
            body = stdout.read(MAX_PNG_BYTES + 1)
            if len(body) > MAX_PNG_BYTES:
                raise LaunchFailure("Screenshot output exceeds its fixed byte bound")
            output.write_bytes(body)
            body = b""
        else:
            body = stdout.read(MAX_LOG_BYTES + 1)
        return subprocess.CompletedProcess(argv, process.returncode, body, stderr.read(MAX_LOG_BYTES + 1))


class CommandRunner:
    def __init__(self, evidence, invoke=execute, clock=time.monotonic, env=None):
        self.evidence = evidence
        evidence.mkdir(parents=True, exist_ok=True)
        self.invoke, self.clock, self.env = invoke, clock, env or {}
        self.started = clock()
        self.deadline = self.started + TOTAL_SECONDS
        self.stages = []

    def remaining(self, cleanup=False):
        value = self.deadline - self.clock() - (0 if cleanup else CLEANUP_RESERVE)
        if value <= 0:
            raise LaunchFailure("Overall Android phase deadline reached")
        return value

    def run(self, stage, argv, timeout=10, allow_nonzero=False, output=None):
        started = self.clock()
        record = {"stage": stage, "requested_timeout_seconds": timeout,
                  "effective_timeout_seconds": 0, "elapsed_seconds": 0,
                  "started_elapsed_seconds": round(started - self.started, 3),
                  "exit_code": None, "outcome": "deadline-exhausted"}
        stdout, stderr = b"", b""
        try:
            limit = min(timeout, self.remaining())
            record["effective_timeout_seconds"] = round(limit, 3)
            try:
                result = self.invoke(stage, argv, timeout=limit, env=self.env, output=output)
            except subprocess.TimeoutExpired as error:
                stdout, stderr = error.output or b"", error.stderr or b""
                record["outcome"] = "timed-out"
                raise LaunchFailure(stage + " timed out") from None
            stdout, stderr = result.stdout, result.stderr
            record["exit_code"] = result.returncode
            record["outcome"] = "completed" if result.returncode == 0 else "failed"
            if result.returncode and not allow_nonzero:
                raise LaunchFailure(stage + " failed with exit " + str(result.returncode))
            return result
        finally:
            def as_bytes(value):
                return value.encode("utf-8") if isinstance(value, str) else value
            data = as_bytes(stdout) + b"\n" + as_bytes(stderr)
            (self.evidence / (stage + ".log")).write_bytes(data[:MAX_LOG_BYTES] + (b"\n[truncated]\n" if len(data) > MAX_LOG_BYTES else b""))
            record["elapsed_seconds"] = round(self.clock() - started, 3)
            self.stages.append(record)

    def text(self, stage, argv, **kwargs):
        output = self.run(stage, argv, **kwargs).stdout
        if len(output) > MAX_LOG_BYTES:
            raise LaunchFailure(stage + " response exceeds its fixed byte bound")
        return output.decode("utf-8", errors="strict").strip()


def properties(path):
    return dict(re.findall(r"(?m)^([A-Za-z0-9_.]+)\s*=\s*(.*?)\s*$", path.read_text(encoding="utf-8")))


def component(value):
    return value.replace(IDENTITY + "/.", IDENTITY + "/" + IDENTITY + ".")


def listener_inodes_match(contents, inodes, port):
    for line in contents.splitlines()[1:]:
        fields = line.split()
        if len(fields) >= 10 and fields[3] == "0A" and fields[1] == "0100007F:" + format(port, "04X") and fields[9] in inodes:
            return True
    return False


def private_listener_present(contents, port):
    """Read LISTEN state, not bindability: closed sockets may remain in TIME_WAIT.

    Inspect both proc tables at the call site. Any listener on the exact private
    port, including IPv6/wildcard addresses, prevents claiming complete cleanup.
    Unknown inventory is an error rather than evidence of an absent listener.
    """
    lines = contents.splitlines()
    if not lines or not {"local_address", "st", "inode"}.issubset(lines[0].split()):
        raise LaunchFailure("Unrecognized private listener inventory header")
    present = False
    for line in lines[1:]:
        if not line.strip():
            continue
        fields = line.split()
        if len(fields) < 10 or not re.fullmatch(r"(?:[0-9A-Fa-f]{8}|[0-9A-Fa-f]{32}):[0-9A-Fa-f]{4}", fields[1]) or not re.fullmatch(r"[0-9A-Fa-f]{2}", fields[3]) or not fields[9].isdigit():
            raise LaunchFailure("Unrecognized private listener inventory row")
        if fields[3].upper() == "0A" and int(fields[1].rsplit(":", 1)[1], 16) == port:
            present = True
    return present


def webview_readiness(contents):
    """Require the API 36 service's usable provider and completed preparation.

    android16-release WebViewUpdateServiceImpl2 can report a current provider
    while it is still preparing. Its readiness predicate requires a clean
    package, finished RELRO creation and an installed provider. Its separate
    package listing also proves this same version is valid/enabled for all users.
    """
    lines = [line.strip() for line in contents.splitlines()]

    def field(label, pattern):
        values = [line[len(label):] for line in lines if line.startswith(label)]
        if len(values) != 1 or not re.fullmatch(pattern, values[0]):
            raise LaunchFailure("Missing, duplicated or malformed WebView readiness field")
        return values[0]

    current = field("Current WebView package (name, version): ", r"\([A-Za-z0-9_.]+, \d+(?:\.\d+){1,3}\)")
    package, version = current[1:-1].split(", ")
    if int(version.split(".")[0]) < 111:
        raise LaunchFailure("Actual active WebView Chromium is older than 111; no update attempted")
    dirty = field("WebView package dirty: ", r"true|false")
    installed = field("Any WebView package installed: ", r"true|false")
    started = int(field("Number of relros started: ", r"\d+"))
    finished = int(field("Number of relros finished: ", r"\d+"))
    # API 36 WebViewLibraryLoader starts at most one 32-bit and one 64-bit
    # creator. Reject impossible counts and Integer.MAX_VALUE's unknown sentinel.
    if not 0 <= finished <= started <= 2:
        raise LaunchFailure("Invalid or placeholder WebView RELRO counts")
    package_lines = [line for line in lines if re.match(r"(?:(?:Valid|Invalid) package )?" + re.escape(package) + r"(?:\s|$)", line)]
    valid = r"Valid package " + re.escape(package) + r" \(versionName: " + re.escape(version) + r", versionCode: [1-9]\d*, targetSdkVersion: \d+\) is[ \t]+installed/enabled for all users"
    if len(package_lines) != 1 or not re.fullmatch(valid, package_lines[0]):
        raise LaunchFailure("Current WebView version is not valid, installed and enabled for all users")
    if dirty != "false" or installed != "true" or started != finished:
        raise WebViewPreparing("Installed WebView preparation is not ready")
    return {"package": package, "version": version, "package_dirty": False,
            "installed_and_enabled_for_all_users": True, "any_package_installed": True,
            "relros_started": started, "relros_finished": finished}


def process_start_ticks(pid):
    # /proc comm can contain spaces or parentheses; split after its closing ')'.
    return int(Path("/proc", str(pid), "stat").read_text(encoding="utf-8").rsplit(")", 1)[1].split()[19])


def package_versions(sdk):
    emulator = properties(sdk / "emulator/source.properties")
    image = properties(sdk / "system-images/android-36/google_apis/x86_64/source.properties")
    tools = properties(sdk / "platform-tools/source.properties")
    if emulator.get("Pkg.Revision") != "37.2.12" or image.get("Pkg.Revision") != "7":
        raise LaunchFailure("Stable SDK package revision changed; review before running")
    if (image.get("AndroidVersion.ApiLevel"), image.get("SystemImage.TagId"), image.get("SystemImage.Abi")) != ("36", "google_apis", "x86_64"):
        raise LaunchFailure("Unexpected installed system image")
    if not re.fullmatch(r"\d+\.\d+\.\d+", tools.get("Pkg.Revision", "")):
        raise LaunchFailure("Unrecognized installed platform-tools revision")
    return {"emulator": emulator["Pkg.Revision"], "image": image["Pkg.Revision"], "platform_tools": tools["Pkg.Revision"]}


def isolated_environment(sdk, work, source):
    # No account credentials, adb vendor keys, existing AVDs or auth caches pass through.
    env = {key: source[key] for key in ("PATH", "JAVA_HOME", "LANG", "LC_ALL") if key in source}
    home = work / "home"
    home.mkdir(exist_ok=True)
    temporary = work / "tmp"
    temporary.mkdir(exist_ok=True)
    env.update({"HOME": str(home), "TMPDIR": str(temporary), "ANDROID_HOME": str(sdk),
                "ANDROID_SDK_ROOT": str(sdk), "ANDROID_SDK_HOME": str(home),
                "ANDROID_USER_HOME": str(home / ".android"),
                "ANDROID_EMULATOR_HOME": str(home / ".android"),
                "ANDROID_AVD_HOME": str(work / "avds"), "ADB_MDNS": "0",
                "ADB_MDNS_AUTO_CONNECT": "", "ADB_MDNS_OPENSCREEN": "0"})
    return env


class ProcessHost:
    def __init__(self, root):
        self.root = root.resolve(strict=True)
        self.work = Path(tempfile.mkdtemp(prefix="dovebevo-android-owned-", dir=self.root))
        self.token = secrets.token_hex(24)
        (self.work / ".owned").write_text(self.token, encoding="ascii")
        self.name = "DoveBevoPreview-" + secrets.token_hex(12)
        self.console_port, self.server_port = None, None
        self.reservations = []

    def require_kvm(self):
        if not stat.S_ISCHR(Path("/dev/kvm").stat().st_mode) or not os.access("/dev/kvm", os.R_OK | os.W_OK):
            raise LaunchFailure("KVM is not readable and writable; no permission changes or CPU fallback")

    def reserve_ports(self):
        self.console_port = 5554 + 2 * secrets.randbelow(64)
        try:
            for port in (self.console_port, self.console_port + 1, 0):
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                self.reservations.append(sock)
                sock.bind((HOST, port))
            self.server_port = self.reservations[-1].getsockname()[1]
        except OSError:
            self.release_ports()
            raise LaunchFailure("Chosen private ports are not free; no retry") from None
        self.release_ports()

    def release_ports(self):
        for sock in self.reservations:
            sock.close()
        self.reservations = []

    def free_server_port(self):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
                sock.bind((HOST, self.server_port))
            return True
        except OSError:
            return False

    def listener_present(self):
        # Read both files even if the first contains a listener; malformed or
        # unavailable kernel read-back can never attest successful cleanup.
        states = [private_listener_present(path.read_text(encoding="ascii"), self.server_port)
                  for path in (Path("/proc/net/tcp"), Path("/proc/net/tcp6"))]
        return any(states)

    def start(self, stage, argv, env):
        process = subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                   stderr=subprocess.DEVNULL, start_new_session=True, env=env)
        try:
            process.owned_start_ticks = process_start_ticks(process.pid)
        except (OSError, ValueError, IndexError):
            process.owned_start_ticks = None
        return process

    def alive(self, process):
        try:
            return process.poll() is None and process.owned_start_ticks is not None and process_start_ticks(process.pid) == process.owned_start_ticks
        except (OSError, ValueError, IndexError):
            return False

    def listener_owned(self, process):
        """Linux read-back: the private smart-socket listener belongs to our process."""
        if not self.alive(process):
            return False
        inodes = set()
        for fd in Path("/proc", str(process.pid), "fd").iterdir():
            try:
                match = re.fullmatch(r"socket:\[(\d+)\]", os.readlink(fd))
                if match:
                    inodes.add(match.group(1))
            except FileNotFoundError:
                pass
        return listener_inodes_match(Path("/proc/net/tcp").read_text(encoding="ascii"), inodes, self.server_port)

    def stop(self, process, runner):
        # These IDs came only from Popen(start_new_session=True), never device inventory.
        if process.owned_start_ticks is None:
            raise LaunchFailure("Original process identity was not established; refusing to signal it")
        try:
            if process_start_ticks(process.pid) != process.owned_start_ticks:
                raise LaunchFailure("Process PID was reused; refusing to signal its group")
        except FileNotFoundError:
            # A remaining group cannot be assigned a new leader with this ID
            # while its original children still belong to it.
            pass
        if process.poll() is None and os.getpgid(process.pid) != process.pid:
            raise LaunchFailure("Owned process group changed; refusing to signal it")
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            process.wait(timeout=min(15, runner.remaining(cleanup=True)))
            # A launcher may have exited before a child. The original session/group
            # remains ours; make sure no process in that group survives cleanup.
            os.killpg(process.pid, 0)
        except ProcessLookupError:
            return
        except subprocess.TimeoutExpired:
            pass
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            return
        process.wait(timeout=min(5, runner.remaining(cleanup=True)))
        end = runner.clock() + min(3, runner.remaining(cleanup=True))
        while True:
            try:
                os.killpg(process.pid, 0)
            except ProcessLookupError:
                return
            if runner.clock() >= end:
                raise LaunchFailure("Owned process group did not exit")
            time.sleep(min(0.1, runner.remaining(cleanup=True)))

    def remove(self):
        self.release_ports()
        if self.work.is_symlink() or self.work.resolve().parent != self.root or not self.work.name.startswith("dovebevo-android-owned-"):
            raise LaunchFailure("Refusing unexpected Android temporary directory")
        if (self.work / ".owned").read_text(encoding="ascii") != self.token:
            raise LaunchFailure("Android temporary ownership marker changed")
        shutil.rmtree(self.work)


def digest_file(path, runner):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            runner.remaining()
            digest.update(chunk)
    return digest.hexdigest()


def apk_identity(root, sdk, evidence, runner):
    apk = evidence / "app-debug.apk"
    built = root / "mobile-android-build/_app/outputs/apk/debug/app-debug.apk"
    digest = digest_file(apk, runner)
    reported = re.fullmatch(r"([0-9a-f]{64})\s+[^\r\n]+\s*", (evidence / "apk-sha256.txt").read_text(encoding="utf-8"))
    if not reported or reported.group(1) != digest or digest_file(built, runner) != digest:
        raise LaunchFailure("Actual APK, evidence copy and compile SHA do not match")
    badging = runner.text("apk-identity", [str(sdk / "build-tools/36.0.0/aapt2"), "dump", "badging", str(apk)])
    package = re.search(r"(?m)^package: name='([^']+)'", badging)
    activity = re.search(r"(?m)^launchable-activity: name='([^']+)'", badging)
    if not package or package.group(1) != IDENTITY or not activity or activity.group(1) != ACTIVITY:
        raise LaunchFailure("Unexpected actual APK preview identity or launch activity")
    return apk, digest


def run_setup(sdk, evidence, runner, host):
    result = {"success": False, "image": IMAGE, "total_deadline_seconds": TOTAL_SECONDS}
    try:
        licence = sdk / "licenses/android-sdk-license"
        if not licence.is_file() or not licence.stat().st_size:
            raise LaunchFailure("Runner has no preaccepted Android SDK licence; no acceptance attempted")
        runner.env = isolated_environment(sdk, host.work, runner.env)
        runner.run("runtime-install", [str(sdk / "cmdline-tools/latest/bin/sdkmanager"),
                   "--sdk_root=" + str(sdk), "--channel=0", "emulator", IMAGE], timeout=480)
        result["runtime_packages"] = package_versions(sdk)
        result["success"] = True
    except Exception as error:
        result["failure"] = str(error)[:2048]
    finally:
        try:
            host.remove()
        except Exception as error:
            result["cleanup_failure"] = str(error)[:2048]
            result["success"] = False
        result["stages"] = runner.stages
        result["elapsed_seconds"] = round(runner.clock() - runner.started, 3)
        (runner.evidence / "setup-result.json").write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print("Android stable runtime setup: " + ("installed and revision checked" if result["success"] else "failed; inspect bounded evidence"))
    return 0 if result["success"] else 1


def run_launch(root, sdk, evidence, runner, host, settle=time.sleep):
    result = {"identity": IDENTITY, "component": COMPONENT, "status": "failed", "success": False,
              "total_deadline_seconds": TOTAL_SECONDS, "cleanup_reserve_seconds": CLEANUP_RESERVE,
              "settle_seconds": SETTLE_SECONDS, "screenshot_requires_human_review": True}
    server, emulator = None, None
    try:
        runner.env = isolated_environment(sdk, host.work, runner.env)
        apk, digest = apk_identity(root, sdk, evidence, runner)
        result["apk_sha256"] = digest
        checkout = runner.text("checkout", ["git", "rev-parse", "HEAD"])
        if not re.fullmatch(r"[0-9a-f]{40}", checkout):
            raise LaunchFailure("Unrecognized checkout SHA")
        result["checkout_sha"] = checkout
        result["runtime_packages"] = package_versions(sdk)
        host.require_kvm()
        host.reserve_ports()
        serial = "emulator-" + str(host.console_port)
        result.update({"owned_avd": host.name, "owned_serial": serial, "private_adb_port": host.server_port})
        runner.env.update({"ANDROID_ADB_SERVER_PORT": str(host.server_port),
                           "ADB_SERVER_SOCKET": "tcp:" + HOST + ":" + str(host.server_port)})
        adb, emu = str(sdk / "platform-tools/adb"), str(sdk / "emulator/emulator")
        prefix = [adb, "-H", HOST, "-P", str(host.server_port)]
        # The vendor launcher selects a separate headless engine. Keep probes
        # consistent with startup instead of selecting the GUI engine for probes.
        emulator_version = runner.text("emulator-version", [emu, "-no-window", "-version"])
        actual_emulator_version = re.search(r"Android emulator version (\d+\.\d+\.\d+(?:\.\d+)?)\b", emulator_version)
        if not actual_emulator_version or ".".join(actual_emulator_version.group(1).split(".")[:3]) != result["runtime_packages"]["emulator"]:
            raise LaunchFailure("Installed emulator binary revision differs from package metadata")
        result["emulator_binary_version"] = actual_emulator_version.group(1)
        version = runner.text("adb-version", [adb, "version"])
        if not re.search(r"(?m)^Version " + re.escape(result["runtime_packages"]["platform_tools"]) + r"-", version):
            raise LaunchFailure("Installed adb binary revision differs from package metadata")
        probe = runner.run("adb-no-autostart-probe", prefix + ["devices"], allow_nonzero=True)
        if probe.returncode == 0 or not host.free_server_port():
            raise LaunchFailure("Private adb no-autostart probe failed; no server adopted")
        result["adb_closed_port_no_autostart_probe"] = "nonzero-and-port-remained-closed"
        runner.run("acceleration", [emu, "-no-window", "-accel-check"])
        runner.run("create-avd", [str(sdk / "cmdline-tools/latest/bin/avdmanager"), "create", "avd",
                   "--name", host.name, "--package", IMAGE, "--device", "pixel_6",
                   "--path", str(host.work / "avds" / (host.name + ".avd"))], timeout=30)
        server = host.start("adb-server", [adb, "-L", "tcp:" + HOST + ":" + str(host.server_port), "server", "nodaemon"], runner.env)
        result["adb_server_host_pid"] = getattr(server, "pid", None)
        # Only readiness polling repeats. There is one server, one AVD and one boot attempt.
        ready_deadline = min(runner.clock() + 10, runner.clock() + runner.remaining())
        while not host.listener_owned(server):
            if not host.alive(server) or runner.clock() >= ready_deadline:
                raise LaunchFailure("Tracked private adb server failed to own its listener")
            settle(0.2)

        def server_owned():
            if not host.alive(server) or not host.listener_owned(server):
                raise LaunchFailure("Tracked private adb server lost ownership; no reconnect")
            status = runner.text("adb-server-status", prefix + ["server-status"])
            server_version = re.search(r'(?m)^version: "([^"]+)"$', status)
            binary = re.search(r'(?m)^executable_absolute_path: ("(?:[^"\\]|\\.)*")$', status)
            if not server_version or server_version.group(1) != result["runtime_packages"]["platform_tools"] or not binary or Path(json.loads(binary.group(1))).resolve() != Path(adb).resolve():
                raise LaunchFailure("Private adb server binary/version identity mismatch")
            if re.search(r"(?m)^mdns_enabled: true$", status):
                raise LaunchFailure("Private adb mDNS discovery remained enabled")
            if not host.alive(server) or not host.listener_owned(server):
                raise LaunchFailure("Private adb server changed during read-back")

        server_owned()
        emulator = host.start("emulator", [emu, "-avd", host.name, "-port", str(host.console_port),
                   "-no-window", "-no-audio", "-no-snapshot", "-no-boot-anim", "-accel", "on",
                   "-gpu", "swiftshader", "-memory", "2048", "-cores", "2",
                   "-camera-back", "none", "-camera-front", "none"], runner.env)
        result["emulator_host_pid"] = getattr(emulator, "pid", None)

        def check_processes():
            if not host.alive(emulator):
                raise LaunchFailure("Tracked emulator process exited")
            server_owned()

        check_processes()
        runner.run("wait-for-device", prefix + ["-s", serial, "wait-for-device"], timeout=180)
        check_processes()

        def owned():
            check_processes()
            devices = runner.text("ownership-devices", prefix + ["devices"])
            entries = [line.split() for line in devices.splitlines() if line.strip() and not line.startswith("List of devices attached")]
            if entries != [[serial, "device"]]:
                raise LaunchFailure("Private adb inventory differs from exact job-owned serial")
            name = runner.text("ownership-avd", prefix + ["-s", serial, "emu", "avd", "name"])
            if name.splitlines() != [host.name, "OK"]:
                raise LaunchFailure("Emulator AVD name does not match this job")
            check_processes()

        def device(stage, arguments, **kwargs):
            owned()
            output = runner.text(stage, prefix + ["-s", serial] + arguments, **kwargs)
            check_processes()
            return output

        boot_deadline = runner.clock() + min(150, runner.remaining())
        while device("boot-completed", ["shell", "getprop", "sys.boot_completed"]) != "1":
            if runner.clock() + 2 >= boot_deadline:
                raise LaunchFailure("Owned emulator boot deadline reached")
            settle(2)
        result["boot_completed"] = True
        if device("android-api", ["shell", "getprop", "ro.build.version.sdk"]) != "36":
            raise LaunchFailure("Actual booted Android API is not 36")
        result["android_api"] = 36
        webview_deadline = runner.clock() + min(60, runner.remaining())
        while True:
            try:
                result["webview"] = webview_readiness(device("webview", ["shell", "dumpsys", "webviewupdate"]))
                break
            except WebViewPreparing:
                if runner.clock() + 2 >= webview_deadline:
                    raise LaunchFailure("Installed WebView readiness deadline reached; no update or switch attempted") from None
                settle(2)
        installed = device("install", ["install", "--no-incremental", str(apk)], timeout=120)
        if not re.search(r"(?m)^Success$", installed) or "Failure" in installed:
            raise LaunchFailure("APK install did not return Success")
        result["installed"] = True
        started = device("launch", ["shell", "am", "start", "-W", "-n", COMPONENT], timeout=60)
        launched_component = re.search(r"(?m)^Activity: ([A-Za-z0-9_./]+)$", started)
        if not re.search(r"(?m)^Status: ok$", started) or not launched_component or component(launched_component.group(1)) != COMPONENT or re.search(r"(?im)error|warning", started):
            raise LaunchFailure("Exact preview activity start did not return an unambiguous successful result")
        pid = device("app-pid", ["shell", "pidof", IDENTITY])
        if not re.fullmatch(r"[1-9]\d*", pid):
            raise LaunchFailure("Preview launch did not return exactly one PID")
        result["launch_pid"] = int(pid)
        if runner.remaining() <= SETTLE_SECONDS:
            raise LaunchFailure("Insufficient overall deadline for startup settling")
        settle(SETTLE_SECONDS)
        if device("settled-pid", ["shell", "pidof", IDENTITY]) != pid:
            raise LaunchFailure("App PID changed during startup settling")
        if device("process-name", ["shell", "cat", "/proc/" + pid + "/cmdline"]).rstrip("\0") != IDENTITY:
            raise LaunchFailure("Settled PID is not the exact preview process")

        def foreground(stage):
            resumed = device(stage, ["shell", "dumpsys", "activity", "activities"])
            components = re.findall(r"(?:topResumedActivity|mResumedActivity)\s*[=:]\s*ActivityRecord\{[^\r\n}]*\bu\d+\s+([A-Za-z0-9_./]+)", resumed)
            normalized = {component(value) for value in components}
            if normalized != {COMPONENT}:
                raise LaunchFailure("Preview component is not the sole resumed foreground activity")

        foreground("foreground")
        owned()
        screenshot = runner.evidence / "launch.png"
        runner.run("screenshot", prefix + ["-s", serial, "exec-out", "screencap", "-p"], timeout=20, output=screenshot)
        if device("screenshot-pid", ["shell", "pidof", IDENTITY]) != pid:
            raise LaunchFailure("App PID changed around screenshot")
        foreground("screenshot-foreground")
        image = screenshot.read_bytes()
        if len(image) < 24 or len(image) > MAX_PNG_BYTES or image[:8] != b"\x89PNG\r\n\x1a\n" or image[12:16] != b"IHDR":
            raise LaunchFailure("Owned emulator did not produce a bounded PNG screenshot")
        width, height = struct.unpack(">II", image[16:24])
        if not 1 <= width <= 8192 or not 1 <= height <= 8192:
            raise LaunchFailure("Screenshot dimensions exceed the fixed bounds")
        result["screenshot"] = {"file": "launch.png", "sha256": hashlib.sha256(image).hexdigest(), "width": width, "height": height}
        if digest_file(apk, runner) != digest:
            raise LaunchFailure("APK evidence changed during startup")
        result["status"] = "launched-process-and-captured-png"
    except Exception as error:
        result["failure"] = str(error)[:2048]
    finally:
        cleanup_errors = []
        for name, process in (("emulator", emulator), ("adb-server", server)):
            if process is not None:
                try:
                    host.stop(process, runner)
                except Exception:
                    cleanup_errors.append(name + " owned process group cleanup failed")
        if host.server_port is not None:
            try:
                if host.listener_present():
                    cleanup_errors.append("private adb listener remains; an unowned listener is never signalled")
            except Exception:
                cleanup_errors.append("private adb listener absence could not be verified")
        if not cleanup_errors:
            try:
                host.remove()
                result["cleanup"] = "owned-process-groups-exited-and-temporary-home-removed"
            except Exception:
                cleanup_errors.append("owned temporary directory cleanup failed")
        if cleanup_errors:
            result["cleanup"], result["cleanup_failures"] = "failed", cleanup_errors
        result["success"] = result["status"] == "launched-process-and-captured-png" and not cleanup_errors
        result["stages"] = runner.stages
        result["elapsed_seconds"] = round(runner.clock() - runner.started, 3)
        (runner.evidence / "launch-result.json").write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print("Android startup evidence: " + ("captured; PNG requires human review" if result["success"] else "failed; inspect bounded evidence"))
    return 0 if result["success"] else 1


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in ("setup", "launch"):
        print("Usage: mobile-ci-android-launch.py setup|launch", file=sys.stderr)
        return 2
    if sys.platform != "linux" or platform.machine() != "x86_64" or not os.environ.get("RUNNER_TEMP") or not os.environ.get("ANDROID_HOME"):
        print("Hosted Linux x86_64 RUNNER_TEMP and ANDROID_HOME are required", file=sys.stderr)
        return 2
    root, sdk = Path(os.environ["RUNNER_TEMP"]).resolve(strict=True), Path(os.environ["ANDROID_HOME"]).resolve(strict=True)
    evidence = root / "mobile-evidence/android"
    phase = sys.argv[1]
    runner = CommandRunner(evidence / ("runtime-setup" if phase == "setup" else "launch"), env=os.environ)
    host = ProcessHost(root)
    return run_setup(sdk, evidence, runner, host) if phase == "setup" else run_launch(root, sdk, evidence, runner, host)


if __name__ == "__main__":
    raise SystemExit(main())
