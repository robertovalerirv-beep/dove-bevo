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
UUID_CASES = ['672e3c73-21b8-4b46-9ecf-a39a0cbcb4b9', '672e3C73-21B8-4b46-9EcF-A39A0cBcB4B9']


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
    def test_original_uuid_spelling_is_preserved_in_metadata_and_export_pin(self):
        for value in UUID_CASES:
            with self.subTest(uuid=value):
                source = profile()
                source['UUID'] = value
                metadata = release.validated_profile(source, NOW)
                self.assertEqual(metadata['uuid'], value)
                self.assertEqual(release.export_options(metadata, FINGERPRINT)['provisioningProfiles'], {release.BUNDLE: value})

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


class ProfileInstallationTests(unittest.TestCase):
    def setUp(self):
        root = Path(__file__).resolve().parents[2] / ".build" / "profile-install-tests"
        root.mkdir(parents=True, exist_ok=True)
        temporary = tempfile.TemporaryDirectory(dir=root)
        self.addCleanup(temporary.cleanup)
        self.folder = Path(temporary.name)
        self.home = self.folder / "home"
        self.home.mkdir()
        self.private = self.folder / "private"
        self.private.mkdir()
        self.checkout = self.folder / "checkout"
        self.checkout.mkdir()
        self.data = b"public fixture bytes; not a signed provisioning profile"
        (self.private / "distribution.mobileprovision").write_bytes(self.data)
        self.metadata = release.validated_profile(profile(), NOW)
        self.targets = [
            self.home / "Library/Developer/Xcode/UserData/Provisioning Profiles" / (profile()["UUID"] + ".mobileprovision"),
            self.home / "Library/MobileDevice/Provisioning Profiles" / (profile()["UUID"] + ".mobileprovision"),
        ]
        home = patch.object(Path, "home", return_value=self.home)
        home.start()
        self.addCleanup(home.stop)
        # All public dummy IO stays in the selected project folder. Mock only
        # the OS-storage location boundary for these fixtures; exercise its real
        # checkout/OneDrive refusals separately below. Symlink checks stay real.
        self.storage_guard = release.validate_profile_storage
        storage = patch.object(release, "validate_profile_storage")
        storage.start()
        self.addCleanup(storage.stop)

    def install(self):
        release.install_profile(self.private, self.metadata, self.checkout)

    def existing(self, target, data=None):
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(self.data if data is None else data)
        return target.stat()

    def journal(self):
        return json.loads((self.private / "installed-profile.json").read_text())

    def test_both_fixed_locations_get_identical_uuid_and_bytes_then_owned_cleanup(self):
        self.install()
        for target in self.targets:
            self.assertEqual(target.read_bytes(), self.data)
        state = self.journal()
        self.assertEqual(state["version"], 2)
        self.assertEqual({item["path"] for item in state["profiles"]}, {str(path) for path in self.targets})
        self.assertTrue(all(item["sha256"] == hashlib.sha256(self.data).hexdigest() for item in state["profiles"]))
        release.cleanup_profile(self.private)
        self.assertTrue(all(not path.exists() for path in self.targets))
        release.cleanup_profile(self.private)  # Missing owned files are safe.

    def test_lowercase_and_mixed_uuid_filenames_and_owned_cleanup_preserve_original_spelling(self):
        for value in UUID_CASES:
            with self.subTest(uuid=value):
                source = profile()
                source['UUID'] = value
                self.metadata = release.validated_profile(source, NOW)
                self.install()
                for target in self.targets:
                    self.assertEqual([path.name for path in target.parent.iterdir()], [value + '.mobileprovision'])
                    self.assertEqual((target.parent / (value + '.mobileprovision')).read_bytes(), self.data)
                self.assertTrue(all(Path(item['path']).name == value + '.mobileprovision' for item in self.journal()['profiles']))
                release.cleanup_profile(self.private)
                self.assertTrue(all(not list(target.parent.iterdir()) for target in self.targets))

    def test_identical_preexisting_profiles_are_preserved_and_never_owned(self):
        identities = [self.existing(path).st_ino for path in self.targets]
        self.install()
        self.assertEqual(self.journal()["profiles"], [])
        release.cleanup_profile(self.private)
        for target, inode in zip(self.targets, identities):
            self.assertEqual(target.read_bytes(), self.data)
            self.assertEqual(target.stat().st_ino, inode)

    def test_cleanup_removes_only_new_location_when_other_profile_already_matches(self):
        self.existing(self.targets[0])
        self.install()
        release.cleanup_profile(self.private)
        self.assertEqual(self.targets[0].read_bytes(), self.data)
        self.assertFalse(self.targets[1].exists())

    def test_collision_in_second_location_is_rejected_before_any_profile_write(self):
        self.existing(self.targets[1], b"different public fixture")
        with self.assertRaisesRegex(release.ReleaseValidationError, "collides"):
            self.install()
        self.assertFalse(self.targets[0].exists())
        self.assertEqual(self.targets[1].read_bytes(), b"different public fixture")
        self.assertFalse((self.private / "installed-profile.json").exists())

    def test_directory_and_target_symlinks_are_rejected_before_install(self):
        original = Path.is_symlink
        # The filesystem symlink boundary is simulated so Windows does not need
        # administrator/developer-mode symlink permission for this negative test.
        for linked in [self.targets[1].parent, self.targets[1]]:
            with self.subTest(linked=linked), patch.object(Path, "is_symlink", new=lambda path: path == linked or original(path)):
                with self.assertRaisesRegex(release.ReleaseValidationError, "symlink"):
                    self.install()
                self.assertTrue(all(not path.exists() for path in self.targets))

    def test_second_partial_write_is_journalled_before_write_and_all_owned_files_clean(self):
        write = os.write
        calls = []

        def interrupted(descriptor, data):
            owned = next(item for item in self.journal()["profiles"]
                         if item["inode"] == os.fstat(descriptor).st_ino)
            self.assertEqual(owned["sha256"], hashlib.sha256(b"").hexdigest())
            calls.append(owned["path"])
            if len(calls) == 2:
                write(descriptor, data[:7])
                raise OSError("public fixture partial-write failure")
            return write(descriptor, data)

        with patch.object(release.os, "write", side_effect=interrupted):
            with self.assertRaisesRegex(OSError, "partial-write"):
                self.install()
        self.assertEqual(calls, [str(path) for path in self.targets])
        self.assertEqual(self.journal()["profiles"][1]["sha256"], hashlib.sha256(self.data[:7]).hexdigest())
        self.assertTrue(all(not path.exists() for path in self.targets))
        release.cleanup_profile(self.private)

    def test_failure_opening_second_location_cleans_first_and_preserves_new_collision(self):
        open_file = os.open

        def collision(path, flags, *args, **kwargs):
            if Path(path) == self.targets[1] and flags & os.O_CREAT:
                self.existing(self.targets[1], b"concurrent public replacement")
            return open_file(path, flags, *args, **kwargs)

        with patch.object(release.os, "open", side_effect=collision):
            with self.assertRaises(FileExistsError):
                self.install()
        self.assertFalse(self.targets[0].exists())
        self.assertEqual(self.targets[1].read_bytes(), b"concurrent public replacement")

    def test_journal_failure_before_first_write_cleans_empty_owned_file(self):
        save = release.save_profile_journal
        count = 0

        def fail_after_creation(directory, profiles):
            nonlocal count
            count += 1
            if count == 2:
                raise OSError("public fixture journal failure")
            save(directory, profiles)

        with patch.object(release, "save_profile_journal", side_effect=fail_after_creation):
            with self.assertRaisesRegex(OSError, "journal failure"):
                self.install()
        self.assertTrue(all(not path.exists() for path in self.targets))

    def test_cleanup_preserves_replaced_inode_but_still_cleans_other_owned_location(self):
        self.install()
        replacement = self.folder / "replacement.mobileprovision"
        replacement.write_bytes(self.data)
        replacement.replace(self.targets[0])
        with self.assertRaisesRegex(release.ReleaseValidationError, "preserving replacement"):
            release.cleanup_profile(self.private)
        self.assertEqual(self.targets[0].read_bytes(), self.data)
        self.assertFalse(self.targets[1].exists())

    def test_cleanup_preserves_changed_bytes_on_same_inode(self):
        self.install()
        original_inode = self.targets[0].stat().st_ino
        self.targets[0].write_bytes(b"changed public fixture")
        self.assertEqual(self.targets[0].stat().st_ino, original_inode)
        with self.assertRaisesRegex(release.ReleaseValidationError, "preserving replacement"):
            release.cleanup_profile(self.private)
        self.assertEqual(self.targets[0].read_bytes(), b"changed public fixture")
        self.assertFalse(self.targets[1].exists())

    def test_cleanup_rejects_symlink_replacement_and_cleans_other_location(self):
        self.install()
        original = Path.is_symlink
        with patch.object(Path, "is_symlink", new=lambda path: path == self.targets[0] or original(path)):
            with self.assertRaisesRegex(release.ReleaseValidationError, "preserving replacement"):
                release.cleanup_profile(self.private)
        self.assertEqual(self.targets[0].read_bytes(), self.data)
        self.assertFalse(self.targets[1].exists())

    def test_cleanup_accepts_previous_single_profile_journal(self):
        self.install()
        state = self.journal()["profiles"][0]
        self.targets[1].unlink()
        (self.private / "installed-profile.json").write_text(json.dumps(state))
        release.cleanup_profile(self.private)
        self.assertFalse(self.targets[0].exists())

    def test_real_storage_guard_rejects_checkout_and_onedrive_without_any_io(self):
        with self.assertRaisesRegex(release.ReleaseValidationError, "inside the checkout"):
            self.storage_guard(self.checkout / "profiles", self.checkout)
        with self.assertRaisesRegex(release.ReleaseValidationError, "OneDrive"):
            # Hosted macOS checkouts are outside OneDrive; name it explicitly.
            self.storage_guard(self.home / "OneDrive - Public Fixture" / "profiles", self.checkout)

    def test_uuid_cannot_override_fixed_profile_destination(self):
        self.metadata["uuid"] = "../../another-profile"
        with self.assertRaisesRegex(release.ReleaseValidationError, "Invalid profile UUID"):
            self.install()
        self.assertTrue(all(not path.exists() for path in self.targets))


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


