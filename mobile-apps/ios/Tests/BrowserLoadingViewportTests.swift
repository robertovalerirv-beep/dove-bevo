import UIKit
import WebKit
import XCTest
@testable import DoveBevo

final class BrowserLoadingViewportTests: XCTestCase {
    @MainActor
    func testMountedNarrowLargeTextLoadingScrollsInsideViewportAndHidesWholeHitTestingOwner() throws {
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first { $0.activationState == .foregroundActive })
        let previous = scene.windows.first { $0.isKeyWindow }
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(x: 0, y: 0, width: 320, height: 568)
        let host = UIViewController()
        window.rootViewController = host
        host.view.frame = window.bounds
        defer { window.isHidden = true; window.rootViewController = nil; previous?.makeKey() }
        var ownedWeb: WKWebView?
        let browser = BrowserViewController(websiteLoader: { web, _ in ownedWeb = web; return nil })
        let tabs = NativeTabsController(browser: browser)
        host.addChild(tabs)
        host.view.addSubview(tabs.view)
        tabs.view.frame = host.view.bounds
        tabs.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        let traits = UITraitCollection(preferredContentSizeCategory: .accessibilityExtraExtraExtraLarge)
        host.setOverrideTraitCollection(traits, forChild: tabs)
        tabs.didMove(toParent: host)
        window.makeKeyAndVisible()
        window.layoutIfNeeded(); tabs.view.layoutIfNeeded(); browser.view.layoutIfNeeded()
        let web = try XCTUnwrap(ownedWeb)
        let loading = try XCTUnwrap(descendants(browser.view).first { $0.accessibilityIdentifier == "browser.loading" } as? UIScrollView)
        let message = try XCTUnwrap(descendants(loading).first { $0.accessibilityIdentifier == "browser.loading.message" } as? UILabel)
        let spinner = try XCTUnwrap(descendants(loading).first { $0.accessibilityIdentifier == "browser.loading.spinner" } as? UIActivityIndicatorView)
        let expectedFont = UIFont.preferredFont(forTextStyle: .body, compatibleWith: traits)
        var previousViewport: CGRect?
        let ready = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            window.layoutIfNeeded(); tabs.view.layoutIfNeeded(); browser.view.layoutIfNeeded()
            let viewport = loading.convert(loading.bounds, to: window)
            defer { previousViewport = viewport }
            return loading.bounds.height > 0 && loading.contentSize.height > loading.bounds.height &&
                message.font.pointSize == expectedFont.pointSize && previousViewport == viewport
        }, object: nil)
        let result = XCTWaiter.wait(for: [ready], timeout: 5)
        capture(window, loading: loading, message: message, spinner: spinner, name: "initial")
        XCTAssertEqual(result, .completed)
        XCTAssertEqual(tabs.traitCollection.preferredContentSizeCategory, .accessibilityExtraExtraExtraLarge)
        XCTAssertEqual(loading.bounds.width, 320)
        XCTAssertFalse(loading.isHidden)
        XCTAssertTrue(loading.clipsToBounds)
        XCTAssertTrue(spinner.isAnimating)
        XCTAssertEqual(message.text, "Caricamento di Dove bevo…")
        XCTAssertEqual(message.font.pointSize, expectedFont.pointSize)
        XCTAssertEqual(message.numberOfLines, 0)
        let viewport = loading.convert(loading.bounds, to: tabs.view)
        XCTAssertEqual(viewport, web.convert(web.bounds, to: tabs.view))
        XCTAssertGreaterThanOrEqual(viewport.minY, tabs.mapNavigation.navigationBar.convert(tabs.mapNavigation.navigationBar.bounds, to: tabs.view).maxY)
        XCTAssertLessThanOrEqual(viewport.maxY, tabs.bottomBar.frame.minY)
        let requiredText = message.sizeThatFits(CGSize(width: message.bounds.width, height: .greatestFiniteMagnitude))
        XCTAssertLessThanOrEqual(requiredText.height, message.bounds.height + 0.5, "The complete unchanged message must fit its real label")

        // Scroll the actual viewport. The spinner and the first/last text lines
        // need not all fit one screen, but each must be wholly reachable.
        loading.scrollRectToVisible(spinner.convert(spinner.bounds, to: loading), animated: false)
        loading.layoutIfNeeded()
        XCTAssertTrue(loading.bounds.contains(spinner.convert(spinner.bounds, to: loading)))
        let text = message.convert(message.bounds, to: loading)
        let lineHeight = min(message.font.lineHeight, message.bounds.height)
        let firstLine = CGRect(x: text.minX, y: text.minY, width: text.width, height: lineHeight)
        loading.scrollRectToVisible(firstLine, animated: false)
        loading.layoutIfNeeded()
        XCTAssertTrue(loading.bounds.contains(firstLine))
        capture(window, loading: loading, message: message, spinner: spinner, name: "first-line")
        loading.setContentOffset(CGPoint(x: 0, y: max(0, loading.contentSize.height - loading.bounds.height)), animated: false)
        loading.layoutIfNeeded()
        let lastLine = CGRect(x: text.minX, y: text.maxY - lineHeight, width: text.width, height: lineHeight)
        capture(window, loading: loading, message: message, spinner: spinner, name: "last-line")
        XCTAssertTrue(loading.bounds.contains(lastLine))
        XCTAssertTrue(loading.bounds.contains(CGRect(x: text.minX, y: text.maxY - 1, width: text.width, height: 1)))

        // An initial failure/retry preserves the same scroll owner. Completion
        // must hide that entire owner so its transparent canvas cannot intercept.
        let failure = NSError(domain: NSURLErrorDomain, code: NSURLErrorNotConnectedToInternet)
        browser.webView(web, didFailProvisionalNavigation: nil, withError: failure)
        XCTAssertTrue(loading.isHidden)
        let retry = try XCTUnwrap(descendants(browser.view).first { $0.accessibilityIdentifier == "browser.retry" } as? UIButton)
        retry.sendActions(for: .touchUpInside)
        XCTAssertFalse(loading.isHidden)
        browser.webView(web, didFinish: nil)
        XCTAssertTrue(loading.isHidden)
        let centre = web.convert(CGPoint(x: web.bounds.midX, y: web.bounds.midY), to: browser.view)
        let hit = try XCTUnwrap(browser.view.hitTest(centre, with: nil))
        XCTAssertTrue(hit === web || hit.isDescendant(of: web), "The hidden loading viewport must pass touches to the actual WKWebView")
        browser.webView(web, didStartProvisionalNavigation: nil)
        XCTAssertTrue(loading.isHidden, "Reloading a ready page keeps its existing content usable")
        browser.webView(web, didFailProvisionalNavigation: nil, withError: failure)
        XCTAssertTrue(loading.isHidden)
        browser.webViewWebContentProcessDidTerminate(web)
        XCTAssertFalse(loading.isHidden, "The existing first renderer recovery starts a fresh loading presentation")
        browser.webViewWebContentProcessDidTerminate(web)
        XCTAssertTrue(loading.isHidden, "The existing repeated-renderer recovery shows error instead")
    }

    @MainActor
    private func descendants(_ view: UIView) -> [UIView] { view.subviews + view.subviews.flatMap { descendants($0) } }

    @MainActor
    private func capture(_ window: UIWindow, loading: UIScrollView, message: UILabel, spinner: UIActivityIndicatorView, name: String) {
        func rect(_ value: CGRect) -> String { [value.minX, value.minY, value.width, value.height].map { String(format: "%.17g", Double($0)) }.joined(separator: ",") }
        let text = "Owned native loading window, not physical-screen store imagery.\nviewport=[\(rect(loading.convert(loading.bounds, to: window)))] bounds=[\(rect(loading.bounds))] contentSize=\(loading.contentSize) offset=\(loading.contentOffset)\nmessage=[\(rect(message.convert(message.bounds, to: window)))] font=\(message.font.pointSize) text=\(message.text ?? "")\nspinner=[\(rect(spinner.convert(spinner.bounds, to: window)))]"
        let geometry = XCTAttachment(string: text)
        geometry.name = "DoveBevo-native-loading-320-XXXL-\(name)-geometry"; geometry.lifetime = .keepAlways; add(geometry)
        let image = UIGraphicsImageRenderer(bounds: window.bounds).image { context in window.layer.render(in: context.cgContext) }
        let snapshot = XCTAttachment(image: image)
        snapshot.name = "DoveBevo-native-loading-320-XXXL-\(name)-owned-window"; snapshot.lifetime = .keepAlways; add(snapshot)
    }
}
