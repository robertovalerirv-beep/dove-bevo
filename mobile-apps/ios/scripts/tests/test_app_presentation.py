"""Packaging/trust fences; real WK/CSP and native rendering run in the Mac gate."""
from pathlib import Path
import unittest

IOS = Path(__file__).resolve().parents[2]


class AppPresentationGuards(unittest.TestCase):
    def test_live_price_form_checks_keyboard_and_closes_without_public_submission(self):
        source = (IOS / "UITests/BrowserSmokeTests.swift").read_text(encoding="utf-8")
        self.assertIn("verifyLiveVenueAndPriceFormReadOnly(venueName: publicName)", source)
        flow = source.split("private func verifyLiveVenueAndPriceFormReadOnly", 1)[1].split("private func ordinaryDecimalKeyboard", 1)[0]
        for required in ['website.buttons["Aggiungi un prezzo qui"]', 'app.buttons["Birra media"]',
                         'app.textFields["Prezzo in euro"]', 'website.buttons["Salva"]', "XCTAssertFalse(submit.isEnabled",
                         "visibleAboveKeyboard(price", "visibleAboveKeyboard(submit", "ordinaryDecimalKeyboard()",
                         'DoveBevo-live-venue-detail-read-only', 'DoveBevo-live-price-form-empty-read-only',
                         'DoveBevo-live-price-field-with-keyboard-read-only', 'DoveBevo-live-price-action-with-keyboard-read-only',
                         "closeForm.tap()", 'website.links["Indicazioni"].exists']:
            self.assertIn(required, flow)
        for forbidden in ["typeText(", "submit.tap()", 'buttons["Confermo"].tap()', ".seen__price", "coordinate("]:
            self.assertNotIn(forbidden, flow)
        keyboard = source.split("private func ordinaryDecimalKeyboard", 1)[1].split("private func visibleAboveKeyboard", 1)[0]
        self.assertIn('label IN %@", ["1", "2"]', keyboard)
        self.assertIn("keyboard.frame.width >= 250, keyboard.frame.height >= 150", keyboard)
        self.assertIn("key.isHittable", keyboard)
        self.assertIn("if ordinaryDecimalKeyboard() == nil { price.tap() }", flow)
        self.assertIn("frame.height < normalViewport.height", flow)
        self.assertIn("frame.maxY <= current.frame.minY", flow)
        self.assertIn("abs(frame.height - normalViewport.height) <= 0.5", flow)
        self.assertLess(flow.index('attachState(named: "DoveBevo-live-price-action-with-keyboard-read-only")'),
                        flow.index('XCTAssertTrue(visibleAboveKeyboard(submit'))
        browser = (IOS / "App/BrowserViewController.swift").read_text(encoding="utf-8")
        self.assertIn("body.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor)", browser)
        self.assertNotIn("followsUndockedKeyboard = true", browser)

    def test_shared_asset_is_only_js_resource_and_installed_in_isolated_main_frame(self):
        project = (IOS / "project.yml").read_text(encoding="utf-8")
        self.assertIn("- path: ../presentation/app-theme.js\n        buildPhase: resources", project)
        source = (IOS / "App/AppPresentationTheme.swift").read_text(encoding="utf-8")
        for required in ['Bundle.main.url(forResource: "app-theme", withExtension: "js")',
                         "data.count <= 32 * 1024", "encoding: .utf8", ".atDocumentEnd",
                         "forMainFrameOnly: true, in: .defaultClient", "URLPolicy.isWebsite(url)",
                         "path(percentEncoded: true)", "guard canApply(to: webView.url), let source",
                         "evaluateJavaScript(source, in: nil, in: .defaultClient)"]:
            self.assertIn(required, source)
        for forbidden in ["addScriptMessageHandler", "addScriptMessageHandlerWithReply", ".page", "MutationObserver",
                          "HTTPCookie", "customUserAgent", "URLSession", "evaluateJavaScript(source +"]:
            self.assertNotIn(forbidden, source)
        browser = (IOS / "App/BrowserViewController.swift").read_text(encoding="utf-8")
        self.assertLess(browser.index("AppPresentationTheme.install(in: configuration)"), browser.index("webView = WKWebView"))
        finish = browser.split("func webView(_ webView: WKWebView, didFinish", 1)[1].split("func webView", 1)[0]
        self.assertLess(finish.index("guard navigationState.acceptsCallback"), finish.index("AppPresentationTheme.applyAfterFinish"))
        self.assertIn("configuration.websiteDataStore = .default()", browser)

    def test_new_checks_use_actual_wk_csp_and_large_text_native_cards(self):
        theme = (IOS / "Tests/AppPresentationThemeTests.swift").read_text(encoding="utf-8")
        for required in ["loadSimulatedRequest", "Content-Security-Policy", "window.URL = function", "typeof window.__themePageOnly",
                         "loadOwned(web, nonce: false)", "cspAllowsNonce: false", "must roll the owned style back",
                         "5.50|0.50|50|true", "document.querySelectorAll('#dovebevo-native-theme-v1')"]:
            self.assertIn(required, theme)
        favourites = (IOS / "Tests/FavouriteComparisonControllerTests.swift").read_text(encoding="utf-8")
        for required in ["testWhiteCardsRenderRealPriceAndMissingState", "accessibilityExtraExtraExtraLarge", "width: 320",
                         "Measure the actual native name and price labels", "label.sizeThatFits", "Prezzo non disponibile",
                         "scrollToRow(at: indexPath, at: .top, animated: false)", "cell.window === window", "table.cellForRow(at: indexPath)",
                         "Presentation and refresh must not rewrite private bookmark identity"]:
            self.assertIn(required, favourites)
        recommendations = (IOS / "Tests/RecommendationControllerTests.swift").read_text(encoding="utf-8")
        self.assertIn("testNativeRecommendationCardFitsAccessibilityText", recommendations)
        self.assertIn("Rendering a selected public count must not cast or repeat a vote", recommendations)

    def test_native_reference_palette_keeps_real_price_and_vote_data(self):
        favourites = (IOS / "App/SavedVenuesViewController.swift").read_text(encoding="utf-8")
        self.assertIn("content.secondaryAttributedText = visual", favourites)
        self.assertIn("price.observedOn", favourites)
        self.assertIn("price.confirmations", favourites)
        self.assertIn("cell.accessibilityValue =", favourites)
        self.assertNotIn("store.save(", favourites)
        votes = (IOS / "App/RecommendationsViewController.swift").read_text(encoding="utf-8")
        self.assertIn('?? "Conteggio non disponibile"', votes)
        self.assertIn("NativeAppearance.button(selected: value?.recommended == true", votes)
        self.assertIn("if button.isEnabled { onToggle?() }", votes)
        self.assertIn("heightAnchor.constraint(greaterThanOrEqualToConstant: 48)", votes)


if __name__ == "__main__":
    unittest.main()
