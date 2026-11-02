import UIKit
import WebKit
import XCTest
@testable import DoveBevo

final class PriceShareTests: XCTestCase {
    private let document = URL(string: "https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9")!

    private func fields() -> [String: Any] {
        ["href": document.absoluteString, "version": "1", "venue": "n123", "venueName": "Actual venue",
         "drink": "spritz", "drinkName": "Spritz", "hh": "1", "amountMinor": "650", "currency": "GBP",
         "serving": "Drink singolo", "provenance": "Da menu online · Fonte verificata il 2026-11-02 · Aperol Spritz · Happy hour 17:00–19:00",
         "confirmations": "0", "tier": "affare", "location": "London"]
    }

    func testExactPoundsPriceAndMenuConditionsAreNeverConvertedToPaidEvidence() throws {
        let value = try XCTUnwrap(PriceShareSnapshot.parse(fields(), currentURL: document))
        XCTAssertEqual(value.amount, "6,50 £"); XCTAssertTrue(value.happyHour)
        XCTAssertEqual(value.venueKey, "n123"); XCTAssertEqual(value.venueName, "Actual venue")
        XCTAssertTrue(value.provenance.contains("Fonte verificata il 2026-11-02"))
        XCTAssertTrue(value.provenance.contains("17:00–19:00")); XCTAssertFalse(value.provenance.contains("Pagato"))
        var legacy = fields(); legacy["currency"] = "EUR"; legacy["serving"] = ""; legacy["location"] = ""
        let euro = try XCTUnwrap(PriceShareSnapshot.parse(legacy, currentURL: document))
        XCTAssertEqual(euro.amount, "6,50 €"); XCTAssertEqual(euro.serving, "")
        XCTAssertTrue(euro.servingLabel.contains("Formato non dichiarato"))
        XCTAssertTrue(euro.accessibilityDescription.contains("Happy hour"))
        XCTAssertTrue(euro.accessibilityDescription.contains("Affare"))
        legacy["hh"] = "0"
        let normal = try XCTUnwrap(PriceShareSnapshot.parse(legacy, currentURL: document))
        XCTAssertTrue(normal.accessibilityDescription.contains("Prezzo normale"))
        XCTAssertTrue(normal.accessibilityDescription.contains("0 conferme"))
        XCTAssertTrue(value.accessibilityDescription.contains("London"))
    }

    func testEveryCategoryUsesExistingCurrencyBoundsAndRejectsValuesOutsideThem() {
        let categories: [(String, Int, Int, Int, Int)] = [
            ("beer_draft", 250, 1200, 100, 3000), ("spritz", 250, 1500, 100, 5000),
            ("negroni", 400, 2000, 100, 5000), ("sbagliato", 400, 2000, 100, 5000),
            ("gin_tonic", 400, 2000, 100, 5000), ("gin_lemon", 400, 2000, 100, 5000),
            ("wine_glass", 200, 1500, 100, 5000), ("alcohol_free", 200, 1200, 100, 3000),
            ("water", 50, 600, 1, 1500)
        ]
        for (drink, euroMin, euroMax, poundMin, poundMax) in categories {
            for (currency, low, high) in [("EUR", euroMin, euroMax), ("GBP", poundMin, poundMax)] {
                var data = fields(); data["drink"] = drink; data["currency"] = currency
                for cents in [low, high] {
                    data["amountMinor"] = String(cents)
                    XCTAssertNotNil(PriceShareSnapshot.parse(data, currentURL: document), "\(drink) \(currency) \(cents)")
                }
                for cents in [low - 1, high + 1] {
                    data["amountMinor"] = String(cents)
                    XCTAssertNil(PriceShareSnapshot.parse(data, currentURL: document), "\(drink) \(currency) \(cents)")
                }
            }
        }
        var oneCent = fields(); oneCent["currency"] = "EUR"; oneCent["amountMinor"] = "1"
        XCTAssertNil(PriceShareSnapshot.parse(oneCent, currentURL: document))
        var thousandPounds = fields(); thousandPounds["amountMinor"] = "100000"
        XCTAssertNil(PriceShareSnapshot.parse(thousandPounds, currentURL: document))
    }

