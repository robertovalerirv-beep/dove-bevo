"""Release boundary tests with fake build/JDK tools; never create or read real keys."""
import base64
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


ANDROID = Path(__file__).resolve().parents[1]
SCRIPT = ANDROID.parent / "scripts" / "release-android.sh"
CERT = "a1" * 32


def bash_path(path):
    value = str(path).replace("\\", "/")
    return "/" + value[0].lower() + value[2:] if os.name == "nt" else value


class ReleaseAndroidTest(unittest.TestCase):
    def setUp(self):
        self.bash = Path("C:/Program Files/Git/bin/bash.exe") if os.name == "nt" else Path(shutil.which("bash") or "/missing-bash")
        if not self.bash.is_file():
            self.skipTest("Bash is unavailable")
        parent = ANDROID / ".local" / "release-tests"
        parent.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(prefix="case-", dir=parent)
        self.root = Path(self.temp.name).resolve()
        assert self.root.is_relative_to(parent.resolve())
        self.repo = self.root / "checkout"
        self.android = self.repo / "mobile-apps/android"
        self.runner = self.root / "runner-temp"
        self.tools = self.root / "fake-tools"
        self.jdk = self.root / "fake-jdk/bin"
        self.log = self.root / "calls"
        for directory in (self.android, self.runner, self.tools, self.jdk, self.log):
            directory.mkdir(parents=True)
        target = self.repo / "mobile-apps/scripts/release-android.sh"
        target.parent.mkdir(parents=True)
        target.write_bytes(SCRIPT.read_bytes())
        self.script = target
        self.aab = self.android / "app/build/outputs/bundle/release/app-release.aab"
        self.write_tool(self.tools / "uname", "printf 'Linux\\n'\n")
        self.write_tool(self.jdk / "java", 'printf \'openjdk version "%s"\\n\' "${FAKE_JAVA_VERSION:-21.0.9}" >&2\n')
        self.write_tool(self.jdk / "jarsigner", '''
printf '%s\\n' "$@" > "$FAKE_LOG/jarsigner-args"
if [[ "${FAKE_VERIFY_MODE:-}" == unsigned ]]; then printf 'jar is unsigned.\\n'; else printf 'jar verified.\\n'; fi
exit "${FAKE_VERIFY_CODE:-0}"
''')
        self.write_tool(self.jdk / "keytool", '''
printf '%s\\n' "$@" > "$FAKE_LOG/keytool-args"
printf 'Signer #1:\\nCertificate #1:\\n SHA256: %s\\n' "${FAKE_CERT:-a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1}"
if [[ "${FAKE_EXTRA_CERT:-}" == yes ]]; then printf ' SHA256: b2\\n'; fi
''')
        self.write_tool(self.android / "gradlew", '''
printf '%s\\n' "$@" > "$FAKE_LOG/gradle-args"
printf '%s\\n' "$DOVEBEVO_ANDROID_KEYSTORE" > "$FAKE_LOG/key-path"
[[ -z "${DOVEBEVO_ANDROID_KEYSTORE_BASE64:-}" ]] || exit 71
[[ -n "$DOVEBEVO_SIGNING_PASSWORD" ]] || exit 72
[[ "$(stat -c '%a' "$DOVEBEVO_ANDROID_KEYSTORE")" == 600 ]] || exit 73
[[ "$(stat -c '%a' "$(dirname "$DOVEBEVO_ANDROID_KEYSTORE")")" == 700 ]] || exit 74
if [[ "${FAKE_BUILD_MODE:-}" == missing ]]; then exit 0; fi
mkdir -p app/build/outputs/bundle/release
printf 'fake bundle bytes' > app/build/outputs/bundle/release/app-release.aab
if [[ "${FAKE_BUILD_MODE:-}" == fail ]]; then exit 7; fi
if [[ "${FAKE_BUILD_MODE:-}" == dirty-cleanup ]]; then printf unknown > "$(dirname "$DOVEBEVO_ANDROID_KEYSTORE")/unexpected.txt"; fi
''')
        # Start from no inherited signing variables; these are deliberately non-key fixtures.
        self.env = {k: os.environ[k] for k in ("PATH", "SystemRoot", "WINDIR", "COMSPEC", "SYSTEMDRIVE", "TEMP", "TMP") if k in os.environ}
        self.env.update({
            "GITHUB_ACTIONS": "true", "RUNNER_ENVIRONMENT": "github-hosted", "RUNNER_OS": "Linux",
            "RUNNER_TEMP": bash_path(self.runner), "JAVA_HOME": bash_path(self.jdk.parent),
            "DOVEBEVO_ANDROID_KEYSTORE_BASE64": base64.b64encode(b"not-a-private-key-test-fixture").decode(),
            "DOVEBEVO_SIGNING_PASSWORD": "public-test-password-not-used-for-signing",
            "DOVEBEVO_ANDROID_CERT_SHA256": CERT, "FAKE_LOG": bash_path(self.log),
        })
        # Git Bash converts the native PATH itself; a script prelude prepends only fake uname.
        self.prelude = 'export PATH="$1:$PATH"; shift; if [[ "${FAKE_SHELL_TRACE:-}" == yes ]]; then exec bash -x "$@"; else exec bash "$@"; fi'

    def tearDown(self):
        self.temp.cleanup()

    def write_tool(self, path, body):
        path.write_text("#!/usr/bin/env bash\nset -eu\n" + body, encoding="utf-8", newline="\n")
        path.chmod(0o700)

    def run_release(self, **updates):
        env = self.env | updates
        result = subprocess.run([str(self.bash), "--noprofile", "--norc", "-c", self.prelude, "release-test",
                                 bash_path(self.tools), bash_path(self.script)], env=env, capture_output=True,
                                text=True, timeout=30, stdin=subprocess.DEVNULL)
        self.assertNotIn(self.env["DOVEBEVO_SIGNING_PASSWORD"], result.stdout + result.stderr)
        self.assertNotIn(self.env["DOVEBEVO_ANDROID_KEYSTORE_BASE64"], result.stdout + result.stderr)
        return result

    def assert_no_private_files(self):
        self.assertEqual([], list(self.runner.iterdir()))

    def test_success_uses_env_password_fixed_alias_strict_verification_and_cleans_key(self):
        result = self.run_release()
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertIn(hashlib.sha256(b"fake bundle bytes").hexdigest(), result.stdout)
        self.assertTrue(self.aab.is_file())
        self.assert_no_private_files()
        args = (self.log / "jarsigner-args").read_text()
        for item in ("-verify", "-strict", "-storetype\nPKCS12", "-storepass:env\nDOVEBEVO_SIGNING_PASSWORD", "dovebevo-upload"):
            self.assertIn(item, args)
        self.assertNotIn(self.env["DOVEBEVO_SIGNING_PASSWORD"], args)
        self.assertIn("-printcert\n-jarfile", (self.log / "keytool-args").read_text())
        gradle = (self.log / "gradle-args").read_text()
        for item in ("--no-daemon", "--no-configuration-cache", "--no-build-cache", ":app:bundleRelease"):
            self.assertIn(item, gradle)

    def test_missing_or_oversized_inputs_stop_before_any_child_build(self):
        for key in ("DOVEBEVO_ANDROID_KEYSTORE_BASE64", "DOVEBEVO_SIGNING_PASSWORD", "DOVEBEVO_ANDROID_CERT_SHA256"):
            with self.subTest(key=key):
                self.assertNotEqual(0, self.run_release(**{key: ""}).returncode)
                self.assert_no_private_files()
        self.assertNotEqual(0, self.run_release(DOVEBEVO_ANDROID_KEYSTORE_BASE64="a" * 65537).returncode)
        self.assertFalse((self.log / "gradle-args").exists())

    def test_uppercase_colon_form_of_pinned_public_fingerprint_is_supported(self):
        result = self.run_release(DOVEBEVO_ANDROID_CERT_SHA256=":".join(["A1"] * 32))
        self.assertEqual(0, result.returncode, result.stderr)
        self.assert_no_private_files()

    def test_caller_xtrace_is_disabled_before_any_signing_input_is_expanded(self):
        result = self.run_release(FAKE_SHELL_TRACE="yes")
        self.assertEqual(0, result.returncode, result.stderr)
        self.assert_no_private_files()

    def test_non_hosted_context_and_source_checkout_temporary_directory_are_rejected(self):
        self.assertNotEqual(0, self.run_release(RUNNER_ENVIRONMENT="self-hosted").returncode)
        self.assertNotEqual(0, self.run_release(RUNNER_TEMP=bash_path(self.android)).returncode)
        self.assert_no_private_files()

    def test_wrong_jdk_and_partial_base64_decode_are_cleaned_before_build(self):
        self.assertNotEqual(0, self.run_release(FAKE_JAVA_VERSION="17.0.14").returncode)
        self.assert_no_private_files()
        self.assertNotEqual(0, self.run_release(DOVEBEVO_ANDROID_KEYSTORE_BASE64="YWJj!!!!").returncode)
        self.assert_no_private_files()
        self.assertFalse((self.log / "gradle-args").exists())

    def test_failed_build_and_missing_output_never_leave_a_bundle_or_key(self):
        for mode in ("fail", "missing"):
            with self.subTest(mode=mode):
                self.assertNotEqual(0, self.run_release(FAKE_BUILD_MODE=mode).returncode)
                self.assertFalse(self.aab.exists())
                self.assert_no_private_files()

    def test_all_strict_nonzero_results_including_code_four_are_rejected(self):
        for code in ("1", "4", "8", "16", "32", "64"):
            with self.subTest(code=code):
                self.assertNotEqual(0, self.run_release(FAKE_VERIFY_CODE=code).returncode)
                self.assertFalse(self.aab.exists())
                self.assert_no_private_files()

    def test_unsigned_result_with_zero_exit_and_unpinned_or_multiple_certificates_are_rejected(self):
        for changes in ({"FAKE_VERIFY_MODE": "unsigned"}, {"FAKE_CERT": "b2" * 32}, {"FAKE_EXTRA_CERT": "yes"}):
            with self.subTest(changes=changes):
                self.assertNotEqual(0, self.run_release(**changes).returncode)
                self.assertFalse(self.aab.exists())
                self.assert_no_private_files()

    def test_preexisting_bundle_is_preserved_and_never_adopted(self):
        self.aab.parent.mkdir(parents=True)
        self.aab.write_bytes(b"preexisting")
        self.assertNotEqual(0, self.run_release().returncode)
        self.assertEqual(b"preexisting", self.aab.read_bytes())
        self.assert_no_private_files()

    def test_unknown_cleanup_contents_prevent_success_without_recursive_deletion(self):
        result = self.run_release(FAKE_BUILD_MODE="dirty-cleanup")
        self.assertNotEqual(0, result.returncode)
        self.assertNotIn("Signed Android bundle verified", result.stdout)
        self.assertFalse(self.aab.exists())
        remaining = list(self.runner.glob("dovebevo-android-signing.*/unexpected.txt"))
        self.assertEqual(1, len(remaining))
        self.assertEqual([], list(self.runner.rglob("upload.p12")))


if __name__ == "__main__":
    unittest.main()