XCODE_HELP = """testFlightInternalTestingOnly : Bool
    -allowProvisioningUpdates
    -authenticationKeyPath <path>
    -authenticationKeyID <keyID>
    -authenticationKeyIssuerID <issuerID>
"""


class ReleaseShellModeTests(unittest.TestCase):
    def run_mode(self, arguments, help_text=XCODE_HELP, help_status=0, whole_script=False):
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
                self.assertEqual('xcodebuild -help' in actions, internal or upload)
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

    def test_upload_requires_each_exact_authentication_capability_before_private_inputs(self):
        flags = ['-allowProvisioningUpdates', '-authenticationKeyPath',
                 '-authenticationKeyID', '-authenticationKeyIssuerID']
        for flag in flags:
            for replacement in ['', flag + 'Suffix']:
                help_text = '\n'.join(line for line in XCODE_HELP.splitlines() if not line.strip().startswith(flag + ' ') and line.strip() != flag)
                help_text += '\n    ' + replacement
                with self.subTest(flag=flag, replacement=replacement):
                    result, actions = self.run_mode(['--upload'], help_text, whole_script=True)
                    self.assertEqual(result.returncode, 1, result.stderr)
                    self.assertIn('xcodebuild -help', actions)
                    self.assertNotIn('python3 ', actions)
                    self.assertNotIn('unexpected ', actions)
                    self.assertNotIn('-project', actions)
        result, actions = self.run_mode(['--upload'], XCODE_HELP, 1, whole_script=True)
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertNotIn('python3 ', actions)

    def test_no_upload_does_not_require_authentication_capabilities(self):
        for arguments, help_text in [([], 'unsupported'),
                                     (['--internal-only'], 'testFlightInternalTestingOnly : Bool')]:
            with self.subTest(arguments=arguments):
                result, actions = self.run_mode(arguments, help_text)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertNotIn('unexpected ', actions)


