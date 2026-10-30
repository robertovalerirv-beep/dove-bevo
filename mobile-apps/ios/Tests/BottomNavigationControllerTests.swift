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
            // Keyboard-guide registration and Dynamic Type configuration can
            // schedule another UIKit layout pass. Observe the real managed
            // controls across two stable polls; never alter their bounds.
            var previousFittingContent: String?
            let settled = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
                window.layoutIfNeeded()
                tabs.view.layoutIfNeeded()
                bar.layoutIfNeeded()
                var rectangles: [String] = []
                for button in bar.buttons {
                    button.layoutIfNeeded()
                    guard let title = button.titleLabel, let image = button.imageView,
                          title.bounds.height > 0, image.bounds.height > 0 else {
                        previousFittingContent = nil; return false
                    }
                    let titleFrame = title.convert(title.bounds, to: button)
                    let imageFrame = image.convert(image.bounds, to: button)
                    guard button.bounds.contains(titleFrame), button.bounds.contains(imageFrame) else {
                        previousFittingContent = nil; return false
                    }
                    rectangles.append("\(button.accessibilityIdentifier ?? "")|\(self.precise(button.bounds))|\(self.precise(titleFrame))|\(self.precise(imageFrame))|\(title.font?.pointSize ?? 0)")
                }
                let current = rectangles.joined(separator: "\n")
                defer { previousFittingContent = current }
                return previousFittingContent == current
            }, object: nil)
            let settledResult = XCTWaiter.wait(for: [settled], timeout: 5)
            attachBottomGeometry(window: window, bar: bar, result: settledResult)
            XCTAssertEqual(settledResult, .completed, "Real native title and icon geometry must settle within the unchanged button bounds")
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
                XCTAssertFalse(button.accessibilityElementsHidden)
                XCTAssertNotNil(button.configuration?.image, "Missing symbol for \(button.accessibilityIdentifier ?? "unknown")")
                if let title = button.titleLabel, let image = button.imageView {
                    XCTAssertGreaterThan(title.bounds.height, 0)
                    XCTAssertGreaterThan(image.bounds.height, 0, "Empty symbol for \(button.accessibilityIdentifier ?? "unknown")")
                    XCTAssertFalse(title.isHidden)
                    XCTAssertFalse(image.isHidden)
                    XCTAssertTrue(title.accessibilityElementsHidden)
                    XCTAssertTrue(image.accessibilityElementsHidden)
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
    func testOwnedRequestHistoryRetainsReadyShareAndReloadMenuAfterBackAndForward() throws {
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first {
            $0.activationState == .foregroundActive
        })
        let previousKeyWindow = scene.windows.first { $0.isKeyWindow }
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
        defer {
            window.isHidden = true
            window.rootViewController = nil
            previousKeyWindow?.makeKey()
        }
        var ownedWeb: WKWebView?
        let browser = BrowserViewController(websiteLoader: { web, request in
            ownedWeb = web
            // Public WebKit API loads the owned response without sending the
            // request. Unlike loadHTMLString, this creates a real history item.
            // The document has no subresources, links or public contributions.
            let data = Data("<html><body><h1>Owned history fixture</h1></body></html>".utf8)
            let response = URLResponse(url: request.url!, mimeType: "text/html", expectedContentLength: data.count, textEncodingName: "UTF-8")
            return web.loadSimulatedRequest(request, response: response, responseData: data)
        })
        let navigation = UINavigationController(rootViewController: browser)
        window.rootViewController = navigation
        window.makeKeyAndVisible()
        window.layoutIfNeeded()
        browser.view.layoutIfNeeded()
        let web = try XCTUnwrap(ownedWeb)
        XCTAssertTrue(web.window === window)
        XCTAssertGreaterThan(web.bounds.width, 0)
        XCTAssertGreaterThan(web.bounds.height, 0)
        waitUntil("Owned page must finish") { (try? self.share(browser).attributes.contains(.disabled)) == false }
        // Use request-created items, matching WebKit's own public load-API
        // history test. A programmatic pushState is not a real user gesture and
        // is intentionally filtered by WebKit's native Back/Forward policy.
        // Actual user-driven SPA history is covered by the live UI case.
        let homeURL = URLPolicy.homeURL
        waitUntil("Owned home item must exist") { web.backForwardList.currentItem?.url == homeURL }
        XCTAssertTrue(web.backForwardList.backList.isEmpty)
        let venueURL = URL(string: "https://www.dovebevo.com/bar/n123?c=u0nd9")!
        browser.openSavedVenue(venueURL)
        waitUntil("Owned history back enabled") {
            web.canGoBack && web.url == venueURL && web.backForwardList.backList.last?.url == homeURL &&
                (try? self.share(browser).attributes.contains(.disabled)) == false
        }
        XCTAssertEqual(web.backForwardList.currentItem?.url, venueURL)
        XCTAssertEqual(web.backForwardList.backList.count, 1)
        XCTAssertTrue(web.backForwardList.forwardList.isEmpty)
        let back = try XCTUnwrap(browser.navigationItem.leftBarButtonItems?.first)
        _ = browser.perform(try XCTUnwrap(back.action))
        waitUntil("Back returns to owned home") {
            web.url == homeURL && web.canGoForward && (try? self.share(browser).attributes.contains(.disabled)) == false
        }
        XCTAssertEqual(web.backForwardList.currentItem?.url, homeURL)
        XCTAssertEqual(web.backForwardList.forwardList.first?.url, venueURL)
        XCTAssertTrue(web.backForwardList.backList.isEmpty)
        XCTAssertFalse(try share(browser).attributes.contains(.disabled))
        XCTAssertTrue(try actions(browser).contains { $0.title == "Ricarica" })
        let forward = try XCTUnwrap(browser.navigationItem.leftBarButtonItems?.last)
        _ = browser.perform(try XCTUnwrap(forward.action))
        waitUntil("Forward restores owned venue route") {
            web.url == venueURL && (try? self.share(browser).attributes.contains(.disabled)) == false
        }
        XCTAssertEqual(web.backForwardList.currentItem?.url, venueURL)
        XCTAssertEqual(web.backForwardList.backList.last?.url, homeURL)
        XCTAssertTrue(web.backForwardList.forwardList.isEmpty)
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

    private func precise(_ rect: CGRect) -> String {
        [rect.minX, rect.minY, rect.width, rect.height].map { String(format: "%.17g", Double($0)) }.joined(separator: ",")
    }

    @MainActor
    private func attachBottomGeometry(window: UIWindow, bar: NativeBottomBar, result: XCTWaiter.Result) {
        func viewRecord(_ view: UIView) -> String {
            let transform = view.transform
            let matrix = [transform.a, transform.b, transform.c, transform.d, transform.tx, transform.ty]
                .map { String(format: "%.17g", Double($0)) }.joined(separator: ",")
            return "\(type(of: view)) id=\(view.accessibilityIdentifier ?? "") frame=[\(precise(view.frame))] bounds=[\(precise(view.bounds))] inWindow=[\(precise(view.convert(view.bounds, to: window)))] transform=[\(matrix)] hidden=\(view.isHidden) clips=\(view.clipsToBounds)"
        }
        var lines = [
            "Owned native unit-test window; no fabricated geometry or rendered web fixture.",
            "settlingResult=\(result.rawValue)",
            "window \(viewRecord(window))",
            "bar \(viewRecord(bar))",
            "traits category=\(bar.traitCollection.preferredContentSizeCategory.rawValue) displayScale=\(bar.traitCollection.displayScale) horizontal=\(bar.traitCollection.horizontalSizeClass.rawValue) vertical=\(bar.traitCollection.verticalSizeClass.rawValue)"
        ]
        for button in bar.buttons {
            lines.append("BUTTON \(viewRecord(button)) enabled=\(button.isEnabled) selected=\(button.isSelected)")
            if let title = button.titleLabel {
                let frame = title.convert(title.bounds, to: button)
                lines.append("TITLE \(viewRecord(title)) inButton=[\(precise(frame))] contained=\(button.bounds.contains(frame)) text=\(title.text ?? title.attributedText?.string ?? "") lines=\(title.numberOfLines) font=\(title.font?.fontName ?? "") pointSize=\(String(format: "%.17g", Double(title.font?.pointSize ?? 0)))")
            }
            if let image = button.imageView {
                let frame = image.convert(image.bounds, to: button)
                lines.append("IMAGE \(viewRecord(image)) inButton=[\(precise(frame))] contained=\(button.bounds.contains(frame))")
            }
        }
        lines.append("COMPLETE OWNED WINDOW VIEW HIERARCHY")
        lines.append(contentsOf: descendants(window).map(viewRecord))
        let geometry = XCTAttachment(string: lines.joined(separator: "\n"))
        geometry.name = "DoveBevo-native-bottom-320-XXXL-geometry"
        geometry.lifetime = .keepAlways
        add(geometry)
        // Render the actual owned window's current layer tree without forcing
        // screen updates or changing any frames. This is a native fixture
        // snapshot, not a physical-screen App Store screenshot.
        let snapshot = UIGraphicsImageRenderer(bounds: window.bounds).image { context in
            window.layer.render(in: context.cgContext)
        }
        let attachment = XCTAttachment(image: snapshot)
        attachment.name = "DoveBevo-native-bottom-320-XXXL-owned-window-layer-snapshot"
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
