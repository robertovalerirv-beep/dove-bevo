import UIKit
import WebKit
import XCTest
@testable import DoveBevo

final class SavedDrinkControllerTests: XCTestCase {
    @MainActor func testActualNativeChooserUsesAutomaticNamesBandAndKeepsNoPriceVenueChoice() throws {
        let venue = try SavedVenuePolicy.venue(url: URL(string: "https://www.dovebevo.com/bar/n123?c=u0nd9")!, label: "Actual venue")
        let document = try XCTUnwrap(MobileEntry.venueDocument(venue.url))
        let price = try XCTUnwrap(PriceShareSnapshot.parse(fields(document), currentURL: document))
        let controller = FavouriteSaveChooser(venue: venue, price: price)
        var selected: FavouriteSaveChooser.Choice?
        controller.onChoose = { selected = $0 }
        try withMounted(controller) { window in
            let index = IndexPath(row: 1, section: 0)
            let row = try XCTUnwrap(controller.tableView.cellForRow(at: index))
            XCTAssertTrue(row.window === window)
            XCTAssertTrue(row.isUserInteractionEnabled)
            for label in ["Spritz", "Happy hour", "Actual venue"] { XCTAssertTrue(row.accessibilityLabel?.contains(label) == true) }
            controller.tableView(controller.tableView, didSelectRowAt: index)
            guard case .drink? = selected else { return XCTFail("Actual drink row must deliver only the drink choice") }
        }
        let unavailable = FavouriteSaveChooser(venue: venue, price: nil)
        unavailable.onChoose = { _ in XCTFail("Unavailable drink must not produce a save") }
        unavailable.loadViewIfNeeded()
        let disabled = unavailable.tableView(unavailable.tableView, cellForRowAt: IndexPath(row: 1, section: 0))
        XCTAssertFalse(disabled.isUserInteractionEnabled)
        unavailable.tableView(unavailable.tableView, didSelectRowAt: IndexPath(row: 1, section: 0))
        var venueChosen = false
        unavailable.onChoose = { if case .venue = $0 { venueChosen = true } }
        unavailable.tableView(unavailable.tableView, didSelectRowAt: IndexPath(row: 0, section: 0))
        XCTAssertTrue(venueChosen)
    }

    func testFocusedDrinkAndBandMustMatchTheActualVisiblePrice() throws {
        let venue = URL(string: "https://www.dovebevo.com/bar/n123?c=u0nd9")!
        let wanted = try XCTUnwrap(MobileEntry.drinkDocument(venue, drink: "spritz", band: .happyHour))
        XCTAssertNotNil(PriceShareSnapshot.parse(fields(wanted), currentURL: wanted))
        let normal = try XCTUnwrap(MobileEntry.drinkDocument(venue, drink: "spritz", band: .normal))
        XCTAssertNil(PriceShareSnapshot.parse(fields(normal), currentURL: normal), "A normal focus cannot capture the previous HH row")
        let other = try XCTUnwrap(MobileEntry.drinkDocument(venue, drink: "negroni", band: .happyHour))
        XCTAssertNil(PriceShareSnapshot.parse(fields(other), currentURL: other), "A changed drink focus cannot capture the previous Spritz row")
    }

    @MainActor func testDrinkPaneReadsOwnBandReopensFocusAndDeletesOnlyItsTuple() throws {
        try withStores { venueStore, drinkStore in
            let url = URL(string: "https://www.dovebevo.com/bar/n123?c=u0nd9")!
            try venueStore.save(url: url, label: "Saved venue")
            let bytes = try Data(contentsOf: venueStore.fileURL)
            let normal = try SavedDrink.validated(url: url, label: "Saved automatic name", drink: "spritz", band: .normal)
            let hh = try SavedDrink.validated(url: url, label: "Saved automatic name", drink: "spritz", band: .happyHour)
            try drinkStore.save(normal); try drinkStore.save(hh)
            let client = DrinkPaneFixture()
            var opened: URL?
            let controller = SavedVenuesViewController(store: venueStore, drinkStore: drinkStore, client: client, activityCheck: { true }) { opened = $0 }
            try withMounted(controller) { _ in
                controller.selectSavedDrinks(true)
                waitUntil("Visible Drink pane must start its actual refresh") { client.last != nil }
                XCTAssertEqual(client.last?.map(\.url), [url], "Read one real venue once for its two saved bands")
                let current = CurrentFavouriteVenue(key: "n123", name: "Current automatic name", prices: [
                    FavouritePrice(drink: "spritz", band: .normal, cents: 800, observedOn: "2026-11-02", confirmations: 1, quarantined: false),
                    FavouritePrice(drink: "spritz", band: .happyHour, cents: 500, observedOn: "2026-11-02", confirmations: 0, quarantined: false)
                ])
                client.complete(FavouriteComparisonSnapshot(venues: [url: current], unavailable: []))
                controller.tableView.layoutIfNeeded()
                XCTAssertEqual(controller.tableView.numberOfRows(inSection: 0), 2)
                let index = IndexPath(row: 0, section: 0)
                let row = controller.tableView(controller.tableView, cellForRowAt: index)
                XCTAssertTrue(row.accessibilityLabel?.contains("Happy hour") == true)
                XCTAssertTrue(row.accessibilityLabel?.contains("Current automatic name") == true)
                XCTAssertTrue(row.accessibilityValue?.contains("5,00 €") == true)
                controller.tableView(controller.tableView, didSelectRowAt: index)
                XCTAssertEqual(opened, MobileEntry.drinkDocument(url, drink: "spritz", band: .happyHour))
                controller.tableView(controller.tableView, commit: .delete, forRowAt: index)
                XCTAssertEqual(try drinkStore.load(), [normal])
                XCTAssertEqual(try Data(contentsOf: venueStore.fileURL), bytes)
                controller.selectSavedDrinks(false)
                XCTAssertEqual(try venueStore.load().count, 1)
            }
        }
    }