class ArchiveAuthenticationTests(unittest.TestCase):
    def run_archive_boundary(self, arguments, cleanup_failure=False, search_identity='matching', profile_uuid=None):
        # Run the real script up to a simulated archive failure and its EXIT
        # trap. Apple tools and private decoding are replaced at their command
        # boundaries; all files are public fixtures in the selected workspace.
        git_bash = Path(os.environ.get('ProgramFiles', 'C:/Program Files')) / 'Git/bin/bash.exe'
        bash = str(git_bash) if git_bash.is_file() else shutil.which('bash')
        if not bash:
            self.skipTest('Bash is unavailable')
        script = Path(__file__).resolve().parents[1] / 'release-ios.sh'
        source = script.read_text()
        # Isolate only the output directory; preserve the release's control flow.
        source = source.replace('RELEASE_ROOT="$IOS_ROOT/.build/release"', 'RELEASE_ROOT="$PWD/release"')
        root = script.parent.parent / '.build' / 'archive-auth-tests'
        root.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=root) as working:
            folder = Path(working)
            (folder / 'private fixture').mkdir()
            profile_input = profile()
            profile_input['UUID'] = profile_uuid or profile_input['UUID']
            (folder / 'private fixture' / 'profile.json').write_text(json.dumps(release.validated_profile(profile_input, NOW)))
            fixture = r'''#!/usr/bin/env bash
record() { printf '%s\n' "$*" >> "$PWD/actions.txt"; }
uname() { printf 'Darwin\n'; }
git() { printf '%s\n' "$PWD"; }
xcrun() { printf '26.2\n'; }
xcodebuild() {
    if [[ "$1" == -version ]]; then printf 'Xcode 26.3\n'; return 0; fi
    if [[ "$1" == -help ]]; then printf '%s\n' "$FIXTURE_HELP"; return 0; fi
    [[ -z "${DOVEBEVO_ASC_PRIVATE_KEY+x}" && -z "${DOVEBEVO_IOS_CERTIFICATE_BASE64+x}"
       && -z "${DOVEBEVO_IOS_PROFILE_BASE64+x}" && -z "${DOVEBEVO_SIGNING_PASSWORD+x}" ]] || return 88
    record 'archive'
    printf '%s\0' "$@" > "$PWD/archive-args.bin"
    return 77
}
openssl() {
    if [[ "$1" == pkcs12 ]]; then printf 'Shrouded Keybag\n'; return 0; fi
    if [[ "$1" == rand ]]; then printf 'public-keychain-password-fixture\n'; return 0; fi
    [[ "$1" == pkey && "$2" == -in && "$3" == "$private_dir/private_keys/AuthKey_PUBLIC1234.p8"
       && -z "${DOVEBEVO_ASC_PRIVATE_KEY+x}" ]] || return 89
    record 'validated existing private key path'
}
python3() {
    if [[ "$1" == -c ]]; then "$FIXTURE_PYTHON" "$@"; return; fi
    case "$2" in
        private-dir) printf '%s/private fixture\n' "$PWD" ;;
        decode|profile|install|keychain-list) record "$2" ;;
        options) record 'options'; shift; "$FIXTURE_PYTHON" "$FIXTURE_SUPPORT" "$@" ;;
        identity)
            if [[ "$4" == "$private_dir/search-list-identities.txt" ]]; then
                record 'validate-user-search-list-identity'
                if [[ "$FIXTURE_SEARCH_IDENTITY" == different ]]; then printf '0000000000000000000000000000000000000000\n'; return 0; fi
                if [[ "$FIXTURE_SEARCH_IDENTITY" == helper-error ]]; then printf 'FABRICATED_HELPER_PRIVATE_ONLY\n' >&2; return 95; fi
            fi
            "$FIXTURE_PYTHON" "$FIXTURE_SUPPORT" identity "$3" "$4" ;;
        cleanup-profile) record 'cleanup-profile'; return "$FIXTURE_CLEANUP_STATUS" ;;
        cleanup-private) record 'cleanup-private' ;;
        *) record 'unexpected helper'; return 99 ;;
    esac
}
security() {
    if [[ "$1" == find-identity ]]; then
        if [[ "$#" == 4 ]]; then
            record 'query-user-search-list-identity'
            case "$FIXTURE_SEARCH_IDENTITY" in
                missing) printf '0 valid identities found\n'; return 0 ;;
                ambiguous) printf '1) %s "Apple Distribution: Public Fixture (9T359CV674)"\n' "$FIXTURE_FINGERPRINT" ;;
                security-error) printf 'FABRICATED_SECURITY_PRIVATE_ONLY\n' >&2; return 94 ;;
            esac
        fi
        printf '1) %s "Apple Distribution: Public Fixture (9T359CV674)"\n' "$FIXTURE_FINGERPRINT"
        return 0
    fi
    case "$1" in
        cms|create-keychain|set-keychain-settings|unlock-keychain|import|set-key-partition-list|find-identity|list-keychains) return 0 ;;
        *) record 'unexpected security'; return 99 ;;
    esac
}
codesign() { record 'unexpected codesign'; return 99; }
ditto() { record 'unexpected ditto'; return 99; }
bash() { record 'generate-project'; }
''' + source
            (folder / 'fixture.sh').write_text(fixture, encoding='utf-8', newline='\n')
            env = {key: os.environ[key] for key in ['PATH', 'SystemRoot', 'WINDIR'] if key in os.environ}
            env.update(RUNNER_TEMP=str(folder), FIXTURE_HELP=XCODE_HELP,
                       FIXTURE_CLEANUP_STATUS='93' if cleanup_failure else '0',
                       DOVEBEVO_ASC_PRIVATE_KEY='FABRICATED_KEY_ONLY',
                       DOVEBEVO_IOS_CERTIFICATE_BASE64='FABRICATED_CERTIFICATE_ONLY',
                       DOVEBEVO_IOS_PROFILE_BASE64='FABRICATED_PROFILE_ONLY',
                       DOVEBEVO_SIGNING_PASSWORD='FABRICATED_PASSWORD_ONLY',
                       FIXTURE_SEARCH_IDENTITY=search_identity, FIXTURE_FINGERPRINT=FINGERPRINT,
                       FIXTURE_PYTHON=release.sys.executable.replace('\\', '/'),
                       FIXTURE_SUPPORT=Path(release.__file__).resolve().as_posix())
            if '--upload' in arguments:
                env.update(DOVEBEVO_ASC_KEY_ID='PUBLIC1234',
                           DOVEBEVO_ASC_ISSUER_ID='00000000-0000-0000-0000-000000000001')
            result = subprocess.run([bash, 'fixture.sh'] + arguments, cwd=folder, env=env,
                                    capture_output=True, text=True, timeout=10)
            args_file = folder / 'archive-args.bin'
            argv = args_file.read_bytes().decode().rstrip('\0').split('\0') if args_file.exists() else []
            actions = (folder / 'actions.txt').read_text().splitlines() if (folder / 'actions.txt').exists() else []
            options = folder / 'private fixture' / 'ExportOptions.plist'
            self.last_export_options = plistlib.loads(options.read_bytes()) if options.exists() else None
            return result, argv, actions

    def test_archive_and_export_use_original_lowercase_and_mixed_uuid_pins(self):
        for value in UUID_CASES:
            with self.subTest(uuid=value):
                result, argv, actions = self.run_archive_boundary(['--upload'], profile_uuid=value)
                self.assertEqual(result.returncode, 77, result.stderr)
                self.assertIn('PROVISIONING_PROFILE_SPECIFIER=' + value, argv)
                self.assertEqual(self.last_export_options['provisioningProfiles'], {release.BUNDLE: value})

    def test_only_upload_archive_receives_existing_key_and_provisioning_flags_with_manual_pins(self):
        for arguments in [[], ['--internal-only'], ['--upload'], ['--internal-only', '--upload']]:
            with self.subTest(arguments=arguments):
                result, argv, actions = self.run_archive_boundary(arguments)
                self.assertEqual(result.returncode, 77, result.stderr)
                for pin in ['CODE_SIGN_STYLE=Manual', 'DEVELOPMENT_TEAM=9T359CV674',
                            f'CODE_SIGN_IDENTITY={FINGERPRINT}',
                            'PROVISIONING_PROFILE_SPECIFIER=672E3C73-21B8-4B46-9ECF-A39A0CBCB4B9',
                            'CODE_SIGNING_ALLOWED=YES', 'CODE_SIGNING_REQUIRED=YES']:
                    self.assertIn(pin, argv)
                self.assertEqual(argv[-1], 'archive')
                self.assertNotIn('', argv)
                for flag in ['-allowProvisioningUpdates', '-authenticationKeyPath',
                             '-authenticationKeyID', '-authenticationKeyIssuerID']:
                    self.assertEqual(argv.count(flag), 1 if '--upload' in arguments else 0)
                if '--upload' in arguments:
                    key_path = argv[argv.index('-authenticationKeyPath') + 1]
                    self.assertTrue(key_path.endswith('/private fixture/private_keys/AuthKey_PUBLIC1234.p8'))
                    self.assertEqual(argv[argv.index('-authenticationKeyID') + 1], 'PUBLIC1234')
                    self.assertEqual(argv[argv.index('-authenticationKeyIssuerID') + 1], '00000000-0000-0000-0000-000000000001')
                    self.assertIn('validated existing private key path', actions)
                else:
                    self.assertNotIn('validated existing private key path', actions)
                self.assertEqual([action for action in actions if action.startswith('cleanup-')], ['cleanup-profile', 'cleanup-private'])
                self.assertNotIn('FABRICATED_', result.stdout + result.stderr + '\n'.join(argv))

    def test_default_user_search_list_must_expose_the_same_unique_validated_identity(self):
        result, argv, actions = self.run_archive_boundary(['--upload'])
        self.assertEqual(result.returncode, 77, result.stderr)
        self.assertTrue(argv)
        for action in ['query-user-search-list-identity', 'validate-user-search-list-identity', 'archive']:
            self.assertIn(action, actions)
        self.assertLess(actions.index('keychain-list'), actions.index('query-user-search-list-identity'))
        self.assertLess(actions.index('query-user-search-list-identity'), actions.index('validate-user-search-list-identity'))
        self.assertLess(actions.index('validate-user-search-list-identity'), actions.index('archive'))
        self.assertIn('"userSearchListIdentityMatch":true', result.stdout)
        for private_value in [FINGERPRINT, 'Apple Distribution:', 'Public Fixture', 'FABRICATED_']:
            self.assertNotIn(private_value, result.stdout + result.stderr)

    def test_missing_ambiguous_failed_or_different_search_identity_blocks_archive_and_still_cleans(self):
        for identity in ['missing', 'ambiguous', 'different', 'security-error', 'helper-error']:
            with self.subTest(identity=identity):
                result, argv, actions = self.run_archive_boundary(['--upload'], search_identity=identity)
                self.assertEqual(result.returncode, 1, result.stderr)
                self.assertEqual(argv, [])
                self.assertNotIn('archive', actions)
                self.assertNotIn('generate-project', actions)
                self.assertEqual([action for action in actions if action.startswith('cleanup-')], ['cleanup-profile', 'cleanup-private'])
                self.assertIn('not uniquely visible in the user keychain search list', result.stderr)
                for private_value in [FINGERPRINT, 'Apple Distribution:', 'Public Fixture', 'FABRICATED_']:
                    self.assertNotIn(private_value, result.stdout + result.stderr)

    def test_cleanup_failure_remains_fatal_after_authenticated_archive(self):
        result, argv, actions = self.run_archive_boundary(['--upload'], cleanup_failure=True)
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIn('-authenticationKeyPath', argv)
        self.assertEqual([action for action in actions if action.startswith('cleanup-')], ['cleanup-profile', 'cleanup-private'])
        self.assertIn('cleanup could not confirm removal', result.stderr)


