"""Source boundary checks; native behavior/transport tests run on the Mac gate."""
from pathlib import Path
import re
import unittest

IOS = Path(__file__).resolve().parents[2]
ROOT = IOS.parents[1]


class RecommendationContractTests(unittest.TestCase):
    def test_native_catalog_matches_shared_codes_and_italian_labels(self):
        native = (IOS / "App/DrinkRecommendation.swift").read_text(encoding="utf-8")
        shared = (ROOT / "src/shared/catalog.ts").read_text(encoding="utf-8")
        labels = (ROOT / "src/app/i18n/it.ts").read_text(encoding="utf-8").split("  drinks: {", 1)[1]
        codes = re.findall(r'code: "([a-z_]+)"', shared)
        rows = re.findall(r'DrinkCategory\(code: "([a-z_]+)", name: "([^"]+)"\)', native)
        self.assertEqual([code for code, _ in rows], codes)
        for code, label in rows:
            self.assertIn(f'{code}: "{label}"', labels)

    def test_transport_is_bounded_and_separate_from_web_credentials(self):
        source = (IOS / "App/RecommendationClient.swift").read_text(encoding="utf-8")
        for required in ["URLSessionDataDelegate", "willPerformHTTPRedirection", "completionHandler(nil)",
                         "httpCookieStorage = nil", "httpShouldSetCookies = false", "urlCredentialStorage = nil",
                         "maximumResponseBytes", "didReceive data: Data", "timeoutIntervalForResource = 20"]:
            self.assertIn(required, source)
        self.assertNotIn("WKHTTPCookieStore", source)
        self.assertNotIn("URLSession.shared", source)

    def test_identity_is_private_backup_excluded_and_not_a_device_identifier(self):
        source = (IOS / "App/RecommendationVoterStore.swift").read_text(encoding="utf-8")
        self.assertIn("isExcludedFromBackup = true", source)
        self.assertIn("UUID().uuidString.lowercased()", source)
        self.assertIn("attributesOfItem(atPath:", source)
        self.assertIn("POSIXErrorCode.ENOENT", source)
        self.assertNotIn("fileExists(atPath:", source)
        self.assertNotIn("identifierForVendor", source)
        self.assertNotIn("UserDefaults", source)

    def test_live_ui_checks_never_tap_recommendation_write_buttons(self):
        source = (IOS / "UITests/BrowserSmokeTests.swift").read_text(encoding="utf-8")
        self.assertIn("verifyLiveRecommendationsReadOnly", source)
        flow = source.split("private func verifyLiveRecommendationsReadOnly", 1)[1].split("\n    private func", 1)[0]
        self.assertNotRegex(flow, r'(?s)recommendations\.toggle[^\n]*\.tap\(')
        self.assertIn("recommendations.loaded", flow)


if __name__ == "__main__":
    unittest.main()
