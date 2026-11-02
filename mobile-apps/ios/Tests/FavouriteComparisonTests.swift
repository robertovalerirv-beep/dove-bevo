import Foundation
import XCTest
@testable import DoveBevo

final class FavouriteComparisonTests: XCTestCase {
    func testSameDrinkAndBandNeverFallsBackAndQuarantineNeverRanks() throws {
        let value = try ComparisonJSON.resolve(staticData: ComparisonFixtures.staticCell(), priceData: ComparisonFixtures.prices([
            ["n123", "beer_draft", 0, 800, "2026-10-28", 2, 0],
            ["n123", "beer_draft", 1, 500, "2026-10-28", 1, 0],
            ["n123", "spritz", 0, 600, "2026-10-28", 3, 1]
        ]), cell: "u0nd9", today: "2026-10-29")
        let venue = try XCTUnwrap(value["n123"])
        XCTAssertEqual(venue.price(drink: "beer_draft", band: .normal)?.cents, 800)
        XCTAssertEqual(venue.price(drink: "beer_draft", band: .happyHour)?.cents, 500)
        XCTAssertNil(venue.price(drink: "spritz", band: .normal))
        XCTAssertNil(venue.price(drink: "water", band: .normal))
    }

    func testPublicCurrentNamesExcludeHiddenPendingAndWrongCellMetadata() throws {
        let hidden = try ComparisonJSON.resolve(staticData: ComparisonFixtures.staticCell(), priceData: ComparisonFixtures.prices([], hidden: ["n123"]), cell: "u0nd9", today: "2026-10-29")
        XCTAssertNil(hidden["n123"])
        let wrongCell = try ComparisonJSON.resolve(staticData: ComparisonFixtures.staticCell(), priceData: ComparisonFixtures.prices([]), cell: "u0nd8", today: "2026-10-29")
        XCTAssertNil(wrongCell["n123"], "An otherwise valid asset from another cell is not current venue proof")
        let pending = try ComparisonFixtures.json(["p": [], "u": [], "pend": [["u5", "In attesa", 1, 45.4642, 9.19, 1]], "h": []])
        XCTAssertNil(try ComparisonJSON.resolve(staticData: nil, priceData: pending, cell: "u0nd9", today: "2026-10-29")["u5"])
        XCTAssertEqual(ComparisonJSON.cellForCoordinates(latitude: 45.4642, longitude: 9.19), "u0nd9")
    }

    func testApprovedUserVenueSurvivesMissingOrHTMLStaticWithoutValidatingOSM() throws {
        let prices = try ComparisonFixtures.prices([["u5", "spritz", 0, 600, "2026-10-28", 1, 0]], users: [["u5", "Nome attuale", 1, 45.4642, 9.19]])
        for file in [nil, Data("<!doctype html><html>SPA</html>".utf8)] as [Data?] {
            let resolved = try ComparisonJSON.resolve(staticData: file, priceData: prices, cell: "u0nd9", today: "2026-10-29")
            XCTAssertEqual(resolved["u5"]?.name, "Nome attuale")
            XCTAssertEqual(resolved["u5"]?.price(drink: "spritz", band: .normal)?.cents, 600)
            XCTAssertNil(resolved["n123"])
        }
        XCTAssertThrowsError(try ComparisonJSON.resolve(staticData: nil, priceData: prices, cell: "u0nd8", today: "2026-10-29"))
    }

    func testMalformedNumbersRowsDuplicatesDatesAndBoundsFailHonestly() throws {
        let valid: [Any] = ["n123", "beer_draft", 0, 800, "2026-10-28", 1, 0]
        let invalid: [(Int, Any)] = [(0, "n0123"), (1, "unknown"), (2, true), (2, 0.5), (2, 2),
                                    (3, true), (3, 800.5), (3, 249), (3, 1201), (4, "2026-02-30"),
                                    (4, "2026-10-30"), (4, "2026-1-01"), (5, -1), (5, true), (5, 1.5),
                                    (5, 9_007_199_254_740_992), (6, true), (6, 2)]
        for (index, bad) in invalid {
            var row = valid; row[index] = bad
            XCTAssertThrowsError(try ComparisonJSON.resolve(staticData: ComparisonFixtures.staticCell(), priceData: ComparisonFixtures.prices([row]), cell: "u0nd9", today: "2026-10-29"))
        }
        XCTAssertThrowsError(try ComparisonJSON.resolve(staticData: ComparisonFixtures.staticCell(), priceData: ComparisonFixtures.prices([valid, valid]), cell: "u0nd9", today: "2026-10-29"))
        XCTAssertThrowsError(try ComparisonJSON.resolve(staticData: nil, priceData: Data(repeating: 32, count: 512 * 1024 + 1), cell: "u0nd9", today: "2026-10-29"))
        XCTAssertNil(ComparisonJSON.integer(NSNumber(value: UInt64.max), minimum: -1, maximum: -1), "Unsigned overflow cannot become the -1 city sentinel")
        let staticJSON = String(data: try ComparisonFixtures.staticCell(), encoding: .utf8)!
        let oversizedIndex = staticJSON.replacingOccurrences(of: ",-1]", with: ",18446744073709551615]")
        XCTAssertNotEqual(staticJSON, oversizedIndex)
        let invalidStatic = try ComparisonJSON.resolve(staticData: Data(oversizedIndex.utf8), priceData: ComparisonFixtures.prices([]), cell: "u0nd9", today: "2026-10-29")
        XCTAssertNil(invalidStatic["n123"], "Malformed static metadata cannot establish an OSM venue")
        let raw = String(data: try ComparisonFixtures.prices([valid]), encoding: .utf8)!
        for literal in ["1.00000000000000001", "1e-999", "9007199254740990.5"] {
            let bad = raw.replacingOccurrences(of: ",1,0]", with: ",\(literal),0]")
            XCTAssertNotEqual(raw, bad)
            XCTAssertThrowsError(try ComparisonJSON.resolve(staticData: nil, priceData: Data(bad.utf8), cell: "u0nd9", today: "2026-10-29"))
        }
    }

