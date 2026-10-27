"""Metadata guard tests; these do not simulate successful Apple signing."""

from contextlib import redirect_stderr
import datetime as dt
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("release_support", Path(__file__).resolve().parents[1] / "release_support.py")
release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release)

NOW = dt.datetime(2026, 10, 26, tzinfo=dt.timezone.utc)
# Public fixture bytes exercise matching, never represent a valid certificate.
# The actual pipeline separately requires security's valid identity listing and
# real codesign verification. Shell fixtures below exercise only argument and
# preflight boundaries, never successful Apple signing.
CERTIFICATE = b"public metadata fixture; not a signing certificate"
FINGERPRINT = hashlib.sha1(CERTIFICATE).hexdigest().upper()


def profile():
    return {
        "UUID": "672E3C73-21B8-4B46-9ECF-A39A0CBCB4B9",
        "TeamIdentifier": ["9T359CV674"],
        "ApplicationIdentifierPrefix": ["9T359CV674"],
        "Platform": ["iOS"],
        "ExpirationDate": dt.datetime(2027, 10, 26),
        "DeveloperCertificates": [CERTIFICATE],
        "Entitlements": {
            "application-identifier": "9T359CV674.com.dovebevo.app",
            "com.apple.developer.team-identifier": "9T359CV674",
            "get-task-allow": False,
            "beta-reports-active": True,
        },
    }


class ReleaseProfileTests(unittest.TestCase):
    def test_exact_app_store_metadata_has_public_selection_fields(self):
        result = release.validated_profile(profile(), NOW)
        self.assertEqual(result["bundle"], "com.dovebevo.app")
        self.assertEqual(result["team"], "9T359CV674")
        self.assertEqual(result["certificateSHA1"], FINGERPRINT)
        self.assertNotIn("DeveloperCertificates", result)

    def test_wrong_team_bundle_prefix_platform_or_uuid_is_rejected(self):
        mutations = [
            ("TeamIdentifier", ["OTHERTEAM1"]),
            ("ApplicationIdentifierPrefix", ["OTHERTEAM1"]),
            ("Platform", ["OSX"]),
            ("UUID", "../../another-profile"),
        ]
        for key, value in mutations:
            with self.subTest(key=key):
                item = profile()
                item[key] = value
                with self.assertRaises(release.ReleaseValidationError):
                    release.validated_profile(item, NOW)
        for key, value in [
            ("application-identifier", "9T359CV674.com.another.app"),
            ("application-identifier", "9T359CV674.*"),
            ("com.apple.developer.team-identifier", "OTHERTEAM1"),
        ]:
            with self.subTest(entitlement=key, value=value):
                item = profile()
                item["Entitlements"][key] = value
                with self.assertRaises(release.ReleaseValidationError):
                    release.validated_profile(item, NOW)

    def test_expired_profile_or_missing_expiration_is_rejected(self):
        for expiration in [NOW, NOW - dt.timedelta(seconds=1), None, "2028-01-01"]:
            with self.subTest(expiration=expiration):
                item = profile()
                item["ExpirationDate"] = expiration
                with self.assertRaises(release.ReleaseValidationError):
                    release.validated_profile(item, NOW)

    def test_debug_ad_hoc_enterprise_and_non_store_profiles_are_rejected(self):
        for update in [
            {"ProvisionedDevices": ["test-device"]},
            {"ProvisionedDevices": []},
            {"ProvisionsAllDevices": True},
        ]:
            item = profile()
            item.update(update)
            with self.subTest(update=update), self.assertRaises(release.ReleaseValidationError):
                release.validated_profile(item, NOW)
        for key, value in [("get-task-allow", True), ("get-task-allow", 0), ("beta-reports-active", False)]:
            item = profile()
            item["Entitlements"][key] = value
            with self.subTest(key=key, value=value), self.assertRaises(release.ReleaseValidationError):
                release.validated_profile(item, NOW)

    def test_missing_or_ambiguous_profile_certificate_is_rejected(self):
        for certificates in [[], [b""], [CERTIFICATE, CERTIFICATE], ["not binary"]]:
            item = profile()
            item["DeveloperCertificates"] = certificates
            with self.subTest(certificates=certificates), self.assertRaises(release.ReleaseValidationError):
                release.validated_profile(item, NOW)

    def test_certificate_fingerprint_team_and_distribution_type_must_match(self):
        metadata = release.validated_profile(profile(), NOW)
        valid = f'  1) {FINGERPRINT} "Apple Distribution: Team Name (9T359CV674)"\n'
        self.assertEqual(release.select_identity(metadata, valid), FINGERPRINT)
        for identities in [
            valid.replace(FINGERPRINT, "0" * 40),
            valid.replace("Apple Distribution:", "Apple Development:"),
            valid.replace("9T359CV674", "OTHERTEAM1"),
            valid + valid,
            "0 valid identities found",
        ]:
            with self.subTest(identities=identities), self.assertRaises(release.ReleaseValidationError):
                release.select_identity(metadata, identities)

    def test_manual_export_pins_profile_and_certificate(self):
        metadata = release.validated_profile(profile(), NOW)
        options = release.export_options(metadata, FINGERPRINT)
        self.assertEqual(options["method"], "app-store-connect")
        self.assertEqual(options["signingStyle"], "manual")
        self.assertEqual(options["signingCertificate"], FINGERPRINT)
        self.assertEqual(options["provisioningProfiles"], {"com.dovebevo.app": profile()["UUID"]})
        self.assertFalse(options["manageAppVersionAndBuildNumber"])

    def test_internal_export_is_explicit_and_adds_only_the_internal_restriction(self):
        metadata = release.validated_profile(profile(), NOW)
        production = {
            "method": "app-store-connect", "destination": "export", "teamID": release.TEAM,
            "signingStyle": "manual", "signingCertificate": FINGERPRINT,
            "provisioningProfiles": {release.BUNDLE: profile()["UUID"]},
            "manageAppVersionAndBuildNumber": False, "stripSwiftSymbols": True, "uploadSymbols": True,
        }
        self.assertEqual(release.export_options(metadata, FINGERPRINT), production)
        self.assertEqual(release.export_options(metadata, FINGERPRINT, internal_only=False), production)
        self.assertEqual(release.export_options(metadata, FINGERPRINT, internal_only=True),
                         dict(production, testFlightInternalTestingOnly=True))