    func testWrongIdentityMalformedCurrencyCountsTextAndVersionHaveNoPoster() {
        let bad: [(String, Any)] = [("version", "2"), ("venue", "n124"), ("href", "https://evil.invalid/"),
            ("drink", "vodka"), ("hh", "true"), ("amountMinor", "6.50"), ("amountMinor", "0650"),
            ("amountMinor", "0"), ("amountMinor", "100001"), ("amountMinor", 650), ("currency", "USD"),
            ("confirmations", "1000001"), ("confirmations", "-1"), ("confirmations", true), ("tier", "best"),
            ("venueName", ""), ("venueName", String(repeating: "a", count: 121)), ("provenance", "one\ntwo"),
            ("provenance", String(repeating: "a", count: 1025)), ("serving", "500 ml\u{0000}"), ("location", " Paris")]
        for (key, replacement) in bad {
            var value = fields(); value[key] = replacement
            XCTAssertNil(PriceShareSnapshot.parse(value, currentURL: document), key)
        }
        var missing = fields(); missing.removeValue(forKey: "serving")
        XCTAssertNil(PriceShareSnapshot.parse(missing, currentURL: document))
        var extra = fields(); extra["paidOn"] = "2026-11-02"
        XCTAssertNil(PriceShareSnapshot.parse(extra, currentURL: document))
        XCTAssertNil(PriceShareSnapshot.parse(fields(), currentURL: URLPolicy.homeURL))
    }

    @MainActor func testRetiredHiddenChangedPageAndOldCallbacksCannotPresentStalePoster() {
        let state = PriceShareCapture()
        let first = state.begin(documentURL: document)
        state.invalidate()
        XCTAssertFalse(state.finish(first, currentURL: document, active: true))
        let second = state.begin(documentURL: document)
        XCTAssertFalse(state.finish(second, currentURL: document, active: false))
        let third = state.begin(documentURL: document)
        XCTAssertFalse(state.finish(third, currentURL: MobileEntry.homeURL, active: true))
        let fourth = state.begin(documentURL: document)
        let current = state.begin(documentURL: document)
        XCTAssertFalse(state.finish(fourth, currentURL: document, active: true))
        XCTAssertTrue(state.finish(current, currentURL: document, active: true))
        XCTAssertFalse(state.finish(current, currentURL: document, active: true), "One completion or timeout only")
    }

    @MainActor func testRealLocalPosterPreviewRendersLongSourceConditionsAndOriginalCurrency() throws {
        var data = fields(); data["provenance"] = String(repeating: "Menu item, servizio al tavolo 17:00–19:00. ", count: 18).trimmingCharacters(in: .whitespaces)
        let value = try XCTUnwrap(PriceShareSnapshot.parse(data, currentURL: document))
        let controller = PriceShareViewController(snapshot: value, publicURL: MobileEntry.shareURL(document))
        controller.loadViewIfNeeded()
        let image = try XCTUnwrap(controller.poster)
        XCTAssertEqual(image.size.width, 1080); XCTAssertGreaterThan(image.size.height, 1000)
        XCTAssertLessThan(image.size.height, 3000)
        XCTAssertGreaterThan(try XCTUnwrap(image.pngData()).count, 1000)
        let preview = try XCTUnwrap(descendants(controller.view).first { $0.accessibilityIdentifier == "share.poster" })
        XCTAssertTrue(preview.accessibilityLabel?.contains("6,50 £") == true)
        XCTAssertTrue(preview.accessibilityLabel?.contains(value.provenance) == true)
        XCTAssertTrue(preview.accessibilityLabel?.contains("Immagine illustrativa") == true)
        XCTAssertNotNil(descendants(controller.view).first { $0.accessibilityIdentifier == "share.image" })
        let activity = try XCTUnwrap(controller.activityController())
        XCTAssertEqual(activity.excludedActivityTypes, [.saveToCameraRoll], "This sharing feature does not add photo-library access")
    }

