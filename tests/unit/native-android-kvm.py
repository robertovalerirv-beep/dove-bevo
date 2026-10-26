"""Injected KVM ACL tests: no actual device, sudo, ACL change or emulator runs."""

import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("kvm_access", "scripts/mobile-ci-android-kvm.py")
kvm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(kvm)

BASE = "user::rw-\ngroup::rw-\nother::---\n"


class Store:
    def __init__(self):
        self.state = None
        self.unsafe = False
        self.saved_before_grant = False

    def create(self, state):
        if self.state is not None:
            raise kvm.AccessFailure("Preexisting private KVM state is never overwritten")
        self.state = json.loads(json.dumps(state))

    def save(self, state):
        if getattr(self, "fail_save", False):
            raise kvm.AccessFailure("Private state persistence failed")
        self.state = json.loads(json.dumps(state))

    def load(self):
        if self.unsafe:
            raise kvm.AccessFailure("Unsafe private KVM ledger")
        return json.loads(json.dumps(self.state))


class Host:
    uid, groups = 1001, [1001, 121]

    def __init__(self, mode="success", acl=BASE):
        self.mode, self.acl, self.mutated = mode, acl, False
        self.access = mode == "preexisting"
        self.snapshot = {"dev": 5, "ino": 42, "rdev": 2792, "major": 10, "minor": 232, "uid": 0, "gid": 108, "mode": 0o660}

    def device(self):
        if self.mode == "no-kvm":
            raise kvm.AccessFailure("KVM device is missing")
        value = dict(self.snapshot)
        if self.mode == "changed-device" and self.mutated:
            value["ino"] += 1
        if self.mode == "wrong-device":
            value["minor"] = 1
        if self.mode == "wrong-owner":
            value["uid"] = 1001
        return value

    def accessible(self):
        return self.access and self.mode != "verify-access-failed"


class Commands:
    def __init__(self, host, store):
        self.host, self.store, self.calls = host, store, []

    def run(self, stage, argv, input=None, cleanup=False):
        self.calls.append((stage, argv, input))
        if stage.startswith("read-acl"):
            return self.host.acl
        if stage == "grant":
            self.store.saved_before_grant = bool(self.store.state and self.store.state["mutation_attempted"])
            if self.host.mode == "grant-failed":
                raise kvm.AccessFailure("grant failed")
            self.host.mutated = True
            self.host.acl = self.store.state["grant_acl"]
            self.host.snapshot["mode"] = kvm.expected_mode(self.store.state["device"]["mode"], self.host.acl)
            self.host.access = True
            if self.host.mode == "grant-partial-failed":
                raise kvm.AccessFailure("grant failed after partial change")
            if self.host.mode == "verify-acl-failed":
                self.host.acl += "user:2000:rw-\n"
        elif stage == "restore-acl":
            if self.host.mode == "restore-failed":
                raise kvm.AccessFailure("restore failed")
            self.host.acl = input.decode("ascii")
            self.host.access = False
            self.host.snapshot["mode"] = self.store.state["device"]["mode"]
        return ""


class PolicyTests(unittest.TestCase):
    def test_numeric_acl_preserves_original_and_grants_only_runner_rw(self):
        expected = "user::rw-\nuser:1001:rw-\ngroup::rw-\nmask::rw-\nother::---\n"
        self.assertEqual(kvm.intended_acl(BASE, 1001), expected)
        self.assertEqual(kvm.canonical_acl(expected), expected)

    def test_restrictive_mask_cannot_unmask_other_users_or_groups(self):
        for principal in ("user:2000:rw-", "group:2000:rw-", "group::rw-"):
            base = "user::rw-\n" + ("group::r--\n" if not principal.startswith("group::") else "") + principal + "\nmask::r--\nother::---\n"
            with self.subTest(principal=principal), self.assertRaises(kvm.AccessFailure):
                kvm.intended_acl(base, 1001)

    def test_existing_masked_target_can_change_without_affecting_others(self):
        original = "user::rw-\nuser:1001:r--\nuser:2000:r--\ngroup::r--\nmask::r--\nother::---\n"
        result = kvm.intended_acl(original, 1001)
        self.assertIn("user:1001:rw-", result)
        self.assertIn("user:2000:r--", result)
        self.assertIn("mask::rw-", result)

    def test_headers_names_default_entries_duplicates_and_unbounded_rules_are_rejected(self):
        for acl in ("# file: /unrelated\n" + BASE, BASE + "user:runner:rw-\n", BASE + "default:user::rw-\n", BASE + "user::rw-\n", BASE + "x" * 17000):
            with self.subTest(acl=acl[:24]), self.assertRaises(kvm.AccessFailure):
                kvm.canonical_acl(acl)

    def test_private_stat_guards_owner_permissions_symlinks_and_type(self):
        good = SimpleNamespace(st_uid=1001, st_mode=stat.S_IFREG | 0o600, st_nlink=1)
        kvm.private_stat(good, 1001, 0o600, directory=False)
        for change in ({"st_uid": 2000}, {"st_mode": stat.S_IFREG | 0o644}, {"st_mode": stat.S_IFLNK | 0o777}, {"st_nlink": 2}):
            value = SimpleNamespace(**(vars(good) | change))
            with self.assertRaises(kvm.AccessFailure):
                kvm.private_stat(value, 1001, 0o600, directory=False)