class ImportFailureTests(unittest.TestCase):
    def test_exact_apple_messages_emit_only_fixed_classification_and_catalog_status(self):
        cases = [
            ('MAC verification failed during PKCS12 import (wrong password?)', 'pkcs12-verification-failed', -25264),
            ('Unable to decode the provided data.', 'data-decode-failed', -26275),
            ('Unknown format in import.', 'import-format-unknown', -25257),
            ('Import/Export format unsupported.', 'import-format-unsupported', -25256),
            ('User interaction is not allowed.', 'interaction-not-allowed', -25308),
            ('The user name or passphrase you entered is not correct.', 'authentication-failed', -25293),
            ('The specified keychain could not be found.', 'keychain-not-found', -25294),
            ('The specified keychain is not a valid keychain file.', 'invalid-keychain', -25295),
            ('The specified item already exists in the keychain.', 'duplicate-item', -25299),
        ]
        for message, classification, status in cases:
            with self.subTest(classification=classification):
                raw = ('FABRICATED_PASSWORD_ONLY /private/fixture Identity Name\n'
                       f'security: SecKeychainItemImport: {message}\n'
                       '-----BEGIN PRIVATE KEY-----\nFABRICATED_KEY_ONLY\n-----END PRIVATE KEY-----\n').encode()
                self.assertEqual(release.classify_import_failure(raw),
                                 {'classification': classification, 'osStatus': status})

    def test_unknown_private_suffixes_spoofed_prefixes_and_conflicting_messages_are_discarded(self):
        known = b'security: SecKeychainItemImport: Unknown format in import.'
        for raw in [b'password=FABRICATED_PASSWORD_ONLY issuer=Fixture Name /private/fixture',
                    known + b' FABRICATED_PASSWORD_ONLY', b'private-prefix ' + known,
                    b'security: SecKeychainItemImport: Unknown error -12345678',
                    known + b'\nsecurity: SecKeychainItemImport: User interaction is not allowed.',
                    b'\xff\x00private data']:
            with self.subTest(raw=raw):
                self.assertEqual(release.classify_import_failure(raw), {'classification': 'unclassified-import-failure'})

    def test_oversize_input_and_unavailable_file_never_echo_raw_diagnostics(self):
        raw = b'security: SecKeychainItemImport: Unknown format in import.\n' + b'X' * 16384
        self.assertEqual(release.classify_import_failure(raw), {'classification': 'diagnostic-too-large'})
        class BoundedStream(io.BytesIO):
            def read(self, count):
                self.count = count
                return super().read(count)
        stream = BoundedStream(raw)
        with patch.object(Path, 'open', return_value=stream):
            self.assertEqual(release.import_failure_summary(Path('fabricated-private-file')),
                             {'classification': 'diagnostic-too-large'})
        self.assertEqual(stream.count, 16385)
        with patch.object(Path, 'open', side_effect=OSError('FABRICATED_PASSWORD_ONLY /private/fixture')):
            self.assertEqual(release.import_failure_summary(Path('fabricated-private-file')),
                             {'classification': 'diagnostic-unavailable'})


