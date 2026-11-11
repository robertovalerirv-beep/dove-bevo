import Foundation
import XCTest
@testable import DoveBevo

final class DiscoveryTests: XCTestCase {
    func testBoundedNeighboursAndDistanceUseMapCentreRatherThanGPS() throws {
        let area = try XCTUnwrap(DiscoveryArea(latitude: 45.4642, longitude: 9.19, zoom: 14))
        XCTAssertEqual(area.cells.count, 9)
        XCTAssertEqual(Set(area.cells).count, 9)
        XCTAssertTrue(area.cells.contains("u0nd9"))
        XCTAssertTrue(area.cells.allSatisfy { ComparisonJSON.matches($0, "^[0-9b-hjkmnp-z]{5}$") })
        XCTAssertEqual(area.distance(latitude: 45.4642, longitude: 9.19), 0, accuracy: 0.0001)
        XCTAssertEqual(area.distance(latitude: 46.4642, longitude: 9.19), 111_195, accuracy: 2)
        XCTAssertEqual(try XCTUnwrap(DiscoveryArea(latitude: 0, longitude: 180, zoom: 14)).cells.count, 9)
        XCTAssertNil(DiscoveryArea(latitude: .nan, longitude: 9.19, zoom: 14))
        XCTAssertNil(DiscoveryArea(latitude: 90, longitude: 9.19, zoom: 14))
        XCTAssertNil(DiscoveryArea(latitude: 45, longitude: 181, zoom: 14))
        XCTAssertNil(DiscoveryArea(latitude: 45, longitude: 9, zoom: 12.9))
    }

    func testMetadataHiddenPendingAndQuarantinedPricesPreserveExistingContract() throws {
        let staticData = try ComparisonFixtures.json(["c": [[72959652, "Milano"]], "v": [
            ["n123", "Visible", 1, 45.4642, 9.19, "Via pubblica 1", 0],
            ["n124", "Hidden", 1, 45.4642, 9.19, "", -1]
        ]])
        let live = try ComparisonFixtures.json(["p": [
            ["n123", "spritz", 0, 600, "2026-10-28", 0, 0],
            ["n123", "beer_draft", 0, 800, "2026-10-28", 7, 1],
            ["n124", "spritz", 0, 400, "2026-10-28", 9, 0],
            ["u5", "spritz", 0, 500, "2026-10-28", 1, 0],
            ["u6", "spritz", 0, 500, "2026-10-28", 1, 0]
        ], "u": [["u5", "Approved", 1, 45.4642, 9.19]],
        "pend": [["u6", "Pending", 1, 45.4642, 9.19, 5]], "h": ["n124"], "g": []])
        let cell = try DiscoveryJSON.resolve(staticData: staticData, priceData: live, cell: "u0nd9", today: "2026-10-29")
        XCTAssertFalse(cell.incomplete)
        XCTAssertEqual(Set(cell.venues.map(\.key)), ["n123", "u5"])
        let venue = try XCTUnwrap(cell.venues.first { $0.key == "n123" })
        XCTAssertEqual(venue.address, "Via pubblica 1")
        XCTAssertEqual(venue.city, "Milano")
        XCTAssertEqual(venue.latitude, 45.4642)
        XCTAssertEqual(venue.url, URL(string: "https://www.dovebevo.com/bar/n123?c=u0nd9"))
        XCTAssertEqual(venue.price(drink: "spritz", band: .normal)?.confirmations, 0)
        XCTAssertNil(venue.price(drink: "beer_draft", band: .normal))
    }

    func testMissingOrInvalidStaticMetadataAllowsOnlySeparatelyApprovedUserWithPartialState() throws {
        let live = try ComparisonFixtures.prices([
            ["n123", "spritz", 0, 600, "2026-10-28", 1, 0],
            ["u5", "spritz", 0, 500, "2026-10-28", 0, 0]
        ], users: [["u5", "Approved", 1, 45.4642, 9.19]])
        for raw in [nil, Data("<html>unavailable</html>".utf8),
                    try ComparisonFixtures.json(["c": [], "v": [["n123", "Wrong cell", 1, 41.9, 12.5, "", -1]]])] as [Data?] {
            let cell = try DiscoveryJSON.resolve(staticData: raw, priceData: live, cell: "u0nd9", today: "2026-10-29")
            XCTAssertTrue(cell.incomplete)
            XCTAssertEqual(cell.venues.map(\.key), ["u5"])
            XCTAssertEqual(cell.venues.first?.address, "")
            XCTAssertNil(cell.venues.first?.city)
        }
        let invalid = try ComparisonFixtures.prices([["n123", "spritz", 0, 6.5, "2026-10-28", 0, 0]])
        XCTAssertThrowsError(try DiscoveryJSON.resolve(staticData: ComparisonFixtures.staticCell(), priceData: invalid, cell: "u0nd9", today: "2026-10-29"))
    }

