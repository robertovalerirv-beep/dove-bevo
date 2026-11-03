import Foundation
import UIKit
import XCTest
@testable import DoveBevo

final class SavedMenuOfferTests: XCTestCase {
    private let canonical = URL(string: "https://www.dovebevo.com/bar/m000000000000000000000007?c=u0nd9")!
    private var source: MenuV2Price {
        MenuV2Price(id: "spritz.7", venueName: "Bar Milano", itemName: "Spritz della casa", category: "",
                    band: .normal, amountMinor: 550, currency: "EUR", exponent: 2,
                    servingLabel: "calice", servingML: 250,
                    origin: .ownerMenu(URL(string: "https://example.org/menu")!, "2026-11-03"), feeNotice: "Servizio escluso")
    }

    func testVerifiedOwnerOfferPersistsIdentityAndDisplayOnly() throws {
        let venue = try SavedVenuePolicy.venue(url: canonical, label: "Bar Milano")
        let item = try XCTUnwrap(SavedMenuOffer.verified(venue: venue, price: source))
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        let store = SavedMenuOfferStore(directoryURL: folder)
        try store.save(item)
        XCTAssertEqual(try store.load(), [item])
        XCTAssertEqual(item.focusedURL()?.absoluteString,
            "https://www.dovebevo.com/mobile/?path=%2Fbar%2Fm000000000000000000000007&c=u0nd9&offer=spritz.7")
        let bytes = try Data(contentsOf: store.fileURL)
        let text = try XCTUnwrap(String(data: bytes, encoding: .utf8))
        for forbidden in ["amount", "price", "550", "currency", "EUR", "source_url"] { XCTAssertFalse(text.contains(forbidden), forbidden) }
        try store.remove(item); XCTAssertTrue(try store.load().isEmpty)
    }

    func testCommandRequiresExactTrustedVenueAndIsNeverAnOrdinaryRoute() throws {
        let base = "https://www.dovebevo.com/mobile/?path=%2Fbar%2Fm000000000000000000000007&c=u0nd9"
        let command = try XCTUnwrap(URL(string: base + "&save_offer=spritz.7"))
        XCTAssertEqual(OfferSaveCommand.offerID(from: command, currentVenue: canonical), "spritz.7")
        XCTAssertNil(SavedVenuePolicy.canonicalURL(command))
        XCTAssertNil(OfferSaveCommand.offerID(from: command, currentVenue: URL(string: "https://www.dovebevo.com/bar/n123?c=u0nd9")))
        for raw in [base + "&save_offer=spritz.7&extra=1", base + "&save_offer=%73pritz.7",
                    base + "&save_offer=spritz.7#x", base + "&save_offer=spritz.7&save_offer=other",
                    base.replacingOccurrences(of: "%2Fbar%2F", with: "%252Fbar%252F") + "&save_offer=spritz.7",
                    "https://evil.test/mobile/?path=%2Fbar%2Fm000000000000000000000007&c=u0nd9&save_offer=spritz.7"] {
            XCTAssertNil(OfferSaveCommand.offerID(from: URL(string: raw)!, currentVenue: canonical), raw)
        }
    }

