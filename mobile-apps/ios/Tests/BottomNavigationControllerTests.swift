import UIKit
import WebKit
import XCTest
@testable import DoveBevo

final class BottomNavigationControllerTests: XCTestCase {
    @MainActor
    func testFiveActualBottomControlsFitNarrowWidthAndAccessibilityTextWithoutBlankDestinations() throws {
        let traits = UITraitCollection(preferredContentSizeCategory: .accessibilityExtraExtraExtraLarge)
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first {
            $0.activationState == .foregroundActive
        })
        let previousKeyWindow = scene.windows.first { $0.isKeyWindow }
        let window = UIWindow(windowScene: scene)
        let host = UIViewController()
        window.frame = CGRect(x: 0, y: 0, width: 320, height: 568)
        window.rootViewController = host
        host.view.frame = window.bounds
        defer {
            window.isHidden = true
            window.rootViewController = nil
            previousKeyWindow?.makeKey()
        }
        traits.performAsCurrent {
            let browser = BrowserViewController(websiteLoader: { _, _ in nil })
            let tabs = NativeTabsController(browser: browser)
            host.addChild(tabs)
            host.view.addSubview(tabs.view)
            tabs.view.frame = host.view.bounds
            tabs.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            host.setOverrideTraitCollection(traits, forChild: tabs)
            tabs.didMove(toParent: host)
            window.makeKeyAndVisible()
            window.layoutIfNeeded()
            tabs.view.layoutIfNeeded()
            let bar = tabs.bottomBar
            bar.layoutIfNeeded()
            XCTAssertTrue(bar.window === window, "Measure the actual mounted native controls")
            XCTAssertEqual(tabs.traitCollection.preferredContentSizeCategory, .accessibilityExtraExtraExtraLarge)
            XCTAssertEqual(bar.bounds.width, 320, accuracy: 0.5)
            XCTAssertEqual(bar.buttons.map { $0.configuration?.title }, ["Home", "Mappa", "Preferiti", "Salva", "Consigliati"])
            XCTAssertEqual(bar.buttons.compactMap(\.accessibilityLabel), ["Home", "Mappa", "Preferiti", "Salva nei preferiti", "Drink consigliati"])
            XCTAssertTrue(tabs.children.contains { $0 === tabs.mapNavigation })
            XCTAssertTrue(tabs.children.contains { $0 === tabs.favouritesNavigation })
            XCTAssertEqual(tabs.children.count, 2, "Actions must not create empty navigation destinations")
            XCTAssertEqual(bar.frame.maxY, tabs.view.safeAreaLayoutGuide.layoutFrame.maxY, accuracy: 0.5)
            XCTAssertGreaterThanOrEqual(bar.frame.height, 48)
            XCTAssertLessThanOrEqual(tabs.mapNavigation.view.frame.maxY, bar.frame.minY + 0.5)
            // iOS 27 nests its native buttons inside material containers. Do
            // not depend on private class names or immediate-child structure.
            let controls = descendants(bar).compactMap { $0 as? UIControl }
            let frames = controls.map { $0.convert($0.bounds, to: bar) }
            let hierarchy = descendants(bar).map { "\(type(of: $0)): \($0.frame)" }.joined(separator: "\n")
            XCTAssertEqual(controls.count, 5, "Measure actual UIKit controls, not a duplicated geometry formula: \(hierarchy)")
            for (index, frame) in frames.enumerated() {
                XCTAssertGreaterThanOrEqual(frame.width, 48)
                XCTAssertGreaterThanOrEqual(frame.height, 48)
                XCTAssertTrue(bar.bounds.contains(frame))
                for other in frames.dropFirst(index + 1) { XCTAssertFalse(frame.intersects(other)) }
            }
            for button in bar.buttons {
                button.layoutIfNeeded()
                XCTAssertTrue(button.isAccessibilityElement)
                XCTAssertNotNil(button.configuration?.image)
                if let title = button.titleLabel, let image = button.imageView {
                    XCTAssertGreaterThan(title.bounds.height, 0)
                    XCTAssertGreaterThan(image.bounds.height, 0)
                    XCTAssertEqual(title.text ?? title.attributedText?.string, button.configuration?.title)
                    XCTAssertEqual(title.numberOfLines, 0)
                    XCTAssertTrue(button.bounds.contains(title.convert(title.bounds, to: button)), "The visible title must not be clipped")
                    XCTAssertTrue(button.bounds.contains(image.convert(image.bounds, to: button)), "The visible icon must not be clipped")
                    let required = title.sizeThatFits(CGSize(width: title.bounds.width, height: .greatestFiniteMagnitude))
                    XCTAssertLessThanOrEqual(required.height, title.bounds.height + 0.5, "The whole wrapped title must fit, including Preferiti and Consigliati")
                } else { XCTFail("Every native button needs a visible icon and title") }
            }
            XCTAssertTrue(bar.button(for: .map).isSelected)
            XCTAssertTrue(bar.button(for: .map).accessibilityTraits.contains(.selected))
            XCTAssertFalse(bar.button(for: .save).isEnabled)
            XCTAssertTrue(bar.button(for: .save).accessibilityTraits.contains(.notEnabled))
            XCTAssertFalse(bar.button(for: .recommendations).isEnabled)
            XCTAssertTrue(bar.button(for: .recommendations).accessibilityTraits.contains(.notEnabled))
            bar.button(for: .save).sendActions(for: .touchUpInside)
            bar.button(for: .recommendations).sendActions(for: .touchUpInside)
            XCTAssertEqual(tabs.selectedIndex, 0)
            XCTAssertEqual(tabs.mapNavigation.viewControllers.count, 1)
            XCTAssertNil(browser.presentedViewController)
            let originalButtons = bar.buttons
            let largeTextHeight = bar.bounds.height
            XCTAssertGreaterThanOrEqual(Set(frames.map { Int($0.minY.rounded()) }).count, 2)
            host.setOverrideTraitCollection(UITraitCollection(preferredContentSizeCategory: .large), forChild: tabs)
            window.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
            host.view.frame = window.bounds
            window.layoutIfNeeded()
            bar.setNeedsLayout()
            bar.layoutIfNeeded()
            window.layoutIfNeeded()
            tabs.view.layoutIfNeeded()
            XCTAssertEqual(bar.bounds.width, 390, accuracy: 0.5)
            XCTAssertLessThan(bar.bounds.height, largeTextHeight, "Normal width/text returns to one usable row")
            XCTAssertTrue(zip(originalButtons, bar.buttons).allSatisfy { pair in pair.0 === pair.1 }, "Resizing retains each native control and target")
            let resizedFrames = bar.buttons.map { $0.convert($0.bounds, to: bar) }
            XCTAssertEqual(Set(resizedFrames.map { Int($0.minY.rounded()) }).count, 1)
            for frame in resizedFrames {
                XCTAssertGreaterThanOrEqual(frame.width, 48)
                XCTAssertGreaterThanOrEqual(frame.height, 48)
                XCTAssertTrue(bar.bounds.contains(frame))
            }
            tabs.additionalSafeAreaInsets = UIEdgeInsets(top: 0, left: 40, bottom: 0, right: 40)
            window.frame = CGRect(x: 0, y: 0, width: 844, height: 390)
            host.view.frame = window.bounds
            window.layoutIfNeeded()
            bar.setNeedsLayout()
            bar.layoutIfNeeded()
            window.layoutIfNeeded()
            tabs.view.layoutIfNeeded()
            XCTAssertGreaterThanOrEqual(bar.safeAreaInsets.left, 40)
            XCTAssertGreaterThanOrEqual(bar.safeAreaInsets.right, 40)
            for button in bar.buttons {
                let frame = button.convert(button.bounds, to: bar)
                XCTAssertTrue(bar.safeAreaLayoutGuide.layoutFrame.contains(frame), "Landscape/split-window side insets protect every native target")
                XCTAssertGreaterThanOrEqual(frame.width, 48)
                XCTAssertGreaterThanOrEqual(frame.height, 48)
            }
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
        XCTAssertTrue(tabs.bottomBar.button(for: .favourites).isSelected)
        XCTAssertTrue(tabs.bottomBar.button(for: .favourites).accessibilityTraits.contains(.selected))
        let bar = tabs.bottomBar
        bar.button(for: .map).sendActions(for: .touchUpInside)
        XCTAssertTrue(tabs.mapNavigation.topViewController === details)
        XCTAssertEqual(requests, [URLPolicy.homeURL])
        tabs.selectedIndex = 1
        bar.button(for: .home).sendActions(for: .touchUpInside)
        XCTAssertEqual(tabs.selectedIndex, 0)
        XCTAssertTrue(bar.button(for: .map).isSelected)
        XCTAssertFalse(bar.button(for: .home).isSelected)
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
        XCTAssertTrue(tabs.bottomBar.button(for: .favourites).isSelected)
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
        let statusIdentifiers = descendants(controller.view).compactMap { ($0 as? UILabel)?.accessibilityIdentifier }
        XCTAssertTrue(statusIdentifiers.contains("favorites.unavailable"))
        XCTAssertFalse(statusIdentifiers.contains("favorites.partial"), "The late result cannot publish a completed snapshot")
        XCTAssertFalse(statusIdentifiers.contains("favorites.loading"))
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
        // loadHTMLString establishes the document origin but does not promise
        // a native history item. Materialize the owned home entry explicitly
        // before adding the venue; assert the real WKBackForwardList, not just
        // a location change or the JavaScript history.length value.
        let homeURL = URL(string: "https://www.dovebevo.com/?owned-history=home")!
        let primed = expectation(description: "Owned home history item")
        web.evaluateJavaScript("history.pushState({}, '', '/?owned-history=home')") { _, error in
            XCTAssertNil(error); primed.fulfill()
        }
        wait(for: [primed], timeout: 10)
        waitUntil("Owned home item must exist") { web.backForwardList.currentItem?.url == homeURL }
        let pushed = expectation(description: "Owned same-document route")
        web.evaluateJavaScript("history.pushState({}, '', '/bar/n123?c=u0nd9')") { _, error in
            XCTAssertNil(error); pushed.fulfill()
        }
        wait(for: [pushed], timeout: 10)
        waitUntil("Owned history back enabled") {
            web.canGoBack && web.url?.path == "/bar/n123" && web.backForwardList.backList.last?.url == homeURL
        }
        XCTAssertEqual(web.backForwardList.currentItem?.url.path, "/bar/n123")
        let back = try XCTUnwrap(browser.navigationItem.leftBarButtonItems?.first)
        _ = browser.perform(try XCTUnwrap(back.action))
        waitUntil("Back returns to owned home") { web.url == homeURL && web.canGoForward }
        XCTAssertEqual(web.backForwardList.currentItem?.url, homeURL)
        XCTAssertEqual(web.backForwardList.forwardList.first?.url.path, "/bar/n123")
        XCTAssertFalse(try share(browser).attributes.contains(.disabled))
        XCTAssertTrue(try actions(browser).contains { $0.title == "Ricarica" })
        let forward = try XCTUnwrap(browser.navigationItem.leftBarButtonItems?.last)
        _ = browser.perform(try XCTUnwrap(forward.action))
        waitUntil("Forward restores owned venue route") { web.url?.path == "/bar/n123" }
        XCTAssertEqual(web.backForwardList.backList.last?.url, homeURL)
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

    @MainActor
    private func descendants(_ view: UIView) -> [UIView] {
        view.subviews + view.subviews.flatMap { descendants($0) }
    }
}
