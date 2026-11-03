import UIKit
import WebKit
import XCTest
@testable import DoveBevo

final class DiscoveryControllerTests: XCTestCase {
    @MainActor func testReferenceDiscoveryPrivateFixtureRendersDrinkSelectorAndRealRows() throws {
        let (controller, mounted) = try referenceFixture(category: .large)
        defer { mounted.close() }
        let selector = try XCTUnwrap(descendants(controller.view).compactMap { $0 as? UIButton }.first {
            $0.accessibilityIdentifier == "discovery.drinkSelector"
        })
        XCTAssertGreaterThanOrEqual(selector.bounds.height, 48)
        XCTAssertEqual(selector.accessibilityValue, "Spritz")
        let first = try XCTUnwrap(controller.tableView.cellForRow(at: IndexPath(row: 0, section: 0)))
        XCTAssertTrue(first.window === mounted.window)
        XCTAssertGreaterThanOrEqual(first.bounds.height, 48)
        XCTAssertLessThanOrEqual(first.bounds.height, 115, "Full-width evidence must not turn simple rows into large cards")
        XCTAssertTrue(first.accessibilityValue?.contains("5,50 €") == true)
        mounted.attach(to: self, name: "Scopri-populated")
    }

    @MainActor func testReferenceDiscoveryPrivateFixtureMountsActualXXXLFontsWithoutClippedEvidence() throws {
        let (controller, mounted) = try referenceFixture(category: .accessibilityExtraExtraExtraLarge)
        defer { mounted.close() }
        let index = IndexPath(row: 0, section: 0)
        controller.tableView.scrollToRow(at: index, at: .top, animated: false)
        mounted.layout()
        let cell = try XCTUnwrap(controller.tableView.cellForRow(at: index))
        XCTAssertTrue(cell.window === mounted.window)
        let labels = descendants(cell).compactMap { $0 as? UILabel }.filter { !($0.text ?? "").isEmpty }
        let name = try XCTUnwrap(labels.first { $0.text == "Locale fixture A" })
        XCTAssertGreaterThan(name.font.pointSize, 30, "A trait parameter alone does not prove actual Dynamic Type fonts")
        for label in labels {
            XCTAssertFalse(label.isHidden)
            XCTAssertGreaterThan(label.bounds.width, 0)
            let needed = label.sizeThatFits(CGSize(width: label.bounds.width, height: .greatestFiniteMagnitude)).height
            XCTAssertLessThanOrEqual(needed, label.bounds.height + 1, label.text ?? "")
        }
        XCTAssertTrue(cell.accessibilityValue?.contains("Formato non dichiarato") == true)
        mounted.attach(to: self, name: "Scopri-populated-XXXL-scrolled-to-row")
    }