    func testDrinkAndBandFilteringSortActualPricesAndKeepDatesAndStaleness() throws {
        let area = try XCTUnwrap(DiscoveryArea(latitude: 45.4642, longitude: 9.19, zoom: 14))
        let normal = FavouritePrice(drink: "spritz", band: .normal, cents: 600, observedOn: "2026-01-01", confirmations: 0, quarantined: false)
        let cheap = FavouritePrice(drink: "spritz", band: .normal, cents: 500, observedOn: "2026-10-28", confirmations: 4, quarantined: false)
        let hour = FavouritePrice(drink: "spritz", band: .happyHour, cents: 400, observedOn: "2026-10-28", confirmations: 2, quarantined: false)
        let venues = [discoveryVenue("n1", name: "A", prices: [normal, hour]), discoveryVenue("n2", name: "B", prices: [cheap])]
        let snapshot = DiscoverySnapshot(area: area, venues: venues, unavailableCells: [])
        XCTAssertEqual(snapshot.rows(drink: "spritz", band: .normal).map { $0.venue.key }, ["n2", "n1"])
        XCTAssertEqual(snapshot.rows(drink: "spritz", band: .happyHour).map { $0.price.cents }, [400])
        XCTAssertTrue(snapshot.rows(drink: "beer_draft", band: .normal).isEmpty)
        XCTAssertEqual(snapshot.rows(drink: "spritz", band: .normal).last?.price.observedOn, "2026-01-01")
        XCTAssertTrue(normal.isOld(today: "2026-10-29"))
    }

    func testDefaultDiscoveryMergesOwnerMenuSamplesWithReportedPricesWithoutInventingCoverage() throws {
        let transport = DelayedComparisonTransport()
        let area = try XCTUnwrap(DiscoveryArea(latitude: 45.4642, longitude: 9.19, zoom: 14))
        let client = DiscoveryClient(transport: transport, today: { "2026-11-03" })
        var output: DiscoverySnapshot?
        let operation = client.load(area) { output = $0 }; defer { operation.cancel() }
        try transport.complete(0, .success(ComparisonFixtures.json([
            "schema_version": 1, "version": "fixture-v1", "venues": []])))
        try transport.complete(1, .success(ComparisonFixtures.health))
        var index = 2
        while index < transport.calls.count {
            XCTAssertLessThanOrEqual(transport.outstanding, 3)
            switch try transport.call(index).endpoint {
            case .venues(_, let cell):
                try transport.complete(index, .success(cell == "u0nd9" ? ComparisonFixtures.staticCell() : ComparisonFixtures.json(["c": [], "v": []])))
            case .prices(let cell):
                try transport.complete(index, .success(ComparisonFixtures.prices(cell == "u0nd9" ?
                    [["n123", "spritz", 0, 600, "2026-11-01", 0, 0]] : [])))
            case .menuV2Cell(let cell, let categories, let after):
                XCTAssertNil(after)
                XCTAssertEqual(categories, DrinkCategory.all.map(\.code))
                try transport.complete(index, .success(menuCellFixture(cell: cell, categories: categories,
                    includeOffer: cell == "u0nd9")))
            case .health, .places, .mobileCatalog, .mobilePrices, .menuV2, .customerV2:
                XCTFail("Unexpected public read in bounded Italian discovery")
            }
            index += 1
        }
        let value = try XCTUnwrap(output)
        XCTAssertEqual(value.menu["n123"]?.samples.first?.amount, "5,50 €")
        XCTAssertTrue(value.menuUnavailableCells.isEmpty)
        XCTAssertTrue(value.unavailableCells.isEmpty)
        let rows = value.displayRows(drink: "spritz", band: .normal)
        XCTAssertEqual(rows.count, 2, "The actual owner sample and customer report remain distinct")
        XCTAssertTrue(rows.contains { $0.price.amount == "5,50 €" && $0.price.details(today: "2026-11-03").contains("menu online") })
        XCTAssertTrue(rows.contains { $0.price.amount == "6,00 €" && $0.price.details(today: "2026-11-03").contains("Segnalato") })
        XCTAssertTrue(value.displayRows(drink: "beer_draft", band: .normal).isEmpty)
    }

