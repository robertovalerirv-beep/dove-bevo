"""Source-bound matcher boundaries; actual XCUI behavior requires the Mac run."""

import json
from pathlib import Path
import re
import unittest


SOURCE = Path(__file__).resolve().parents[2] / "UITests/BrowserSmokeTests.swift"


class LiveReadinessTests(unittest.TestCase):
    def setUp(self):
        self.source = SOURCE.read_text(encoding="utf-8")

    def test_only_the_base_map_label_and_observed_region_suffix_are_allowed(self):
        declaration = re.search(r"static let liveMapLabels\s*=\s*(\[[^\]]+\])", self.source)
        self.assertIsNotNone(declaration, "The live query must declare its finite label allowlist")
        labels = json.loads(declaration.group(1))
        self.assertEqual(set(labels), {"Mappa interattiva dei bar", "Mappa interattiva dei bar, region"})
        for label in ["Mappa interattiva dei bar, region, loading", "Mappa interattiva dei bar non pronta",
                      "Mappa interattiva dei bar, button", "mappa interattiva dei bar", "Mappa interattiva dei bar\n"]:
            self.assertNotIn(label, labels)
        query = self.source.split("private func interactiveMap()", 1)[1].split("\n    }", 1)[0]
        self.assertIn('app.webViews["browser.website"]', query)
        self.assertIn('NSPredicate(format: "label IN %@", Self.liveMapLabels as NSArray)', query)
        self.assertNotIn("BEGINSWITH", query)

    def test_coverage_uses_the_actual_anchored_pattern_and_valid_positive_ratio(self):
        declaration = re.search(r'static let liveCoveragePattern\s*=\s*#"([^"]+)"#', self.source)
        self.assertIsNotNone(declaration)
        pattern = declaration.group(1)
        self.assertTrue(pattern.startswith("^") and pattern.endswith("$"))
        def accepts(label):
            match = re.fullmatch(pattern, label)
            return bool(match and 0 < int(match[1]) <= int(match[2]))
        for label in ["2 bar su 43 qui hanno un prezzo", "1 bar su 1 qui hanno un prezzo"]:
            self.assertTrue(accepts(label), label)
        for label in ["0 bar su 43 qui hanno un prezzo", "2 bar su 0 qui hanno un prezzo",
                      "44 bar su 43 qui hanno un prezzo", "Carico i prezzi della zona…",
                      "La mappa non si carica", "2 bar su 43 qui hanno un prezzo\n",
                      "Copertura +1: 2 bar su 43 qui hanno un prezzo", "２ bar su 43 qui hanno un prezzo"]:
            self.assertFalse(accepts(label), label)
        check = self.source.split("private static func hasPositiveCoverage", 1)[1].split("\n    }", 1)[0]
        self.assertIn("match.range == range", check)
        self.assertIn("withPrice > 0 && total >= withPrice", check)
        visibility = self.source.split("private func hasVisiblePositiveCoverage()", 1)[1].split("\n    }", 1)[0]
        self.assertIn('app.webViews["browser.website"]', visibility)
        self.assertNotIn("isHittable", visibility)
        self.assertIn("element.exists", visibility)
        self.assertIn("!rectangle.isNull && !rectangle.isInfinite", visibility)
        self.assertIn("rectangle.size.width > 0 && rectangle.size.height > 0", visibility)
        self.assertIn("rectangle.minX, rectangle.minY, rectangle.maxX, rectangle.maxY", visibility)
        self.assertIn("allSatisfy { $0.isFinite }", visibility)
        self.assertIn("websiteFrame.contains(frame) && appFrame.contains(frame)", visibility)
        self.assertIn("Self.hasPositiveCoverage(element.label)", visibility)

    def test_final_capture_follows_semantic_and_postprivacy_checks(self):
        live = self.source.split("func testLiveWebsiteCitySearchAndMap()", 1)[1].split("\n    private func", 1)[0]
        self.assertIn('searchField.typeText("Milano")', live)
        self.assertIn("city.tap()", live)
        self.assertIn('app.webViews["browser.website"].buttons["Esplora la mappa"]', live)
        self.assertIn('La mappa non si carica: controlla la connessione e ricarica la pagina.', live)
        self.assertGreaterEqual(live.count("hasVisiblePositiveCoverage()"), 2)
        self.assertGreater(live.index('attachScreen(named: "DoveBevo-live-Milano-map")'), live.index("openPrivacyAndReturn()"))
        self.assertGreater(live.rindex("assertNoNativeRecovery()"), live.index("openPrivacyAndReturn()"))


if __name__ == "__main__":
    unittest.main()