class ImportFailureShellTests(unittest.TestCase):
    def test_actual_import_failure_block_hides_raw_output_stops_and_cleans_even_if_classifier_fails(self):
        git_bash = Path(os.environ.get('ProgramFiles', 'C:/Program Files')) / 'Git/bin/bash.exe'
        bash = str(git_bash) if git_bash.is_file() else shutil.which('bash')
        if not bash:
            self.skipTest('Bash is unavailable')
        script = Path(__file__).resolve().parents[1] / 'release-ios.sh'
        source = script.read_text()
        handler = 'cleanup() {' + source.split('cleanup() {', 1)[1].split('\ntrap cleanup EXIT', 1)[0]
        import_block = 'if ! { security import ' + source.split('if ! { security import ', 1)[1].split('\nunset DOVEBEVO_SIGNING_PASSWORD', 1)[0]
        fail = next(line for line in source.splitlines() if line.startswith('fail() {'))
        root = script.parent.parent / '.build' / 'import-failure-tests'
        root.mkdir(parents=True, exist_ok=True)
        for classifier_failure in [False, True]:
            with self.subTest(classifier_failure=classifier_failure), tempfile.TemporaryDirectory(dir=root) as working:
                folder = Path(working).resolve()
                self.assertTrue(folder.is_relative_to(root.resolve()))
                private = folder / 'private'
                private.mkdir()
                (private / 'dovebevo.keychain-db').write_bytes(b'public fixture; not a keychain')
                fixture = '''#!/usr/bin/env bash
set -euo pipefail
umask 077
record() { printf '%s\\n' "$*" >> "$PWD/actions.txt"; }
private_dir="$PWD/private"
task_keychain="$private_dir/dovebevo.keychain-db"
keychain_attempted=true
search_list_changed=false
RUNNER_TEMP="$PWD"
REPO_ROOT="$PWD"
DOVEBEVO_SIGNING_PASSWORD=FABRICATED_PASSWORD_ONLY
security() {
    case "$1" in
        import)
            record 'security import'
            [[ "$#" == 8 && "$2" == "$private_dir/distribution.p12" && "$3" == -k && "$4" == "$task_keychain"
               && "$5" == -P && "$6" == FABRICATED_PASSWORD_ONLY && "$7" == -T && "$8" == /usr/bin/codesign ]] || return 99
            printf 'FABRICATED_STDOUT_ONLY\\n'
            printf 'FABRICATED_PASSWORD_ONLY /private/fixture Identity Name\\nsecurity: SecKeychainItemImport: Unknown format in import.\\n' >&2
            return 1 ;;
        delete-keychain)
            record 'security delete-keychain'
            [[ "$2" == "$PWD/private/dovebevo.keychain-db" ]] || return 99
            rm -- "$2" ;;
        *) record 'unexpected security operation'; return 99 ;;
    esac
}
python3() {
    case "$2" in
        import-failure)
            record 'classify import failure'
            if [[ "$FIXTURE_CLASSIFIER_FAILURE" == true ]]; then return 91; fi
            "$FIXTURE_PYTHON" "$SUPPORT" import-failure "$3" ;;
        cleanup-profile) record 'cleanup-profile' ;;
        cleanup-private)
            record 'cleanup-private'
            [[ "$3" == "$PWD/private" ]] || return 99
            rm -f -- "$3/security-import-error.txt"
            rmdir -- "$3" ;;
        *) record 'unexpected helper operation'; return 99 ;;
    esac
}
''' + fail + '\n' + handler + '\ntrap cleanup EXIT\n' + import_block + "\nrecord 'unexpected build continued'\n"
                (folder / 'fixture.sh').write_text(fixture, encoding='utf-8', newline='\n')
                env = {key: os.environ[key] for key in ['PATH', 'SystemRoot', 'WINDIR'] if key in os.environ}
                env.update(SUPPORT=Path(release.__file__).resolve().as_posix(), FIXTURE_PYTHON=release.sys.executable.replace('\\', '/'),
                           FIXTURE_CLASSIFIER_FAILURE=str(classifier_failure).lower())
                result = subprocess.run([bash, 'fixture.sh'], cwd=folder, env=env,
                                        capture_output=True, text=True, timeout=10)
                self.assertEqual(result.returncode, 1, result.stderr)
                public_output = result.stdout + result.stderr
                for private_value in ['FABRICATED_', '/private/fixture', 'Identity Name', str(folder)]:
                    self.assertNotIn(private_value, public_output)
                if not classifier_failure:
                    self.assertIn('"classification": "import-format-unknown"', public_output)
                    self.assertIn('"osStatus": -25257', public_output)
                self.assertEqual((folder / 'actions.txt').read_text().splitlines(),
                                 ['security import', 'classify import failure', 'cleanup-profile',
                                  'security delete-keychain', 'cleanup-private'])
                self.assertFalse(private.exists())


