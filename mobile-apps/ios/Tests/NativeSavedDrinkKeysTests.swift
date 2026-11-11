import XCTest
@testable import DoveBevo

final class NativeSavedDrinkKeysTests: XCTestCase {
    func testExactLocalKeysKeepBandsAndServingsDistinct() throws {
        let venue = try XCTUnwrap(URL(string: "https://www.dovebevo.com/bar/n123?c=u0nd9"))
        XCTAssertEqual(NativeSavedDrinkKeys.venuePrefix(
            URL(string: "https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9")),
            "n123|u0nd9|")
        XCTAssertEqual(NativeSavedDrinkKeys.key(venue: venue, kind: "offer", item: "source:123"),
                       "n123|u0nd9|offer|source:123")
        XCTAssertEqual(NativeSavedDrinkKeys.key(venue: venue, kind: "legacy", item: "spritz", band: 0),
                       "n123|u0nd9|legacy|spritz|0")
        XCTAssertEqual(NativeSavedDrinkKeys.key(venue: venue, kind: "customer", item: "o" + String(repeating: "a", count: 64)),
                       "n123|u0nd9|customer|o" + String(repeating: "a", count: 64))
        XCTAssertEqual(NativeSavedDrinkKeys.key(venue: venue, kind: "europe", item: "beer_draft",
                                                band: 0, currency: "GBP", serving: "ml:568"),
                       "n123|u0nd9|europe|beer_draft|0|GBP|ml:568")
        XCTAssertNotEqual(NativeSavedDrinkKeys.key(venue: venue, kind: "legacy", item: "spritz", band: 0),
                          NativeSavedDrinkKeys.key(venue: venue, kind: "legacy", item: "spritz", band: 1))
    }

    func testInvalidIdentityDoesNotCrossIntoWebDocument() throws {
        let venue = try XCTUnwrap(URL(string: "https://www.dovebevo.com/bar/n123?c=u0nd9"))
        XCTAssertNil(NativeSavedDrinkKeys.venuePrefix(URL(string: "https://www.dovebevo.com/mobile/")))
        XCTAssertNil(NativeSavedDrinkKeys.key(venue: try XCTUnwrap(URL(string: "https://example.com/bar/n123?c=u0nd9")),
                                              kind: "offer", item: "source:123"))
        XCTAssertNil(NativeSavedDrinkKeys.key(venue: venue, kind: "offer", item: "bad|item"))
        XCTAssertNil(NativeSavedDrinkKeys.key(venue: venue, kind: "legacy", item: "spritz", band: 2))
        XCTAssertNil(NativeSavedDrinkKeys.key(venue: venue, kind: "europe", item: "beer_draft",
                                              band: 0, currency: "USD", serving: "ml:568"))
    }
}