    func testFailedOrStalledMenuKeepsValidatedExistingPricesAndMarksMenuPartial() throws {
        let area = try XCTUnwrap(DiscoveryArea(latitude: 45.4642, longitude: 9.19, zoom: 14))
        let firstCell = try XCTUnwrap(area.cells.first)
        let point = cellCenter(firstCell)
        for stall in [false, true] {
            let transport = DelayedComparisonTransport(), timer = ManualComparisonDeadline()
            let client = DiscoveryClient(transport: transport, today: { "2026-11-03" }, schedule: timer.schedule)
            var output: DiscoverySnapshot?
            var completions = 0
            let operation = client.load(area) { output = $0; completions += 1 }; defer { operation.cancel() }
            var italian = EuropeFixtures.venues[0]
            italian["city"] = "Milano"; italian["country"] = "IT"; italian["currency"] = "EUR"
            italian["cell"] = firstCell; italian["lat"] = point.0; italian["lon"] = point.1
            try transport.complete(0, .success(EuropeFixtures.json([
                "schema_version": 1, "version": "fixture-v1", "venues": [italian]])))
            try transport.complete(1, .success(ComparisonFixtures.health))
            XCTAssertEqual(try transport.call(2).endpoint, .venues(version: "20261027", cell: firstCell))
            try transport.complete(2, .success(ComparisonFixtures.json(["c": [], "v": [
                ["n123", "Legacy", 1, point.0, point.1, "Via reale 1", -1]
            ]])))
            XCTAssertEqual(try transport.call(5).endpoint, .prices(cell: firstCell))
            try transport.complete(5, .success(ComparisonFixtures.prices([
                ["n123", "beer_draft", 0, 600, "2026-11-01", 0, 0]
            ])))
            XCTAssertEqual(try transport.call(6).endpoint, .mobilePrices(cell: firstCell))
            var row = EuropeFixtures.rows("gcpvj")[1]
            row["cell"] = firstCell; row["currency"] = "EUR"
            try transport.complete(6, .success(EuropeFixtures.cell(firstCell, rows: [row])))
            guard case .menuV2Cell(let requestedCell, _, nil) = try transport.call(7).endpoint else {
                return XCTFail("Expected the optional menu read after both validated price reads")
            }
            XCTAssertEqual(requestedCell, firstCell)
            XCTAssertNil(output, "The cell stays active until optional menu settles or the deadline fires")
            if !stall { try transport.complete(7, .failure(.unavailable)) }
            timer.fire()
            let value = try XCTUnwrap(output)
            XCTAssertEqual(value.venues.first?.price(drink: "beer_draft", band: .normal)?.cents, 600)
            XCTAssertEqual(value.europe?.venues["n1001"]?.prices.first?.amountMinor, 650)
            XCTAssertFalse(value.unavailableCells.contains(firstCell), "Existing price reads were complete")
            XCTAssertTrue(value.menuUnavailableCells.contains(firstCell), "The menu feed was not complete")
            XCTAssertTrue(value.partialCells.contains(firstCell))
            XCTAssertEqual(value.displayRows(drink: "beer_draft", band: .normal).count, 2)
            XCTAssertEqual(transport.outstanding, 0)
            XCTAssertEqual(completions, 1)
            if stall {
                try transport.complete(7, .success(menuCellFixture(cell: firstCell,
                    categories: DrinkCategory.all.map(\.code), includeOffer: false)))
                XCTAssertEqual(completions, 1, "Late menu data cannot publish another result")
            }
        }
    }

