import UIKit
import WebKit
import XCTest
@testable import DoveBevo

final class SavedDrinkControllerTests: XCTestCase {
    @MainActor func testNativeChooserSavesOneExplicitDrinkAndBandWithoutAPrice() throws {
        let venue = try SavedVenuePolicy.venue(url: URL(string: "https://www.dovebevo.com/bar/n123?c=u0nd9")!, label: "Actual venue")
        let controller = FavouriteSaveChooser(venue: venue)
        var selected: (String, ComparisonBand)?
        controller.onChoose = { selected = ($0, $1) }
        try withMounted(controller) { window in
            XCTAssertEqual(controller.tableView.numberOfRows(inSection: 0), DrinkCategory.all.count)
            let index = IndexPath(row: 1, section: 0)
            let row = try XCTUnwrap(controller.tableView.cellForRow(at: index))
            XCTAssertTrue(row.window === window)
            XCTAssertEqual(row.accessibilityIdentifier, "favorites.saveDrink.spritz")
            XCTAssertTrue(controller.tableView(controller.tableView, titleForHeaderInSection: 0)?.contains("Actual venue") == true)
            controller.tableView(controller.tableView, didSelectRowAt: index)
            controller.bandControl.selectedSegmentIndex = 1
            controller.save()
            XCTAssertEqual(selected?.0, "spritz")
            XCTAssertEqual(selected?.1, .happyHour)
        }
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
                XCTAssertTrue(controller.tableView.value(forKey: "tableHeaderView") != nil)
                waitUntil("Visible Drink pane must start its actual refresh") { client.last != nil }
                XCTAssertEqual(client.last?.map(\.url), [url], "Read one real venue once for its two saved bands")
                let current = CurrentFavouriteVenue(key: "n123", name: "Current automatic name", prices: [
                    FavouritePrice(drink: "spritz", band: .normal, cents: 800, observedOn: "2026-11-02", confirmations: 1, quarantined: false),
                    FavouritePrice(drink: "spritz", band: .happyHour, cents: 500, observedOn: "2026-11-02", confirmations: 0, quarantined: false)
                ])
                client.complete(FavouriteComparisonSnapshot(venues: [url: current], unavailable: []))
                controller.tableView.layoutIfNeeded()
                XCTAssertEqual(controller.tableView.numberOfRows(inSection: 0), 2)
                let index = try XCTUnwrap((0..<2).map { IndexPath(row: $0, section: 0) }.first {
                    controller.tableView(controller.tableView, cellForRowAt: $0).accessibilityLabel?.contains("Happy hour") == true
                })
                let row = controller.tableView(controller.tableView, cellForRowAt: index)
                XCTAssertTrue(row.accessibilityLabel?.contains("Happy hour") == true)
                XCTAssertTrue(row.accessibilityLabel?.contains("Current automatic name") == true)
                XCTAssertTrue(row.accessibilityValue?.contains("5,00 €") == true)
                controller.tableView(controller.tableView, didSelectRowAt: index)
                XCTAssertEqual(opened, MobileEntry.drinkDocument(url, drink: "spritz", band: .happyHour))
                controller.tableView(controller.tableView, commit: .delete, forRowAt: index)
                XCTAssertEqual(try drinkStore.load(), [normal])
                XCTAssertEqual(try Data(contentsOf: venueStore.fileURL), bytes)
                controller.selectDrink("negroni")
                XCTAssertEqual(controller.tableView.numberOfRows(inSection: 0), 0)
                controller.selectDrink("all")
                XCTAssertEqual(controller.tableView.numberOfRows(inSection: 0), 1)
                XCTAssertEqual(try venueStore.load().count, 1)
            }
        }
    }

    @MainActor func testThreeSavedPricesFitAndKeepFullEvidenceInNativeDetails() throws {
        try withStores { venueStore, drinkStore in
            let url = URL(string: "https://www.dovebevo.com/bar/n123?c=u0nd9")!
            for code in ["beer_draft", "spritz", "negroni"] {
                try drinkStore.save(SavedDrink.validated(url: url, label: "Bar Milano", drink: code, band: .normal))
            }
            let client = DrinkPaneFixture()
            let controller = SavedVenuesViewController(store: venueStore, drinkStore: drinkStore,
                                                        client: client, activityCheck: { true }) { _ in }
            try withMounted(controller) { _ in
                guard waitUntil("Saved drinks should refresh", { client.last != nil }) else { return }
                let current = CurrentFavouriteVenue(key: "n123", name: "Bar Milano", prices: [
                    FavouritePrice(drink: "beer_draft", band: .normal, cents: 500, observedOn: "2026-11-02", confirmations: 1, quarantined: false),
                    FavouritePrice(drink: "spritz", band: .normal, cents: 650, observedOn: "2026-11-02", confirmations: 1, quarantined: false),
                    FavouritePrice(drink: "negroni", band: .normal, cents: 800, observedOn: "2026-11-02", confirmations: 1, quarantined: false)
                ])
                client.complete(FavouriteComparisonSnapshot(venues: [url: current], unavailable: []))
                controller.tableView.layoutIfNeeded()
                XCTAssertEqual(controller.tableView.numberOfRows(inSection: 0), 3)
                let last = IndexPath(row: 2, section: 0)
                XCTAssertLessThanOrEqual(controller.tableView.rectForRow(at: last).maxY,
                                         controller.tableView.bounds.height + controller.tableView.contentOffset.y + 8,
                                         "Three priced favourites should be visible on the 402 x 800 test phone")
                let cell = controller.tableView(controller.tableView, cellForRowAt: last)
                XCTAssertEqual(cell.accessoryType, .detailDisclosureButton)
                XCTAssertEqual((cell.contentConfiguration as? UIListContentConfiguration)?.secondaryTextProperties.numberOfLines, 2)
                XCTAssertTrue(cell.accessibilityValue?.contains("€") == true)
                controller.tableView(controller.tableView, accessoryButtonTappedForRowWith: last)
                guard waitUntil("Native details should open", { controller.presentedViewController is UIAlertController }) else { return }
                let details = controller.presentedViewController as? UIAlertController
                XCTAssertTrue(details?.message?.contains("2026") == true)
                details?.dismiss(animated: false)
            }
        }
    }

    @MainActor func testConditionalStaleMenuFavouriteKeepsWarningsVisibleAndFullDetailsAccessible() throws {
        try withStores { venueStore, drinkStore in
            let url = URL(string: "https://www.dovebevo.com/bar/n123?c=u0nd9")!
            let venue = try SavedVenuePolicy.venue(url: url, label: "Bar Milano")
            let source = MenuV2Price(id: "spritz.7", venueName: "Bar Milano", itemName: "Spritz della casa",
                                     category: "spritz", band: .normal, amountMinor: 550, currency: "EUR", exponent: 2,
                                     servingLabel: "calice", servingML: 250,
                                     origin: .ownerMenu(URL(string: "https://example.org/menu")!, "2020-01-01"), feeNotice: "Servizio escluso")
            let offerStore = SavedMenuOfferStore(directoryURL: drinkStore.fileURL.deletingLastPathComponent().appendingPathComponent("offers"))
            try offerStore.save(try XCTUnwrap(SavedMenuOffer.verified(venue: venue, price: source)))
            var conditional = MenuV2Price(id: source.id, venueName: source.venueName, itemName: source.itemName,
                                          category: "spritz", band: nil, amountMinor: 750, currency: "EUR", exponent: 2,
                                          servingLabel: "calice", servingML: 250,
                                          origin: .ownerMenu(URL(string: "https://example.org/menu")!, "2020-01-01"), feeNotice: "Servizio escluso")
            conditional.condition = "Solo dopo le 18"
            let snapshot = MenuV2Snapshot(venues: [url: MenuV2Venue(key: "n123", cell: "u0nd9", name: "Bar Milano",
                                                                        offers: [conditional], feeNotice: "Servizio escluso")], unavailable: [])
            let client = DrinkPaneMenuFixture(snapshot: snapshot)
            let controller = SavedVenuesViewController(store: venueStore, drinkStore: drinkStore, offerStore: offerStore,
                                                        menuClient: client, activityCheck: { true }) { _ in }
            try withMounted(controller) { _ in
                XCTAssertEqual(controller.tableView.numberOfRows(inSection: 0), 1)
                let index = IndexPath(row: 0, section: 0)
                let cell = controller.tableView(controller.tableView, cellForRowAt: index)
                let content = try XCTUnwrap(cell.contentConfiguration as? UIListContentConfiguration)
                XCTAssertTrue(content.secondaryText?.hasPrefix("Menu del locale: 7,50 € · Con condizioni · Da riverificare") == true)
                XCTAssertTrue(content.secondaryText?.contains("EUR · calice · 250 ml") == true)
                XCTAssertEqual(content.secondaryTextProperties.numberOfLines, 3)
                XCTAssertTrue(cell.accessibilityValue?.contains("Solo dopo le 18") == true)
                controller.tableView(controller.tableView, accessoryButtonTappedForRowWith: index)
                guard waitUntil("Full menu warning details", { controller.presentedViewController is UIAlertController }) else { return }
                XCTAssertTrue((controller.presentedViewController as? UIAlertController)?.message?.contains("Menu da riverificare: oltre 90 giorni") == true)
                controller.dismiss(animated: false)
            }
        }
    }

    @MainActor func testOldCommunityPriceDisplaysRecheckWarningBeforeDetails() throws {
        try withStores { venueStore, drinkStore in
            let url = URL(string: "https://www.dovebevo.com/bar/n123?c=u0nd9")!
            try drinkStore.save(SavedDrink.validated(url: url, label: "Bar Milano", drink: "spritz", band: .normal))
            let client = DrinkPaneFixture()
            let controller = SavedVenuesViewController(store: venueStore, drinkStore: drinkStore,
                                                        client: client, activityCheck: { true }) { _ in }
            try withMounted(controller) { _ in
                guard waitUntil("Saved price refresh", { client.last != nil }) else { return }
                let current = CurrentFavouriteVenue(key: "n123", name: "Bar Milano", prices: [
                    FavouritePrice(drink: "spritz", band: .normal, cents: 650,
                                   observedOn: "2020-01-01", confirmations: 1, quarantined: false)
                ])
                client.complete(FavouriteComparisonSnapshot(venues: [url: current], unavailable: []))
                let index = IndexPath(row: 0, section: 0)
                let cell = controller.tableView(controller.tableView, cellForRowAt: index)
                let content = try XCTUnwrap(cell.contentConfiguration as? UIListContentConfiguration)
                XCTAssertTrue(content.secondaryAttributedText?.string.contains("6,50 € · Da riverificare") == true)
                XCTAssertEqual(content.secondaryTextProperties.numberOfLines, 3)
                XCTAssertTrue(cell.accessibilityValue?.contains("oltre 90 giorni") == true)
            }
        }
    }

    @MainActor func testOldSavedPlaceConvertsOnlyAfterExplicitDrinkChoiceInSameTab() throws {
        try withStores { venueStore, drinkStore in
            let url = URL(string: "https://www.dovebevo.com/bar/n123?c=u0nd9")!
            try venueStore.save(url: url, label: "Old saved place")
            let controller = SavedVenuesViewController(store: venueStore, drinkStore: drinkStore, activityCheck: { true }) { _ in }
            try withMounted(controller) { _ in
                XCTAssertEqual(controller.tableView.numberOfSections, 2)
                let index = IndexPath(row: 0, section: 1)
                let row = controller.tableView(controller.tableView, cellForRowAt: index)
                XCTAssertEqual(row.accessibilityIdentifier, "favorites.migrate.n123")
                XCTAssertTrue(try drinkStore.load().isEmpty)
                XCTAssertEqual(try venueStore.load().count, 1)
                guard waitUntil("Visible favourites must finish their actual appearance before legacy selection", {
                    controller.canReloadFromMore
                }) else { return }
                controller.tableView(controller.tableView, didSelectRowAt: index)
                waitUntil("Explicit old place drink chooser") { (controller.presentedViewController as? UINavigationController)?.topViewController is FavouriteSaveChooser }
                let chooser = try XCTUnwrap((controller.presentedViewController as? UINavigationController)?.topViewController as? FavouriteSaveChooser)
                chooser.tableView(chooser.tableView, didSelectRowAt: IndexPath(row: 1, section: 0))
                chooser.save()
                XCTAssertEqual(try drinkStore.load().first?.drink, "spritz")
                XCTAssertTrue(try venueStore.load().isEmpty)
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
                chooser.tableView(chooser.tableView, didSelectRowAt: IndexPath(row: 1, section: 0))
                chooser.bandControl.selectedSegmentIndex = 1
                chooser.save()
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
        guard waitUntil("Actual foreground fixture window must be mounted", {
            root.view.window === window && window.isKeyWindow && !root.view.bounds.isEmpty
        }) else {
            throw NSError(domain: "OwnedSavedDrinkFixture", code: 1, userInfo: [NSLocalizedDescriptionKey: "Fixture window did not mount"])
        }
        try body(window)
    }
    @MainActor @discardableResult private func waitUntil(_ label: String, _ predicate: @escaping () -> Bool) -> Bool {
        if predicate() { return true }
        let ready = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in predicate() }, object: nil)
        let result = XCTWaiter.wait(for: [ready], timeout: 15)
        let mounted = predicate()
        XCTAssertTrue(mounted, "\(label); waiter=\(result.rawValue)")
        return mounted
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

private final class DrinkPaneMenuFixture: MenuV2Serving {
    let snapshot: MenuV2Snapshot
    init(snapshot: MenuV2Snapshot) { self.snapshot = snapshot }
    func load(_ saved: [SavedVenue], completion: @escaping (MenuV2Snapshot) -> Void) -> RecommendationRequest {
        completion(snapshot)
        return TestRecommendationRequest()
    }
}