    @MainActor func testOfferOnlyFavouriteShowsRefreshedLivePriceInSameTab() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let venueStore = SavedVenueStore(directoryURL: root.appendingPathComponent("venues"))
        let drinkStore = SavedDrinkStore(directoryURL: root.appendingPathComponent("categories"))
        let offerStore = SavedMenuOfferStore(directoryURL: root.appendingPathComponent("offers"))
        let venue = try SavedVenuePolicy.venue(url: canonical, label: "Bar Milano")
        try offerStore.save(try XCTUnwrap(SavedMenuOffer.verified(venue: venue, price: source)))
        var live = MenuV2Price(id: source.id, venueName: "Bar Milano", itemName: source.itemName,
            category: "", band: nil, amountMinor: 750, currency: "EUR", exponent: 2,
            servingLabel: "calice", servingML: 250,
            origin: .ownerMenu(URL(string: "https://example.org/menu")!, "2026-11-03"), feeNotice: "Servizio escluso")
        live.condition = "Solo dopo le 18"
        var customer = MenuV2Price(id: "c" + String(repeating: "b", count: 64), venueName: "Bar Milano",
            itemName: source.itemName, category: "", band: nil, amountMinor: 850, currency: "EUR", exponent: 2,
            servingLabel: "calice", servingML: 300, origin: .customer("2026-11-03"), feeNotice: "Spese non verificate")
        customer.linkedOfferID = source.id
        let snapshot = MenuV2Snapshot(venues: [canonical: MenuV2Venue(key: canonical.lastPathComponent,
            cell: "u0nd9", name: "Bar Milano", offers: [live], feeNotice: "Servizio escluso",
            linkedReports: [customer])], unavailable: [])
        let client = ImmediateOwnerMenu(snapshot: snapshot)
        var opened: URL?
        let controller = SavedVenuesViewController(store: venueStore, drinkStore: drinkStore,
            offerStore: offerStore, menuClient: client, activityCheck: { true }) { opened = $0 }
        controller.loadViewIfNeeded(); controller.viewWillAppear(false); controller.viewDidAppear(false)
        XCTAssertEqual(client.requests, 1)
        XCTAssertEqual(controller.tableView.numberOfRows(inSection: 0), 1)
        let index = IndexPath(row: 0, section: 0)
        let cell = controller.tableView(controller.tableView, cellForRowAt: index)
        XCTAssertEqual(cell.accessibilityIdentifier, "savedOffer.spritz.7")
        XCTAssertTrue(cell.accessibilityValue?.contains("7,50") == true)
        XCTAssertTrue(cell.accessibilityValue?.contains("8,50") == true)
        let details = (cell.contentConfiguration as? UIListContentConfiguration)?.secondaryText
        XCTAssertTrue(details?.contains("Menu del locale: 7,50") == true)
        XCTAssertTrue(details?.contains("Segnalazione cliente distinta: 8,50") == true)
        XCTAssertTrue(details?.contains("Prezzo soggetto a condizioni: Solo dopo le 18") == true)
        XCTAssertTrue(details?.contains("Formato, categoria o valuta diversi dal menu") == true)
        controller.tableView(controller.tableView, didSelectRowAt: index)
        XCTAssertEqual(opened, MobileEntry.offerDocument(canonical, offerID: "spritz.7"))
        controller.tableView(controller.tableView, commit: .delete, forRowAt: index)
        XCTAssertTrue(try offerStore.load().isEmpty)
        XCTAssertTrue(try drinkStore.load().isEmpty)
        controller.viewWillDisappear(false)
    }

    func testVerifiedLongMenuMetadataFitsThePublicV2Bounds() throws {
        let venue = try SavedVenuePolicy.venue(url: canonical, label: "Bar Milano")
        let long = MenuV2Price(id: "long.1", venueName: "Bar Milano",
            itemName: String(repeating: "A", count: 512), category: "",
            band: .normal, amountMinor: 550, currency: "EUR", exponent: 2,
            servingLabel: String(repeating: "B", count: 256), servingML: 100_000,
            origin: .ownerMenu(URL(string: "https://example.org/menu")!, "2026-11-03"), feeNotice: "")
        let saved = try XCTUnwrap(SavedMenuOffer.verified(venue: venue, price: long))
        XCTAssertEqual(saved.name.count, 512)
        XCTAssertEqual(saved.servingML, 100_000)
    }

    func testOfferFocusIsExactAndMissingOfferNeverBecomesAnotherDrink() throws {
        let focus = try XCTUnwrap(MobileEntry.offerDocument(canonical, offerID: "spritz.7"))
        XCTAssertEqual(MobileEntry.publicVenue(focus), canonical)
        XCTAssertEqual(MobileEntry.documentURL(focus), focus)
        for raw in [focus.absoluteString + "&extra=1", focus.absoluteString.replacingOccurrences(of: "offer=", with: "save_offer="),
                    focus.absoluteString.replacingOccurrences(of: "offer=spritz.7", with: "offer=%73pritz.7")] {
            XCTAssertNil(MobileEntry.publicVenue(URL(string: raw)), raw)
        }
        XCTAssertNil(MobileEntry.offerDocument(canonical, offerID: "bad/name"))
        let venue = try SavedVenuePolicy.venue(url: canonical, label: "Bar Milano")
        let customer = MenuV2Price(id: source.id, venueName: source.venueName, itemName: source.itemName,
            category: source.category, band: source.band, amountMinor: 100, currency: "EUR", exponent: 2,
            servingLabel: source.servingLabel, servingML: source.servingML, origin: .customer("2026-11-03"), feeNotice: source.feeNotice)
        XCTAssertNil(SavedMenuOffer.verified(venue: venue, price: customer))
    }
}

private final class ImmediateOwnerMenu: MenuV2Serving {
    let snapshot: MenuV2Snapshot
    var requests = 0
    init(snapshot: MenuV2Snapshot) { self.snapshot = snapshot }
    func load(_ saved: [SavedVenue], completion: @escaping (MenuV2Snapshot) -> Void) -> RecommendationRequest {
        requests += 1; completion(snapshot); return ComparisonCancellation()
    }
}