    @MainActor func testProductionBrowserReadsActualFeaturedRowThenSavesOnlyPrivateDrink() throws {
        try withStores { venueStore, drinkStore in
            var ready = false
            let browser = BrowserViewController(savedVenues: venueStore, savedDrinks: drinkStore, websiteLoader: { web, request in
                let bytes = Data(self.html.utf8)
                return web.loadSimulatedRequest(request, response: URLResponse(url: request.url!, mimeType: "text/html", expectedContentLength: bytes.count, textEncodingName: "UTF-8"), responseData: bytes)
            })
            browser.onVenueActionsChanged = { ready = $0 }
            try withMounted(browser) { _ in
                browser.openSavedVenue(URL(string: "https://www.dovebevo.com/bar/n123?c=u0nd9")!)
                waitUntil("Actual owned venue must finish before save") { ready }
                browser.saveCurrentVenue()
                waitUntil("Actual native save chooser") { (browser.presentedViewController as? UINavigationController)?.topViewController is FavouriteSaveChooser }
                let chooser = try XCTUnwrap((browser.presentedViewController as? UINavigationController)?.topViewController as? FavouriteSaveChooser)
                XCTAssertEqual(chooser.price?.drink, "spritz"); XCTAssertEqual(chooser.price?.happyHour, true)
                chooser.tableView(chooser.tableView, didSelectRowAt: IndexPath(row: 1, section: 0))
                let saved = try XCTUnwrap(drinkStore.load().first)
                XCTAssertEqual(saved.drink, "spritz"); XCTAssertEqual(saved.band, .happyHour)
                XCTAssertEqual(saved.venue.label, "Actual venue"); XCTAssertTrue(try venueStore.load().isEmpty)
            }
        }
    }

    @MainActor private func withMounted(_ root: UIViewController, _ body: (UIWindow) throws -> Void) throws {
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first { $0.activationState == .foregroundActive })
        let previous = scene.windows.first { $0.isKeyWindow }
        let window = UIWindow(windowScene: scene); window.frame = CGRect(x: 0, y: 0, width: 402, height: 800)
        window.rootViewController = UINavigationController(rootViewController: root)
        window.makeKeyAndVisible(); window.layoutIfNeeded(); root.view.layoutIfNeeded()
        defer { window.isHidden = true; window.rootViewController = nil; previous?.makeKey() }
        waitUntil("Actual foreground fixture window must be mounted") { root.view.window === window && window.isKeyWindow && !root.view.bounds.isEmpty }
        try body(window)
    }
    @MainActor private func waitUntil(_ label: String, _ predicate: @escaping () -> Bool) {
        let ready = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in predicate() }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 15), .completed, label)
    }
    private func withStores(_ body: (SavedVenueStore, SavedDrinkStore) throws -> Void) throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        try body(SavedVenueStore(directoryURL: root.appendingPathComponent("venues")), SavedDrinkStore(directoryURL: root.appendingPathComponent("drinks")))
    }
    private func fields(_ url: URL) -> [String: Any] {
        ["href": url.absoluteString, "version": "1", "venue": "n123", "venueName": "Actual venue", "drink": "spritz", "drinkName": "Spritz", "hh": "1", "amountMinor": "650", "currency": "GBP", "serving": "Drink singolo", "provenance": "Da menu online · Fonte verificata il 2026-11-02", "confirmations": "0", "tier": "affare", "location": "London"]
    }
    private var html: String {
        #"""
        <!doctype html><html data-dovebevo-mobile-shell="1"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>
        <section class="map" data-selected="n123"></section><dialog class="sheet sheet--bare" aria-label="Actual venue"><div class="sheet__body"><div class="scontrino"><div class="scontrino__paper"><h2 class="scontrino__name">Actual venue</h2>
        <div data-dovebevo-share="1" data-version="1" data-venue="n123" data-venue-name="Actual venue" data-drink="spritz" data-drink-name="Spritz" data-hh="1" data-amount-minor="650" data-currency="GBP" data-serving="Drink singolo" data-provenance="Da menu online · Fonte verificata il 2026-11-02" data-confirmations="0" data-tier="affare" data-location="London" style="width:200px;height:100px">Spritz 6,50 £</div>
        </div></div></div></dialog><script>document.querySelector('dialog').showModal()</script></body></html>
        """#
    }
}

private final class DrinkPaneFixture: FavouriteComparisonServing {
    var last: [SavedVenue]?
    private var completion: ((FavouriteComparisonSnapshot) -> Void)?
    func load(_ saved: [SavedVenue], completion: @escaping (FavouriteComparisonSnapshot) -> Void) -> RecommendationRequest {
        last = saved; self.completion = completion; return TestRecommendationRequest()
    }
    func complete(_ snapshot: FavouriteComparisonSnapshot) { completion?(snapshot) }
}