    @MainActor func testReferenceSharePrivateFixtureCapturesActualPosterPreview() throws {
        let snapshot = try XCTUnwrap(PriceShareSnapshot.parse(fields(), currentURL: document))
        let controller = PriceShareViewController(snapshot: snapshot, publicURL: MobileEntry.shareURL(document))
        let mounted = try OwnedReferenceWindow(root: UINavigationController(rootViewController: controller))
        defer { mounted.close() }
        let image = try XCTUnwrap(descendants(controller.view).first { $0.accessibilityIdentifier == "share.poster" })
        XCTAssertTrue(image.window === mounted.window)
        for expected in ["6,50 £", "Drink singolo", "Happy hour", "0 conferme", "London", "Affare", snapshot.provenance] {
            XCTAssertTrue(image.accessibilityLabel?.contains(expected) == true, expected)
        }
        mounted.attach(to: self, name: "Share-poster-GBP-HH")
    }

    @MainActor func testActualIsolatedWebKitReaderRequiresCurrentVisibleVenueAndSinglePriceMarker() throws {
        let web = WKWebView(frame: CGRect(x: 0, y: 0, width: 390, height: 700), configuration: WKWebViewConfiguration())
        let loaded = expectation(description: "Owned share fixture")
        let delegate = ShareFixtureNavigationDelegate(loaded); web.navigationDelegate = delegate
        let html = #"""
        <!doctype html><html data-dovebevo-mobile-shell="1"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>
        <section class="map" data-selected="n123"></section>
        <dialog class="sheet sheet--bare" aria-label="Actual venue"><div class="sheet__body"><div class="scontrino"><div class="scontrino__paper">
        <h2 class="scontrino__name">Actual venue</h2>
        <div id="price" data-dovebevo-share="1" data-version="1" data-venue="n123" data-venue-name="Actual venue" data-drink="spritz" data-drink-name="Spritz" data-hh="1" data-amount-minor="650" data-currency="GBP" data-serving="Drink singolo" data-provenance="Da menu online · Fonte verificata il 2026-11-02" data-confirmations="0" data-tier="affare" data-location="London" style="width:200px;height:100px">Spritz 6,50 £</div>
        </div></div></div></dialog><script>document.querySelector('dialog').showModal();</script></body></html>
        """#
        let data = Data(html.utf8)
        XCTAssertNotNil(web.loadSimulatedRequest(URLRequest(url: document),
            response: URLResponse(url: document, mimeType: "text/html", expectedContentLength: data.count, textEncodingName: "UTF-8"), responseData: data))
        wait(for: [loaded], timeout: 15)
        let initial = try evaluate(web, PriceShareReader.script)
        XCTAssertEqual(PriceShareSnapshot.parse(initial, currentURL: document)?.amount, "6,50 £")
        _ = try evaluate(web, "document.querySelector('#price').style.display='none';true")
        XCTAssertTrue(try evaluate(web, "(\(PriceShareReader.script))===null") as? Bool == true)
        _ = try evaluate(web, "document.querySelector('#price').style.display='block';document.querySelector('#price').setAttribute('data-venue','n124');true")
        XCTAssertTrue(try evaluate(web, "(\(PriceShareReader.script))===null") as? Bool == true)
        _ = try evaluate(web, "document.querySelector('#price').setAttribute('data-venue','n123');document.querySelector('#price').after(document.querySelector('#price').cloneNode(true));true")
        XCTAssertTrue(try evaluate(web, "(\(PriceShareReader.script))===null") as? Bool == true)
        _ = try evaluate(web, "document.querySelectorAll('#price')[1].remove();const unrelated=document.createElement('dialog');unrelated.textContent='Owned unrelated modal';document.body.append(unrelated);unrelated.showModal();true")
        XCTAssertTrue(try evaluate(web, "(\(PriceShareReader.script))===null") as? Bool == true, "The underlying venue is implicitly inert behind any other modal")
    }

    @MainActor private func evaluate(_ web: WKWebView, _ script: String) throws -> Any {
        let done = expectation(description: "Read owned current-price DOM")
        var result: Result<Any, Error>?
        web.evaluateJavaScript(script, in: nil, in: .defaultClient) { result = $0; done.fulfill() }
        wait(for: [done], timeout: 5)
        return try XCTUnwrap(result).get()
    }
    @MainActor private func descendants(_ view: UIView) -> [UIView] { view.subviews.flatMap { [$0] + descendants($0) } }
}

private final class ShareFixtureNavigationDelegate: NSObject, WKNavigationDelegate {
    private let loaded: XCTestExpectation
    init(_ loaded: XCTestExpectation) { self.loaded = loaded }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { loaded.fulfill() }
}