    @MainActor private func referenceFixture(category: UIContentSizeCategory) throws -> (DiscoveryViewController, OwnedReferenceWindow) {
        let client = DelayedDiscoveryService()
        let controller = DiscoveryViewController(client: client, activityCheck: { true }, onOpen: { _ in }, onMap: {})
        let area = try XCTUnwrap(DiscoveryArea(latitude: 45.4642, longitude: 9.19, zoom: 14))
        controller.setArea(area)
        controller.selectDrink("spritz")
        let mounted = try OwnedReferenceWindow(root: UINavigationController(rootViewController: controller), category: category)
        let requested = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in client.calls.count == 1 }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [requested], timeout: 5), .completed)
        guard client.calls.count == 1 else { mounted.close(); throw ComparisonReadError.unavailable }
        let venues = [550, 650, 700].enumerated().map { index, cents in
            DiscoveryVenue(key: "n\(901 + index)", name: "Locale fixture \(["A", "B", "C"][index])", cell: "u0nd9",
                latitude: 45.4642, longitude: 9.19, address: "Via fixture \(index + 1)", city: "Milano",
                prices: [FavouritePrice(drink: "spritz", band: .normal, cents: cents, observedOn: "2026-11-01", confirmations: 0, quarantined: false)])
        }
        client.complete(0, DiscoverySnapshot(area: area, venues: venues, unavailableCells: []))
        mounted.layout(); controller.tableView.layoutIfNeeded()
        XCTAssertEqual(controller.tableView.numberOfRows(inSection: 0), 3)
        return (controller, mounted)
    }

    @MainActor
    func testNativeRowsShowRealDataFiltersAndCanonicalOpenWithoutSavingAnything() throws {
        let client = DelayedDiscoveryService()
        var opened: URL?
        let controller = DiscoveryViewController(client: client, activityCheck: { true }, onOpen: { opened = $0 }, onMap: {})
        let area = try XCTUnwrap(DiscoveryArea(latitude: 45.4642, longitude: 9.19, zoom: 14))
        controller.setArea(area)
        controller.loadViewIfNeeded()
        controller.beginAppearanceTransition(true, animated: false); controller.endAppearanceTransition()
        XCTAssertEqual(client.calls.count, 1)
        let price = FavouritePrice(drink: "spritz", band: .normal, cents: 550, observedOn: "2026-10-28", confirmations: 0, quarantined: false)
        let venue = DiscoveryVenue(key: "n123", name: "Real current name", cell: "u0nd9", latitude: 45.4642, longitude: 9.19,
                                   address: "Via pubblica", city: "Milano", prices: [price])
        client.complete(0, DiscoverySnapshot(area: area, venues: [venue], unavailableCells: []))
        XCTAssertEqual(controller.tableView(controller.tableView, numberOfRowsInSection: 0), 0, "Both platforms start on the first real drink filter")
        controller.selectDrink("spritz")
        XCTAssertEqual(controller.tableView(controller.tableView, numberOfRowsInSection: 0), 1)
        controller.selectDrink("beer_draft")
        XCTAssertEqual(controller.tableView(controller.tableView, numberOfRowsInSection: 0), 0, "A beer filter cannot show a Spritz price")
        controller.selectDrink("spritz")
        XCTAssertEqual(controller.tableView(controller.tableView, numberOfRowsInSection: 0), 1)
        let index = IndexPath(row: 0, section: 0)
        let cell = controller.tableView(controller.tableView, cellForRowAt: index)
        let labels = descendants(cell).compactMap { ($0 as? UILabel)?.text }
        XCTAssertTrue(labels.contains("Real current name"))
        let text = labels.joined(separator: "\n")
        for expected in ["5,50 €", "Via pubblica · Milano", "0 m dal centro mappa", "2026-10-28", "0 conferme", "Formato non dichiarato"] {
            XCTAssertTrue(text.contains(expected), expected)
        }
        XCTAssertTrue(cell.accessibilityValue?.contains("Spritz · Normale") == true, "The selected global drink and band remain explicit to VoiceOver")
        XCTAssertEqual(cell.backgroundConfiguration?.backgroundColor, NativeAppearance.surface)
        XCTAssertFalse(text.contains("Affare"), "A disposable feed must not invent a price tier")
        controller.tableView(controller.tableView, didSelectRowAt: index)
        XCTAssertEqual(opened, URL(string: "https://www.dovebevo.com/bar/n123?c=u0nd9"))
        XCTAssertEqual(client.calls.count, 1, "Filters and opening cannot post or refetch contributions")
        let hour = try XCTUnwrap(descendants(controller.view).compactMap { $0 as? UIButton }.first { $0.accessibilityIdentifier == "favorites.band.happyHour" })
        hour.sendActions(for: .touchUpInside)
        XCTAssertEqual(controller.tableView(controller.tableView, numberOfRowsInSection: 0), 0)
        controller.beginAppearanceTransition(false, animated: false); controller.endAppearanceTransition()
    }

    @MainActor
    func testHiddenDestinationBackgroundAndChangedAreaRejectLateResultsAndCancelReads() throws {
        let client = DelayedDiscoveryService()
        var selected = false
        let controller = DiscoveryViewController(client: client, activityCheck: { true }, onOpen: { _ in }, onMap: {})
        controller.isDestinationSelected = { selected }
        let first = try XCTUnwrap(DiscoveryArea(latitude: 45.4642, longitude: 9.19, zoom: 14))
        let next = try XCTUnwrap(DiscoveryArea(latitude: 41.9, longitude: 12.5, zoom: 14))
        controller.setArea(first)
        controller.loadViewIfNeeded()
        controller.beginAppearanceTransition(true, animated: false); controller.endAppearanceTransition()
        XCTAssertTrue(client.calls.isEmpty, "A visible scene does not authorize a hidden destination")
        selected = true; controller.refresh()
        XCTAssertEqual(client.calls.count, 1)
        controller.setArea(next)
        XCTAssertTrue(client.calls[0].request.cancelled)
        XCTAssertEqual(client.calls.count, 2)
        client.complete(0, DiscoverySnapshot(area: first, venues: [], unavailableCells: []))
        XCTAssertTrue(identifiers(controller).contains("discovery.loading"), "Old area completion cannot retire the newer read")
        selected = false
        client.complete(1, DiscoverySnapshot(area: next, venues: [], unavailableCells: []))
        XCTAssertFalse(identifiers(controller).contains("discovery.loaded"))
        selected = true; controller.refresh()
        XCTAssertEqual(client.calls.count, 3)
        NotificationCenter.default.post(name: UIApplication.willResignActiveNotification, object: nil)
        XCTAssertTrue(client.calls[2].request.cancelled)
        client.complete(2, DiscoverySnapshot(area: next, venues: [], unavailableCells: []))
        XCTAssertFalse(identifiers(controller).contains("discovery.empty"))
        controller.refresh()
        XCTAssertEqual(client.calls.count, 3, "Background refresh must remain inert")
        controller.beginAppearanceTransition(false, animated: false); controller.endAppearanceTransition()
    }

    @MainActor
    func testChooseAreaAndPartialResultsRemainExplicit() throws {
        let client = DelayedDiscoveryService()
        let controller = DiscoveryViewController(client: client, activityCheck: { true }, onOpen: { _ in }, onMap: {})
        controller.loadViewIfNeeded()
        controller.beginAppearanceTransition(true, animated: false); controller.endAppearanceTransition()
        XCTAssertTrue(identifiers(controller).contains("discovery.chooseArea"))
        XCTAssertTrue(client.calls.isEmpty)
        let area = try XCTUnwrap(DiscoveryArea(latitude: 45.4642, longitude: 9.19, zoom: 14))
        controller.setArea(area)
        client.complete(0, DiscoverySnapshot(area: area, venues: [], unavailableCells: [area.cells[0]]))
        XCTAssertTrue(identifiers(controller).contains("discovery.partial"))
        controller.refresh()
        client.complete(1, DiscoverySnapshot(area: area, venues: [], unavailableCells: Set(area.cells)))
        XCTAssertTrue(identifiers(controller).contains("discovery.unavailable"))
        controller.beginAppearanceTransition(false, animated: false); controller.endAppearanceTransition()
    }

    @MainActor
    func testRealIsolatedWebKitReadUsesCurrentPublicMapAttributesAndRejectsUnreadyOrDuplicateMap() throws {
        let web = WKWebView(frame: CGRect(x: 0, y: 0, width: 390, height: 700), configuration: WKWebViewConfiguration())
        let loaded = expectation(description: "Owned map area fixture")
        let delegate = DiscoveryNavigationDelegate(loaded)
        web.navigationDelegate = delegate
        let data = Data("""
        <!doctype html><html><head><meta charset="utf-8"></head><body>
        <div id="app"><div class="app"><section class="map" data-ready="true" data-center="45.46420,9.19000" data-zoom="14.0" style="width:300px;height:300px"></section></div></div>
        <script>window.URL=function(){throw new Error('page world shadow');};</script>
        </body></html>
        """.utf8)
        let url = URLPolicy.homeURL
        let response = URLResponse(url: url, mimeType: "text/html", expectedContentLength: data.count, textEncodingName: "UTF-8")
        XCTAssertNotNil(web.loadSimulatedRequest(URLRequest(url: url), response: response, responseData: data))
        wait(for: [loaded], timeout: 15)
        let value = try evaluate(web, MapAreaReader.script)
        XCTAssertEqual(MapAreaReader.area(value, currentURL: url), DiscoveryArea(latitude: 45.4642, longitude: 9.19, zoom: 14))
        _ = try evaluate(web, "document.querySelector('section.map').setAttribute('data-ready','false');true")
        XCTAssertTrue(try evaluate(web, "(\(MapAreaReader.script)) === null") as? Bool == true)
        _ = try evaluate(web, "document.querySelector('section.map').setAttribute('data-ready','true');document.querySelector('.app').appendChild(document.querySelector('section.map').cloneNode(true));true")
        XCTAssertTrue(try evaluate(web, "(\(MapAreaReader.script)) === null") as? Bool == true)
    }

    @MainActor
    private func evaluate(_ web: WKWebView, _ source: String) throws -> Any {
        let done = expectation(description: "Fixed isolated area read")
        var result: Result<Any, Error>?
        web.evaluateJavaScript(source, in: nil, in: .defaultClient) { value in result = value; done.fulfill() }
        wait(for: [done], timeout: 5)
        return try XCTUnwrap(result).get()
    }

    @MainActor private func identifiers(_ controller: UIViewController) -> [String] {
        descendants(controller.view).compactMap(\.accessibilityIdentifier)
    }
    @MainActor private func descendants(_ view: UIView) -> [UIView] { view.subviews.flatMap { [$0] + descendants($0) } }
}

private final class DelayedDiscoveryService: DiscoveryServing {
    struct Call { let area: DiscoveryArea; let request: TestRecommendationRequest; let completion: (DiscoverySnapshot) -> Void }
    var calls: [Call] = []
    func load(_ area: DiscoveryArea, completion: @escaping (DiscoverySnapshot) -> Void) -> RecommendationRequest {
        let request = TestRecommendationRequest(); calls.append(Call(area: area, request: request, completion: completion)); return request
    }
    func complete(_ index: Int, _ snapshot: DiscoverySnapshot) { calls[index].completion(snapshot) }
}

private final class DiscoveryNavigationDelegate: NSObject, WKNavigationDelegate {
    let completed: XCTestExpectation
    init(_ completed: XCTestExpectation) { self.completed = completed }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { completed.fulfill() }
}
