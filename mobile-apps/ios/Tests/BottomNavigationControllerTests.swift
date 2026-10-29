import UIKit
import WebKit
import XCTest
@testable import DoveBevo

final class BottomNavigationControllerTests: XCTestCase {
    @MainActor
    func testFiveActualBottomControlsFitNarrowWidthAndAccessibilityTextWithoutBlankDestinations() throws {
        let traits = UITraitCollection(preferredContentSizeCategory: .accessibilityExtraExtraExtraLarge)
        traits.performAsCurrent {
            let browser = BrowserViewController(websiteLoader: { _, _ in nil })
            let tabs = NativeTabsController(browser: browser)
            tabs.loadViewIfNeeded()
            tabs.view.frame = CGRect(x: 0, y: 0, width: 320, height: 568)
            tabs.view.layoutIfNeeded()
            let bar = tabs.bottomBar
            XCTAssertEqual(bar.items?.map(\.title), ["Home", "Mappa", "Preferiti", "Salva", "Consigliati"])
            XCTAssertEqual(bar.items?.compactMap(\.accessibilityLabel), ["Home", "Mappa", "Preferiti", "Salva nei preferiti", "Drink consigliati"])
            XCTAssertTrue(tabs.children.contains { $0 === tabs.mapNavigation })
            XCTAssertTrue(tabs.children.contains { $0 === tabs.favouritesNavigation })
            XCTAssertEqual(tabs.children.count, 2, "Actions must not create empty navigation destinations")
            XCTAssertEqual(bar.frame.maxY, tabs.view.safeAreaLayoutGuide.layoutFrame.maxY, accuracy: 0.5)
            XCTAssertGreaterThanOrEqual(bar.frame.height, 48)
            XCTAssertLessThanOrEqual(tabs.mapNavigation.view.frame.maxY, bar.frame.minY + 0.5)
            let controls = bar.subviews.compactMap { $0 as? UIControl }.sorted { $0.frame.minX < $1.frame.minX }
            XCTAssertEqual(controls.count, 5, "Measure actual UIKit controls, not a duplicated geometry formula")
            for (index, control) in controls.enumerated() {
                XCTAssertGreaterThanOrEqual(control.bounds.width, 48)
                XCTAssertGreaterThanOrEqual(control.bounds.height, 48)
                XCTAssertTrue(bar.bounds.contains(control.frame))
                if index > 0 { XCTAssertLessThanOrEqual(controls[index - 1].frame.maxX, control.frame.minX + 0.5) }
            }
            XCTAssertTrue(bar.selectedItem === tabs.mapNavigation.tabBarItem)
            XCTAssertFalse(bar.items?[3].isEnabled ?? true)
            XCTAssertFalse(bar.items?[4].isEnabled ?? true)
            tabs.tabBar(bar, didSelect: bar.items![3])
            tabs.tabBar(bar, didSelect: bar.items![4])
            XCTAssertEqual(tabs.selectedIndex, 0)
            XCTAssertEqual(tabs.mapNavigation.viewControllers.count, 1)
            XCTAssertNil(browser.presentedViewController)
        }
    }

    @MainActor
    func testHomeResetsSameBrowserButMapResumesItsRetainedStack() throws {
        var requests: [URL] = []
        let browser = BrowserViewController(websiteLoader: { _, request in
            requests.append(request.url!); return nil
        })
        let tabs = NativeTabsController(browser: browser)
        tabs.loadViewIfNeeded()
        let originalView = browser.view
        let details = UIViewController()
        tabs.mapNavigation.pushViewController(details, animated: false)
        tabs.selectedIndex = 1
        let bar = tabs.bottomBar
        tabs.tabBar(bar, didSelect: try XCTUnwrap(bar.items?[1]))
        XCTAssertTrue(tabs.mapNavigation.topViewController === details)
        XCTAssertEqual(requests, [URLPolicy.homeURL])
        tabs.selectedIndex = 1
        tabs.tabBar(bar, didSelect: try XCTUnwrap(bar.items?.first))
        XCTAssertEqual(tabs.selectedIndex, 0)
        XCTAssertTrue(bar.selectedItem === tabs.mapNavigation.tabBarItem)
        XCTAssertTrue(tabs.mapNavigation.topViewController === browser)
        XCTAssertTrue(browser.view === originalView)
        XCTAssertEqual(requests, [URLPolicy.homeURL, URLPolicy.homeURL])
    }

    @MainActor
    func testDestinationChangesDuringParentAppearanceRemainBalancedAndSelected() {
        let browser = BrowserViewController(websiteLoader: { _, _ in nil })
        let tabs = NativeTabsController(browser: browser)
        tabs.loadViewIfNeeded()
        tabs.beginAppearanceTransition(true, animated: false)
        tabs.selectedIndex = 1
        tabs.endAppearanceTransition()
        XCTAssertEqual(tabs.selectedIndex, 1)
        XCTAssertTrue(tabs.bottomBar.selectedItem === tabs.favouritesNavigation.tabBarItem)
        XCTAssertTrue(tabs.mapNavigation.view.isHidden)
        XCTAssertFalse(tabs.favouritesNavigation.view.isHidden)
        tabs.beginAppearanceTransition(false, animated: false)
        tabs.selectedIndex = 0
        tabs.endAppearanceTransition()
        XCTAssertEqual(tabs.selectedIndex, 0)
        XCTAssertFalse(tabs.mapNavigation.view.isHidden)
        XCTAssertTrue(tabs.favouritesNavigation.view.isHidden)
    }

