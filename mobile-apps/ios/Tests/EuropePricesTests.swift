import Foundation
import UIKit
import XCTest
@testable import DoveBevo

final class EuropePricesTests: XCTestCase {
    func testCatalogueAcceptsUnknownOrLowReviewCountsButRejectsInventedCounts() throws {
        var low = EuropeFixtures.venues[0]
        var google = try XCTUnwrap(low["google"] as? [String: Any])
        google["review_count"] = 0
        low["google"] = google
        var unknown = EuropeFixtures.venues[1]
        var unknownGoogle = try XCTUnwrap(unknown["google"] as? [String: Any])
        unknownGoogle.removeValue(forKey: "review_count")
        unknown["google"] = unknownGoogle
        let venues = [low, unknown]
        let catalog = try EuropeJSON.catalog(EuropeFixtures.json(["schema_version":1,"version":"fixture-v1","venues":venues]), checkedToday: "2026-11-02")
        XCTAssertEqual(catalog.venues.count, 2)
        unknownGoogle["review_count"] = NSNull()
        unknown["google"] = unknownGoogle
        XCTAssertEqual(try EuropeJSON.catalog(EuropeFixtures.json(["schema_version":1,"version":"fixture-v1","venues":[unknown]]), checkedToday: "2026-11-02").venues.count, 1)
        let invalidCounts: [Any] = [-1, 1.5, "100"]
        for invalid in invalidCounts {
            google["review_count"] = invalid; low["google"] = google
            XCTAssertThrowsError(try EuropeJSON.catalog(EuropeFixtures.json(["schema_version":1,"version":"fixture-v1","venues":[low]]), checkedToday: "2026-11-02"))
        }
    }

    func testAllRealServingVariantsAndCurrencyGroupsSurviveWithoutLegacyCasting() throws {
        let catalog = try EuropeFixtures.catalog()
        let london = try EuropeJSON.resolve(EuropeFixtures.cell("gcpvj"), catalog: catalog, cell: "gcpvj", today: "2026-11-02", checkedToday: "2026-11-02")
        let paris = try EuropeJSON.resolve(EuropeFixtures.cell("u09tv"), catalog: catalog, cell: "u09tv", today: "2026-11-02", checkedToday: "2026-11-02")
        let europe = EuropeSnapshot(venues: london.venues.merging(paris.venues) { first, _ in first })
        let saved = [ComparisonFixtures.saved("n1001", cell: "gcpvj"), ComparisonFixtures.saved("n2001", cell: "u09tv")]
        let snapshot = FavouriteComparisonSnapshot(venues: [:], unavailable: [], europe: europe)
        let beer = FavouriteComparisonRow.sorted(saved: saved, snapshot: snapshot, drink: "beer_draft", band: .normal)
        XCTAssertEqual(beer.count, 3)
        XCTAssertTrue(beer.allSatisfy { $0.price == nil && $0.europePrice != nil }, "Never coerce foreign prices into legacy cents")
        XCTAssertEqual(Set(beer.compactMap { $0.displayPrice?.group }), ["GBP|ml:250", "GBP|ml:500", "EUR|ml:500"])
        XCTAssertEqual(beer.first?.europePrice?.currency, "EUR", "Group order is separate from cross-currency amount ranking")
        let wine = FavouriteComparisonRow.sorted(saved: [saved[0]], snapshot: snapshot, drink: "wine_glass", band: .normal)
        XCTAssertEqual(wine.compactMap { $0.europePrice?.serving.ml }, [175, 250])
        XCTAssertEqual(wine.compactMap { $0.europePrice?.amountMinor }, [900, 700], "The cheaper large glass cannot replace the smaller glass")
        var quarantined = EuropeFixtures.rows("gcpvj"); quarantined[0]["status"] = "quarantined"
        let held = try EuropeJSON.resolve(EuropeFixtures.cell("gcpvj", rows: quarantined), catalog: catalog, cell: "gcpvj", today: "2026-11-02")
        let heldRows = FavouriteComparisonRow.sorted(saved: [saved[0]], snapshot: FavouriteComparisonSnapshot(venues: [:], unavailable: [], europe: EuropeSnapshot(venues: held.venues)), drink: "beer_draft", band: .normal)
        XCTAssertEqual(heldRows.compactMap { $0.europePrice?.serving.ml }, [500], "Held prices never become cheapest comparable rows")
        XCTAssertEqual(FavouriteComparisonRow.sorted(saved: [saved[0]], snapshot: snapshot, drink: "spritz", band: .happyHour).first?.europePrice?.amountMinor, 550)
        let area = try XCTUnwrap(DiscoveryArea(latitude: 51.5074, longitude: -0.1278, zoom: 14))
        let discovery = DiscoverySnapshot(area: area, venues: [], unavailableCells: [], europe: europe)
        XCTAssertEqual(discovery.displayRows(drink: "beer_draft", band: .normal).count, 3)
        XCTAssertTrue(NativeComparablePrice.legacy(FavouritePrice(drink: "beer_draft", band: .normal, cents: 500, observedOn: "2026-11-01", confirmations: 0, quarantined: false)).groupLabel.contains("Formato non dichiarato"))
    }

