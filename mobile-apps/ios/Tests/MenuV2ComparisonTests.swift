import Foundation
import XCTest
@testable import DoveBevo

final class MenuV2ComparisonTests: XCTestCase {
    private let venueKey = "m" + String(repeating: "0", count: 24)
    private let cell = "u0nd9"

    private func venue() throws -> SavedVenue {
        try SavedVenuePolicy.venue(url: URL(string: "https://www.dovebevo.com/bar/\(venueKey)?c=\(cell)")!, label: "Saved actual name")
    }
    private func source() -> [String: Any] {
        ["id": "source-1", "url": "https://bar.example/menu", "text_sha256": String(repeating: "a", count: 64), "checked_on": "2026-11-02"]
    }
    private func offer(_ id: String, context: String, cents: Int) -> [String: Any] {
        ["id": id, "name": "Spritz della casa", "category": "spritz", "serving": ["label": "Calice", "ml": 200],
         "amount_minor": cents, "currency": "GBP", "currency_exponent": 2,
         "context": ["kind": context, "condition": NSNull()], "source": source()]
    }
    private func menu(_ offers: [[String: Any]], count: Int, next: String?) throws -> Data {
        try JSONSerialization.data(withJSONObject: [
            "schema_version": 2, "coverage": ["complete": false, "basis": "verified_source_items_only"],
            "price_scope": "menu_item_only", "venue": ["key": venueKey, "cell": cell, "name": "Current venue"],
            "stored_offer_count": count, "offers": offers, "next_after": next as Any? ?? NSNull(),
            "fees": [], "fee_coverage": ["status": "unknown", "source": NSNull()]
        ] as [String: Any])
    }
    private func customer(ml: Int = 200) throws -> Data {
        try JSONSerialization.data(withJSONObject: [
            "schema_version": 1, "price_scope": "customer_reported_drink_item",
            "venue": ["key": venueKey, "cell": cell, "name": "Current venue", "country": "GB"],
            "rows": [["revision": 4, "item_key": "c" + String(repeating: "b", count: 64),
                      "kind": "menu_offer", "offer_id": "a2", "name": "Spritz della casa",
                      "category": "spritz", "serving": ["label": "Calice", "ml": ml],
                      "amount_minor": 650, "currency": "GBP", "currency_exponent": 2,
                      "observed_on": "2026-11-03", "source_kind": "customer",
                      "observation_kind": "customer_reported_price", "price_scope": "drink_item"]],
            "next_after": NSNull()
        ] as [String: Any])
    }

    private func cellPage(_ sample: [String: Any], extraSamples: [[String: Any]] = [], unresolved: Int = 0) throws -> Data {
        let categories = DrinkCategory.all.map(\.code)
        return try JSONSerialization.data(withJSONObject: [
            "schema_version": 2, "coverage": ["complete": false, "basis": "verified_source_items_only"],
            "price_scope": "menu_item_only", "cell": cell, "category": NSNull(), "categories": categories,
            "venues": [["key": "n123", "cell": cell, "name": "Current venue", "kind": 1,
                        "lat": 45.4642, "lon": 9.19, "address": "Via reale 1", "city": "Milano", "country": "IT",
                        "identity_url": "https://www.openstreetmap.org/node/123", "identity_kind": "osm",
                        "matching_offer_count": 1 + extraSamples.count, "sample_offers": [sample] + extraSamples,
                        "fee_coverage": ["status": "unknown", "source": NSNull()]]],
            "next_after": NSNull(), "unresolved_venues": unresolved
        ] as [String: Any])
    }

    func testCellSamplesKeepSourceServingCurrencyAndIncompleteCoverage() throws {
        var sample = offer("spritz-1", context: "regular", cents: 550)
        sample["currency"] = "EUR"
        let categories = DrinkCategory.all.map(\.code)
        let page = try XCTUnwrap(MenuV2JSON.cellPage(cellPage(sample, unresolved: 1), cell: cell,
                                                     categories: categories, after: nil))
        XCTAssertEqual(page.venues.count, 1)
        XCTAssertTrue(page.incomplete)
        let venue = try XCTUnwrap(page.venues.first)
        XCTAssertEqual(venue.url, URL(string: "https://www.dovebevo.com/bar/n123?c=u0nd9"))
        XCTAssertEqual(venue.samples.first?.amount, "5,50 €")
        XCTAssertEqual(venue.samples.first?.serving, "Calice · 200 ml")
        XCTAssertTrue(venue.samples.first?.evidence.contains("menu online") == true)
        XCTAssertTrue(venue.samples.first?.feeNotice.contains("spese non verificate") == true)
        XCTAssertEqual(try ComparisonEndpoint.menuV2Cell(cell: cell, categories: categories, after: nil).url().absoluteString,
                       "https://www.dovebevo.com/api/mobile/v2/menu/cells/u0nd9?categories=\(categories.joined(separator: ","))")
    }

