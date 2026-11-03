import UIKit
import WebKit
import XCTest
@testable import DoveBevo

final class AppPresentationThemeTests: XCTestCase {
    @MainActor
    func testPackagedAssetUsesOnlyMainFrameDocumentEndAndNormalWebKitSession() throws {
        let source = try XCTUnwrap(AppPresentationTheme.source, "The reviewed shared JS must be a real app resource")
        let asset = try XCTUnwrap(Bundle.main.url(forResource: "app-theme", withExtension: "js"))
        let core = try String(contentsOf: asset, encoding: .utf8)
        let artworkAsset = try XCTUnwrap(Bundle.main.url(forResource: "drink-art", withExtension: "js"))
        let artwork = try String(contentsOf: artworkAsset, encoding: .utf8)
        XCTAssertLessThanOrEqual(core.utf8.count, 32 * 1024)
        XCTAssertLessThanOrEqual(artwork.utf8.count, 256 * 1024)
        XCTAssertEqual(source, artwork + "\n" + core)
        let configuration = WKWebViewConfiguration()
        let originalApplicationName = configuration.applicationNameForUserAgent
        let originalStore = configuration.websiteDataStore
        AppPresentationTheme.install(in: configuration)
        let scripts = configuration.userContentController.userScripts
        XCTAssertEqual(scripts.count, 2)
        let early = try XCTUnwrap(scripts.first)
        XCTAssertEqual(early.injectionTime, .atDocumentStart)
        XCTAssertTrue(early.isForMainFrameOnly)
        let earlyAsset = try XCTUnwrap(Bundle.main.url(forResource: "app-theme-start", withExtension: "js"))
        XCTAssertEqual(early.source, try String(contentsOf: earlyAsset, encoding: .utf8))
        let script = try XCTUnwrap(scripts.last)
        XCTAssertEqual(script.source, source)
        XCTAssertEqual(script.injectionTime, .atDocumentEnd)
        XCTAssertTrue(script.isForMainFrameOnly)
        XCTAssertEqual(configuration.applicationNameForUserAgent, originalApplicationName)
        XCTAssertTrue(configuration.websiteDataStore === originalStore)
        XCTAssertTrue(configuration.websiteDataStore.isPersistent)
    }

    @MainActor
    func testBundledDrinkArtworkDecodesUnderProductionImageCSPWithoutChangingPrice() throws {
        let configuration = WKWebViewConfiguration()
        AppPresentationTheme.install(in: configuration)
        let web = WKWebView(frame: CGRect(x: 0, y: 0, width: 390, height: 844), configuration: configuration)
        try loadOwned(web, nonce: true, artwork: true)
        AppPresentationTheme.applyAfterFinish(to: web)
        let finished = expectation(description: "Bundled decorative drink decodes under CSP")
        var value: Result<Any, Error>?
        web.callAsyncJavaScript("const image = document.querySelector('img.dovebevo-drink-art'); await image.decode(); return [image.naturalWidth, image.naturalHeight, document.querySelector('#price').value].join('|');",
                                arguments: [:], in: nil, in: .defaultClient) { result in value = result; finished.fulfill() }
        wait(for: [finished], timeout: 15)
        XCTAssertEqual(try XCTUnwrap(value).get() as? String, "1024|1536|5.50")
        XCTAssertEqual(try evaluate(web, "document.querySelector('img.dovebevo-drink-art').alt") as? String, "")
    }

