import Foundation
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
