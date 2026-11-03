"""Regression guards for the isolated CI smoke runner; never execute Android tools."""
import ast
import importlib.util
import io
import json
import os
import pathlib
import re
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

    def test_city_result_uses_exact_row_bounds_not_venue_or_clickable_list(self):
        ui = m.ET.fromstring('''<hierarchy><node class="android.widget.ListView" clickable="true" bounds="[42,695][1042,2133]">
            <node class="android.view.View" text="Milano Città · 682 bar" clickable="false" bounds="[42,695][1042,878]"/>
            <node class="android.view.View" text="Milano Londra 69 Bar · Seregno" clickable="false" bounds="[42,1411][1042,1595]"/>
        </node></hierarchy>''')
        self.assertEqual(m.city_result(ui, 'Milano').get('bounds'), '[42,695][1042,878]')
        self.assertIsNone(m.city_result(ui, 'Torino'))

    def test_native_back_requires_owned_resource_and_enabled_state(self):
        ui = m.ET.fromstring('''<hierarchy>
          <node resource-id="web:back" content-desc="Indietro" enabled="true" bounds="[1,1][50,50]"/>
          <node resource-id="com.dovebevo.app:id/back" content-desc="Indietro" enabled="true" bounds="[21,128][147,254]"/>
        </hierarchy>''')
        self.assertEqual(m.native_back(ui).get('bounds'), '[21,128][147,254]')
        ui[1].set('enabled', 'false')
        self.assertIsNone(m.native_back(ui))

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
        m.PUBLIC_STAGE, m.OWNED_PASS = None, False
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
        for text in ['native adult usage rules', 'live website city-search control', 'clickable Milano city result',
                     'live map initialized after city selection', 'clickable venue with verified menu in Milano',
                     'real venue name, owner-menu amount and dated source were visible',
                     'Milano map restored by native Back', 'accepted app restarts into live service']:
            self.assertIn(text, source)

    def test_venue_probe_requires_a_real_clickable_positive_menu_row(self):
        row = ('<node clickable="true" bounds="[0,0][300,90]">'
               '<node text="The Dome"/><node text="149 voci menu"/>'
               '<node text="Bar · Dal menu del locale"/></node>')
        found = m.menu_venue_row(m.ET.fromstring(row))
        self.assertIsNotNone(found)
        self.assertEqual((found[1], found[2]), ('The Dome', 149))
        self.assertEqual(found[0].get('bounds'), '[0,0][300,90]')
        for invalid in [row.replace('149 voci', '0 voci'),
                        row.replace('Dal menu del locale', 'Prezzo segnalato'),
                        row.replace('clickable="true"', 'clickable="false"')]:
            self.assertIsNone(m.menu_venue_row(m.ET.fromstring(invalid)))

    def test_venue_detail_requires_matching_name_amount_owner_provenance_and_source(self):
        detail = ('<hierarchy><node text="The Dome"/><node text="Dal menu del locale">'
                  '<node text="Spritz"><node text="Prezzo da menu"/>'
                  '<node text="5,50 €"/><node text="Menu verificato il 2026-11-03"/>'
                  '</node></node></hierarchy>')
        self.assertEqual(m.menu_detail_state(m.ET.fromstring(detail), 'The Dome'),
                         {'venue': 'The Dome', 'menu_price': '5,50 €'})
        mixed = ('<hierarchy><node text="The Dome"/><node text="Prezzi segnalati dai clienti">'
                 '<node text="Birra media 9,00 €"/></node><node text="Dal menu del locale">'
                 '<node text="Still water 75 cl"><node text="4,00 €"/>'
                 '<node text="Prezzo da menu"/><node text="Menu verificato il 2026-11-03"/>'
                 '</node></node></hierarchy>')
        self.assertEqual(m.menu_detail_state(m.ET.fromstring(mixed), 'The Dome'),
                         {'venue': 'The Dome', 'menu_price': '4,00 €'})
        self.assertIsNone(m.menu_detail_state(m.ET.fromstring(
            mixed.replace('4,00 €', 'nessun prezzo')), 'The Dome'))
        self.assertIsNone(m.menu_detail_state(m.ET.fromstring(
            '<hierarchy><node text="The Dome"/><node text="Birra media 9,00 €"/>'
            '<node text="Prezzo da menu"/><node text="Menu verificato il 2026-11-03"/>'
            '</hierarchy>'), 'The Dome'))
        for wrong_name, invalid in [('Other venue', detail),
                                    ('The Dome', detail.replace('Prezzo da menu', 'Prezzo segnalato')),
                                    ('The Dome', detail.replace('5,50 €', 'nessun prezzo')),
                                    ('The Dome', detail.replace('Menu verificato il', 'Senza fonte'))]:
            self.assertIsNone(m.menu_detail_state(m.ET.fromstring(invalid), wrong_name))
        map_ui = m.ET.fromstring('<hierarchy><node text="Mappa interattiva dei bar"/></hierarchy>')
        self.assertTrue(m.map_after_venue_back(map_ui))
        self.assertFalse(m.map_ready(m.ET.fromstring(
            '<hierarchy><node text="Mappa interattiva dei bar"/><node text="Riprova mappa"/></hierarchy>')))
        self.assertFalse(m.map_after_venue_back(m.ET.fromstring(
            '<hierarchy><node text="Mappa interattiva dei bar"/><node text="Prezzo da menu"/></hierarchy>')))
        self.assertFalse(m.map_after_venue_back(m.ET.fromstring(
            '<hierarchy><node text="Mappa interattiva dei bar"/><node text="Chiudi"/></hierarchy>')))

    def test_menu_and_back_stages_preserve_exact_challenge_classification(self):
        self.assertTrue({'list', 'venue', 'back'} <= set(m.PUBLIC_STAGES))
        challenge = self.challenge_xml()
        with mock.patch.object(m, 'adb', return_value=subprocess.CompletedProcess([], 0, challenge, b'')), \
             mock.patch.object(m, 'screenshot') as shot:
            shot.side_effect = lambda name: (m.EVIDENCE / name).write_bytes(b'\x89PNG\r\n\x1a\nfixture-only')
            m.OWNED_PASS = True
            for stage in ('list', 'venue', 'back'):
                m.PUBLIC_STAGE = stage
                with self.assertRaises(m.PublicProbeBlocked) as blocked:
                    m.tree()
                self.assertEqual(blocked.exception.stage, stage)

    def owned_output(self):
        lines = []
        for name, count in m.OWNED_CLASSES.items():
            for number in range(count):
                for code in (1, 0):
                    lines.extend([f'INSTRUMENTATION_STATUS: class=com.dovebevo.app.{name}',
                                  f'INSTRUMENTATION_STATUS: test=case{number}',
                                  'INSTRUMENTATION_STATUS: numtests=45', f'INSTRUMENTATION_STATUS_CODE: {code}'])
        return ('\n'.join(lines) + '\nOK (45 tests)\nINSTRUMENTATION_CODE: -1\n').encode()

    def challenge_xml(self):
        return b'<hierarchy><node class="android.webkit.WebView" package="com.dovebevo.app"><node text="www.dovebevo.com"/><node text="Performing security verification"/><node class="android.widget.CheckBox" text="Verify you are human"/><node text="Cloudflare"/></node></hierarchy>'

    def blocked_receipt(self):
        owned = m.owned_instrumentation(self.owned_output())
        (m.EVIDENCE / 'owned-instrumentation.json').write_text(json.dumps(owned))
        (m.EVIDENCE / 'public-blocked-ui.xml').write_bytes(self.challenge_xml())
        (m.EVIDENCE / 'public-blocked.png').write_bytes(b'\x89PNG\r\n\x1a\nfixture-only')
        proof = {name: m.evidence_hash(name) for name in ('public-blocked-ui.xml', 'public-blocked.png')}
        result = {'result': 'blocked', 'blocker': 'cloudflare_challenge', 'owned': owned,
                  'public_probe': {'result': 'blocked', 'stage': 'home', 'evidence': proof},
                  'cleanup': {'result': 'passed', 'errors': []}}
        (m.EVIDENCE / 'smoke-result.json').write_text(json.dumps(result))
        return result, m.PublicProbeBlocked('home', proof)

    def test_owned_instrumentation_requires_every_explicit_unskipped_case(self):
        good = self.owned_output()
        self.assertEqual(m.owned_instrumentation(good)['tests'], 45)
        for bad in [b'', good.replace(b'OK (45 tests)', b''), good.replace(b'INSTRUMENTATION_CODE: -1', b''),
                    good.replace(b'STATUS_CODE: 0', b'STATUS_CODE: -2', 1),
                    good.replace(b'STATUS_CODE: 0', b'STATUS_CODE: -3', 1),
                    good.replace(b'STATUS_CODE: 0', b'STATUS_CODE: -4', 1),
                    good.replace(b'case0', b'case1', 2), good + b'\nFAILURES!!!\n']:
            with self.subTest(bad=bad[:50]), self.assertRaises((RuntimeError, ValueError)):
                m.owned_instrumentation(bad)

    def test_owned_suite_uses_one_bounded_ten_minute_process_budget(self):
        m.ADB_OWNER = Proc(code=None)
        with mock.patch.object(m.subprocess, 'run',
                               return_value=subprocess.CompletedProcess([], 0, self.owned_output(), b'')) as run:
            result = m.run_owned_instrumentation()
        self.assertEqual(result['tests'], 45)
        self.assertEqual(run.call_count, 2, 'One instrument invocation and final force-stop; no retries')
        instrument, stop = run.call_args_list
        self.assertEqual(instrument.args[0][7:14], ('shell', 'am', 'instrument', '-w', '-r', '-e', 'class'))
        self.assertEqual(instrument.kwargs['timeout'], 600)
        self.assertEqual(stop.args[0][7:], ('shell', 'am', 'force-stop', 'com.dovebevo.app'))
        self.assertEqual(stop.kwargs['timeout'], 30, 'Other ADB operations retain their short deadline')

    def test_owned_class_allowlist_fresh_process_and_force_stop(self):
        with mock.patch.object(m, 'adb', return_value=subprocess.CompletedProcess([], 0, self.owned_output(), b'')) as adb:
            m.run_owned_instrumentation()
        self.assertEqual(adb.call_count, 2)
        args = adb.call_args_list[0].args
        self.assertEqual(args[:7], ('shell', 'am', 'instrument', '-w', '-r', '-e', 'class'))
        self.assertEqual(set(args[7].split(',')), {'com.dovebevo.app.' + name for name in m.OWNED_CLASSES})
        self.assertNotIn('PublicBrowseRuntimeTest', args[7])
        self.assertEqual(adb.call_args_list[1].args, ('shell', 'am', 'force-stop', 'com.dovebevo.app'))

    def test_owned_output_is_bounded_redacted_and_saved_before_success_parser(self):
        original = self.owned_output()
        stderr = b'useful warning\nAuthorization: Bearer FABRICATED_SECRET\n' + b'e' * 50000
        actual_parser = m.owned_instrumentation
        def parse(raw):
            retained = json.loads((m.EVIDENCE / 'emulator-startup.json').read_text())['owned_instrumentation']
            self.assertEqual(retained['stdout']['bytes'], len(original))
            self.assertNotIn('FABRICATED_SECRET', json.dumps(retained))
            self.assertLessEqual(len(retained['stderr']['head'].encode()), m.DIAGNOSTIC_LIMIT)
            self.assertLessEqual(len(retained['stderr']['tail'].encode()), m.DIAGNOSTIC_LIMIT)
            self.assertEqual(retained['stderr']['truncated_bytes'], max(0, retained['stderr']['sanitized_bytes'] - 2 * m.DIAGNOSTIC_LIMIT))
            self.assertIn('OK (45 tests)', retained['stdout']['tail'])
            self.assertIs(raw, original)
            return actual_parser(raw)
        with mock.patch.object(m, 'owned_instrumentation', side_effect=parse), \
             mock.patch.object(m, 'adb', return_value=subprocess.CompletedProcess([], 0, original, stderr)) as adb:
            self.assertEqual(m.run_owned_instrumentation()['tests'], 45)
        self.assertEqual(adb.call_count, 2)
        self.assertFalse(any(call.args[0] == 'logcat' for call in adb.call_args_list))
        self.assertNotIn('failure_logcat', m.STARTUP['owned_instrumentation'])

    def test_stream_tail_keeps_final_failure_without_cutting_into_sensitive_blocks(self):
        stream = (b'first diagnostic\n' + b'ordinary status\n' * 3000
                  + b'-----BEGIN PRIVATE KEY-----\n' + b'FABRICATED_KEY_BODY\n' * 2000
                  + b'-----END PRIVATE KEY-----\n'
                  + b'access_token=' + b'FABRICATED_TOKEN' * 2000
                  + b'\nFINAL FAILURE: useful real end-of-stream detail\n')
        retained = m.diagnostic_stream(stream)
        self.assertEqual(retained['bytes'], len(stream))
        self.assertEqual(retained['sha256'], m.hashlib.sha256(stream).hexdigest())
        self.assertIn('first diagnostic', retained['head'])
        self.assertIn('FINAL FAILURE', retained['tail'])
        self.assertNotIn('FABRICATED_KEY_BODY', json.dumps(retained))
        self.assertNotIn('FABRICATED_TOKEN', json.dumps(retained))
        self.assertGreater(retained['truncated_bytes'], 0)
        for window in ('head', 'tail'):
            self.assertLessEqual(len(retained[window].encode()), m.DIAGNOSTIC_LIMIT)

    def test_owned_parse_failure_retains_output_and_only_then_filtered_logcat(self):
        m.ADB_OWNER = Proc(code=None)
        responses = [subprocess.CompletedProcess([], 0, b'INSTRUMENTATION_ABORTED: runner crashed', b'runner stderr'),
                     subprocess.CompletedProcess([], 0, b'AndroidRuntime: useful fixture stack\nAuthorization: FABRICATED_SECRET', b'')]
        with mock.patch.object(m, 'adb', side_effect=responses) as adb:
            with self.assertRaisesRegex(RuntimeError, 'missing explicit 45-case PASS'):
                m.run_owned_instrumentation()
        log_args = adb.call_args_list[1]
        self.assertEqual(log_args.args, ('logcat', '-d', '-t', '300', '-v', 'brief', 'AndroidRuntime:E',
                                        'TestRunner:V', 'chromium:E', 'libc:F', 'DEBUG:F', 'System.err:W', '*:S'))
        self.assertEqual(log_args.kwargs, {'timeout': 15, 'check': False})
        retained = json.loads((m.EVIDENCE / 'emulator-startup.json').read_text())['owned_instrumentation']
        self.assertIn('runner crashed', retained['stdout']['head'])
        self.assertIn('useful fixture stack', retained['failure_logcat']['stdout']['head'])
        self.assertNotIn('FABRICATED_SECRET', json.dumps(retained))
        self.assertFalse((m.EVIDENCE / 'owned-instrumentation.json').exists())
        self.assertFalse(m.OWNED_PASS)

    def test_owned_command_timeout_keeps_partial_streams_and_original_exception(self):
        m.ADB_OWNER = Proc(code=None)
        error = subprocess.TimeoutExpired('owned fixture', 600, output=b'partial test output', stderr=b'partial stderr')
        with mock.patch.object(m, 'adb', side_effect=[error, subprocess.CompletedProcess([], 0, b'crash detail', b'')]):
            with self.assertRaises(subprocess.TimeoutExpired) as caught: m.run_owned_instrumentation()
        self.assertIs(caught.exception, error)
        retained = json.loads((m.EVIDENCE / 'emulator-startup.json').read_text())['owned_instrumentation']
        self.assertEqual(retained['stdout']['head'], 'partial test output')
        self.assertEqual(retained['stderr']['head'], 'partial stderr')
        self.assertEqual(retained['failure_logcat']['status'], 'captured')

    def test_diagnostic_io_failure_never_masks_parser_error_or_manufactures_pass(self):
        for otherwise_passed in (False, True):
            original = RuntimeError('original owned parser failure')
            m.ADB_OWNER = Proc(code=None)
            with mock.patch.object(pathlib.Path, 'write_text', side_effect=OSError('diagnostic disk failure')), \
                 mock.patch.object(m, 'owned_instrumentation', side_effect=None if otherwise_passed else original,
                                   return_value={'result': 'passed', 'tests': 45}), \
                 mock.patch.object(m, 'adb', return_value=subprocess.CompletedProcess([], 0, b'fixture', b'')) as adb:
                with self.assertRaises(RuntimeError) as caught: m.run_owned_instrumentation()
            if otherwise_passed:
                self.assertIn('diagnostics could not be retained', str(caught.exception))
            else:
                self.assertIs(caught.exception, original)
            self.assertTrue(m.DIAGNOSTIC_ERRORS)
            self.assertFalse(m.OWNED_PASS)
            self.assertFalse(any(call.args[:3] == ('shell', 'am', 'force-stop') for call in adb.call_args_list))

    def test_failed_logcat_does_not_replace_owned_error_and_dead_adb_is_not_used(self):
        m.ADB_OWNER = Proc(code=None)
        original = subprocess.CalledProcessError(1, 'owned fixture', output=b'failed test')
        log_error = subprocess.TimeoutExpired('filtered logcat', 15, output=b'partial fatal stack')
        with mock.patch.object(m, 'adb', side_effect=[original, log_error]):
            with self.assertRaises(subprocess.CalledProcessError) as caught: m.run_owned_instrumentation()
        self.assertIs(caught.exception, original)
        retained = m.STARTUP['owned_instrumentation']['failure_logcat']
        self.assertEqual(retained['status'], 'failed')
        self.assertEqual(retained['stdout']['head'], 'partial fatal stack')
        m.ADB_OWNER = Proc(code=1)
        with mock.patch.object(m, 'adb') as adb: m.owned_failure_logcat()
        adb.assert_not_called()
        self.assertEqual(m.STARTUP['owned_instrumentation']['failure_logcat']['status'], 'unavailable')

    def test_only_exact_challenge_inside_app_webview_is_recognized(self):
        good = self.challenge_xml()
        self.assertTrue(m.cloudflare_challenge(m.ET.fromstring(good)))
        for bad in [good.replace(b'Cloudflare', b'Network error'), good.replace(b'com.dovebevo.app', b'other.app'),
                    good.replace(b'www.dovebevo.com', b'other.invalid'), good.replace(b'android.widget.CheckBox', b'android.widget.TextView')]:
            self.assertFalse(m.cloudflare_challenge(m.ET.fromstring(bad)))
        with mock.patch.object(m, 'adb', return_value=subprocess.CompletedProcess([], 0, good, b'')), mock.patch.object(m, 'screenshot') as shot:
            m.tree()  # Not public-stage or owned-pass: never special-case this state.
            m.PUBLIC_STAGE, m.OWNED_PASS = 'home', True
            shot.side_effect = lambda name: (m.EVIDENCE / name).write_bytes(b'\x89PNG\r\n\x1a\nfixture-only')
            with self.assertRaises(m.PublicProbeBlocked): m.tree()
            shot.assert_called_once_with('public-blocked.png')

    def test_pr_only_wrapper_preserves_pass_and_recognized_block_but_never_generic_failure(self):
        with mock.patch.object(m, 'main') as main:
            m.ci_entry(pr_quality=True)
            main.assert_called_once()
        _, blocked = self.blocked_receipt()
        env = {'GITHUB_EVENT_NAME': 'pull_request', 'GITHUB_REPOSITORY': 'robertovalerirv-beep/dove-bevo'}
        with mock.patch.dict(os.environ, env, clear=True), mock.patch.object(m, 'main', side_effect=blocked), mock.patch('sys.stdout', new_callable=io.StringIO) as output:
            m.ci_entry(pr_quality=True)
        self.assertIn('BLOCKED', output.getvalue())
        self.assertNotIn('public production probe passed', output.getvalue())
        for event, flag in [('push', True), ('pull_request', False)]:
            with mock.patch.dict(os.environ, {**env, 'GITHUB_EVENT_NAME': event}, clear=True), mock.patch.object(m, 'main', side_effect=blocked):
                with self.assertRaises(m.PublicProbeBlocked): m.ci_entry(pr_quality=flag)
        with mock.patch.dict(os.environ, env, clear=True), mock.patch.object(m, 'main', side_effect=RuntimeError('timeout/crash')):
            with self.assertRaisesRegex(RuntimeError, 'timeout/crash'): m.ci_entry(pr_quality=True)

    def test_invalid_receipt_owned_cleanup_or_artifacts_are_always_fatal(self):
        env = {'GITHUB_EVENT_NAME': 'pull_request', 'GITHUB_REPOSITORY': 'robertovalerirv-beep/dove-bevo'}
        for change in ['owned', 'missing-owned-cases', 'cleanup', 'receipt', 'evidence', 'stage']:
            result, blocked = self.blocked_receipt()
            if change == 'owned': result['owned'] = {'result': 'failed', 'tests': 34}
            if change == 'missing-owned-cases':
                result['owned']['cases'] = []
                (m.EVIDENCE / 'owned-instrumentation.json').write_text(json.dumps(result['owned']))
            if change == 'cleanup': result['cleanup'] = {'result': 'failed', 'errors': ['still running']}
            if change == 'stage': result['public_probe']['stage'] = 'native-rules'
            if change == 'evidence': (m.EVIDENCE / 'public-blocked-ui.xml').write_bytes(b'<hierarchy/>')
            (m.EVIDENCE / 'smoke-result.json').write_text('invalid' if change == 'receipt' else json.dumps(result))
            with mock.patch.dict(os.environ, env, clear=True), mock.patch.object(m, 'main', side_effect=blocked):
                with self.subTest(change=change), self.assertRaises((m.PublicProbeBlocked, ValueError)):
                    m.ci_entry(pr_quality=True)

    def test_receipt_write_failure_cannot_be_reclassified_as_public_block(self):
        _, blocked = self.blocked_receipt()
        # Main is tested through actual finalization; all Android collaborators are local doubles.
        def await_fixture(description, *args):
            if description == 'live website city-search control': raise blocked
            return m.ET.fromstring('<node bounds="[0,0][10,10]"/>')
        privacy = m.ET.fromstring('<hierarchy><node text="Roberto Valeri dovebevo@gmail.com"/></hierarchy>')
        with mock.patch.object(m, 'prepare_runtime'), mock.patch.object(m, 'port_open', return_value=False), \
             mock.patch.object(m, 'run'), mock.patch.object(m.subprocess, 'Popen', return_value=Proc(code=None)), \
             mock.patch.object(m, 'adb', return_value=subprocess.CompletedProcess([], 0, b'', b'')), \
             mock.patch.object(m, 'tree', return_value=privacy), mock.patch.object(m, 'screenshot'), \
             mock.patch.object(m, 'run_owned_instrumentation', return_value=m.owned_instrumentation(self.owned_output())), \
             mock.patch.object(m, 'wait_for', side_effect=await_fixture), mock.patch.object(m, 'cleanup_runtime', return_value=[]), \
             mock.patch.object(pathlib.Path, 'write_text', side_effect=OSError('receipt disk failed')), \
             mock.patch('sys.stdout', new_callable=io.StringIO):
            with self.assertRaisesRegex(OSError, 'receipt disk failed'): m.main()
        self.assertTrue(m.OWNED_PASS)

    def test_workflow_smoke_budget_is_bounded_inside_unchanged_job_and_sdk_limits(self):
        workflow = (root / '.github/workflows/mobile-apps.yml').read_text()
        android = workflow.split('\n  android:\n', 1)[1].split('\n  release-android:', 1)[0]
        # Read numeric limits from their actual job/step scopes, not unrelated occurrences.
        job_limits = re.findall(r'^    timeout-minutes: ([0-9]+)$', android, re.M)
        self.assertEqual(len(job_limits), 1)
        steps = re.split(r'(?=^      - )', android, flags=re.M)
        smoke_steps = [step for step in steps if 'python3 -B mobile-apps/scripts/android-smoke.py --pr-quality' in step]
        sdk_steps = [step for step in steps if '/sdkmanager"' in step]
        self.assertEqual(len(smoke_steps), 1)
        self.assertEqual(len(sdk_steps), 1)
        def step_limit(step):
            values = re.findall(r'^        timeout-minutes: ([0-9]+)$', step, re.M)
            self.assertEqual(len(values), 1)
            return int(values[0])
        smoke_minutes, sdk_minutes, job_minutes = step_limit(smoke_steps[0]), step_limit(sdk_steps[0]), int(job_limits[0])
        self.assertEqual((smoke_minutes, sdk_minutes, job_minutes), (18, 8, 25))
        self.assertLess(600, smoke_minutes * 60, 'Startup, public probing and cleanup have aggregate room')
        self.assertLess(smoke_minutes, job_minutes, 'The complete job remains the outer hard limit')
        self.assertNotIn('continue-on-error', smoke_steps[0])
        self.assertNotIn('|| true', smoke_steps[0])

    def test_workflow_keeps_required_job_and_release_dependency_without_blanket_override(self):
        workflow = (root / '.github/workflows/mobile-apps.yml').read_text()
        android = workflow.split('\n  android:\n', 1)[1].split('\n  release-android:', 1)[0]
        self.assertIn(':app:assembleDebugAndroidTest', android)
        self.assertIn('python3 -B mobile-apps/scripts/android-smoke.py --pr-quality', android)
        self.assertNotIn('continue-on-error', android)
        self.assertNotIn('|| true', android)
        self.assertIn('needs: [android, ios]', workflow)
if __name__ == '__main__':
    unittest.main()
