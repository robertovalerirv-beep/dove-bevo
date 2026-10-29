"""Small source contract fences; Swift/UIKit behavior runs in the Mac gate."""
from pathlib import Path
import unittest

IOS = Path(__file__).resolve().parents[2]


class FavouritesComparisonGuards(unittest.TestCase):
    def test_transport_is_existing_public_get_only_and_isolated(self):
        source = (IOS / "App/FavouriteComparisonClient.swift").read_text(encoding="utf-8")
        for required in ["/api/health", "/api/prices/", "/data/", 'request.httpMethod = "GET"',
                         "httpCookieStorage = nil", "urlCredentialStorage = nil", "completionHandler(nil)",
                         "timeoutIntervalForResource = 15", "data.count <= maximum - body.count"]:
            self.assertIn(required, source)
        for forbidden in ['"POST"', "X-DoveBevo-Voter", "WKHTTPCookieStore", "URLSession.shared"]:
            self.assertNotIn(forbidden, source)

    def test_refresh_caps_include_queued_work_and_visible_only_entry(self):
        client = (IOS / "App/FavouriteComparisonClient.swift").read_text(encoding="utf-8")
        self.assertIn("schedule(60)", client)
        self.assertIn("activeCells.count < 3", client)
        self.assertIn("queued.removeAll()", client)
        controller = (IOS / "App/SavedVenuesViewController.swift").read_text(encoding="utf-8")
        initial = controller.split("override func viewDidLoad()", 1)[1].split("override func viewWillAppear", 1)[0]
        self.assertNotIn("store.load()", initial)
        self.assertNotIn("client.load(", initial)
        self.assertIn("guard canRead else", controller)

    def test_comparison_never_writes_network_names_or_prices_to_store(self):
        source = (IOS / "App/SavedVenuesViewController.swift").read_text(encoding="utf-8")
        self.assertNotIn("store.save(", source)
        self.assertIn("store.remove(url:", source)
        model = (IOS / "App/FavouriteComparison.swift").read_text(encoding="utf-8")
        self.assertIn("cellForCoordinates", model)
        self.assertIn("!$0.quarantined", model)
        self.assertIn("$0.band == band", model)

    def test_native_tabs_and_live_checks_keep_original_map_and_no_public_writes(self):
        tabs = (IOS / "App/NativeTabsController.swift").read_text(encoding="utf-8")
        self.assertIn("UITabBarController", tabs)
        self.assertIn("lazy var browser", tabs)
        self.assertIn('mapNavigation.tabBarItem.accessibilityLabel = "Mappa"', tabs)
        browser = (IOS / "App/BrowserViewController.swift").read_text(encoding="utf-8")
        self.assertIn('navigationItem.title = "Dove bevo"', browser)
        self.assertNotIn('\n        title = "Dove bevo"', browser)
        tests = (IOS / "UITests/BrowserSmokeTests.swift").read_text(encoding="utf-8")
        self.assertIn("verifyLiveFavouriteComparisonReadOnly", tests)
        self.assertIn('app.tabBars.buttons["Mappa"]', tests)
        self.assertIn('app.staticTexts["favorites.loaded"]', tests)
        self.assertIn("hasVisiblePositiveCoverage", tests)


if __name__ == "__main__":
    unittest.main()