    func testRomeDayOldBoundaryAndPriceSortingKeepMissingSeparate() throws {
        XCTAssertEqual(ComparisonJSON.today(ISO8601DateFormatter().date(from: "2026-10-28T23:00:00Z")!), "2026-10-29")
        XCTAssertNil(ComparisonJSON.day("2026-02-29"))
        XCTAssertNotNil(ComparisonJSON.day("2024-02-29"))
        let old = FavouritePrice(drink: "water", band: .normal, cents: 100, observedOn: "2026-07-30", confirmations: 0, quarantined: false)
        XCTAssertTrue(old.isOld(today: "2026-10-29"))
        let boundary = FavouritePrice(drink: "water", band: .normal, cents: 100, observedOn: "2026-07-31", confirmations: 0, quarantined: false)
        XCTAssertFalse(boundary.isOld(today: "2026-10-29"))
        let saved = [ComparisonFixtures.saved("n123"), ComparisonFixtures.saved("n124"), ComparisonFixtures.saved("n125")]
        let snapshot = FavouriteComparisonSnapshot(venues: [
            saved[0].url: CurrentFavouriteVenue(key: "n123", name: "B", prices: [old]),
            saved[1].url: CurrentFavouriteVenue(key: "n124", name: "A", prices: [boundary])
        ], unavailable: [saved[2].url])
        let rows = FavouriteComparisonRow.sorted(saved: saved, snapshot: snapshot, drink: "water", band: .normal)
        XCTAssertEqual(rows.map(\.name), ["A", "B", "Salvato n125"])
        XCTAssertNil(rows[2].price)
        XCTAssertTrue(rows[2].unavailable)
        XCTAssertEqual(saved[0].label, "Salvato n123", "Current names must not rewrite saved values")
    }

    func testVersionAndEndpointPinsRejectUnexpectedOriginsQueriesAndFixtures() throws {
        XCTAssertEqual(try ComparisonJSON.version(ComparisonFixtures.health), "20261027")
        for version in ["fixture", "2026102", "20261027?x=1"] {
            XCTAssertThrowsError(try ComparisonEndpoint.venues(version: version, cell: "u0nd9").url())
        }
        XCTAssertThrowsError(try ComparisonEndpoint.prices(cell: "u0nd9/../").url())
        XCTAssertEqual(try ComparisonEndpoint.prices(cell: "u0nd9").url().absoluteString, "https://www.dovebevo.com/api/prices/u0nd9")
        XCTAssertThrowsError(try ComparisonJSON.version(Data(repeating: 32, count: 8193)))
    }
}

enum ComparisonFixtures {
    static let health = Data(#"{"status":"ok","version":"0.0.0","data_version":"20261027"}"#.utf8)
    static func saved(_ key: String, cell: String = "u0nd9") -> SavedVenue {
        SavedVenue(url: URL(string: "https://www.dovebevo.com/bar/\(key)?c=\(cell)")!, label: "Salvato \(key)")
    }
    static func json(_ value: Any) throws -> Data { try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]) }
    static func staticCell() throws -> Data {
        try json(["c": [], "v": [["n123", "Nome attuale", 1, 45.4642, 9.19, "Via pubblica", -1]]])
    }
    static func prices(_ rows: [[Any]], users: [[Any]] = [], hidden: [String] = []) throws -> Data {
        try json(["p": rows, "u": users, "pend": [], "h": hidden, "g": []])
    }
}
