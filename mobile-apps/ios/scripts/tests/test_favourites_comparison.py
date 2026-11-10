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
        self.assertIn("NativeTabsController: UIViewController, UINavigationControllerDelegate", tabs)
        self.assertIn("lazy var browser", tabs)
        self.assertIn("bottomBar = NativeBottomBar()", tabs)
        self.assertIn("for child in [mapNavigation, favouritesNavigation, discoveryNavigation, areaVotesNavigation]", tabs)
        bar = (IOS / "App/NativeBottomBar.swift").read_text(encoding="utf-8")
        self.assertIn("case home, search, map, favourites, recommendations", bar)
        self.assertIn("for action in BottomNavigationAction.allCases", bar)
        self.assertIn("let button = NativeBottomButton(type: .system)", bar)
        self.assertIn("private final class NativeBottomButton: UIButton", bar)
        self.assertNotIn("accessibilityTraits = .tabBar", bar)
        self.assertNotIn("accessibilityElements = buttons", bar)
        self.assertIn("titleLabel?.accessibilityElementsHidden = true", bar)
        self.assertIn("browser.openSavedVenue(url)", tabs)
        browser = (IOS / "App/BrowserViewController.swift").read_text(encoding="utf-8")
        self.assertIn("navigationItem.title = nil", browser)
        self.assertIn("mapNavigation.setNavigationBarHidden(true", tabs)
        self.assertNotIn('\n        title = "Dove bevo"', browser)
        tests = (IOS / "UITests/BrowserSmokeTests.swift").read_text(encoding="utf-8")
        self.assertIn("verifyAreaRecommendationsReadOnly", tests)
        self.assertIn('app.buttons["tab.map"]', tests)
        self.assertIn('app.tables["areaVotes.list"]', tests)
        self.assertIn("hasVisiblePositiveCoverage", tests)

    def test_bottom_destinations_are_reachable_and_save_is_per_drink(self):
        tabs = (IOS / "App/NativeTabsController.swift").read_text(encoding="utf-8")
        bar = (IOS / "App/NativeBottomBar.swift").read_text(encoding="utf-8")
        for label in ["Home", "Cerca", "Consigliati"]:
            self.assertIn(f'return "{label}"', bar)
        self.assertNotIn('case .save:', bar)
        self.assertIn('case home, search, map, favourites, recommendations', bar)
        self.assertIn('topMoreButton.accessibilityIdentifier = "browser.more"', tabs)
        self.assertIn('content.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor)', tabs)
        self.assertIn('topChrome.widthAnchor.constraint(equalToConstant: 48)', tabs)
        self.assertIn('topMoreButton.menu = browser.moreMenu()', tabs)
        self.assertIn("button.isEnabled = true", bar)
        self.assertNotIn("traits.insert(.notEnabled)", bar)
        self.assertIn("sender.isEnabled", bar)
        self.assertIn("bottomBar.update(destination: destinationIndex, venueActionsEnabled: enabled)", tabs)
        self.assertIn("heightAnchor.constraint(greaterThanOrEqualToConstant: 56)", bar)
        self.assertIn("widthAnchor.constraint(greaterThanOrEqualToConstant: 48)", bar)
        self.assertIn("Self.columns(for: usableWidth, fontScale:", bar)
        self.assertIn("usableWidth - 8 >= 5 * 56 * max(1, fontScale) ? 5 : 3", bar)
        self.assertIn("safeAreaLayoutGuide.leadingAnchor", bar)
        self.assertIn("safeAreaInsets.left - safeAreaInsets.right", bar)
        self.assertIn("mapNavigation.topViewController === browser && venueActionsAvailable", tabs)
        self.assertIn("guard (0...3).contains(index)", tabs)
        self.assertNotIn("UITabBarController", tabs)
        self.assertNotIn("UITabBar()", tabs)
        self.assertIn("browser.captureDiscoveryArea", tabs)
        self.assertIn("DiscoveryViewController(client: discoveryClient", tabs)
        self.assertNotIn("browser.goHome()", tabs)
        self.assertIn("self.areaVotes.setArea(area)", tabs)
        self.assertIn("case .recommendations: openAreaVotes()", tabs)
        self.assertIn("browser.openMapSearch()", tabs)
        self.assertIn("browser.cancelPendingSearch()", tabs)
        self.assertIn("activeNavigation.pushViewController(PrivacyViewController()", tabs)
        self.assertIn("activeNavigation.pushViewController(information", tabs)
        browser = (IOS / "App/BrowserViewController.swift").read_text(encoding="utf-8")
        self.assertIn("if isMapDestinationSelected?() == false { return nil }", browser)
        self.assertIn("guard browserVisible, bookmarkLifecycleActive", browser)
        saved = (IOS / "App/SavedVenuesViewController.swift").read_text(encoding="utf-8")
        self.assertIn("guard visible, lifecycleActive, isDestinationSelected?() != false", saved)

    def test_more_menu_owns_share_reload_only_and_save_stays_on_current_venue(self):
        browser = (IOS / "App/BrowserViewController.swift").read_text(encoding="utf-8")
        more = browser.split("func moreMenu()", 1)[1].split("private var canSaveCurrentVenue", 1)[0]
        self.assertIn('UIAction(title: "Condividi"', more)
        self.assertIn('UIAction(title: pageLoading ? "Interrompi" : "Ricarica"', more)
        for title in ["Home", "Preferiti", "Salva nei preferiti", "Drink consigliati"]:
            self.assertNotIn(f'UIAction(title: "{title}"', more)
        self.assertNotIn("saveMenuEnabled", browser)
        self.assertNotIn("toolbar.items", browser)
        save = browser.split("@objc func saveCurrentVenue()", 1)[1].split("@objc func showRecommendations()", 1)[0]
        self.assertIn("try self.savedDrinks.save(SavedDrink.validated", save)
        self.assertNotIn("self.savedVenues.save", save)
        self.assertIn("self.favouriteSave.consume(context, currentURL: self.webView?.url, active: self.isBookmarkInteractionActive)", save)
        self.assertNotIn("showSavedVenues()", save)
        self.assertIn('"Preferito salvato"', save)

    def test_native_and_ui_suites_exercise_real_controls_and_same_document_history(self):
        native = (IOS / "Tests/BottomNavigationControllerTests.swift").read_text(encoding="utf-8")
        for required in ["descendants(bar).compactMap", "UIWindow(windowScene: scene)", "previousKeyWindow?.makeKey()",
                         "bar.window === window", "convert($0.bounds, to: bar)",
                         "accessibilityExtraExtraExtraLarge", "tabs.children.count, 4",
                         "testCercaReturnsToMapSearchAndMoreUsesTheVisibleNavigationStack", "testDestinationChangesDuringParentAppearance",
                         "testOffscreenFavouritesCannotFetchOrAcceptLateResults", "testOverflowUpdatesLoadingAndRecovery",
                         "testOwnedRequestHistory", "browser.openSavedVenue(canonical)", "MobileEntry.venueDocument(canonical)", "web.canGoBack",
                         "web.backForwardList.currentItem", "web.backForwardList.backList.last", "web.backForwardList.forwardList.first",
                         "loadSimulatedRequest(request, response: response, responseData: data)"]:
            self.assertIn(required, native)
        history = native.split("func testOwnedRequestHistory", 1)[1].split("private func actions", 1)[0]
        self.assertNotIn("web.evaluateJavaScript", history)
        self.assertIn("web.window === window", history)
        ui = (IOS / "UITests/BrowserSmokeTests.swift").read_text(encoding="utf-8")
        self.assertIn('app.descendants(matching: .any)["native.bottomNavigation"]', ui)
        self.assertIn("assertShareAndReloadAvailable()", ui)
        self.assertIn("verifyLiveVenueHistoryReadOnly(venueName: publicName)", ui)
        self.assertIn('let back = app.buttons["Indietro"]', ui)
        self.assertIn('let forward = app.buttons["Avanti"]', ui)
        history_flow = ui.split("private func verifyLiveVenueHistoryReadOnly", 1)[1].split("private func waitForOrdinaryKeyboard", 1)[0]
        self.assertLess(history_flow.index('app.buttons["browser.more"].tap()'), history_flow.index('let forward = app.buttons["Avanti"]'))
        self.assertIn('XCTAssertFalse(app.buttons["browser.saveVenue"].exists)', ui)
        self.assertIn('app.tables["areaVotes.list"]', ui)
        dismiss = ui.split("private func dismissMoreMenu()", 1)[1].split("private func interactiveMap()", 1)[0]
        self.assertIn('app.buttons["Informazioni"]', dismiss)
        self.assertIn("returnFromNativeInformation()", dismiss)
        information = ui.split("private func returnFromNativeInformation()", 1)[1].split("private func assertNoSharePresentation()", 1)[0]
        self.assertIn('app.navigationBars["Altro"]', information)
        self.assertIn('app.tables["information.list"]', information)
        self.assertIn('buttons["Torna alla mappa"]', information)
        self.assertNotIn('app.alerts["Dove bevo"]', dismiss)
        self.assertNotIn(".coordinate(", dismiss)
        self.assertIn('app.buttons["tab.map"].isSelected', dismiss)
        self.assertIn('app.otherElements["ShareSheet.RemoteContainerView"].exists', dismiss)


if __name__ == "__main__":
    unittest.main()
