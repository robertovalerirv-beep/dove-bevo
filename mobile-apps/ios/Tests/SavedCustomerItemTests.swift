import XCTest
@testable import DoveBevo

final class SavedCustomerItemTests: XCTestCase {
    private let venue = SavedVenue(url: URL(string: "https://www.dovebevo.com/bar/n4170005990?c=u0nd9")!, label: "The Dome")
    private let key = "o" + String(repeating: "a", count: 64)

    func testCustomerItemIsPrivateAndRetainsExactIdentityWithoutPrice() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let price = MenuV2Price(id: key, venueName: venue.label, itemName: "Spritz della casa", category: "spritz",
                                band: nil, amountMinor: 550, currency: "EUR", exponent: 2,
                                servingLabel: "Calice", servingML: 250, origin: .customer("2026-11-04"), feeNotice: "")
        let item = try XCTUnwrap(SavedCustomerItem.verified(venue: venue, price: price))
        let store = SavedCustomerItemStore(directoryURL: root)
        try store.save(item)
        XCTAssertEqual(try store.load(), [item])
        let stored = try String(contentsOf: store.fileURL, encoding: .utf8)
        XCTAssertFalse(stored.contains("550"))
        XCTAssertFalse(stored.contains("2026-11-04"))
        try store.remove(item)
        XCTAssertTrue(try store.load().isEmpty)
    }

    func testRejectsOwnerMenuAndForgedCustomerMetadata() {
        let owner = MenuV2Price(id: key, venueName: venue.label, itemName: "Spritz", category: "spritz",
                                band: nil, amountMinor: 550, currency: "EUR", exponent: 2,
                                servingLabel: nil, servingML: nil, origin: .ownerMenu(URL(string: "https://example.com/menu")!, "2026-11-04"), feeNotice: "")
        XCTAssertNil(SavedCustomerItem.verified(venue: venue, price: owner))
        XCTAssertNil(SavedCustomerItem.validated(venue: venue, key: "x" + String(repeating: "a", count: 64),
                                                 name: "Spritz", category: nil, servingLabel: nil, servingML: nil))
        XCTAssertNil(SavedCustomerItem.validated(venue: venue, key: key, name: "Spritz\nOther",
                                                 category: nil, servingLabel: nil, servingML: nil))
    }
}