class DistributionModeTests(unittest.TestCase):
    def test_helper_rejects_duplicate_abbreviated_unknown_and_misplaced_mode_flags(self):
        for arguments in [["options", "--internal-only", "--internal-only"],
                          ["options", "--internal"], ["options", "--unknown"],
                          ["decode", "--internal-only"]]:
            with self.subTest(arguments=arguments), patch.object(release.sys, "argv", ["release_support.py"] + arguments), \
                    patch.object(release, "decode_secrets") as decode, redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit) as failure:
                    release.main()
                self.assertEqual(failure.exception.code, 2)
                decode.assert_not_called()

    def test_cli_options_and_manifest_agree_on_explicit_distribution_scope(self):
        directory = Path(__file__).resolve().parents[2] / ".build" / "metadata-tests"
        directory.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=directory) as working:
            folder = Path(working)
            metadata = release.validated_profile(profile(), NOW)
            metadata_file = folder / "profile.json"
            metadata_file.write_text(json.dumps(metadata), encoding="utf-8")
            ipa = folder / "fixture.ipa"
            ipa.write_bytes(b"public fixture bytes; not a signed IPA")
            for internal in [False, True]:
                with self.subTest(internal=internal):
                    flag = ["--internal-only"] if internal else []
                    options_file, manifest_file = folder / "options.plist", folder / "manifest.json"
                    with patch.object(release.sys, "argv", ["release_support.py", "options", str(metadata_file),
                                                           FINGERPRINT, str(options_file)] + flag):
                        release.main()
                    options = plistlib.loads(options_file.read_bytes())
                    self.assertEqual(options.get("testFlightInternalTestingOnly", False), internal)
                    if not internal:
                        self.assertNotIn("testFlightInternalTestingOnly", options)
                    with patch.object(release.sys, "argv", ["release_support.py", "manifest", str(ipa),
                                                           str(manifest_file), str(metadata_file), "19", "a" * 40] + flag):
                        release.main()
                    manifest = json.loads(manifest_file.read_text())
                    self.assertEqual(manifest, {
                        "bundleIdentifier": release.BUNDLE, "teamIdentifier": release.TEAM,
                        "buildNumber": "19", "sourceCommit": "a" * 40,
                        "ipaSHA256": hashlib.sha256(ipa.read_bytes()).hexdigest(),
                        "profileUUID": metadata["uuid"], "profileExpiresAt": metadata["expiresAt"],
                        "signingCertificateSHA1": metadata["certificateSHA1"],
                        "signaturesVerified": True, "uploadRequested": False,
                        "distributionScope": "internal-only" if internal else "app-store",
                    })