class LifecycleTests(unittest.TestCase):
    def fixture(self, mode="success", acl=BASE):
        host, store = Host(mode, acl), Store()
        return host, store, Commands(host, store)

    def test_prepare_and_restore_exact_original_rules_with_fixed_target(self):
        host, store, commands = self.fixture()
        result = kvm.prepare(host, store, commands)
        self.assertTrue(result["success"])
        self.assertTrue(store.saved_before_grant)
        self.assertIn("user:1001:rw-", host.acl)
        result = kvm.restore(host, store, commands)
        self.assertTrue(result["success"])
        self.assertEqual(host.acl, BASE)
        self.assertTrue(store.state["restored"])
        writes = [(stage, argv, body) for stage, argv, body in commands.calls if stage in ("grant", "restore-acl")]
        self.assertEqual(len(writes), 2)
        for _, argv, _ in writes:
            self.assertEqual(argv[-2:], ["--", "/dev/kvm"])
            self.assertIn("--no-mask", argv)
            self.assertNotIn("--restore", str(argv))
        self.assertEqual(writes[1][2], BASE.encode("ascii"))

    def test_preexisting_access_is_verified_without_privileged_write(self):
        host, store, commands = self.fixture("preexisting")
        self.assertTrue(kvm.prepare(host, store, commands)["success"])
        self.assertTrue(kvm.restore(host, store, commands)["success"])
        self.assertFalse(any(stage in ("grant", "restore-acl") for stage, *_ in commands.calls))

    def test_safe_mask_extension_preserves_other_principals_and_restores_original_mode(self):
        original = "user::rw-\nuser:2000:r--\ngroup::r--\nmask::r--\nother::---\n"
        host, store, commands = self.fixture(acl=original)
        host.snapshot["mode"] = 0o640
        result = kvm.prepare(host, store, commands)
        self.assertTrue(result["success"])
        self.assertEqual(result["device_after"]["mode"], 0o660)
        self.assertIn("group::r--", host.acl)
        self.assertIn("user:2000:r--", host.acl)
        self.assertTrue(kvm.restore(host, store, commands)["success"])
        self.assertEqual(host.snapshot["mode"], 0o640)
        self.assertEqual(host.acl, original)

    def test_restrictive_acl_is_rejected_before_state_or_mutation(self):
        acl = "user::rw-\nuser:2000:rw-\ngroup::r--\nmask::r--\nother::---\n"
        host, store, commands = self.fixture(acl=acl)
        host.snapshot["mode"] = 0o640
        result = kvm.prepare(host, store, commands)
        self.assertFalse(result["success"])
        self.assertIn("unmask", result["failure"])
        self.assertIsNone(store.state)
        self.assertFalse(any(stage == "grant" for stage, *_ in commands.calls))

    def test_missing_or_wrong_device_never_reaches_privileged_write(self):
        for mode in ("no-kvm", "wrong-device", "wrong-owner"):
            host, store, commands = self.fixture(mode)
            self.assertFalse(kvm.prepare(host, store, commands)["success"])
            self.assertFalse(any(stage == "grant" for stage, *_ in commands.calls))

    def test_grant_failure_partial_failure_and_verification_failure_restore_original(self):
        # An unrelated new principal is outside the permitted mutation domain;
        # that former fixture now belongs to the drift rejection test below.
        for mode in ("grant-failed", "grant-partial-failed", "verify-access-failed"):
            with self.subTest(mode=mode):
                host, store, commands = self.fixture(mode)
                result = kvm.prepare(host, store, commands)
                self.assertFalse(result["success"])
                self.assertTrue(store.saved_before_grant)
                self.assertEqual(host.acl, BASE)
                self.assertTrue(store.state["restored"])

    def test_unrelated_restrictions_new_principals_or_unknown_runner_mask_drift_are_not_overwritten(self):
        for drift in (
            lambda acl: acl.replace("group::rw-", "group::r--"),
            lambda acl: acl.replace("user::rw-", "user::r--"),
            lambda acl: acl + "user:2000:r--\n",
            lambda acl: acl + "group:2000:r--\n",
            lambda acl: acl.replace("mask::rw-", "mask::r--"),
            lambda acl: acl.replace("user:1001:rw-", "user:1001:r-x"),
        ):
            with self.subTest(drift=drift):
                host, store, commands = self.fixture()
                self.assertTrue(kvm.prepare(host, store, commands)["success"])
                host.acl = kvm.canonical_acl(drift(host.acl))
                before = host.acl
                commands.calls.clear()
                result = kvm.restore(host, store, commands)
                self.assertFalse(result["success"])
                self.assertFalse(store.state["restored"])
                self.assertEqual(host.acl, before)
                self.assertFalse(any(stage == "restore-acl" for stage, *_ in commands.calls))

    def test_other_permission_restriction_and_existing_principal_removal_remain_intact(self):
        fixtures = (
            ("user::rw-\ngroup::rw-\nother::r--\n", 0o664, lambda acl: acl.replace("other::r--", "other::---")),
            ("user::rw-\nuser:2000:r--\ngroup::rw-\nmask::rw-\nother::---\n", 0o660, lambda acl: acl.replace("user:2000:r--\n", "")),
            ("user::rw-\nuser:2000:r--\ngroup::rw-\nmask::rw-\nother::---\n", 0o660, lambda acl: acl.replace("user:2000:r--", "user:2000:---")),
            ("user::rw-\ngroup::rw-\ngroup:2000:r--\nmask::rw-\nother::---\n", 0o660, lambda acl: acl.replace("group:2000:r--", "group:2000:---")),
        )
        for original, mode, drift in fixtures:
            host, store, commands = self.fixture(acl=original)
            host.snapshot["mode"] = mode
            self.assertTrue(kvm.prepare(host, store, commands)["success"])
            host.acl = drift(host.acl)
            commands.calls.clear()
            self.assertFalse(kvm.restore(host, store, commands)["success"])
            self.assertFalse(any(stage == "restore-acl" for stage, *_ in commands.calls))

    def test_unrelated_change_during_prepare_verification_does_not_trigger_broad_rollback(self):
        host, store, commands = self.fixture("verify-acl-failed")
        result = kvm.prepare(host, store, commands)
        self.assertFalse(result["success"])
        self.assertIn("rollback_failure", result)
        self.assertIn("user:2000:rw-", host.acl)
        self.assertFalse(store.state["restored"])
        self.assertFalse(any(stage == "restore-acl" for stage, *_ in commands.calls))

    def test_known_target_and_mask_partial_changes_restore_without_affecting_other_principals(self):
        original = "user::rw-\nuser:1001:r--\nuser:2000:r--\ngroup::r--\nmask::r--\nother::---\n"
        for partial in (
            lambda acl: acl.replace("mask::rw-", "mask::r--"),
            lambda acl: acl.replace("user:1001:rw-", "user:1001:r--"),
        ):
            host, store, commands = self.fixture(acl=original)
            host.snapshot["mode"] = 0o640
            self.assertTrue(kvm.prepare(host, store, commands)["success"])
            host.acl = partial(host.acl)
            host.snapshot["mode"] = kvm.expected_mode(0o640, host.acl)
            self.assertTrue(kvm.restore(host, store, commands)["success"])
            self.assertEqual(host.acl, original)
        host, store, commands = self.fixture()
        self.assertTrue(kvm.prepare(host, store, commands)["success"])
        host.acl = host.acl.replace("user:1001:rw-\n", "")
        self.assertTrue(kvm.restore(host, store, commands)["success"])
        self.assertEqual(host.acl, BASE)

    def test_restoration_rechecks_acl_after_identity_preflight_before_privileged_write(self):
        host, store, commands = self.fixture()
        self.assertTrue(kvm.prepare(host, store, commands)["success"])
        device = host.device
        calls = [0]

        def device_with_restriction():
            calls[0] += 1
            if calls[0] == 2:
                host.acl = host.acl.replace("group::rw-", "group::r--")
            return device()

        host.device = device_with_restriction
        commands.calls.clear()
        self.assertFalse(kvm.restore(host, store, commands)["success"])
        self.assertIn("group::r--", host.acl)
        self.assertFalse(any(stage == "restore-acl" for stage, *_ in commands.calls))

    def test_changed_device_refuses_restore_and_does_not_mutate_replacement(self):
        host, store, commands = self.fixture("changed-device")
        result = kvm.prepare(host, store, commands)
        self.assertFalse(result["success"])
        self.assertIn("rollback_failure", result)
        self.assertFalse(any(stage == "restore-acl" for stage, *_ in commands.calls))

    def test_restoration_failure_fails_and_preserves_pending_state(self):
        host, store, commands = self.fixture()
        self.assertTrue(kvm.prepare(host, store, commands)["success"])
        host.mode = "restore-failed"
        result = kvm.restore(host, store, commands)
        self.assertFalse(result["success"])
        self.assertFalse(store.state["restored"])

    def test_unsafe_or_tampered_ledger_cannot_supply_acl_input(self):
        for tamper in ("unsafe", "header", "extra-field", "other-uid"):
            host, store, commands = self.fixture()
            self.assertTrue(kvm.prepare(host, store, commands)["success"])
            commands.calls.clear()
            if tamper == "unsafe":
                store.unsafe = True
            elif tamper == "header":
                store.state["original_acl"] = "# file: /other\n" + BASE
            elif tamper == "extra-field":
                store.state["restore_path"] = "/other"
            else:
                store.state["uid"] = 2000
            self.assertFalse(kvm.restore(host, store, commands)["success"])
            self.assertFalse(any(stage == "restore-acl" for stage, *_ in commands.calls))

    def test_prepare_does_not_overwrite_preexisting_ledger(self):
        host, store, commands = self.fixture()
        store.state = {"preserved": True}
        self.assertFalse(kvm.prepare(host, store, commands)["success"])
        self.assertEqual(store.state, {"preserved": True})
        self.assertFalse(any(stage == "grant" for stage, *_ in commands.calls))

    def test_failed_rollback_state_persistence_prevents_grant(self):
        host, store, commands = self.fixture()
        store.fail_save = True
        self.assertFalse(kvm.prepare(host, store, commands)["success"])
        self.assertEqual(host.acl, BASE)
        self.assertFalse(any(stage == "grant" for stage, *_ in commands.calls))

    def test_already_restored_state_is_verified_without_another_privileged_write(self):
        host, store, commands = self.fixture()
        self.assertTrue(kvm.prepare(host, store, commands)["success"])
        self.assertTrue(kvm.restore(host, store, commands)["success"])
        writes = sum(stage == "restore-acl" for stage, *_ in commands.calls)
        self.assertTrue(kvm.restore(host, store, commands)["success"])
        self.assertEqual(sum(stage == "restore-acl" for stage, *_ in commands.calls), writes)

    def test_restore_without_owned_state_is_a_nonmutating_noop(self):
        host, store, commands = self.fixture()
        self.assertTrue(kvm.restore(host, store, commands)["success"])
        self.assertFalse(commands.calls)


