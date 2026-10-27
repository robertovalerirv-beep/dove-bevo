"""Regression guards for the isolated CI smoke runner; never execute Android tools."""
import ast
import importlib.util
import io
import json
import os
import pathlib
import signal
import stat
import subprocess
import tempfile
import types
import unittest
from unittest import mock
root = pathlib.Path(__file__).resolve().parents[3]
path = root / 'mobile-apps/scripts/android-smoke.py'
source = path.read_text(encoding='utf-8')
OWNER_UID = os.getuid() if hasattr(os, 'getuid') else 0
spec = importlib.util.spec_from_file_location('smoke_fixture', path)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
base = root / '.task-tmp' / 'android-smoke-tests'

class Proc:

    def __init__(self, pid=9101, code=0, out=b'out', err=b'err'):
        self.pid = pid
        self.returncode = code
        self.stdout = io.BytesIO(out)
        self.stderr = io.BytesIO(err)

    def poll(self):
        return self.returncode

    def wait(self, timeout):
        return self.returncode

class Clock:
    def __init__(self):
        self.now = 0

    def monotonic(self):
        return self.now

    def sleep(self, seconds):
        self.now += seconds

class AndroidSmokeTests(unittest.TestCase):

    def setUp(self):
        base.mkdir(parents=True, exist_ok=True)
        self.tmp = tempfile.TemporaryDirectory(dir=base)
        self.addCleanup(self.tmp.cleanup)
        self.base = pathlib.Path(self.tmp.name).resolve()
        self.saved = {k: getattr(m, k) for k in ['ROOT', 'EVIDENCE', 'ENV', 'RUNTIME', 'RUNTIME_ID', 'ADB_OWNER', 'SDK', 'ADB']}
        m.ROOT = self.base / 'checkout'
        m.ROOT.mkdir()
        m.EVIDENCE = self.base / 'evidence'
        m.EVIDENCE.mkdir()
        m.ENV = {}
        m.RUNTIME = None
        m.RUNTIME_ID = None
        m.ADB_OWNER = None
        m.SDK = self.base / 'fake-sdk'
        m.ADB = str(m.SDK / 'platform-tools/adb')
        m.FAILURES.clear()
        m.STARTUP.clear()
        m.DIAGNOSTIC_ERRORS.clear()
        self.addCleanup(lambda: [setattr(m, k, v) for k, v in self.saved.items()])
        p = mock.patch.object(signal, 'SIGKILL', 9, create=True)
        p.start()
        self.addCleanup(p.stop)

    def test_preparation_failure_keeps_result_without_tools(self):
        with mock.patch.object(m, 'prepare_runtime', side_effect=RuntimeError('preparation fixture')), mock.patch.object(m.subprocess, 'run') as run, mock.patch.object(m.subprocess, 'Popen') as popen, mock.patch('sys.stdout', new_callable=io.StringIO) as output:
            with self.assertRaisesRegex(RuntimeError, 'preparation fixture'):
                m.main()
        run.assert_not_called()
        popen.assert_not_called()
        result = json.loads((m.EVIDENCE / 'smoke-result.json').read_text())
        self.assertEqual(result['result'], 'failed')
        self.assertEqual(result['error'], 'preparation fixture')
        self.assertEqual(result['cleanup']['result'], 'passed')
        self.assertEqual(json.loads(output.getvalue())['result'], 'failed')

    def test_foreground_argv(self):
        calls = [n for n in ast.walk(ast.parse(source)) if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) and (n.func.attr == 'Popen')]
        args = next(([x.value for x in n.args[0].elts if isinstance(x, ast.Constant)] for n in calls if any((isinstance(x, ast.Constant) and x.value == 'nodaemon' for x in n.args[0].elts))))
        self.assertEqual(args, ['-L', 'tcp:localhost:5041', 'server', 'nodaemon'])
        self.assertNotIn('/proc', source)
        self.assertNotIn('kill-server', source)

    def test_non_ci_guard(self):
        with mock.patch.dict(os.environ, {}, clear=True), mock.patch.object(m.tempfile, 'mkdtemp') as mk:
            with self.assertRaisesRegex(RuntimeError, 'GitHub-hosted'):
                m.prepare_runtime()
            mk.assert_not_called()

    def test_self_hosted_guard(self):
        with mock.patch.object(m.sys, 'platform', 'linux'), mock.patch.dict(os.environ, {'GITHUB_ACTIONS': 'true', 'RUNNER_ENVIRONMENT': 'self-hosted'}, clear=True):
            with self.assertRaisesRegex(RuntimeError, 'GitHub-hosted'):
                m.prepare_runtime()

    def test_checkout_temp_guard(self):
        env = {'GITHUB_ACTIONS': 'true', 'RUNNER_ENVIRONMENT': 'github-hosted', 'ANDROID_HOME': str(m.SDK), 'RUNNER_TEMP': str(m.ROOT)}
        with mock.patch.object(m.sys, 'platform', 'linux'), mock.patch.object(m.os, 'getuid', return_value=OWNER_UID, create=True), mock.patch.dict(os.environ, env, clear=True):
            with self.assertRaisesRegex(RuntimeError, 'outside the checkout'):
                m.prepare_runtime()

    def test_isolated_runtime_excludes_inherited_legacy_sdk_home(self):
        runner = self.base / 'runner'
        runner.mkdir()
        original = pathlib.Path.stat

        def posix_stat(p, *a, **kw):
            v = original(p, *a, **kw)
            # Linux checks the real fixture permissions. Windows injects only
            # the POSIX metadata needed to exercise this Linux-only helper.
            if os.name == 'nt' and p.name.startswith('dovebevo-android-'):
                values = list(v)
                values[0] = stat.S_IFDIR | 0o700
                return os.stat_result(values)
            return v
        env = {'GITHUB_ACTIONS': 'true', 'RUNNER_ENVIRONMENT': 'github-hosted', 'ANDROID_HOME': str(m.SDK), 'RUNNER_TEMP': str(runner), 'ANDROID_SDK_HOME': str(self.base / 'host-preferences'), 'ADB_TRACE': 'auth', 'ADB_VENDOR_KEYS': 'untrusted-key'}
        with mock.patch.object(m.sys, 'platform', 'linux'), mock.patch.object(m.os, 'getuid', return_value=OWNER_UID, create=True), mock.patch.dict(os.environ, env, clear=True), mock.patch.object(pathlib.Path, 'stat', posix_stat):
            m.prepare_runtime()
            self.assertEqual(os.environ['ANDROID_SDK_HOME'], env['ANDROID_SDK_HOME'])
        self.assertNotIn('ANDROID_SDK_HOME', m.ENV)
        self.assertEqual(m.ENV['ANDROID_HOME'], str(m.SDK))
        self.assertTrue(m.RUNTIME.is_relative_to(runner))
        self.assertFalse(m.RUNTIME.is_relative_to(m.EVIDENCE))
        for key in ['HOME', 'ANDROID_USER_HOME', 'ANDROID_AVD_HOME', 'ANDROID_EMULATOR_HOME', 'ADB_VENDOR_KEYS', 'TMPDIR', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME']:
            self.assertTrue(pathlib.Path(m.ENV[key]).is_relative_to(m.RUNTIME), key)
            self.assertFalse(pathlib.Path(m.ENV[key]).is_relative_to(m.EVIDENCE), key)
        self.assertTrue(pathlib.Path(m.ENV['ANDROID_AVD_HOME']).is_dir())
        self.assertNotIn('ADB_TRACE', m.ENV)

    def test_redaction_and_bounds(self):
        v = m.safe_text(b'good\n-----BEGIN PRIVATE KEY-----\nSECRET\n-----END PRIVATE KEY-----\ntoken xyz\n' + b'x' * 50000)
        self.assertNotIn('SECRET', v)
        self.assertNotIn('xyz', v)
        self.assertLessEqual(len(v.encode()), 16384)
        self.assertLessEqual(len(m.safe_text('€' * 10000).encode()), 16384)

    def test_adb_public_key_lines_are_omitted(self):
        fabricated_key = 'FABRICATED_ADB_PUBLIC_KEY_BYTES_ONLY'
        for key_line in [
                f'emulator: INFO | Sending adb public key [{fabricated_key} fixture@host]',
                f'SENDING\tADB PUBLIC KEY {fabricated_key}',
                f'kernel parameters: console=ttyS0 androidboot.qemu.adb.pubkey={fabricated_key} qemu=1',
                f'qemu arguments: "androidboot.qemu.adb.pubkey={fabricated_key}" console=ttyS0']:
            with self.subTest(key_line=key_line):
                sanitized = m.safe_text(f'listener ready\n{key_line}\nboot completed')
                self.assertNotIn(fabricated_key, sanitized)
                self.assertEqual(sanitized.splitlines(), [
                    'listener ready', '[sensitive diagnostic line omitted]', 'boot completed'])

    def test_startup_public_key_redaction_preserves_capture_bounds_and_exit(self):
        fabricated_key = b'FABRICATED_INLINE_ADB_PUBLIC_KEY_BYTES_ONLY'
        stdout = (b'emulator kernel arguments: androidboot.qemu.adb.pubkey=' + fabricated_key
                  + b' qemu=1\nboot diagnostic retained\n' + b'x' * 50000)
        capture = m.BoundedLog(Proc(code=7, out=stdout, err=b'useful emulator failure'), 'emulator')
        capture.finish()
        retained = (m.EVIDENCE / 'emulator-startup.json').read_text()
        self.assertFalse(fabricated_key.decode() in retained, 'Startup evidence retained the fabricated public key')
        result = json.loads(retained)['emulator']
        self.assertEqual(result['returncode'], 7)
        self.assertEqual(result['streams']['stderr']['text'], 'useful emulator failure')
        stream = result['streams']['stdout']
        self.assertIn('boot diagnostic retained', stream['text'])
        self.assertEqual(stream['bytes'], len(stdout))
        self.assertEqual(stream['truncated_bytes'], len(stdout) - 16384)
        self.assertEqual(len(capture.parts['stdout']['data']), 16384)
        self.assertLessEqual(len(stream['text'].encode()), 16384)

    def test_failure_streams(self):
        with mock.patch.object(m.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1, b'O' * 50000, b'useful error')):
            with self.assertRaises(subprocess.CalledProcessError):
                m.run('fake')
        v = json.loads((m.EVIDENCE / 'command-failures.json').read_text())
        self.assertEqual(v[0]['stderr'], 'useful error')
        self.assertEqual(len(v[0]['stdout']), 16384)

    def test_failure_ring(self):
        for n in range(40):
            m.record_failure(('fake', str(n)), 'exit1')
        self.assertEqual(len(m.FAILURES), 32)
        self.assertEqual(m.FAILURES[0]['command'][1], '8')

    def test_write_error_preserves_original(self):
        with mock.patch.object(m.subprocess, 'run', return_value=subprocess.CompletedProcess([], 7, b'o', b'e')), mock.patch.object(pathlib.Path, 'write_text', side_effect=OSError('disk failed')):
            with self.assertRaises(subprocess.CalledProcessError) as c:
                m.run('fake')
        self.assertEqual(c.exception.returncode, 7)
        self.assertTrue(m.DIAGNOSTIC_ERRORS)

    def test_timeout_partial_streams(self):
        with mock.patch.object(m.subprocess, 'run', side_effect=subprocess.TimeoutExpired('fake', 1, output=b'partial', stderr=b'detail')):
            with self.assertRaises(subprocess.TimeoutExpired):
                m.run('fake')
        self.assertEqual(m.FAILURES[-1]['stdout'], 'partial')
        self.assertEqual(m.FAILURES[-1]['stderr'], 'detail')

    def test_both_pipes_flood(self):
        capture = m.BoundedLog(Proc(out=b'A' * 90000, err=b'B' * 100000), 'adb')
        capture.finish()
        v = json.loads((m.EVIDENCE / 'emulator-startup.json').read_text())['adb']['streams']
        self.assertEqual(v['stdout']['bytes'], 90000)
        self.assertEqual(v['stderr']['bytes'], 100000)
        self.assertTrue(v['stdout']['eof'])
        self.assertEqual(v['stderr']['truncated_bytes'], 100000 - 16384)

    def test_read_error_fails(self):

        class Bad(io.BytesIO):

            def read(self, n):
                raise OSError('read failed')
        p = Proc()
        p.stderr = Bad()
        c = m.BoundedLog(p, 'adb')
        with self.assertRaisesRegex(RuntimeError, 'streams'):
            c.finish()
        v = json.loads((m.EVIDENCE / 'emulator-startup.json').read_text())['adb']['streams']['stderr']
        self.assertFalse(v['eof'])
        self.assertIn('read failed', v['error'])

    def fake_runtime(self):
        p = mock.Mock()
        p.name = 'dovebevo-android-fixture'
        p.lstat.return_value = types.SimpleNamespace(st_dev=1, st_ino=2, st_uid=OWNER_UID, st_mode=stat.S_IFDIR | 0o700)
        p.is_symlink.return_value = False
        p.resolve.return_value = p
        p.is_relative_to.return_value = False
        m.RUNTIME = p
        m.RUNTIME_ID = (1, 2, OWNER_UID)
        return p

    def test_stop_order_before_remove(self):
        runtime = self.fake_runtime()
        m.ADB_OWNER = Proc(9102)
        events = []

        def kill(pid, sig):
            if sig == 0:
                raise ProcessLookupError()
            events.append(('stop', pid))
        with mock.patch.object(m.os, 'getuid', return_value=OWNER_UID, create=True), mock.patch.object(m.os, 'killpg', side_effect=kill, create=True), mock.patch.object(m, 'port_open', return_value=False), mock.patch.object(m.shutil, 'rmtree') as rm:
            rm.side_effect = lambda p: events.append(('remove', p))
            self.assertEqual(m.cleanup_runtime(Proc(9101), []), [])
        self.assertEqual(events, [('stop', 9101), ('stop', 9102), ('remove', runtime)])

    def test_unstopped_group_retains_state(self):
        for emulator, adb, label, pid in [(Proc(), None, 'emulator', 9101), (None, Proc(9102), 'ADB', 9102)]:
            self.fake_runtime()
            m.ADB_OWNER = adb
            clock = Clock()
            with self.subTest(label=label), mock.patch.object(m.os, 'killpg', return_value=None, create=True) as kill, mock.patch.object(m.time, 'monotonic', clock.monotonic), mock.patch.object(m.time, 'sleep', clock.sleep), mock.patch.object(m, 'port_open', return_value=False), mock.patch.object(m.shutil, 'rmtree') as rm:
                self.assertEqual(m.cleanup_runtime(emulator, []), [f'Owned {label} process group did not stop'])
                rm.assert_not_called()
            self.assertGreaterEqual(clock.now, 15)
            self.assertLessEqual(clock.now, 15.01)
            self.assertEqual({call.args[0] for call in kill.call_args_list}, {pid})

    def test_early_leader_exit_still_waits_for_group_before_escalation(self):
        clock = Clock()
        def kill(pid, sig):
            if sig == 0 and clock.now >= 0.3:
                raise ProcessLookupError()
        with mock.patch.object(m.os, 'killpg', side_effect=kill, create=True) as action, mock.patch.object(m.time, 'monotonic', clock.monotonic), mock.patch.object(m.time, 'sleep', clock.sleep):
            self.assertEqual(m.cleanup_runtime(Proc(), []), [])
        self.assertGreaterEqual(clock.now, 0.3)
        self.assertEqual([call.args for call in action.call_args_list if call.args[1] != 0], [(9101, signal.SIGTERM)])

    def test_group_remaining_after_term_is_escalated_then_observed_until_gone(self):
        clock = Clock()
        def kill(pid, sig):
            if sig == 0 and clock.now >= 10.3:
                raise ProcessLookupError()
        with mock.patch.object(m.os, 'killpg', side_effect=kill, create=True) as action, mock.patch.object(m.time, 'monotonic', clock.monotonic), mock.patch.object(m.time, 'sleep', clock.sleep):
            self.assertEqual(m.cleanup_runtime(Proc(), []), [])
        self.assertGreaterEqual(clock.now, 10.3)
        self.assertEqual([call.args for call in action.call_args_list if call.args[1] != 0], [(9101, signal.SIGTERM), (9101, signal.SIGKILL)])

    def test_decline_waits_for_nonempty_foreground_change_before_one_launch(self):
        clock = Clock()
        events = []
        packages = iter(['com.dovebevo.app', 'com.dovebevo.app', 'com.google.android.apps.nexuslauncher'])
        def hierarchy():
            package = next(packages)
            events.append(package)
            return m.ET.fromstring(f'<hierarchy><node package="{package}" /></hierarchy>')
        with mock.patch.object(m, 'tree', side_effect=hierarchy), mock.patch.object(m, 'launch_app', side_effect=lambda stage: events.append(stage)) as launch, mock.patch.object(m.time, 'monotonic', clock.monotonic), mock.patch.object(m.time, 'sleep', clock.sleep):
            m.relaunch_after_decline()
        launch.assert_called_once_with('after_decline')
        self.assertEqual(events[-2:], ['com.google.android.apps.nexuslauncher', 'after_decline'])
        self.assertEqual(clock.now, 4)

    def test_decline_never_launches_while_app_or_empty_window_remains(self):
        for xml in ['<hierarchy />', '<hierarchy><node /></hierarchy>', '<hierarchy><node package="com.dovebevo.app" /></hierarchy>']:
            clock = Clock()
            with self.subTest(xml=xml), mock.patch.object(m, 'tree', return_value=m.ET.fromstring(xml)), mock.patch.object(m, 'launch_app') as launch, mock.patch.object(m.time, 'monotonic', clock.monotonic), mock.patch.object(m.time, 'sleep', clock.sleep):
                with self.assertRaisesRegex(RuntimeError, 'declined Activity leaves foreground'):
                    m.relaunch_after_decline()
                launch.assert_not_called()

    def test_launch_diagnostics_are_fixed_stage_bounded_and_sanitized(self):
        m.RUNTIME = self.base / 'private-runtime'
        payload = str(m.RUNTIME).encode() + b'\ntoken omitted-value\n' + b'x' * 50000
        completed = subprocess.CompletedProcess([], 0, payload, b'intent delivered to existing activity')
        with mock.patch.object(m, 'adb', return_value=completed) as adb:
            for stage in ['initial', 'after_decline', 'resume', 'after_restart']:
                m.launch_app(stage)
            for stage in ['initial', 'arbitrary-stage']:
                with self.assertRaisesRegex(RuntimeError, 'launch stage'):
                    m.launch_app(stage)
        self.assertEqual(adb.call_count, 4)
        for call in adb.call_args_list:
            self.assertEqual(call.args, ('shell', 'am', 'start', '-W', '-n', 'com.dovebevo.app/.MainActivity'))
            self.assertEqual(call.kwargs, {'check': False})
        launches = json.loads((m.EVIDENCE / 'emulator-startup.json').read_text())['launches']
        self.assertEqual(len(launches), 4)
        for outcome in launches.values():
            self.assertEqual(outcome['returncode'], 0)
            self.assertLessEqual(len(outcome['stdout'].encode()), m.DIAGNOSTIC_LIMIT)
            self.assertNotIn('omitted-value', outcome['stdout'])
            self.assertNotIn(str(m.RUNTIME), outcome['stdout'])
            self.assertEqual(outcome['stderr'], 'intent delivered to existing activity')

    def test_failed_launch_keeps_outcome_before_raising_and_does_not_retry(self):
        with mock.patch.object(m, 'adb', return_value=subprocess.CompletedProcess([], 9, b'launch detail', b'failure')) as adb:
            with self.assertRaises(subprocess.CalledProcessError):
                m.launch_app('after_decline')
        adb.assert_called_once()
        outcome = json.loads((m.EVIDENCE / 'emulator-startup.json').read_text())['launches']['after_decline']
        self.assertEqual(outcome['returncode'], 9)
        self.assertEqual(outcome['stdout'], 'launch detail')
        self.assertEqual(outcome['stderr'], 'failure')

    def test_identity_change_retains_state(self):
        self.fake_runtime()
        m.RUNTIME_ID = (1, 999, OWNER_UID)
        with mock.patch.object(m.os, 'getuid', return_value=OWNER_UID, create=True), mock.patch.object(m, 'port_open', return_value=False), mock.patch.object(m.shutil, 'rmtree') as rm:
            self.assertTrue(m.cleanup_runtime(None, []))
            rm.assert_not_called()

    def test_dead_adb_no_client(self):
        m.ADB_OWNER = Proc(code=1)
        with mock.patch.object(m, 'run') as run:
            with self.assertRaisesRegex(RuntimeError, 'unavailable'):
                m.adb('shell', 'true')
            run.assert_not_called()

    def test_client_scope(self):
        m.ADB_OWNER = Proc(code=None)
        with mock.patch.object(m, 'run', return_value='ok') as run:
            self.assertEqual(m.adb('shell', 'true'), 'ok')
        self.assertEqual(run.call_args.args[:7], (m.ADB, '-H', '127.0.0.1', '-P', '5041', '-s', 'emulator-5554'))

    def test_startup_exit_keeps_result_and_stderr(self):
        p = Proc(code=1, err=b'ADB startup parser detail')
        with mock.patch.object(m, 'prepare_runtime'), mock.patch.object(m, 'port_open', return_value=False), mock.patch.object(m.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, b'', b'')), mock.patch.object(m.subprocess, 'Popen', return_value=p) as popen, mock.patch.object(m.os, 'killpg', side_effect=ProcessLookupError(), create=True), mock.patch('sys.stdout', new_callable=io.StringIO) as output:
            with self.assertRaisesRegex(RuntimeError, 'ADB server exited'):
                m.main()
        self.assertEqual(popen.call_count, 1)
        r = json.loads((m.EVIDENCE / 'smoke-result.json').read_text())
        self.assertEqual(r['result'], 'failed')
        self.assertEqual(r['cleanup']['result'], 'passed')
        self.assertEqual(json.loads(output.getvalue())['result'], 'failed')
        v = json.loads((m.EVIDENCE / 'emulator-startup.json').read_text())['adb']['streams']
        self.assertEqual(v['stderr']['text'], 'ADB startup parser detail')

    def test_unknown_socket_fails_closed(self):
        with mock.patch.object(m.socket, 'create_connection', side_effect=TimeoutError('unknown')):
            with self.assertRaises(TimeoutError):
                m.port_open(5041)

    def test_required_ui_checks_retained(self):
        for text in ['native adult usage rules', 'live website city-search control', 'clickable Milano city result', 'live map initialized after city selection', 'accepted app restarts into live service']:
            self.assertIn(text, source)
if __name__ == '__main__':
    unittest.main()