    func testSourceDatesAreNullablePaidEvidenceAndOldMenusNeedTheirOwnRecheck() throws {
        let catalog = try EuropeFixtures.catalog()
        let fresh = try EuropeJSON.resolve(EuropeFixtures.cell("gcpvj"), catalog: catalog, cell: "gcpvj", today: "2026-11-02", checkedToday: "2026-11-02")
        let menu = try XCTUnwrap(fresh.venues["n1001"]?.prices.first { $0.serving.ml == 500 })
        XCTAssertNil(menu.observedOn)
        XCTAssertEqual(menu.sourceCheckedOn, "2026-11-01")
        XCTAssertTrue(menu.details(today: "2026-11-02").contains("Fonte verificata il 2026-11-01"))
        XCTAssertFalse(menu.details(today: "2026-11-02").contains("Segnalato il"))
        XCTAssertFalse(menu.details(today: "2026-11-02").contains("Menu da riverificare"))
        var oldRows = EuropeFixtures.rows("gcpvj")
        var source = oldRows[1]["provenance"] as! [String: Any]
        source["source_checked_on"] = "2026-01-01"; oldRows[1]["provenance"] = source
        oldRows[1]["confirmed_on"] = "2026-11-01"
        let old = try EuropeJSON.resolve(EuropeFixtures.cell("gcpvj", rows: oldRows), catalog: catalog, cell: "gcpvj", today: "2026-11-02", checkedToday: "2026-11-02")
        XCTAssertTrue(try XCTUnwrap(old.venues["n1001"]?.prices.first { $0.serving.ml == 500 }).details(today: "2026-11-02").contains("Menu da riverificare"))
    }

    func testHiddenLegacyAndMalformedSourceCurrencyServingOrVersionFailClosed() throws {
        let catalog = try EuropeFixtures.catalog()
        let hidden = try EuropeJSON.resolve(EuropeFixtures.cell("gcpvj", hidden: ["n1001"]), catalog: catalog, cell: "gcpvj", today: "2026-11-02")
        XCTAssertTrue(hidden.venues.isEmpty)
        for change in ["currency", "volume", "observed", "version", "duplicate", "wrong-cell"] {
            var rows = EuropeFixtures.rows("gcpvj"), version = "fixture-v1"
            switch change {
            case "currency": rows[0]["currency"] = "EUR"
            case "volume": rows[0]["serving"] = ["unit": "ml"]
            case "observed": rows[1]["observed_on"] = "2026-11-01"
            case "version": version = "old-version"
            case "duplicate": rows.append(rows[0])
            default: rows[0]["cell"] = "u09tv"
            }
            XCTAssertThrowsError(try EuropeJSON.resolve(EuropeFixtures.cell("gcpvj", rows: rows, version: version), catalog: catalog, cell: "gcpvj", today: "2026-11-02"), change)
        }
        XCTAssertThrowsError(try EuropeJSON.resolve(EuropeFixtures.cell("gcpvj", hidden: ["n2001"]), catalog: catalog, cell: "gcpvj", today: "2026-11-02"))
        var invalid = EuropeFixtures.venues
        invalid[0]["currency"] = "EUR"
        XCTAssertThrowsError(try EuropeJSON.catalog(EuropeFixtures.json(["schema_version": 1, "version": "fixture-v1", "venues": invalid])))
        XCTAssertThrowsError(try EuropeJSON.catalog(Data("<html>SPA fallback</html>".utf8)))
    }