    @MainActor
    func testOffscreenFavouritesCannotFetchOrAcceptLateResultsEvenWithActiveScene() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = SavedVenueStore(directoryURL: directory)
        let venue = URL(string: "https://www.dovebevo.com/bar/n123?c=u0nd9")!
        try store.save(url: venue, label: "Owned bookmark")
        let client = DelayedFavouriteService()
        var selected = false
        let controller = SavedVenuesViewController(store: store, client: client, activityCheck: { true }) { _ in }
        controller.isDestinationSelected = { selected }
        controller.loadViewIfNeeded()
        controller.beginAppearanceTransition(true, animated: false)
        controller.endAppearanceTransition()
        XCTAssertTrue(client.calls.isEmpty, "Scene activity cannot authorize a hidden destination")
        selected = true
        controller.refresh()
        XCTAssertEqual(client.calls.count, 1)
        let original = try Data(contentsOf: store.fileURL)
        selected = false
        try client.complete(0, FavouriteComparisonSnapshot(venues: [:], unavailable: [venue]))
        XCTAssertFalse(controller.view.subviews.contains { $0.accessibilityIdentifier == "favorites.loaded" })
        XCTAssertEqual(try Data(contentsOf: store.fileURL), original)
        controller.refresh()
        XCTAssertEqual(client.calls.count, 1, "An offscreen manual refresh must remain inert")
        controller.beginAppearanceTransition(false, animated: false)
        controller.endAppearanceTransition()
    }

    @MainActor
    func testOverflowUpdatesLoadingAndRecoveryWithoutVenueEligibilityChanging() throws {
        var webView: WKWebView?
        let browser = BrowserViewController(websiteLoader: { web, _ in webView = web; return nil })
        let navigation = UINavigationController(rootViewController: browser)
        browser.loadViewIfNeeded()
        XCTAssertEqual(browser.navigationItem.leftBarButtonItems?.compactMap(\.accessibilityIdentifier), ["browser.back", "browser.forward"])
        XCTAssertEqual(browser.navigationItem.rightBarButtonItems?.compactMap(\.accessibilityIdentifier), ["browser.more"])
        XCTAssertTrue(try actions(browser).contains { $0.title == "Interrompi" })
        XCTAssertTrue(try share(browser).attributes.contains(.disabled))
        let web = try XCTUnwrap(webView)
        browser.webView(web, didFinish: nil)
        XCTAssertTrue(try actions(browser).contains { $0.title == "Ricarica" })
        XCTAssertFalse(try actions(browser).contains { $0.title == "Interrompi" })
        browser.webView(web, didStartProvisionalNavigation: nil)
        XCTAssertTrue(try actions(browser).contains { $0.title == "Interrompi" })
        browser.webView(web, didFailProvisionalNavigation: nil, withError: NSError(domain: NSURLErrorDomain, code: NSURLErrorNotConnectedToInternet))
        XCTAssertTrue(try actions(browser).contains { $0.title == "Ricarica" })
        XCTAssertTrue(try share(browser).attributes.contains(.disabled))
        XCTAssertFalse(try actions(browser).contains { ["Preferiti", "Salva nei preferiti", "Drink consigliati", "Home"].contains($0.title) })
        XCTAssertTrue(navigation.topViewController === browser)
    }

    @MainActor
    func testSameDocumentHistoryRetainsReadyShareAndReloadMenuAfterBackAndForward() throws {
        var ownedWeb: WKWebView?
        let browser = BrowserViewController(websiteLoader: { web, request in
            ownedWeb = web
            // An owned asset-free document, never a public request or contribution.
            return web.loadHTMLString("<html><body><h1>Owned history fixture</h1></body></html>", baseURL: request.url)
        })
        let navigation = UINavigationController(rootViewController: browser)
        browser.loadViewIfNeeded()
        let web = try XCTUnwrap(ownedWeb)
        waitUntil("Owned page must finish") { (try? self.share(browser).attributes.contains(.disabled)) == false }
        let pushed = expectation(description: "Owned same-document route")
        web.evaluateJavaScript("history.pushState({}, '', '/bar/n123?c=u0nd9')") { _, error in
            XCTAssertNil(error); pushed.fulfill()
        }
        wait(for: [pushed], timeout: 10)
        waitUntil("Owned history back enabled") { web.canGoBack && web.url?.path == "/bar/n123" }
        let back = try XCTUnwrap(browser.navigationItem.leftBarButtonItems?.first)
        _ = browser.perform(try XCTUnwrap(back.action))
        waitUntil("Back returns to owned home") { web.url?.path == "/" }
        XCTAssertFalse(try share(browser).attributes.contains(.disabled))
        XCTAssertTrue(try actions(browser).contains { $0.title == "Ricarica" })
        let forward = try XCTUnwrap(browser.navigationItem.leftBarButtonItems?.last)
        _ = browser.perform(try XCTUnwrap(forward.action))
        waitUntil("Forward restores owned venue route") { web.url?.path == "/bar/n123" }
        XCTAssertFalse(try share(browser).attributes.contains(.disabled))
        XCTAssertTrue(try actions(browser).contains { $0.title == "Ricarica" })
        XCTAssertTrue(navigation.topViewController === browser)
    }

    @MainActor
    private func actions(_ browser: BrowserViewController) throws -> [UIAction] {
        try XCTUnwrap(browser.navigationItem.rightBarButtonItem?.menu).children.compactMap { $0 as? UIAction }
    }

    @MainActor
    private func share(_ browser: BrowserViewController) throws -> UIAction {
        try XCTUnwrap(try actions(browser).first { $0.identifier.rawValue == "browser.share" })
    }

    @MainActor
    private func waitUntil(_ description: String, condition: @escaping () -> Bool) {
        let ready = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in condition() }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 15), .completed, description)
    }
}