class ExportValidationShellTests(unittest.TestCase):
    def run_export_validation(self, failure='', cleanup_failure=False):
        # Execute the actual post-export block and EXIT handler. Only the
        # platform tools are faked; Python checks inspect public fixture data.
        git_bash = Path(os.environ.get('ProgramFiles', 'C:/Program Files')) / 'Git/bin/bash.exe'
        bash = str(git_bash) if git_bash.is_file() else shutil.which('bash')
        if not bash:
            self.skipTest('Bash is unavailable')
        script = Path(__file__).resolve().parents[1] / 'release-ios.sh'
        source = script.read_text()
        handler = 'cleanup() {' + source.split('cleanup() {', 1)[1].split('\ntrap cleanup EXIT', 1)[0]
        block = 'ditto -x -k ' + source.split('ditto -x -k ', 1)[1].split('\nif [[ "$UPLOAD"', 1)[0]
        fail = next(line for line in source.splitlines() if line.startswith('fail() {'))
        root = script.parent.parent / '.build' / 'export-validation-tests'
        root.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=root) as working:
            folder = Path(working)
            private = folder / 'private fixture'
            app = private / 'ipa/Payload/DoveBevo.app'
            app.mkdir(parents=True)
            output = folder / 'release'
            output.mkdir()
            ipa = output / 'DoveBevo.ipa'
            ipa.write_bytes(b'public IPA fixture; never a signed app')
            original = profile()
            (private / 'profile.json').write_text(json.dumps(release.validated_profile(original, NOW)))
            embedded = profile()
            if failure == 'profile-mismatch':
                embedded['UUID'] = '11111111-1111-1111-1111-111111111111'
            (private / 'embedded-source.plist').write_bytes(plistlib.dumps(embedded))
            entitlements = dict(original['Entitlements'])
            if failure == 'debug-entitlement':
                entitlements['get-task-allow'] = True
            (private / 'entitlements-source.plist').write_bytes(plistlib.dumps(entitlements))
            (app / 'Info.plist').write_bytes(plistlib.dumps({
                'CFBundleIdentifier': release.BUNDLE, 'CFBundleVersion': '19',
                'CFBundleSupportedPlatforms': ['iPhoneOS']}))
            fixture = r'''#!/usr/bin/env bash
set -euo pipefail
umask 077
record() { printf '%s\n' "$*" >> "$PWD/actions.txt"; }
tool_failure() { printf 'FABRICATED_PRIVATE_TOOL_OUTPUT\n'; printf 'FABRICATED_PRIVATE_TOOL_ERROR\n' >&2; return 97; }
private_dir="$PWD/private fixture"
RELEASE_ROOT="$PWD/release"
EXPORTED_APP="$private_dir/ipa/Payload/DoveBevo.app"
IPA="$RELEASE_ROOT/DoveBevo.ipa"
BUILD_NUMBER=19
REPO_ROOT="$PWD"
RUNNER_TEMP="$PWD"
task_keychain=''
keychain_attempted=false
search_list_changed=false
RELEASE_MODE_ARGS=(--internal-only)
git() { printf 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n'; }
ditto() { record 'unpack'; [[ "$FIXTURE_FAILURE" != unpack ]] || tool_failure; }
codesign() {
    if [[ "$1" == --verify ]]; then
        record 'verify-signature'
        [[ "$#" == 4 && "$2" == --deep && "$3" == --strict && "$4" == "$EXPORTED_APP" ]] || return 98
        [[ "$FIXTURE_FAILURE" != verify-signature ]] || tool_failure
    elif [[ "$1" == -d && "$2" == --entitlements ]]; then
        record 'entitlements'
        printf '%s\0' "$@" > "$PWD/entitlement-args.bin"
        [[ "$#" == 5 && "$3" == - && "$4" == --xml && "$5" == "$EXPORTED_APP" ]] || { tool_failure; return 97; }
        [[ "$FIXTURE_FAILURE" != entitlements ]] || { tool_failure; return 97; }
        cat "$private_dir/entitlements-source.plist"
    elif [[ "$1" == -dvv ]]; then
        record 'details'
        [[ "$FIXTURE_FAILURE" != details ]] || { tool_failure; return 97; }
        printf 'TeamIdentifier=9T359CV674\nIdentifier=com.dovebevo.app\nFABRICATED_PRIVATE_DETAILS\n'
    elif [[ "$1" == -d && "$2" == --extract-certificates* ]]; then
        record 'certificates'
        printf '%s\0' "$@" > "$PWD/certificate-args.bin"
        # Optional long-option values must be attached; a separate prefix is
        # another code operand, rather than the requested destination prefix.
        [[ "$#" == 3 && "$2" == "--extract-certificates=$private_dir/signature-cert-" && "$3" == "$EXPORTED_APP" ]] || { tool_failure; return 97; }
        [[ "$FIXTURE_FAILURE" != certificates ]] || { tool_failure; return 97; }
        if [[ "$FIXTURE_FAILURE" == certificate-mismatch ]]; then printf 'other public certificate' > "$private_dir/signature-cert-0"
        else printf '%s' "$FIXTURE_CERTIFICATE" > "$private_dir/signature-cert-0"; fi
    else record 'unexpected codesign'; return 99; fi
}
security() {
    record 'embedded-profile'
    [[ "$#" == 4 && "$1" == cms && "$2" == -D && "$3" == -i && "$4" == "$EXPORTED_APP/embedded.mobileprovision" ]] || return 98
    [[ "$FIXTURE_FAILURE" != embedded-profile ]] || { tool_failure; return 97; }
    cat "$private_dir/embedded-source.plist"
}
python3() {
    record "$2"
    case "$2" in
        cleanup-profile) return "$FIXTURE_CLEANUP_STATUS" ;;
        cleanup-private) return 0 ;;
        *) "$FIXTURE_PYTHON" "$@" ;;
    esac
}
''' + fail + '\n' + handler + '\ntrap cleanup EXIT\n' + block + "\nrecord 'upload boundary reached'\n"
            (folder / 'fixture.sh').write_text(fixture, encoding='utf-8', newline='\n')
            env = {key: os.environ[key] for key in ['PATH', 'SystemRoot', 'WINDIR'] if key in os.environ}
            env.update(SUPPORT=Path(release.__file__).resolve().as_posix(),
                       FIXTURE_PYTHON=release.sys.executable.replace('\\', '/'), FIXTURE_FAILURE=failure,
                       FIXTURE_CERTIFICATE=CERTIFICATE.decode(), FIXTURE_CLEANUP_STATUS='93' if cleanup_failure else '0')
            result = subprocess.run([bash, 'fixture.sh'], cwd=folder, env=env,
                                    capture_output=True, text=True, timeout=10)
            actions = (folder / 'actions.txt').read_text().splitlines()
            manifest = output / 'release-manifest.json'
            arguments = {}
            for name in ['entitlement', 'certificate']:
                path = folder / (name + '-args.bin')
                arguments[name] = path.read_bytes().decode().rstrip('\0').split('\0') if path.exists() else []
            return result, actions, json.loads(manifest.read_text()) if manifest.exists() else None, arguments

    def test_actual_postexport_block_extracts_xml_and_exact_certificate_before_manifest(self):
        result, actions, manifest, arguments = self.run_export_validation()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(actions, ['unpack', 'verify-signature', 'entitlements', 'details', 'certificates',
                                   'embedded-profile', 'verify', 'manifest', 'upload boundary reached',
                                   'cleanup-profile', 'cleanup-private'])
        self.assertEqual(arguments['entitlement'][1:4], ['--entitlements', '-', '--xml'])
        self.assertIn('/private fixture/signature-cert-', arguments['certificate'][1])
        self.assertEqual(manifest['signingCertificateSHA1'], FINGERPRINT)
        self.assertTrue(manifest['signaturesVerified'])
        self.assertEqual(manifest['distributionScope'], 'internal-only')
        self.assertFalse(manifest['uploadRequested'])
        self.assertNotIn('FABRICATED_', result.stdout + result.stderr)

    def test_each_platform_failure_stops_with_fixed_private_diagnostics_and_cleans(self):
        messages = {'unpack': 'Cannot unpack the exported IPA',
                    'verify-signature': 'The exported IPA code signature failed verification',
                    'entitlements': 'Cannot extract the exported app entitlements as XML',
                    'details': 'Cannot inspect the exported app code signature',
                    'certificates': 'Cannot extract the exported app signing certificates',
                    'embedded-profile': 'Cannot decode the exported app provisioning profile'}
        for stage, message in messages.items():
            with self.subTest(stage=stage):
                result, actions, manifest, arguments = self.run_export_validation(stage)
                self.assertEqual(result.returncode, 1, result.stderr)
                self.assertIn(message, result.stderr)
                self.assertIsNone(manifest)
                self.assertNotIn('upload boundary reached', actions)
                self.assertEqual(actions[-2:], ['cleanup-profile', 'cleanup-private'])
                self.assertNotIn('FABRICATED_', result.stdout + result.stderr)

    def test_real_export_checks_still_reject_changed_certificate_profile_or_debug_entitlement(self):
        for tampering in ['certificate-mismatch', 'profile-mismatch', 'debug-entitlement']:
            with self.subTest(tampering=tampering):
                result, actions, manifest, arguments = self.run_export_validation(tampering)
                self.assertEqual(result.returncode, 1, result.stderr)
                self.assertIn('The exported app failed certificate, profile or entitlement validation', result.stderr)
                self.assertIsNone(manifest)
                self.assertNotIn('manifest', actions)
                self.assertNotIn('upload boundary reached', actions)
                self.assertEqual(actions[-2:], ['cleanup-profile', 'cleanup-private'])
                self.assertNotIn('Traceback', result.stderr)
                self.assertNotIn('FABRICATED_', result.stdout + result.stderr)

    def test_cleanup_failure_remains_fatal_after_validated_export(self):
        result, actions, manifest, arguments = self.run_export_validation(cleanup_failure=True)
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertTrue(manifest['signaturesVerified'])
        self.assertIn('cleanup could not confirm removal', result.stderr)
        self.assertEqual(actions[-2:], ['cleanup-profile', 'cleanup-private'])


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