class ReleaseShellModeTests(unittest.TestCase):
    def run_mode(self, arguments, help_text="testFlightInternalTestingOnly : Bool", help_status=0, whole_script=False):
        # Exercise the real argument/preflight prefix and forwarding calls only.
        # No certificate decoder, keychain, signing, Apple binary or upload runs.
        git_bash = Path(os.environ.get("ProgramFiles", "C:/Program Files")) / "Git/bin/bash.exe"
        bash = str(git_bash) if git_bash.is_file() else shutil.which("bash")
        if not bash:
            self.skipTest("Bash is unavailable")
        script = Path(__file__).resolve().parents[1] / "release-ios.sh"
        source = script.read_text()
        prefix = source.split("\nprivate_dir=''", 1)[0]
        options_call = next(line for line in source.splitlines() if line.startswith('python3 "$SUPPORT" options '))
        manifest_call = 'python3 "$SUPPORT" manifest ' + source.split('python3 "$SUPPORT" manifest ', 1)[1].split('\n\nif [[ "$UPLOAD"', 1)[0]
        root = script.parent.parent / ".build" / "release-mode-tests"
        root.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=root) as working:
            folder = Path(working)
            fixture = '''#!/usr/bin/env bash
record() { printf '%s\\n' "$*" >> "$PWD/actions.txt"; }
uname() { printf 'Darwin\\n'; }
git() { printf '%s\\n' "$PWD"; }
xcrun() { record "xcrun $*"; printf '26.2\\n'; }
xcodebuild() {
    record "xcodebuild $*"
    if [[ "$1" == -version ]]; then printf 'Xcode 26.3\\n'; return 0; fi
    printf '%s\\n' "$FIXTURE_HELP"
    return "$FIXTURE_HELP_STATUS"
}
python3() { record "python3 $*"; return "$FIXTURE_PYTHON_STATUS"; }
security() { record 'unexpected security operation'; return 99; }
openssl() { record 'unexpected openssl operation'; return 99; }
codesign() { record 'unexpected codesign operation'; return 99; }
ditto() { record 'unexpected ditto operation'; return 99; }
'''
            mode_fixture = prefix + '''
printf 'accepted upload=%s internal=%s\\n' "$UPLOAD" "$INTERNAL_ONLY"
private_dir=private-fixture
IDENTITY=public-fingerprint-fixture
BUILD_NUMBER=19
COMMIT=public-commit-fixture
IPA=public-ipa-fixture
''' + options_call + '\n' + manifest_call + '\n'
            fixture += source if whole_script else mode_fixture
            (folder / "fixture.sh").write_text(fixture, encoding="utf-8", newline="\n")
            env = {key: os.environ[key] for key in ["PATH", "SystemRoot", "WINDIR"] if key in os.environ}
            env.update(RUNNER_TEMP=str(folder), FIXTURE_HELP=help_text, FIXTURE_HELP_STATUS=str(help_status),
                       FIXTURE_PYTHON_STATUS='97' if whole_script else '0')
            result = subprocess.run([bash, "fixture.sh"] + arguments, cwd=folder, env=env,
                                    capture_output=True, text=True, timeout=10)
            actions = (folder / "actions.txt").read_text() if (folder / "actions.txt").exists() else ""
            return result, actions

    def test_default_and_both_internal_upload_orders_forward_the_exact_mode(self):
        for arguments, internal, upload in [([], False, False), (["--upload"], False, True),
                                            (["--internal-only"], True, False),
                                            (["--internal-only", "--upload"], True, True),
                                            (["--upload", "--internal-only"], True, True)]:
            with self.subTest(arguments=arguments):
                result, actions = self.run_mode(arguments)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn(f'accepted upload={str(upload).lower()} internal={str(internal).lower()}', result.stdout)
                self.assertEqual('xcodebuild -help' in actions, internal)
                calls = [line for line in actions.splitlines() if line.startswith('python3 ')]
                self.assertEqual(len(calls), 2)
                for call in calls:
                    self.assertEqual(call.endswith(' --internal-only'), internal)

    def test_unknown_and_duplicate_release_flags_fail_before_tool_calls(self):
        for arguments in [["--unknown"], ["--upload", "--upload"], ["--internal-only", "--internal-only"],
                          ["--upload", "--internal-only", "--upload"]]:
            with self.subTest(arguments=arguments):
                result, actions = self.run_mode(arguments)
                self.assertEqual(result.returncode, 2, result.stderr)
                self.assertEqual(actions, "")

    def test_internal_mode_requires_successful_exact_installed_help_before_credentials(self):
        for help_text, status in [("unsupported", 0), ("someOtherKey : Bool", 0),
                                  ("testFlightInternalTestingOnlySuffix : Bool", 0),
                                  ("testFlightInternalTestingOnly : String", 0),
                                  ("testFlightInternalTestingOnly : Bool", 1)]:
            with self.subTest(help_text=help_text, status=status):
                result, actions = self.run_mode(["--internal-only"], help_text, status)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('xcodebuild -help', actions)
                self.assertNotIn('python3 ', actions)
                self.assertNotIn('unexpected ', actions)

    def test_whole_release_script_stops_before_private_dir_or_signing_when_help_is_unsupported(self):
        for help_text, status in [('unsupported', 0), ('testFlightInternalTestingOnly : Bool', 1)]:
            with self.subTest(help_text=help_text, status=status):
                result, actions = self.run_mode(['--internal-only', '--upload'], help_text, status, whole_script=True)
                self.assertEqual(result.returncode, 1, result.stderr)
                self.assertIn('xcodebuild -help', actions)
                self.assertNotIn('python3 ', actions)
                self.assertNotIn('unexpected ', actions)
                self.assertNotIn('-project', actions)
                self.assertNotIn('-exportArchive', actions)
        result, actions = self.run_mode(['--internal-only', '--upload'], whole_script=True)
        self.assertEqual(result.returncode, 97, result.stderr)
        python_calls = [line for line in actions.splitlines() if line.startswith('python3 ')]
        self.assertEqual(len(python_calls), 1)
        self.assertIn(' private-dir ', python_calls[0])
        self.assertNotIn(' decode ', actions)
        self.assertNotIn('unexpected ', actions)


class UploadOutcomeTests(unittest.TestCase):
    def test_attempt_remains_uncertain_until_command_success_is_recorded(self):
        directory = Path(__file__).resolve().parents[2] / ".build" / "metadata-tests"
        directory.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=directory) as working:
            manifest = Path(working) / "manifest.json"
            manifest.write_text(json.dumps({"uploadRequested": False}), encoding="utf-8")
            with patch.object(release.sys, "argv", ["release_support.py", "upload-attempt", str(manifest)]):
                release.main()
            attempted = json.loads(manifest.read_text())
            self.assertTrue(attempted["uploadRequested"])
            self.assertIsNone(attempted["uploadCommandSucceeded"])
            self.assertFalse(attempted["appStoreProcessingVerified"])
            with patch.object(release.sys, "argv", ["release_support.py", "upload-receipt", str(manifest)]):
                release.main()
            succeeded = json.loads(manifest.read_text())
            self.assertTrue(succeeded["uploadCommandSucceeded"])
            self.assertFalse(succeeded["appStoreProcessingVerified"])


if __name__ == "__main__":
    unittest.main()
