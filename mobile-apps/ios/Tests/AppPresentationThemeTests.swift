import UIKit
import WebKit
import XCTest
@testable import DoveBevo

final class AppPresentationThemeTests: XCTestCase {
    @MainActor
    func testPackagedAssetUsesOnlyMainFrameDocumentEndAndNormalWebKitSession() throws {
        let source = try XCTUnwrap(AppPresentationTheme.source, "The reviewed shared JS must be a real app resource")
        let asset = try XCTUnwrap(Bundle.main.url(forResource: "app-theme", withExtension: "js"))
        XCTAssertEqual(source, try String(contentsOf: asset, encoding: .utf8))
        let configuration = WKWebViewConfiguration()
        let originalApplicationName = configuration.applicationNameForUserAgent
        let originalStore = configuration.websiteDataStore
        AppPresentationTheme.install(in: configuration)
        let script = try XCTUnwrap(configuration.userContentController.userScripts.first)
        XCTAssertEqual(configuration.userContentController.userScripts.count, 1)
        XCTAssertEqual(script.source, source)
        XCTAssertEqual(script.injectionTime, .atDocumentEnd)
        XCTAssertTrue(script.isForMainFrameOnly)
        XCTAssertEqual(configuration.applicationNameForUserAgent, originalApplicationName)
        XCTAssertTrue(configuration.websiteDataStore === originalStore)
        XCTAssertTrue(configuration.websiteDataStore.isPersistent)
    }

    @MainActor
    func testNativeFallbackRejectsNonVisitorPathsCredentialsPortsAndForeignOrigins() {
        for text in ["https://www.dovebevo.com/", "https://dovebevo.com/bar/n123?c=u0nd9", "https://www.dovebevo.com:443/bar/u45"] {
            XCTAssertTrue(AppPresentationTheme.canApply(to: URL(string: text)), text)
        }
        for text in ["http://www.dovebevo.com/", "https://www.dovebevo.com.evil.example/", "https://login.example/",
                     "https://user@www.dovebevo.com/", "https://www.dovebevo.com:444/", "https://www.dovebevo.com/auth",
                     "https://www.dovebevo.com/api/health", "https://www.dovebevo.com/bar/n0", "https://www.dovebevo.com/bar/n123/",
                     "https://www.dovebevo.com/bar/n123%0A", "file:///app/index.html", "about:blank"] {
            XCTAssertFalse(AppPresentationTheme.canApply(to: URL(string: text)), text)
        }
        XCTAssertFalse(AppPresentationTheme.canApply(to: nil))
    }