    func testDefaultClientReadsActualCatalogueAndMobileCellsWithNoForeignEURFallback() throws {
        let transport = DelayedComparisonTransport()
        let client = FavouriteComparisonClient(transport: transport, today: { "2026-11-02" })
        let saved = [ComparisonFixtures.saved("n1001", cell: "gcpvj"), ComparisonFixtures.saved("n2001", cell: "u09tv")]
        var output: FavouriteComparisonSnapshot?
        let operation = client.load(saved) { output = $0 }; defer { operation.cancel() }
        XCTAssertEqual(transport.calls.map(\.endpoint), [.mobileCatalog])
        try transport.complete(0, .success(EuropeFixtures.catalogData()))
        try transport.complete(1, .success(ComparisonFixtures.health))
        XCTAssertEqual(transport.outstanding, 2)
        for index in 2..<4 {
            guard case .mobilePrices(let cell) = try transport.call(index).endpoint else { return XCTFail("Foreign cells use the mobile API") }
            try transport.complete(index, .success(EuropeFixtures.cell(cell)))
        }
        XCTAssertTrue(output?.venues.isEmpty == true)
        XCTAssertTrue(output?.unavailable.isEmpty == true)
        XCTAssertEqual(output?.europe?.venues.count, 2)
        XCTAssertEqual(transport.calls.filter { $0.endpoint == .mobileCatalog }.count, 1)
        XCTAssertEqual(try ComparisonEndpoint.mobilePrices(cell: "gcpvj").url().absoluteString, "https://www.dovebevo.com/api/mobile/prices/cells/gcpvj")
        XCTAssertThrowsError(try ComparisonEndpoint.mobilePrices(cell: "gcpvj?x=1").url())
    }

    func testProductionDefaultDeadlineCancellationAndBadCatalogueRetireWithoutEmptySuccess() throws {
        let transport = DelayedComparisonTransport(), timer = ManualComparisonDeadline()
        let client = FavouriteComparisonClient(transport: transport, schedule: timer.schedule)
        let saved = ComparisonFixtures.saved("n1001", cell: "gcpvj")
        var output: FavouriteComparisonSnapshot?
        let operation = client.load([saved]) { output = $0 }
        XCTAssertEqual(timer.delay, 60)
        timer.fire()
        XCTAssertEqual(output?.unavailable, [saved.url])
        XCTAssertTrue(try transport.call(0).request.cancelled)
        try transport.complete(0, .success(EuropeFixtures.catalogData()))
        XCTAssertEqual(transport.calls.count, 1, "Retired catalogue completion cannot start more requests")
        operation.cancel()
        let badTransport = DelayedComparisonTransport()
        let badClient = FavouriteComparisonClient(transport: badTransport)
        var bad: FavouriteComparisonSnapshot?
        let failed = badClient.load([saved]) { bad = $0 }; defer { failed.cancel() }
        try badTransport.complete(0, .success(Data("{}".utf8)))
        try badTransport.complete(1, .success(ComparisonFixtures.health))
        XCTAssertEqual(bad?.unavailable, [saved.url])
        XCTAssertEqual(badTransport.calls.count, 2, "No legacy euro read for a foreign cell")
    }