    @MainActor
    func testDocumentStartSelectsLightBeforePageMapConsumers() throws {
        let configuration = WKWebViewConfiguration()
        AppPresentationTheme.install(in: configuration)
        let web = WKWebView(frame: CGRect(x: 0, y: 0, width: 390, height: 700), configuration: configuration)
        let done = expectation(description: "Document start visitor fixture")
        let delegate = ThemeNavigationDelegate(finished: done)
        web.navigationDelegate = delegate
        let data = Data("""
        <!doctype html><html><head><meta charset="utf-8">
        <link rel="manifest" href="/manifest.webmanifest"><link rel="icon" href="/brand/favicon.svg">
        <script>document.documentElement.dataset.theme='dark';</script></head>
        <body><div id="app"></div><script type="module">
        window.themeSeen=[document.documentElement.dataset.theme];
        window.addEventListener('themechange',()=>window.themeSeen.push(document.documentElement.dataset.theme));
        </script></body></html>
        """.utf8)
        let url = URLPolicy.homeURL
        let response = URLResponse(url: url, mimeType: "text/html", expectedContentLength: data.count, textEncodingName: "UTF-8")
        XCTAssertNotNil(web.loadSimulatedRequest(URLRequest(url: url), response: response, responseData: data))
        wait(for: [done], timeout: 15)
        XCTAssertNil(delegate.error)
        XCTAssertEqual(try evaluate(web, "window.themeSeen.join('|')", world: .page) as? String, "light")
        XCTAssertEqual(try evaluate(web, "document.documentElement.dataset.theme='dark';window.dispatchEvent(new Event('themechange'));window.themeSeen.join('|')", world: .page) as? String, "light|light")
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
    func testDelayedMobileMountAppliesThemeAndHidesDuplicateTopSearch() throws {
        let configuration = WKWebViewConfiguration()
        AppPresentationTheme.install(in: configuration)
        let web = WKWebView(frame: CGRect(x: 0, y: 0, width: 390, height: 844), configuration: configuration)
        let savedVenue = URL(string: "https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9")!
        try loadDelayedMobile(web, url: savedVenue)
        XCTAssertEqual(try evaluate(web, "document.querySelectorAll('#dovebevo-native-theme-v1').length") as? Int, 0)
        AppPresentationTheme.applyAfterFinish(to: web)
        _ = try evaluate(web, """
        document.querySelector('#app').innerHTML =
          '<div class="app"><header class="top"><div class="top__row"><button class="btn search-field">Cerca città o bar</button></div></header><main class="main"></main></div>';
        """)
        let styled = expectation(description: "Delayed owned mobile shell receives its nonce-bound theme")
        var value: Result<Any, Error>?
        web.callAsyncJavaScript("""
        const deadline = Date.now() + 6500;
        while (Date.now() < deadline) {
          const button = document.querySelector('.top__row > .search-field');
          if (document.documentElement.getAttribute('data-dovebevo-app-theme') === '1' &&
              button && getComputedStyle(button).display === 'none') return '1|none';
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        const button = document.querySelector('.top__row > .search-field');
        return String(document.documentElement.getAttribute('data-dovebevo-app-theme')) + '|' +
          (button ? getComputedStyle(button).display : 'missing');
        """, arguments: [:], in: nil, in: .defaultClient) { result in value = result; styled.fulfill() }
        wait(for: [styled], timeout: 8)
        XCTAssertEqual(try XCTUnwrap(value).get() as? String, "1|none")
        XCTAssertEqual(try evaluate(web, "document.querySelectorAll('#dovebevo-native-theme-v1').length") as? Int, 1)
    }

    @MainActor
    func testDelayedThemeRetryStopsWhenNavigationLeavesTrustedVisitorDocument() throws {
        let configuration = WKWebViewConfiguration()
        AppPresentationTheme.install(in: configuration)
        let web = WKWebView(frame: CGRect(x: 0, y: 0, width: 390, height: 844), configuration: configuration)
        let savedVenue = URL(string: "https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9")!
        try loadDelayedMobile(web, url: savedVenue)
        AppPresentationTheme.applyAfterFinish(to: web)
        try loadDelayedMobile(web, url: URL(string: "https://www.dovebevo.com/auth")!)
        _ = try evaluate(web, #"document.querySelector('#app').innerHTML = '<div class="app"><header class="top"></header><main class="main"></main></div>';"#)
        let settled = expectation(description: "Old mobile retry cannot style the new auth document")
        var value: Result<Any, Error>?
        web.callAsyncJavaScript("await new Promise(resolve => setTimeout(resolve, 800)); return document.querySelectorAll('#dovebevo-native-theme-v1').length;",
                                arguments: [:], in: nil, in: .defaultClient) { result in value = result; settled.fulfill() }
        wait(for: [settled], timeout: 3)
        XCTAssertEqual(try XCTUnwrap(value).get() as? Int, 0)
    }

    @MainActor
    private func loadOwned(_ web: WKWebView, nonce: Bool, cspAllowsNonce: Bool = true, artwork: Bool = false) throws {
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
        <!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-\(styleNonce)'; script-src 'nonce-\(fixtureNonce)'; img-src data:;">\(style)\(nonce ? pageScript : "")</head>
        <body><div id="app"><div class="app"><header class="top">Dove bevo</header><main class="main"><form>\(artwork ? "<h3 class='context-tag'>Spritz</h3><label class='price-input'>" : "")<input id="price" type="number" value="5.50" min="0.50" max="50" required>\(artwork ? "</label>" : "")</form></main></div></div></body></html>
        """.utf8)
        let url = URLPolicy.homeURL
        let response = URLResponse(url: url, mimeType: "text/html", expectedContentLength: data.count, textEncodingName: "UTF-8")
        XCTAssertNotNil(web.loadSimulatedRequest(URLRequest(url: url), response: response, responseData: data))
        wait(for: [finished], timeout: 15)
        XCTAssertNil(delegate.error)
        web.navigationDelegate = nil
    }

    @MainActor
    private func loadDelayedMobile(_ web: WKWebView, url: URL) throws {
        let finished = expectation(description: "Mobile visitor document finishes before its shell mounts")
        let delegate = ThemeNavigationDelegate(finished: finished)
        web.navigationDelegate = delegate
        let nonce = "dGhlbWVmaXh0dXJlb25seQ=="
        let data = Data("""
        <!doctype html><html data-dovebevo-mobile-shell="1"><head>
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-\(nonce)'; script-src 'nonce-\(nonce)'; img-src data:">
        <style nonce="\(nonce)">body { margin: 0; }</style></head><body><div id="app"></div></body></html>
        """.utf8)
        let response = URLResponse(url: url, mimeType: "text/html", expectedContentLength: data.count,
                                   textEncodingName: "UTF-8")
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