    private func menuCellFixture(cell: String, categories: [String], includeOffer: Bool) throws -> Data {
        let venue: [String: Any] = [
            "key": "n123", "cell": cell, "name": "Nome attuale", "kind": 1,
            "lat": 45.4642, "lon": 9.19, "address": "Via reale 1", "city": "Milano", "country": "IT",
            "identity_url": "https://www.openstreetmap.org/node/123", "identity_kind": "osm",
            "matching_offer_count": 1, "sample_offers": [[
                "id": "spritz-1", "name": "Spritz della casa", "category": "spritz",
                "serving": ["label": "Calice", "ml": 200], "amount_minor": 550,
                "currency": "EUR", "currency_exponent": 2,
                "context": ["kind": "regular", "condition": NSNull()],
                "source": ["id": "source-1", "url": "https://bar.example/menu",
                           "text_sha256": String(repeating: "a", count: 64), "checked_on": "2026-11-03"]
            ]], "fee_coverage": ["status": "unknown", "source": NSNull()]
        ]
        return try ComparisonFixtures.json([
            "schema_version": 2, "coverage": ["complete": false, "basis": "verified_source_items_only"],
            "price_scope": "menu_item_only", "cell": cell, "category": NSNull(),
            "categories": categories, "venues": includeOffer ? [venue] : [],
            "next_after": NSNull(), "unresolved_venues": 0
        ])
    }

    @MainActor
    func testMapAreaDecoderRejectsChangedRouteExtraFieldsUntrustedOriginsAndBooleans() throws {
        let url = URLPolicy.homeURL
        let value: [String: Any] = ["href": url.absoluteString, "latitude": 45.4642, "longitude": 9.19, "zoom": 14.0]
        XCTAssertEqual(MapAreaReader.area(value, currentURL: url)?.cells.count, 9)
        XCTAssertNil(MapAreaReader.area(value, currentURL: URL(string: "https://www.dovebevo.com/bar/n123?c=u0nd9")!))
        let changes: [(String, Any)] = [("latitude", true), ("zoom", 12), ("longitude", "9.19"), ("href", "https://evil.example/")]
        for (field, replacement) in changes {
            var invalid = value; invalid[field] = replacement
            XCTAssertNil(MapAreaReader.area(invalid, currentURL: url))
        }
        var extra = value; extra["unexpected"] = "ignored?"
        XCTAssertNil(MapAreaReader.area(extra, currentURL: url))
        XCTAssertNil(MapAreaReader.area(nil, currentURL: url))
    }

    func testDiscoveryReadsAtMostThreeRequestsAndNineCellsThenReturnsRealRows() throws {
        let transport = DelayedComparisonTransport()
        let area = try XCTUnwrap(DiscoveryArea(latitude: 45.4642, longitude: 9.19, zoom: 14))
        let client = DiscoveryClient(transport: transport, includeEurope: false, today: { "2026-10-29" })
        var output: DiscoverySnapshot?
        let operation = client.load(area) { output = $0 }
        defer { operation.cancel() }
        XCTAssertEqual(transport.calls.map(\.endpoint), [.health])
        try transport.complete(0, .success(ComparisonFixtures.health))
        XCTAssertEqual(transport.outstanding, 3)
        var index = 1
        while index < transport.calls.count {
            XCTAssertLessThanOrEqual(transport.outstanding, 3)
            let endpoint = try transport.call(index).endpoint
            switch endpoint {
            case .venues(_, let cell):
                try transport.complete(index, .success(cell == "u0nd9" ? ComparisonFixtures.staticCell() : ComparisonFixtures.json(["c": [], "v": []])))
            case .prices(let cell):
                try transport.complete(index, .success(ComparisonFixtures.prices(cell == "u0nd9" ? [["n123", "spritz", 0, 600, "2026-10-28", 0, 0]] : [])))
            case .health: XCTFail("Health must be read only once")
            case .places, .mobileCatalog, .mobilePrices, .menuV2, .customerV2, .menuV2Cell: XCTFail("This explicit legacy-only fixture must not request the Europe adapter")
            }
            index += 1
        }
        XCTAssertEqual(transport.calls.count, 19)
        XCTAssertEqual(output?.venues.first?.name, "Nome attuale")
        XCTAssertEqual(output?.rows(drink: "spritz", band: .normal).first?.price.cents, 600)
        XCTAssertTrue(output?.unavailableCells.isEmpty == true)
    }