    @MainActor
    func testRealWebKitCSPThemeIsIdempotentPreservesFormAndFailsClosedWithoutNonce() throws {
        let configuration = WKWebViewConfiguration()
        AppPresentationTheme.install(in: configuration)
        let web = WKWebView(frame: CGRect(x: 0, y: 0, width: 390, height: 844), configuration: configuration)
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first {
            $0.activationState == .foregroundActive
        })
        let previous = scene.windows.first { $0.isKeyWindow }
        let window = UIWindow(windowScene: scene)
        let host = UIViewController()
        window.rootViewController = host
        host.view.addSubview(web)
        window.makeKeyAndVisible()
        defer { window.isHidden = true; window.rootViewController = nil; previous?.makeKey() }
        // Supplied response bytes and fixture nonce only: no live requests,
        // subresources, accounts, public contributions or response secrets.
        try loadOwned(web, nonce: true)
        AppPresentationTheme.applyAfterFinish(to: web)
        XCTAssertEqual(try evaluate(web, "window.__themePageOnly", world: .page) as? Int, 1, "The owned page-world shadow must really execute under CSP")
        XCTAssertEqual(try evaluate(web, "typeof window.__themePageOnly") as? String, "undefined", "The theme assertions must run in the separate client world")
        let state = try evaluate(web, #"[document.documentElement.getAttribute('data-dovebevo-app-theme'), getComputedStyle(document.documentElement).getPropertyValue('--dovebevo-app-theme').trim(), document.querySelectorAll('#dovebevo-native-theme-v1').length, document.querySelector('#price').value, document.querySelector('#price').min, document.querySelector('#price').max, document.querySelector('#price').required].join('|')"#)
        XCTAssertEqual(state as? String, "1|1|1|5.50|0.50|50|true")
        AppPresentationTheme.applyAfterFinish(to: web)
        XCTAssertEqual(try evaluate(web, "document.querySelectorAll('#dovebevo-native-theme-v1').length") as? Int, 1)
        try loadOwned(web, nonce: false)
        AppPresentationTheme.applyAfterFinish(to: web)
        XCTAssertEqual(try evaluate(web, "document.querySelectorAll('#dovebevo-native-theme-v1').length") as? Int, 0)
        XCTAssertEqual(try evaluate(web, "document.documentElement.hasAttribute('data-dovebevo-app-theme')") as? Bool, false)
        XCTAssertEqual(try evaluate(web, "document.querySelector('#price').value") as? String, "5.50")
        try loadOwned(web, nonce: true, cspAllowsNonce: false)
        AppPresentationTheme.applyAfterFinish(to: web)
        XCTAssertEqual(try evaluate(web, "document.querySelectorAll('#dovebevo-native-theme-v1').length") as? Int, 0, "A nonce-bearing candidate rejected by CSP must roll the owned style back")
        XCTAssertEqual(try evaluate(web, "document.documentElement.hasAttribute('data-dovebevo-app-theme')") as? Bool, false)
        XCTAssertEqual(try evaluate(web, "document.querySelector('#price').value") as? String, "5.50")
    }

    @MainActor
    private func loadOwned(_ web: WKWebView, nonce: Bool, cspAllowsNonce: Bool = true) throws {
        let finished = expectation(description: "Owned visitor response finishes")
        let delegate = ThemeNavigationDelegate(finished: finished)
        web.navigationDelegate = delegate
        let fixtureNonce = "dGhlbWVmaXh0dXJlb25seQ=="
        let styleNonce = cspAllowsNonce ? fixtureNonce : "Y3NwZGVuaWVkZml4dHVyZQ=="
        let style = nonce ? "<style nonce='\(fixtureNonce)'>body { margin: 0; }</style>" : ""
        // A page-world theme would see the deliberately shadowed URL and fail.
        // The public isolated-world API must retain its own JS global scope.
        let pageScript = "<script nonce='\(fixtureNonce)'>window.__themePageOnly = 1; window.URL = function () { throw new Error('page scope'); };</script>"
        let data = Data("""
        <!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-\(styleNonce)'; script-src 'nonce-\(fixtureNonce)';">\(style)\(nonce ? pageScript : "")</head>
        <body><div id="app"><div class="app"><header class="top">Dove bevo</header><main class="main"><form><input id="price" type="number" value="5.50" min="0.50" max="50" required></form></main></div></div></body></html>
        """.utf8)
        let url = URLPolicy.homeURL
        let response = URLResponse(url: url, mimeType: "text/html", expectedContentLength: data.count, textEncodingName: "UTF-8")
        XCTAssertNotNil(web.loadSimulatedRequest(URLRequest(url: url), response: response, responseData: data))
        wait(for: [finished], timeout: 15)
        XCTAssertNil(delegate.error)
        web.navigationDelegate = nil
    }

    @MainActor
    private func evaluate(_ web: WKWebView, _ source: String, world: WKContentWorld = .defaultClient) throws -> Any {
        let finished = expectation(description: "Owned document assertion")
        var value: Result<Any, Error>?
        web.evaluateJavaScript(source, in: nil, in: world) { result in value = result; finished.fulfill() }
        wait(for: [finished], timeout: 5)
        return try XCTUnwrap(value).get()
    }
}

private final class ThemeNavigationDelegate: NSObject, WKNavigationDelegate {
    let finished: XCTestExpectation
    var error: Error?
    init(finished: XCTestExpectation) { self.finished = finished }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { finished.fulfill() }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        self.error = error; finished.fulfill()
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        self.error = error; finished.fulfill()
    }
}