    func testDefaultMixedAdapterKeepsExistingItalianPriceWithoutDuplicatingItsCatalogueEntry() throws {
        let transport = DelayedComparisonTransport()
        let client = FavouriteComparisonClient(transport: transport, today: { "2026-11-02" })
        let saved = ComparisonFixtures.saved("n123")
        var italian = EuropeFixtures.venues[0]
        italian["key"] = "n123"; italian["name"] = "Nome attuale"; italian["city"] = "Milano"
        italian["lat"] = 45.4642; italian["lon"] = 9.19; italian["cell"] = "u0nd9"
        italian["country"] = "IT"; italian["currency"] = "EUR"
        var output: FavouriteComparisonSnapshot?
        let operation = client.load([saved]) { output = $0 }; defer { operation.cancel() }
        try transport.complete(0, .success(EuropeFixtures.json(["schema_version":1,"version":"fixture-v1","venues":[italian]])))
        try transport.complete(1, .success(ComparisonFixtures.health))
        try transport.complete(2, .success(ComparisonFixtures.staticCell()))
        try transport.complete(3, .success(ComparisonFixtures.prices([["n123","spritz",0,550,"2026-11-01",0,0]])))
        XCTAssertEqual(try transport.call(4).endpoint, .mobilePrices(cell: "u0nd9"))
        try transport.complete(4, .success(EuropeFixtures.cell("u0nd9", rows: [], legacy: ["n123"])))
        XCTAssertEqual(output?.venues[saved.url]?.prices.first?.cents, 550)
        XCTAssertTrue(output?.europe?.venues.isEmpty == true)
        XCTAssertTrue(output?.unavailable.isEmpty == true)
    }

    func testDefaultDiscoveryKeepsThreeSlotsAndShowsEveryActualVariant() throws {
        let transport = DelayedComparisonTransport()
        let client = DiscoveryClient(transport: transport, today: { "2026-11-02" })
        let area = try XCTUnwrap(DiscoveryArea(latitude: 51.5074, longitude: -0.1278, zoom: 14))
        var output: DiscoverySnapshot?
        let operation = client.load(area) { output = $0 }; defer { operation.cancel() }
        try transport.complete(0, .success(EuropeFixtures.catalogData()))
        try transport.complete(1, .success(ComparisonFixtures.health))
        var index = 2
        while index < transport.calls.count {
            XCTAssertLessThanOrEqual(transport.outstanding, 3)
            guard case .mobilePrices(let cell) = try transport.call(index).endpoint else { return XCTFail("Unexpected legacy read") }
            try transport.complete(index, .success(EuropeFixtures.cell(cell))); index += 1
        }
        XCTAssertEqual(output?.displayRows(drink: "beer_draft", band: .normal).count, 2)
        XCTAssertEqual(output?.displayRows(drink: "wine_glass", band: .normal).count, 2)
        XCTAssertTrue(output?.unavailableCells.isEmpty == true, "A validated catalogue establishes complete-empty foreign neighbour cells")
        let failedTransport = DelayedComparisonTransport()
        let failedClient = DiscoveryClient(transport: failedTransport)
        var failedOutput: DiscoverySnapshot?
        let failed = failedClient.load(area) { failedOutput = $0 }; defer { failed.cancel() }
        try failedTransport.complete(0, .failure(.unavailable))
        try failedTransport.complete(1, .success(ComparisonFixtures.health))
        XCTAssertEqual(failedOutput?.unavailableCells.count, 9, "Failed catalogue is not complete-empty")
    }

    func testActualThreeCellPoolAndDefaultDiscoveryDeadlineCancelAllRemainingWork() throws {
        let area = try XCTUnwrap(DiscoveryArea(latitude: 51.5074, longitude: -0.1278, zoom: 14))
        let step = 360.0 / 8192.0
        var venues: [[String: Any]] = []
        for y in -1...1 { for x in -1...1 {
            let latitude = area.latitude + Double(y) * step, longitude = area.longitude + Double(x) * step
            var venue = EuropeFixtures.venues[0]
            venue["key"] = "n\(5000 + venues.count)"; venue["lat"] = latitude; venue["lon"] = longitude
            venue["cell"] = ComparisonJSON.cellForCoordinates(latitude: latitude, longitude: longitude)
            venues.append(venue)
        } }
        let transport = DelayedComparisonTransport(), timer = ManualComparisonDeadline()
        let client = DiscoveryClient(transport: transport, schedule: timer.schedule)
        var output: DiscoverySnapshot?
        let operation = client.load(area) { output = $0 }; defer { operation.cancel() }
        try transport.complete(0, .success(EuropeFixtures.json(["schema_version":1,"version":"fixture-v1","venues":venues])))
        try transport.complete(1, .success(ComparisonFixtures.health))
        XCTAssertEqual(transport.outstanding, 3, "Exercise a real full pool, not a single relevant cell")
        let first = try transport.call(2)
        guard case .mobilePrices(let cell) = first.endpoint else { return XCTFail("Expected mobile cell") }
        try transport.complete(2, .success(EuropeFixtures.cell(cell, rows: [])))
        XCTAssertEqual(transport.outstanding, 3)
        XCTAssertEqual(transport.calls.count, 6, "Finishing one cell starts only one replacement")
        timer.fire()
        XCTAssertEqual(output?.unavailableCells.count, 8)
        XCTAssertEqual(transport.outstanding, 0)
        let previousCount = transport.calls.count
        try transport.complete(3, .success(EuropeFixtures.cell(cell, rows: [])))
        XCTAssertEqual(transport.calls.count, previousCount, "Late callbacks cannot restart the retired pool")
    }