class BoundaryTests(unittest.TestCase):
    def test_real_host_device_boundary_rejects_a_symlink_or_regular_file(self):
        host = kvm.Host.__new__(kvm.Host)
        for mode in (stat.S_IFLNK | 0o777, stat.S_IFREG | 0o660):
            with patch.object(kvm.Path, "lstat", return_value=SimpleNamespace(st_mode=mode)), self.assertRaises(kvm.AccessFailure):
                host.device()

    def test_runner_bounds_input_output_and_uses_eof_without_inherited_credentials(self):
        calls = []

        def invoke(argv, **kwargs):
            calls.append((argv, kwargs))
            return SimpleNamespace(returncode=0, stdout=BASE.encode(), stderr=b"")

        runner = kvm.Runner("prepare", invoke=invoke)
        self.assertEqual(runner.run("read-acl", ["fixture-never-run"]), BASE)
        self.assertEqual(calls[0][1]["stdin"], subprocess.DEVNULL)
        self.assertEqual(calls[0][1]["env"], {"PATH": "/usr/bin:/bin", "LC_ALL": "C"})
        with self.assertRaises(kvm.AccessFailure):
            runner.run("restore-acl", ["fixture-never-run"], input=b"x" * 17000, cleanup=True)
        self.assertEqual(len(calls), 1)
        runner.invoke = lambda *args, **kwargs: SimpleNamespace(returncode=0, stdout=b"x" * 17000, stderr=b"")
        with self.assertRaises(kvm.AccessFailure):
            runner.run("read-acl", ["fixture-never-run"])

    def test_prepare_work_deadline_reserves_rollback_and_timeout_is_not_retried(self):
        clock = SimpleNamespace(value=0)
        calls = []

        def invoke(argv, **kwargs):
            calls.append(argv)
            raise subprocess.TimeoutExpired(argv, kwargs["timeout"])

        runner = kvm.Runner("prepare", invoke=invoke, clock=lambda: clock.value)
        clock.value = 55
        with self.assertRaises(kvm.AccessFailure):
            runner.run("grant", ["fixture-never-run"])
        self.assertFalse(calls)
        with self.assertRaises(kvm.AccessFailure):
            runner.run("restore-acl", ["fixture-never-run"], input=BASE.encode(), cleanup=True)
        self.assertEqual(len(calls), 1)
        self.assertEqual(runner.stages[-1]["outcome"], "timed-out")

    def test_ledger_read_uses_no_follow_nonblock_and_checks_the_open_descriptor(self):
        with tempfile.TemporaryDirectory() as temporary:
            store = kvm.SecureStore(Path(temporary), 1001)
            store.directory.mkdir()
            good = SimpleNamespace(st_uid=1001, st_mode=stat.S_IFREG | 0o600, st_nlink=1)
            with patch.object(store, "check_root"), patch.object(store, "check_directory"), patch.object(kvm.os, "O_NOFOLLOW", 131072, create=True), patch.object(kvm.os, "O_NONBLOCK", 2048, create=True), patch.object(kvm.os, "open", return_value=99) as opened, patch.object(kvm.os, "fstat", return_value=good), patch.object(kvm.os, "fdopen", return_value=io.BytesIO(b'{"fixture":true}')), patch.object(kvm.os, "close"):
                self.assertEqual(store.load(), {"fixture": True})
                self.assertTrue(opened.call_args.args[1] & 131072)
                self.assertTrue(opened.call_args.args[1] & 2048)
            bad = SimpleNamespace(st_uid=2000, st_mode=stat.S_IFREG | 0o600, st_nlink=1)
            with patch.object(store, "check_root"), patch.object(store, "check_directory"), patch.object(kvm.os, "O_NOFOLLOW", 131072, create=True), patch.object(kvm.os, "O_NONBLOCK", 2048, create=True), patch.object(kvm.os, "open", return_value=99), patch.object(kvm.os, "fstat", return_value=bad), patch.object(kvm.os, "close"):
                with self.assertRaises(kvm.AccessFailure):
                    store.load()

    def test_entry_point_refuses_user_pc_and_self_hosted_context_before_host_creation(self):
        for context in ({}, {"GITHUB_ACTIONS": "true", "RUNNER_ENVIRONMENT": "self-hosted", "RUNNER_TEMP": "fixture"}):
            with patch.object(kvm.sys, "argv", ["fixture", "prepare"]), patch.object(kvm.sys, "platform", "linux"), patch.dict(kvm.os.environ, context, clear=True), patch.object(kvm, "Host") as host:
                self.assertEqual(kvm.main(), 2)
                host.assert_not_called()


if __name__ == "__main__":
    unittest.main()