    func testCellSamplesPreserveMixedCurrencyAndExponentWithoutRejectingTheCell() throws {
        var sample = offer("spritz-1", context: "regular", cents: 550)
        let categories = DrinkCategory.all.map(\.code)
        var euro = offer("spritz-2", context: "regular", cents: 550)
        euro["currency"] = "EUR"
        sample["amount_minor"] = 6
        sample["currency_exponent"] = 0
        let page = try XCTUnwrap(MenuV2JSON.cellPage(try cellPage(sample, extraSamples: [euro]),
                                                    cell: cell, categories: categories, after: nil))
        XCTAssertEqual(page.venues.first?.samples.map(\.amount), ["6 £", "5,50 €"])
        XCTAssertNotEqual(page.venues.first?.samples[0].group, page.venues.first?.samples[1].group)
    }

    func testCellSamplesRejectInvalidSourceAndIdentity() throws {
        var sample = offer("spritz-1", context: "regular", cents: 550)
        sample["currency"] = "EUR"
        let categories = DrinkCategory.all.map(\.code)
        var invalidSource = sample
        var source = self.source(); source["url"] = "http://bar.example/menu"
        invalidSource["source"] = source
        XCTAssertNil(MenuV2JSON.cellPage(try cellPage(invalidSource), cell: cell, categories: categories, after: nil))
        XCTAssertNil(MenuV2JSON.cellPage(try cellPage(sample), cell: "u0nd8", categories: categories, after: nil))
        XCTAssertThrowsError(try ComparisonEndpoint.menuV2Cell(cell: cell, categories: ["spritz", "spritz"], after: nil).url())
    }

    func testPaginatesVerifiedNamedMenuAndKeepsCustomerReportDistinct() throws {
        let saved = try venue()
        let fixture = MenuTransportFixture(pages: [
            (.menuV2(key: venueKey, cell: cell, after: nil), try menu([offer("a1", context: "conditional", cents: 450)], count: 2, next: "a1")),
            (.menuV2(key: venueKey, cell: cell, after: "a1"), try menu([offer("a2", context: "regular", cents: 550)], count: 2, next: nil)),
            (.customerV2(key: venueKey, cell: cell, after: nil), try customer())
        ])
        var loaded: MenuV2Snapshot?
        let client = MenuV2Client(transport: fixture)
        _ = client.load([saved]) { loaded = $0 }
        let result = try XCTUnwrap(loaded?.venues[saved.url])
        XCTAssertEqual(result.name, "Current venue")
        XCTAssertEqual(result.offers.count, 3)
        XCTAssertEqual(result.offers[1].amount, "5,50 \u{00A3}")
        XCTAssertEqual(result.offers[1].serving, "Calice · 200 ml")
        XCTAssertEqual(result.offers[2].amount, "6,50 \u{00A3}")
        XCTAssertTrue(result.offers[2].evidence.contains("cliente"))
        XCTAssertTrue(result.offers[1].evidence.contains("menu online"))
        XCTAssertTrue(result.offers[1].feeNotice.contains("spese non verificate"))
        XCTAssertEqual(result.linkedReports.count, 1)
        XCTAssertEqual(result.linkedReports[0].linkedOfferID, "a2")
        XCTAssertEqual(fixture.seen.count, 3)
        let drink = try SavedDrink.validated(url: saved.url, label: saved.label, drink: "spritz", band: .normal)
        let base = FavouriteComparisonSnapshot(venues: [:], unavailable: [])
        let rows = SavedDrinkRow.rows([drink], snapshot: base, menuSnapshot: loaded)
        XCTAssertEqual(rows.count, 2, "Only exact normal-band source and linked customer prices are comparable")
        XCTAssertEqual(rows.compactMap(\.menuPrice).map(\.amountMinor), [550, 650])
    }

    func testLinkedCustomerWithDifferentServingStaysSeparateFromComparableRows() throws {
        let saved = try venue()
        let fixture = MenuTransportFixture(pages: [
            (.menuV2(key: venueKey, cell: cell, after: nil), try menu([offer("a2", context: "regular", cents: 550)], count: 1, next: nil)),
            (.customerV2(key: venueKey, cell: cell, after: nil), try customer(ml: 300))
        ])
        var loaded: MenuV2Snapshot?
        _ = MenuV2Client(transport: fixture).load([saved]) { loaded = $0 }
        let result = try XCTUnwrap(loaded?.venues[saved.url])
        XCTAssertEqual(result.offers.count, 1, "A different serving must not enter category price comparison")
        XCTAssertEqual(result.linkedReports.count, 1, "The exact linked customer fact remains visible on the saved offer")
        XCTAssertEqual(result.linkedReports[0].linkedOfferID, "a2")
        XCTAssertEqual(result.linkedReports[0].servingML, 300)
    }