    @MainActor func testOwnedUIKitRowsExposePoundsServingAndSourceWithoutRewritingBookmark() throws {
        let catalog = try EuropeFixtures.catalog()
        let cell = try EuropeJSON.resolve(EuropeFixtures.cell("gcpvj"), catalog: catalog, cell: "gcpvj", today: "2026-11-02")
        let snapshot = EuropeSnapshot(venues: cell.venues)
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("europe-owned-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = SavedVenueStore(directoryURL: directory)
        try store.save(url: ComparisonFixtures.saved("n1001", cell: "gcpvj").url, label: "Local saved label")
        let bytes = try Data(contentsOf: store.fileURL)
        let service = EuropeFavouriteFixture(snapshot: FavouriteComparisonSnapshot(venues: [:], unavailable: [], europe: snapshot))
        var opened: URL?
        let controller = SavedVenuesViewController(store: store, client: service, activityCheck: { true }) { opened = $0 }
        controller.loadViewIfNeeded(); controller.beginAppearanceTransition(true, animated: false); controller.endAppearanceTransition()
        XCTAssertEqual(controller.tableView(controller.tableView, numberOfRowsInSection: 0), 2)
        let index = IndexPath(row: 1, section: 0)
        let row = controller.tableView(controller.tableView, cellForRowAt: index)
        let content = try XCTUnwrap(row.contentConfiguration as? UIListContentConfiguration)
        XCTAssertEqual(content.text, "London fixture")
        let text = try XCTUnwrap(content.secondaryAttributedText).string
        for value in ["6,50 £", "500 ml", "GBP", "Fonte verificata", "Menu item"] { XCTAssertTrue(text.contains(value), value) }
        XCTAssertEqual(text.components(separatedBy: "Fonte verificata").count - 1, 1)
        XCTAssertFalse(text.contains("Segnalato il")); XCTAssertFalse(text.contains("€"))
        controller.tableView(controller.tableView, didSelectRowAt: index)
        XCTAssertEqual(opened, ComparisonFixtures.saved("n1001", cell: "gcpvj").url)
        XCTAssertEqual(try Data(contentsOf: store.fileURL), bytes)
        controller.beginAppearanceTransition(false, animated: false); controller.endAppearanceTransition()

        let area = try XCTUnwrap(DiscoveryArea(latitude: 51.5074, longitude: -0.1278, zoom: 14))
        let discovery = DiscoveryViewController(client: EuropeDiscoveryFixture(snapshot: DiscoverySnapshot(area: area, venues: [], unavailableCells: [], europe: snapshot)), activityCheck: { true }, onOpen: { opened = $0 }, onMap: {})
        discovery.setArea(area); discovery.loadViewIfNeeded(); discovery.beginAppearanceTransition(true, animated: false); discovery.endAppearanceTransition()
        discovery.selectDrink("wine_glass")
        XCTAssertEqual(discovery.tableView(discovery.tableView, numberOfRowsInSection: 0), 2)
        let wine = discovery.tableView(discovery.tableView, cellForRowAt: IndexPath(row: 0, section: 0))
        let wineText = visibleLabels(wine).joined(separator: "\n")
        XCTAssertTrue(wineText.contains("175 ml"))
        XCTAssertTrue(wineText.contains("9,00 £"))
        discovery.beginAppearanceTransition(false, animated: false); discovery.endAppearanceTransition()
    }
    @MainActor private func visibleLabels(_ view: UIView) -> [String] {
        let own = (view as? UILabel)?.text.map { [$0] } ?? []
        return own + view.subviews.flatMap { visibleLabels($0) }
    }
}

private final class EuropeFavouriteFixture: FavouriteComparisonServing {
    let snapshot: FavouriteComparisonSnapshot
    init(snapshot: FavouriteComparisonSnapshot) { self.snapshot = snapshot }
    func load(_ saved: [SavedVenue], completion: @escaping (FavouriteComparisonSnapshot) -> Void) -> RecommendationRequest {
        completion(snapshot); return TestRecommendationRequest()
    }
}
private final class EuropeDiscoveryFixture: DiscoveryServing {
    let snapshot: DiscoverySnapshot
    init(snapshot: DiscoverySnapshot) { self.snapshot = snapshot }
    func load(_ area: DiscoveryArea, completion: @escaping (DiscoverySnapshot) -> Void) -> RecommendationRequest {
        completion(snapshot); return TestRecommendationRequest()
    }
}

enum EuropeFixtures {
    static let venues: [[String: Any]] = [
        ["key":"n1001","name":"London fixture","kind":1,"lat":51.5074,"lon":-0.1278,"cell":"gcpvj","city":"London","country":"GB","currency":"GBP","google":["url":"https://www.google.com/maps?cid=1001","review_count":101,"checked_on":"2026-11-01"]],
        ["key":"n2001","name":"Paris fixture","kind":1,"lat":48.8566,"lon":2.3522,"cell":"u09tv","city":"Paris","country":"FR","currency":"EUR","google":["url":"https://www.google.com/maps?cid=2001","review_count":201,"checked_on":"2026-11-01"]]
    ]
    static func json(_ object: Any) throws -> Data { try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]) }
    static func catalogData() throws -> Data { try json(["schema_version":1,"version":"fixture-v1","venues":venues]) }
    static func catalog() throws -> EuropeCatalog { try EuropeJSON.catalog(catalogData(), checkedToday: "2026-11-02") }
    static func rows(_ cell: String) -> [[String: Any]] {
        let paris = cell == "u09tv"
        let variants: [(String, Int, String, Int?, Int, Bool)] = paris ? [("beer_draft", 600, "ml", 500, 0, false)] : [
            ("beer_draft", 350, "ml", 250, 0, true), ("beer_draft", 650, "ml", 500, 0, false),
            ("wine_glass", 900, "glass", 175, 0, false), ("wine_glass", 700, "glass", 250, 0, false), ("spritz", 550, "drink", nil, 1, false)]
        return variants.enumerated().map { index, value in
            var serving: [String: Any] = ["unit": value.2]; if let ml = value.3 { serving["ml"] = ml }
            let provenance: [String: Any] = value.5 ? ["kind":"customer","source_url":NSNull(),"source_checked_on":NSNull(),"source_sha256":NSNull(),"menu_item":NSNull()] : ["kind":"online_menu","source_url":"https://official.fixture.test/menu.pdf","source_checked_on":"2026-11-01","source_sha256":String(repeating:"a",count:64),"menu_item":"Menu item · HH 17–19"]
            return ["venue":paris ? "n2001":"n1001","cell":cell,"drink":value.0,"hh":value.4,"currency":paris ? "EUR":"GBP","amount_minor":value.1,"serving":serving,"observed_on":value.5 ? "2026-11-01" as Any:NSNull(),"confirmed_on":NSNull(),"confirmations":0,"status":"active","revision":String(format:"00000000-0000-4000-8000-%012d",index+1),"provenance":provenance]
        }
    }
    static func cell(_ cell: String, rows: [[String: Any]]? = nil, hidden: [String] = [], version: String = "fixture-v1", legacy: [String] = []) throws -> Data {
        try json(["schema_version":1,"catalog_version":version,"rows":rows ?? self.rows(cell),"hidden":hidden,"legacy_venues":legacy])
    }
}
