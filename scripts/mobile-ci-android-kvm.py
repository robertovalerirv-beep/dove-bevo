"""Temporary named-user KVM ACL on an ephemeral GitHub-hosted Linux runner.

Never changes udev, groups, sudoers or broad device modes. Original numeric ACL
rules stay in a private runner-owned directory outside uploaded evidence. The
unchanged runtime gate still checks actual KVM access and emulator acceleration.
Subprocess deadlines are soft OS limits; the two-minute step leaves 30s margin.
"""

import json
import os
from pathlib import Path
import re
import secrets
import stat
import subprocess
import sys
import time

DEVICE = "/dev/kvm"
MAX_BYTES = 16384
TOTAL_SECONDS = 90
STATE_KEYS = {"version", "uid", "groups", "device", "original_acl", "grant_acl", "mode", "mutation_attempted", "restored"}


class AccessFailure(Exception):
    pass


def numeric(value):
    return type(value) is int and 0 <= value < 4294967295


def rules(text):
    if not isinstance(text, str) or len(text.encode("utf-8")) > MAX_BYTES:
        raise AccessFailure("KVM ACL exceeds its fixed input bound")
    entries = {}
    for line in text.splitlines():
        if not line:
            continue
        match = re.fullmatch(r"(user|group|mask|other):((?:0|[1-9]\d{0,9})?):([r-][w-][x-])", line)
        if not match:
            raise AccessFailure("Only numeric access ACL rules are accepted")
        kind, principal, permissions = match.groups()
        if principal and (kind not in ("user", "group") or not numeric(int(principal))):
            raise AccessFailure("Invalid numeric ACL principal")
        if (kind, principal) in entries:
            raise AccessFailure("Duplicate KVM ACL entry")
        entries[kind, principal] = permissions
    if len(entries) > 256 or not {("user", ""), ("group", ""), ("other", "")}.issubset(entries):
        raise AccessFailure("Missing or unbounded base KVM ACL entries")
    if any(principal for _, principal in entries) and ("mask", "") not in entries:
        raise AccessFailure("Named ACL entries require an explicit mask")
    return entries


def render(entries):
    order = {"user": 0, "group": 1, "mask": 2, "other": 3}
    ordered = sorted(entries, key=lambda entry: (order[entry[0]], -1 if not entry[1] else int(entry[1])))
    return "".join(kind + ":" + principal + ":" + entries[kind, principal] + "\n" for kind, principal in ordered)


def canonical_acl(text):
    return render(rules(text))


def bits(value):
    return sum(weight for character, weight in zip(value, (4, 2, 1)) if character != "-")


def permissions(value):
    return "".join(character if value & weight else "-" for character, weight in zip("rwx", (4, 2, 1)))


def intended_acl(original, uid):
    if not numeric(uid) or uid == 0:
        raise AccessFailure("A non-root numeric runner UID is required")
    before = rules(original)
    old_mask = bits(before.get(("mask", ""), "rwx"))
    new_mask = (bits(before["mask", ""]) if ("mask", "") in before else bits(before["group", ""])) | 6
    for (kind, principal), value in before.items():
        if kind == "group" or (kind == "user" and principal and principal != str(uid)):
            if bits(value) & old_mask != bits(value) & new_mask:
                raise AccessFailure("Runner grant would unmask another principal's permissions")
    after = dict(before)
    after["user", str(uid)] = "rw-"
    after["mask", ""] = permissions(new_mask)
    return render(after)


def expected_mode(original_mode, acl):
    entries = rules(acl)
    return (original_mode & 0o7000) | (bits(entries["user", ""]) << 6) | (bits(entries.get(("mask", ""), entries["group", ""])) << 3) | bits(entries["other", ""])


def valid_device(device):
    keys = {"dev", "ino", "rdev", "major", "minor", "uid", "gid", "mode"}
    if not isinstance(device, dict) or set(device) != keys or any(type(value) is not int or value < 0 for value in device.values()):
        raise AccessFailure("Invalid KVM device identity")
    if device["major"] != 10 or device["minor"] != 232 or device["uid"] != 0 or device["mode"] > 0o7777:
        raise AccessFailure("Expected only the root-owned KVM character device 10:232")


def same_device(before, after):
    valid_device(before)
    valid_device(after)
    if any(before[key] != after[key] for key in before if key != "mode"):
        raise AccessFailure("KVM device identity changed; replacement is never modified")


def private_stat(info, uid, mode, directory=False):
    expected_type = stat.S_ISDIR if directory else stat.S_ISREG
    if not expected_type(info.st_mode) or info.st_uid != uid or stat.S_IMODE(info.st_mode) != mode or (not directory and info.st_nlink != 1):
        raise AccessFailure("Unsafe private KVM ledger ownership, permissions or type")