    func testGlobalDeadlineAndCancelRetireActiveAndQueuedReadsAndLateResults() throws {
        let transport = DelayedComparisonTransport(), timer = ManualComparisonDeadline()
        let client = DiscoveryClient(transport: transport, includeEurope: false, schedule: timer.schedule)
        let area = try XCTUnwrap(DiscoveryArea(latitude: 45.4642, longitude: 9.19, zoom: 14))
        var output: DiscoverySnapshot?
        let operation = client.load(area) { output = $0 }
        try transport.complete(0, .success(ComparisonFixtures.health))
        XCTAssertEqual(timer.delay, 60)
        XCTAssertEqual(transport.outstanding, 3)
        timer.fire()
        XCTAssertEqual(output?.unavailableCells.count, 9)
        XCTAssertEqual(transport.outstanding, 0)
        try transport.complete(1, .success(ComparisonFixtures.staticCell()))
        XCTAssertEqual(transport.calls.count, 4)
        operation.cancel()
        output = nil
        let cancelled = client.load(area) { output = $0 }
        cancelled.cancel()
        try transport.complete(4, .success(ComparisonFixtures.health))
        XCTAssertNil(output)
        XCTAssertEqual(transport.calls.count, 5)
    }

    func testConflictingCrossCellIdentityIsExcludedForBothCompletionOrders() throws {
        let area = try XCTUnwrap(DiscoveryArea(latitude: 45.4642, longitude: 9.19, zoom: 14))
        for reversed in [false, true] {
            let transport = DelayedComparisonTransport()
            let client = DiscoveryClient(transport: transport, includeEurope: false, today: { "2026-10-29" })
            var output: DiscoverySnapshot?
            let operation = client.load(area) { output = $0 }
            defer { operation.cancel() }
            try transport.complete(0, .success(ComparisonFixtures.health))
            while output == nil {
                let waiting = transport.calls.indices.filter { !transport.calls[$0].completed }
                let index = try XCTUnwrap(reversed ? waiting.last : waiting.first)
                switch try transport.call(index).endpoint {
                case .venues(_, let cell):
                    let point = cellCenter(cell)
                    let rows: [[Any]] = [["n123", "Conflicting \(cell)", 1, point.0, point.1, "", -1]] +
                        (cell == area.cells[0] ? [["n456", "Independent", 1, point.0, point.1, "", -1]] : [])
                    try transport.complete(index, .success(ComparisonFixtures.json(["c": [], "v": rows])))
                case .prices(let cell):
                    let rows: [[Any]] = [["n123", "spritz", 0, 600, "2026-10-28", 0, 0]] +
                        (cell == area.cells[0] ? [["n456", "spritz", 0, 900, "2026-10-28", 0, 0]] : [])
                    try transport.complete(index, .success(ComparisonFixtures.prices(rows)))
                case .health: XCTFail("Only the first request may be health")
                case .places, .mobileCatalog, .mobilePrices, .menuV2, .customerV2, .menuV2Cell: XCTFail("Explicit legacy-only fixture")
                }
            }
            XCTAssertEqual(output?.venues.map(\.key), ["n456"])
            XCTAssertEqual(output?.unavailableCells, Set(area.cells), "Later completions must not clear conflict warnings")
            XCTAssertEqual(transport.calls.count, 19)
        }
    }

    private func cellCenter(_ cell: String) -> (Double, Double) {
        let alphabet = Array("0123456789bcdefghjkmnpqrstuvwxyz")
        var latitude = (-90.0, 90.0), longitude = (-180.0, 180.0), longitudeBit = true
        for character in cell {
            let code = alphabet.firstIndex(of: character)!
            for shift in stride(from: 4, through: 0, by: -1) {
                let high = (code & (1 << shift)) != 0
                if longitudeBit {
                    let middle = (longitude.0 + longitude.1) / 2
                    if high { longitude.0 = middle } else { longitude.1 = middle }
                } else {
                    let middle = (latitude.0 + latitude.1) / 2
                    if high { latitude.0 = middle } else { latitude.1 = middle }
                }
                longitudeBit.toggle()
            }
        }
        return ((latitude.0 + latitude.1) / 2, (longitude.0 + longitude.1) / 2)
    }

    private func discoveryVenue(_ key: String, name: String, prices: [FavouritePrice]) -> DiscoveryVenue {
        DiscoveryVenue(key: key, name: name, cell: "u0nd9", latitude: 45.4642, longitude: 9.19, address: "", city: nil, prices: prices)
    }
}
