import Foundation
import UIKit
import WebKit
import XCTest
@testable import DoveBevo

final class MobileEntryBrowserTests: XCTestCase {
    @MainActor
    func testLegacyFallbackCannotBecomeReadyAndRetryLoadsVerifiedAppDocument() throws {
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first { $0.activationState == .foregroundActive })
        let previous = scene.windows.first { $0.isKeyWindow }
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
        defer { window.isHidden = true; window.rootViewController = nil; previous?.makeKey() }
        var marked = false
        var loads: [URL] = []
        var ownedWeb: WKWebView?
        let browser = BrowserViewController(websiteLoader: { web, request in
            ownedWeb = web
            loads.append(request.url!)
            let marker = marked ? " data-dovebevo-mobile-shell=\"1\"" : ""
            let data = Data("<!doctype html><html\(marker)><body><h1>Owned app document fixture</h1></body></html>".utf8)
            let response = URLResponse(url: request.url!, mimeType: "text/html", expectedContentLength: data.count, textEncodingName: "UTF-8")
            return web.loadSimulatedRequest(request, response: response, responseData: data)
        })
        let tabs = NativeTabsController(browser: browser)
        window.rootViewController = tabs
        window.makeKeyAndVisible(); window.layoutIfNeeded(); browser.view.layoutIfNeeded()
        let error = try XCTUnwrap(descendants(browser.view).first { $0.accessibilityIdentifier == "browser.error" })
        let retry = try XCTUnwrap(descendants(browser.view).first { $0.accessibilityIdentifier == "browser.retry" } as? UIButton)
        waitUntil("Missing app marker must show native retry") { !error.isHidden }
        XCTAssertEqual(loads, [MobileEntry.homeURL])
        XCTAssertTrue(try share(tabs).attributes.contains(.disabled))
        XCTAssertFalse(tabs.bottomBar.button(for: .save).isEnabled, "Home has no venue to save while the app document is unverified")
        XCTAssertTrue(try XCTUnwrap(ownedWeb).accessibilityElementsHidden)
        marked = true
        retry.sendActions(for: .touchUpInside)
        waitUntil("Retry must finish the actual marked document") { error.isHidden && (try? self.share(tabs).attributes.contains(.disabled)) == false }
        XCTAssertEqual(loads, [MobileEntry.homeURL, MobileEntry.homeURL])
        XCTAssertFalse(try XCTUnwrap(ownedWeb).accessibilityElementsHidden)
        XCTAssertFalse(tabs.bottomBar.button(for: .save).isEnabled, "A verified Home document still cannot create a venue bookmark")
    }

    @MainActor
    func testRealMobileVenueReaderReturnsActualNameAndCanonicalBookmarkIdentity() throws {
        let configuration = WKWebViewConfiguration()
        let web = WKWebView(frame: CGRect(x: 0, y: 0, width: 390, height: 844), configuration: configuration)
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first { $0.activationState == .foregroundActive })
        let previous = scene.windows.first { $0.isKeyWindow }
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
        let host = UIViewController()
        window.rootViewController = host
        host.view.addSubview(web)
        web.frame = host.view.bounds
        web.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        window.makeKeyAndVisible(); window.layoutIfNeeded()
        defer { window.isHidden = true; window.rootViewController = nil; previous?.makeKey() }
        let loaded = expectation(description: "Owned marked venue")
        let delegate = OwnedDocumentDelegate(loaded)
        web.navigationDelegate = delegate
        let url = try XCTUnwrap(URL(string: "https://www.dovebevo.com/mobile/?path=%2Fbar%2Fm000000000000000000000007&c=u0nd9"))
        let html = """
        <!doctype html><html data-dovebevo-mobile-shell="1"><head><meta name="viewport" content="width=device-width"></head><body>
        <section class="map" data-selected="m000000000000000000000007"></section>
        <dialog class="sheet sheet--bare" aria-label="Owned Venue"><div class="sheet__body"><div class="scontrino"><div class="scontrino__paper"><h2 class="scontrino__name">Owned Venue</h2></div></div></div></dialog>
        <script>document.querySelector('dialog').showModal()</script></body></html>
        """
        let bytes = Data(html.utf8)
        let request = URLRequest(url: url)
        let response = URLResponse(url: url, mimeType: "text/html", expectedContentLength: bytes.count, textEncodingName: "UTF-8")
        web.loadSimulatedRequest(request, response: response, responseData: bytes)
        wait(for: [loaded], timeout: 10)
        let captured = expectation(description: "Fixed reader result")
        let capture = VenueBookmarkCapture()
        let token = try XCTUnwrap(capture.begin(url: url))
        var venue: SavedVenue?
        var failure: Error?
        web.evaluateJavaScript(VenueNameReader.script, in: nil, in: .defaultClient) { result in
            do { venue = try capture.complete(token, value: result.get(), currentUsableURL: url) }
            catch { failure = error }
            captured.fulfill()
        }
        wait(for: [captured], timeout: 10)
        XCTAssertNil(failure)
        XCTAssertEqual(venue?.label, "Owned Venue")
        XCTAssertEqual(venue?.url.absoluteString, "https://www.dovebevo.com/bar/m000000000000000000000007?c=u0nd9")
        withExtendedLifetime(delegate) {}
    }

    @MainActor
    func testFocusedSavedDrinkReaderAcceptsCurrentItalianReceiptIdentity() throws {
        // Reopening a saved drink uses four query pairs. The current Italian
        // receipt places its h2 inside a named identity header, unlike the
        // older and European receipts covered by the two-pair test above.
        let url = try XCTUnwrap(URL(string: "https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9&drink=beer_draft&hh=0"))
        let web = WKWebView(frame: CGRect(x: 0, y: 0, width: 390, height: 844), configuration: WKWebViewConfiguration())
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first { $0.activationState == .foregroundActive })
        let previous = scene.windows.first { $0.isKeyWindow }
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
        let host = UIViewController()
        window.rootViewController = host
        host.view.addSubview(web)
        web.frame = host.view.bounds
        web.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        window.makeKeyAndVisible(); window.layoutIfNeeded()
        defer { window.isHidden = true; window.rootViewController = nil; previous?.makeKey() }
        let loaded = expectation(description: "Owned focused drink venue")
        let delegate = OwnedDocumentDelegate(loaded)
        web.navigationDelegate = delegate
        let html = """
        <!doctype html><html data-dovebevo-mobile-shell="1"><head><meta name="viewport" content="width=device-width"></head><body>
        <section class="map" data-selected="n123"></section>
        <dialog class="sheet sheet--bare" aria-label="Owned Venue"><div class="sheet__body"><div class="scontrino mobile-venue"><div class="scontrino__paper"><header class="mobile-venue__identity"><h2 class="scontrino__name">Owned Venue</h2></header></div></div></div></dialog>
        <script>document.querySelector('dialog').showModal()</script></body></html>
        """
        let bytes = Data(html.utf8)
        let request = URLRequest(url: url)
        let response = URLResponse(url: url, mimeType: "text/html", expectedContentLength: bytes.count, textEncodingName: "UTF-8")
        web.loadSimulatedRequest(request, response: response, responseData: bytes)
        wait(for: [loaded], timeout: 10)
        let captured = expectation(description: "Focused reader result")
        let capture = VenueBookmarkCapture()
        let token = try XCTUnwrap(capture.begin(url: url))
        var venue: SavedVenue?
        var failure: Error?
        web.evaluateJavaScript(VenueNameReader.script, in: nil, in: .defaultClient) { result in
            do { venue = try capture.complete(token, value: result.get(), currentUsableURL: url) }
            catch { failure = error }
            captured.fulfill()
        }
        wait(for: [captured], timeout: 10)
        XCTAssertNil(failure, "A visible focused receipt must support both Save and Recommendations")
        XCTAssertEqual(venue?.label, "Owned Venue")
        XCTAssertEqual(venue?.url.absoluteString, "https://www.dovebevo.com/bar/n123?c=u0nd9")
        withExtendedLifetime(delegate) {}
    }

    @MainActor private func share(_ tabs: NativeTabsController) throws -> UIAction {
        try XCTUnwrap(tabs.topMoreButton.menu?.children.compactMap { $0 as? UIAction }.first { $0.identifier.rawValue == "browser.share" })
    }
    @MainActor private func descendants(_ view: UIView) -> [UIView] { view.subviews + view.subviews.flatMap { descendants($0) } }
    @MainActor private func waitUntil(_ message: String, _ predicate: @escaping () -> Bool) {
        let value = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in predicate() }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [value], timeout: 10), .completed, message)
    }
}

@MainActor private final class OwnedDocumentDelegate: NSObject, WKNavigationDelegate {
    private let loaded: XCTestExpectation
    init(_ loaded: XCTestExpectation) { self.loaded = loaded }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { loaded.fulfill() }
}
