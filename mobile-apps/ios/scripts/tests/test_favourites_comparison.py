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
        self.assertIn("NativeTabsController: UIViewController, UITabBarDelegate", tabs)
        self.assertIn("lazy var browser", tabs)
        self.assertIn('mapNavigation.tabBarItem = bottomItem("Mappa", label: "Mappa"', tabs)
        self.assertIn("for child in [mapNavigation, favouritesNavigation]", tabs)
        self.assertIn("bottomBar.items = [homeItem, mapNavigation.tabBarItem, favouritesNavigation.tabBarItem, saveItem, recommendationsItem]", tabs)
        self.assertIn("browser.openSavedVenue(url)", tabs)
        browser = (IOS / "App/BrowserViewController.swift").read_text(encoding="utf-8")
        self.assertIn('navigationItem.title = "Dove bevo"', browser)
        self.assertNotIn('\n        title = "Dove bevo"', browser)
        tests = (IOS / "UITests/BrowserSmokeTests.swift").read_text(encoding="utf-8")
        self.assertIn("verifyLiveFavouriteComparisonReadOnly", tests)
        self.assertIn('app.tabBars.buttons["Mappa"]', tests)
        self.assertIn('app.staticTexts["favorites.loaded"]', tests)
        self.assertIn("hasVisiblePositiveCoverage", tests)

    def test_bottom_actions_are_contextual_and_do_not_select_empty_destinations(self):
        tabs = (IOS / "App/NativeTabsController.swift").read_text(encoding="utf-8")
        for label in ["Home", "Salva nei preferiti", "Drink consigliati"]:
            self.assertIn(f'label: "{label}"', tabs)
        self.assertIn("saveItem.isEnabled = enabled", tabs)
        self.assertIn("recommendationsItem.isEnabled = enabled", tabs)
        self.assertIn("mapNavigation.topViewController === browser && venueActionsAvailable", tabs)
        self.assertIn("guard (0...1).contains(index)", tabs)
        self.assertNotIn("UITabBarController", tabs)
        self.assertIn("browser.goHome()", tabs)
        self.assertIn("browser.saveCurrentVenue()", tabs)
        self.assertIn("browser.showRecommendations()", tabs)
        browser = (IOS / "App/BrowserViewController.swift").read_text(encoding="utf-8")
        self.assertIn("if isMapDestinationSelected?() == false { return nil }", browser)
        self.assertIn("guard browserVisible, bookmarkLifecycleActive", browser)
        saved = (IOS / "App/SavedVenuesViewController.swift").read_text(encoding="utf-8")
        self.assertIn("guard visible, lifecycleActive, isDestinationSelected?() != false", saved)

    def test_more_menu_owns_share_reload_only_and_save_stays_on_current_venue(self):
        browser = (IOS / "App/BrowserViewController.swift").read_text(encoding="utf-8")
        more = browser.split("private func moreMenu()", 1)[1].split("private var canSaveCurrentVenue", 1)[0]
        self.assertIn('UIAction(title: "Condividi"', more)
        self.assertIn('UIAction(title: pageLoading ? "Interrompi" : "Ricarica"', more)
        for title in ["Home", "Preferiti", "Salva nei preferiti", "Drink consigliati"]:
            self.assertNotIn(f'UIAction(title: "{title}"', more)
        self.assertNotIn("saveMenuEnabled", browser)
        self.assertNotIn("toolbar.items", browser)
        save = browser.split("@objc func saveCurrentVenue()", 1)[1].split("@objc func showRecommendations()", 1)[0]
        self.assertIn("try self.savedVenues.save(url: venue.url, label: venue.label)", save)
        self.assertNotIn("showSavedVenues()", save)
        self.assertIn('"Preferito salvato"', save)

    def test_native_and_ui_suites_exercise_real_controls_and_same_document_history(self):
        native = (IOS / "Tests/BottomNavigationControllerTests.swift").read_text(encoding="utf-8")
        for required in ["bar.subviews.compactMap", "accessibilityExtraExtraExtraLarge", "tabs.children.count, 2",
                         "testHomeResetsSameBrowserButMapResumesItsRetainedStack", "testDestinationChangesDuringParentAppearance",
                         "testOffscreenFavouritesCannotFetchOrAcceptLateResults", "testOverflowUpdatesLoadingAndRecovery",
                         "testSameDocumentHistory", "history.pushState", "web.canGoBack"]:
            self.assertIn(required, native)
        ui = (IOS / "UITests/BrowserSmokeTests.swift").read_text(encoding="utf-8")
        self.assertIn('app.tabBars["native.bottomNavigation"]', ui)
        self.assertIn("assertShareAndReloadAvailable()", ui)
        save = ui.split("private func saveCurrentVenueInOneTap()", 1)[1].split("private func assertShareAndReloadAvailable()", 1)[0]
        self.assertIn('app.alerts["Preferito salvato"]', save)
        self.assertIn('app.navigationBars["Dove bevo"].exists', save)
        self.assertIn('app.tabBars.buttons["Mappa"].isSelected', save)


if __name__ == "__main__":
    unittest.main()
