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

    def test_live_city_and_euro_matchers_keep_utf8_literals(self):
        for required in ['Cerca citt\u00e0 o bar', '"Citt\u00e0"', '"\u20ac"']:
            self.assertIn(required, self.source)
        for damaged in ["\u00c3\u00a0", "\u00e2\u201a\u00ac", "\ufffd"]:
            self.assertNotIn(damaged, self.source)

    def test_city_search_uses_anchored_label_and_exact_selected_city_without_loosening_map_readiness(self):
        query = self.source.split("private func citySearchPredicate(", 1)[1].split("private func interactiveMap()", 1)[0]
        for required in ["NSRegularExpression.escapedPattern(for: $0)", 'label MATCHES %@',
                         "{1,120}", "citySearchPredicate(city: city)", "website.buttons.matching"]:
            self.assertIn(required, query)
        self.assertIn(chr(92) * 2 + "A", query)
        self.assertIn(chr(92) * 2 + "z", query)
        self.assertNotIn("CONTAINS", query)
        self.assertIn('citySearchButton(in: website, city: "Milano")', self.source)
        self.assertIn('"(?:" + NSRegularExpression.escapedPattern(for: $0) + " · )?"', query)
        self.assertIn('citySearchPredicate(city: "Milano").evaluate(with: ["label": "Cerca città o bar"])', self.source)
        self.assertIn('XCTAssertFalse(citySearchPredicate(city: "Milano").evaluate(with: ["label": "Torino · Cerca città o bar"]))', self.source)
        self.assertIn("hasVisiblePositiveCoverage()", self.source)
        self.assertIn('website.buttons.matching(citySearchPredicate()).count, 1', self.source)

    def test_original_field_receives_one_real_focus_tap_and_keyboard_readiness_before_typing(self):
        live = self.source.split("func testLiveWebsiteCitySearchAndMap()", 1)[1].split("\n    private func", 1)[0]
        self.assertEqual(live.count("searchField.tap()"), 1)
        self.assertLess(live.index("searchField.tap()"), live.index("waitForOrdinaryKeyboard()"))
        self.assertLess(live.index("waitForOrdinaryKeyboard()"), live.index('searchField.typeText("Milano")'))
        self.assertIn('XCTAssertEqual(searchField.value as? String, "Milano"', live)
        ready = self.source.split("private func waitForOrdinaryKeyboard(", 1)[1].split("\n    private func", 1)[0]
        self.assertIn("self.ordinaryKeyboardVisible()", ready)
        sample = self.source.split("private func ordinaryKeyboardVisible()", 1)[1].split("\n    private func", 1)[0]
        self.assertIn("keyboards.allElementsBoundByIndex.contains", sample)
        self.assertIn("isOrdinaryKeyboard(keyboard, frame: keyboard.frame, windowFrame: windowFrame)", sample)
        self.assertLess(sample.index("guard keyboard.exists"), sample.index("frame: keyboard.frame"))
        self.assertIn("app.windows.firstMatch.frame", sample)
        keyboard = self.source.split("private func isOrdinaryKeyboard(", 1)[1].split("\n    private func", 1)[0]
        self.assertIn("frame.width >= 250, frame.height >= 150", keyboard)
        self.assertIn("key.isHittable", keyboard)
        self.assertIn("windowFrame.contains(keyFrame)", keyboard)
        simultaneous = live.split("let searchVisible =", 1)[1].split("city.tap()", 1)[0]
        for required in ["keyboards.allElementsBoundByIndex", "self.isOrdinaryKeyboard(keyboard, frame: candidateFrame, windowFrame: windowFrame)",
                         "Self.frameVisibleAboveKeyboard(fieldFrame", "Self.frameVisibleAboveKeyboard(cityFrame",
                         "queryMatches && fieldHittable && cityHittable && fieldVisible && cityVisible"]:
            self.assertIn(required, simultaneous)
        self.assertNotIn("keyboards.firstMatch", simultaneous)
        self.assertLess(simultaneous.index("guard keyboard.exists"), simultaneous.index("let candidateFrame = keyboard.frame"))

    def test_observed_keyboard_tutorial_requires_real_keys_after_its_scoped_action(self):
        helper = self.source.split("private func dismissKeyboardIntroductionIfPresent(", 1)[1].split("\n    private func", 1)[0]
        for required in ['"Speed up your typing"', 'app.buttons["Continue"]',
                         'guard introduction.waitForExistence(timeout: 2)',
                         'appFrame.contains(buttonFrame)', 'withOffset(offset).tap()',
                         'waitForOrdinaryKeyboard(timeout: 10)',
                         'searchField.isHittable', 'assertNoNativeRecovery()']:
            self.assertIn(required, helper)
        self.assertNotIn('"exists == false"', helper)
        self.assertLess(helper.index('withOffset(offset).tap()'), helper.index('waitForOrdinaryKeyboard(timeout: 10)'))
        self.assertLess(helper.index('waitForOrdinaryKeyboard(timeout: 10)'), helper.index('DoveBevo-keyboard-introduction-after-continue'))
        ready = self.source.split("private func waitForOrdinaryKeyboard(", 1)[1].split("\n    private func", 1)[0]
        self.assertIn('timeout: TimeInterval = 15', ready)
        self.assertIn('XCTWaiter.wait(for: [ready], timeout: timeout)', ready)

    def test_keyboard_visibility_samples_actual_window_once_without_relaxing_geometry(self):
        sample = self.source.split("let searchVisible =", 1)[1].split("city.tap()", 1)[0]
        for lookup in ["self.app.windows.firstMatch.frame", "website.frame", "searchField.frame", "city.frame"]:
            self.assertEqual(sample.count(lookup), 1, lookup)
        self.assertNotIn("app.frame", sample)
        self.assertIn("XCTWaiter.wait(for: [searchVisible], timeout: 45)", sample)
        self.assertIn('sampleAttachment.name = "DoveBevo-search-visibility-sample"', sample)
        self.assertIn("sampleAttachment.lifetime = .keepAlways", sample)
        for condition in ["fieldExists", "cityExists", "queryMatches", "fieldHittable", "cityHittable",
                          "fieldVisible", "cityVisible", "ordinaryKeyboard", "seconds="]:
            self.assertIn(condition, sample)
        geometry = self.source.split("private static func frameVisibleAboveKeyboard(", 1)[1].split("\n    private func", 1)[0]
        for required in ["!rectangle.isNull && !rectangle.isInfinite", "rectangle.width > 0 && rectangle.height > 0",
                         "allSatisfy { $0.isFinite }", "frame.width >= 44 && frame.height >= 44",
                         "windowFrame.contains(frame) && websiteFrame.contains(frame)", "frame.maxY <= keyboardFrame.minY"]:
            self.assertIn(required, geometry)

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