    func testConditionalOfferRetainsItsOwnCondition() throws {
        var conditional = offer("a1", context: "conditional", cents: 450)
        conditional["context"] = ["kind": "conditional", "condition": "Solo dopo le 18"]
        let page = try XCTUnwrap(MenuV2JSON.menuPage(menu([conditional], count: 1, next: nil), key: venueKey, cell: cell))
        XCTAssertNil(page.offers[0].band)
        XCTAssertEqual(page.offers[0].condition, "Solo dopo le 18")
    }

    func testLastOfferAfter149RowsIsStillEligibleForExactFavourite() throws {
        let saved = try venue()
        let first = (1...100).map { offer("a\($0)", context: "regular", cents: 550) }
        let last = (101...149).map { offer("a\($0)", context: "regular", cents: 650) }
        let fixture = MenuTransportFixture(pages: [
            (.menuV2(key: venueKey, cell: cell, after: nil), try menu(first, count: 149, next: "a100")),
            (.menuV2(key: venueKey, cell: cell, after: "a100"), try menu(last, count: 149, next: nil))
        ])
        var loaded: MenuV2Snapshot?
        _ = MenuV2Client(transport: fixture).load([saved]) { loaded = $0 }
        let venue = try XCTUnwrap(loaded?.venues[saved.url])
        XCTAssertEqual(venue.offers.count, 149)
        let exact = try XCTUnwrap(venue.offers.first { $0.id == "a149" })
        XCTAssertEqual(exact.amountMinor, 650)
        XCTAssertEqual(SavedMenuOffer.verified(venue: saved, price: exact)?.offerID, "a149")
    }

    func testConditionalFeeRemainsSeparateAndRetainsItsCondition() throws {
        var value = try XCTUnwrap(JSONSerialization.jsonObject(with: menu([offer("a2", context: "regular", cents: 550)], count: 1, next: nil)) as? [String: Any])
        value["fees"] = [["id": "f1", "label": "Coperto", "kind": "fixed", "basis": "person",
                          "amount_minor": 250, "currency": "GBP", "currency_exponent": 2,
                          "rate_bps": NSNull(), "applicability": "conditional", "condition": "Dopo le 20:00",
                          "source": source()]]
        value["fee_coverage"] = ["status": "documented_partial", "source": source()]
        let data = try JSONSerialization.data(withJSONObject: value)
        let page = try XCTUnwrap(MenuV2JSON.menuPage(data, key: venueKey, cell: cell))
        XCTAssertEqual(page.offers[0].amount, "5,50 \u{00A3}")
        XCTAssertTrue(page.feeNotice.contains("Spese separate"))
        XCTAssertTrue(page.feeNotice.contains("solo se Dopo le 20:00"))
        XCTAssertTrue(page.feeNotice.contains("Copertura delle spese parziale"))
        var invalid = value
        var fees = try XCTUnwrap(invalid["fees"] as? [[String: Any]])
        fees[0]["condition"] = NSNull(); invalid["fees"] = fees
        XCTAssertNil(MenuV2JSON.menuPage(try JSONSerialization.data(withJSONObject: invalid), key: venueKey, cell: cell))
    }

    func testRejectsCursorNotMatchingLastOfferAndDoesNotInventPrice() throws {
        let data = try menu([offer("a1", context: "regular", cents: 550)], count: 2, next: "wrong")
        XCTAssertNil(MenuV2JSON.menuPage(data, key: venueKey, cell: cell))
        let saved = try venue()
        let fixture = MenuTransportFixture(pages: [(.menuV2(key: venueKey, cell: cell, after: nil), data)])
        var loaded: MenuV2Snapshot?
        _ = MenuV2Client(transport: fixture).load([saved]) { loaded = $0 }
        XCTAssertNil(loaded?.venues[saved.url])
        XCTAssertTrue(loaded?.unavailable.contains(saved.url) == true)
    }
}

private final class MenuTransportFixture: ComparisonReadTransport {
    let pages: [(ComparisonEndpoint, Data)]
    var seen: [ComparisonEndpoint] = []
    init(pages: [(ComparisonEndpoint, Data)]) { self.pages = pages }
    func get(_ endpoint: ComparisonEndpoint, completion: @escaping (Result<Data, ComparisonReadError>) -> Void) -> RecommendationRequest {
        seen.append(endpoint)
        if let page = pages.first(where: { $0.0 == endpoint }) { completion(.success(page.1)) }
        else { completion(.failure(.unavailable)) }
        return ComparisonCancellation()
    }
}
