"""Metadata guard tests; these do not simulate successful Apple signing."""

import datetime as dt
import hashlib
import importlib.util
from pathlib import Path
import unittest

SPEC = importlib.util.spec_from_file_location("release_support", Path(__file__).resolve().parents[1] / "release_support.py")
release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release)

NOW = dt.datetime(2026, 10, 26, tzinfo=dt.timezone.utc)
# Public fixture bytes exercise matching, never represent a valid certificate.
# The actual pipeline separately requires security's valid identity listing and
# real codesign verification; no Apple CLI is mocked by this test suite.
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


if __name__ == "__main__":
    unittest.main()