class SecureStore:
    def __init__(self, root, uid):
        self.root, self.uid = root, uid
        self.directory = root / "dovebevo-kvm-access"
        self.path = self.directory / "state.json"

    def check_root(self):
        if self.root.resolve(strict=True) != self.root or self.root.is_symlink():
            raise AccessFailure("Runner temporary root must be a direct canonical path")
        info = self.root.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != self.uid or info.st_mode & 0o022:
            raise AccessFailure("Runner temporary root is not owned and protected")

    def check_directory(self):
        self.check_root()
        private_stat(self.directory.lstat(), self.uid, 0o700, directory=True)

    def create(self, state):
        # Exclusive creation refuses a previous run's state, even if it looks valid.
        self.check_root()
        self.directory.mkdir(mode=0o700)
        self.check_directory()
        self.write(state, exclusive=True)

    def write(self, state, exclusive=False):
        self.check_directory()
        if not exclusive:
            private_stat(self.path.lstat(), self.uid, 0o600)
        temporary = self.path if exclusive else self.directory / ("state-" + secrets.token_hex(12) + ".tmp")
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW
        descriptor = os.open(temporary, flags, 0o600)
        try:
            private_stat(os.fstat(descriptor), self.uid, 0o600)
            data = (json.dumps(state, sort_keys=True, allow_nan=False) + "\n").encode("ascii")
            if len(data) > MAX_BYTES:
                raise AccessFailure("Private KVM state exceeds its fixed byte bound")
            with os.fdopen(descriptor, "wb", closefd=False) as output:
                output.write(data)
                output.flush()
                os.fsync(output.fileno())
        finally:
            os.close(descriptor)
        if not exclusive:
            os.replace(temporary, self.path)
        directory_fd = os.open(self.directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)

    def save(self, state):
        self.write(state)

    def load(self):
        # No directory means preparation never captured state and never mutated.
        self.check_root()
        if not self.directory.exists() and not self.directory.is_symlink():
            return None
        self.check_directory()
        descriptor = os.open(self.path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        try:
            private_stat(os.fstat(descriptor), self.uid, 0o600)
            with os.fdopen(descriptor, "rb", closefd=False) as source:
                data = source.read(MAX_BYTES + 1)
            if len(data) > MAX_BYTES:
                raise AccessFailure("Private KVM state exceeds its fixed byte bound")
            return json.loads(data.decode("ascii"))
        finally:
            os.close(descriptor)


class Runner:
    def __init__(self, phase, invoke=subprocess.run, clock=time.monotonic):
        self.invoke, self.clock, self.started = invoke, clock, clock()
        self.reserve = 30 if phase == "prepare" else 0
        self.stages = []

    def run(self, stage, argv, input=None, cleanup=False):
        available = TOTAL_SECONDS - (self.clock() - self.started) - (0 if cleanup else self.reserve)
        if available < (12 if stage in ("grant", "restore-acl") else 1):
            raise AccessFailure("KVM helper deadline reached before " + stage)
        timeout = min(10, available)
        started = self.clock()
        record = {"stage": stage, "effective_timeout_seconds": round(timeout, 3), "outcome": "failed"}
        try:
            kwargs = {"capture_output": True, "timeout": timeout, "check": False,
                      "env": {"PATH": "/usr/bin:/bin", "LC_ALL": "C"}}
            if input is None:
                kwargs["stdin"] = subprocess.DEVNULL
            else:
                if not isinstance(input, bytes) or len(input) > MAX_BYTES:
                    raise AccessFailure("Unbounded privileged ACL input refused")
                kwargs["input"] = input
            result = self.invoke(argv, **kwargs)
            record["exit_code"] = result.returncode
            if result.returncode != 0:
                raise AccessFailure(stage + " command failed")
            if len(result.stdout) > MAX_BYTES or len(result.stderr) > MAX_BYTES:
                raise AccessFailure(stage + " output exceeds its fixed byte bound")
            record["outcome"] = "completed"
            return result.stdout.decode("ascii")
        except subprocess.TimeoutExpired:
            record["outcome"] = "timed-out"
            raise AccessFailure(stage + " timed out") from None
        finally:
            record["elapsed_seconds"] = round(self.clock() - started, 3)
            self.stages.append(record)


class Host:
    def __init__(self):
        self.uid = os.getuid()
        self.groups = sorted(set([os.getgid()] + os.getgroups()))
        if self.uid == 0 or self.uid != os.geteuid() or not numeric(self.uid):
            raise AccessFailure("A non-root unprivileged runner UID is required")
        for name in ("getfacl", "setfacl", "sudo", "timeout"):
            info = Path("/usr/bin", name).lstat()
            if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
                raise AccessFailure("Required system ACL tools are absent or unsafe")

    def device(self):
        info = Path(DEVICE).lstat()
        if not stat.S_ISCHR(info.st_mode):
            raise AccessFailure("KVM path is not a direct character device")
        value = {"dev": info.st_dev, "ino": info.st_ino, "rdev": info.st_rdev,
                 "major": os.major(info.st_rdev), "minor": os.minor(info.st_rdev),
                 "uid": info.st_uid, "gid": info.st_gid, "mode": stat.S_IMODE(info.st_mode)}
        valid_device(value)
        return value

    def accessible(self):
        return os.access(DEVICE, os.R_OK | os.W_OK, effective_ids=True)


def read_acl(commands, cleanup=False):
    return canonical_acl(commands.run("read-acl", ["/usr/bin/getfacl", "--omit-header", "--numeric", "--no-effective", "--", DEVICE], cleanup=cleanup))


def privileged(arguments):
    # timeout is root-owned coreutils, bounding the root child as well as sudo.
    # The only writable target stays the literal KVM path; no restore file header
    # can select another path, owner, group or mode operation.
    return ["/usr/bin/sudo", "-n", "--", "/usr/bin/timeout", "--signal=KILL", "8s",
            "/usr/bin/setfacl", "--no-mask"] + arguments + ["--", DEVICE]


def validate_state(state, host):
    if not isinstance(state, dict) or set(state) != STATE_KEYS or type(state["version"]) is not int or state["version"] != 1 or state["uid"] != host.uid:
        raise AccessFailure("Unrecognized private KVM state")
    if not isinstance(state["groups"], list) or len(state["groups"]) > 128 or any(not numeric(group) for group in state["groups"]):
        raise AccessFailure("Invalid saved runner groups")
    if type(state["mutation_attempted"]) is not bool or type(state["restored"]) is not bool or state["mode"] not in ("preexisting-access", "runner-uid-acl"):
        raise AccessFailure("Invalid KVM lifecycle state")
    valid_device(state["device"])
    original = canonical_acl(state["original_acl"])
    grant = canonical_acl(state["grant_acl"])
    if original != state["original_acl"] or grant != state["grant_acl"] or expected_mode(state["device"]["mode"], original) != state["device"]["mode"]:
        raise AccessFailure("Saved KVM ACL is not canonical or mode-consistent")
    expected = original if state["mode"] == "preexisting-access" else intended_acl(original, host.uid)
    if grant != expected or (state["mode"] == "preexisting-access" and state["mutation_attempted"]):
        raise AccessFailure("Saved KVM grant exceeds the named runner ACL contract")


def verify(host, state, acl):
    current = host.device()
    same_device(state["device"], current)
    if current["mode"] != expected_mode(state["device"]["mode"], acl):
        raise AccessFailure("KVM mode does not match its intended ACL")
    return current


def require_owned_acl_domain(state, current):
    """A full reset is safe only while every other principal is unchanged.

    setfacl normally updates an ACL atomically. For a failed grant, allow only
    the strict partial domain: the runner entry and mask can each be either
    their original value (including absence) or their intended granted value.
    Unknown restrictions or additions must survive; never overwrite them by
    restoring a stale snapshot. This is a read-back fence, not an atomic CAS.
    """
    original, granted, actual = rules(state["original_acl"]), rules(state["grant_acl"]), rules(current)
    mutable = {("user", str(state["uid"])), ("mask", "")}
    for key in (set(original) | set(actual)) - mutable:
        if actual.get(key) != original.get(key):
            raise AccessFailure("Unrelated KVM ACL drift; refusing full restoration")
    for key in mutable:
        if actual.get(key) not in (original.get(key), granted.get(key)):
            raise AccessFailure("Unknown runner or mask ACL drift; refusing full restoration")
    old_mask = bits(original.get(("mask", ""), "rwx"))
    current_mask = bits(actual.get(("mask", ""), "rwx"))
    for (kind, principal), value in original.items():
        if kind == "group" or (kind == "user" and principal and principal != str(state["uid"])):
            if bits(value) & old_mask != bits(value) & current_mask:
                raise AccessFailure("Other principal's effective ACL changed; refusing full restoration")


def restore_owned(host, store, commands, state):
    validate_state(state, host)
    same_device(state["device"], host.device())
    current = read_acl(commands, cleanup=True)
    if not state["restored"] and state["mutation_attempted"] and current != state["original_acl"]:
        require_owned_acl_domain(state, current)
        same_device(state["device"], host.device())
        if read_acl(commands, cleanup=True) != current:
            raise AccessFailure("KVM ACL changed during restoration preflight; no write attempted")
        commands.run("restore-acl", privileged(["--set-file=-"]), input=state["original_acl"].encode("ascii"), cleanup=True)
    after = read_acl(commands, cleanup=True)
    if after != state["original_acl"]:
        raise AccessFailure("Exact original KVM ACL restoration was not verified")
    current_device = verify(host, state, after)
    state["restored"] = True
    store.save(state)
    return {"acl_after": after.splitlines(), "device_after": current_device}


def prepare(host, store, commands):
    result = {"success": False, "runner_uid": host.uid, "runner_groups": host.groups}
    state, attempted = None, False
    try:
        device = host.device()
        result["device_before"] = device
        valid_device(device)
        original = read_acl(commands)
        result["acl_before"] = original.splitlines()
        if expected_mode(device["mode"], original) != device["mode"]:
            raise AccessFailure("Original KVM ACL and mode disagree")
        same_device(device, host.device())
        accessible = host.accessible()
        grant = original if accessible else intended_acl(original, host.uid)
        if not accessible and grant == original:
            raise AccessFailure("Runner ACL already grants rw but actual access fails")
        state = {"version": 1, "uid": host.uid, "groups": host.groups, "device": device,
                 "original_acl": original, "grant_acl": grant,
                 "mode": "preexisting-access" if accessible else "runner-uid-acl",
                 "mutation_attempted": False, "restored": False}
        store.create(state)
        result.update({"mode": state["mode"], "device_before": device, "acl_before": original.splitlines()})
        if not accessible:
            same_device(device, host.device())
            if read_acl(commands) != original:
                raise AccessFailure("KVM ACL changed before the grant")
            state["mutation_attempted"] = True
            store.save(state)  # Durable rollback state must precede every possible mutation.
            attempted = True
            mask = rules(grant)["mask", ""]
            commands.run("grant", privileged(["--modify", "user:" + str(host.uid) + ":rw-,mask::" + mask]))
        after = read_acl(commands)
        result["acl_after"] = after.splitlines()
        if after != grant or not host.accessible():
            raise AccessFailure("Exact runner-only ACL grant or actual rw access was not verified")
        result["device_after"] = verify(host, state, after)
        result["acl_after"] = after.splitlines()
        result["success"] = True
    except Exception as error:
        result["failure"] = str(error)[:1024]
        if attempted:
            try:
                result["rollback"] = restore_owned(host, store, commands, state)
            except Exception as rollback_error:
                result["rollback_failure"] = str(rollback_error)[:1024]
    return result


def restore(host, store, commands):
    result = {"success": False, "runner_uid": host.uid, "runner_groups": host.groups}
    try:
        state = store.load()
        if state is None:
            result.update({"success": True, "mode": "no-owned-state-no-mutation"})
            return result
        validate_state(state, host)
        result["mode"] = "verify-only" if state["restored"] or not state["mutation_attempted"] else "restore-original-acl"
        result.update(restore_owned(host, store, commands, state))
        result["success"] = True
    except Exception as error:
        result["failure"] = str(error)[:1024]
    return result


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in ("prepare", "restore"):
        print("Usage: mobile-ci-android-kvm.py prepare|restore", file=sys.stderr)
        return 2
    if sys.platform != "linux" or os.environ.get("GITHUB_ACTIONS") != "true" or os.environ.get("RUNNER_ENVIRONMENT") != "github-hosted" or not os.environ.get("RUNNER_TEMP"):
        print("Ephemeral GitHub-hosted Linux runner required", file=sys.stderr)
        return 2
    phase = sys.argv[1]
    root = Path(os.environ["RUNNER_TEMP"])
    commands = Runner(phase)
    try:
        host = Host()
        store = SecureStore(root, host.uid)
        result = prepare(host, store, commands) if phase == "prepare" else restore(host, store, commands)
    except Exception as error:
        result = {"success": False, "failure": str(error)[:1024]}
    result["stages"] = commands.stages
    result["elapsed_seconds"] = round(commands.clock() - commands.started, 3)
    result["total_deadline_seconds"] = TOTAL_SECONDS
    evidence = root / "mobile-evidence/android/kvm"
    evidence.mkdir(parents=True, exist_ok=True)
    (evidence / (phase + "-result.json")).write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print("Ephemeral runner KVM " + phase + ": " + ("verified" if result["success"] else "failed; inspect structured evidence"))
    return 0 if result["success"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
