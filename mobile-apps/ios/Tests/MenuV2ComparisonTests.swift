import Foundation
import XCTest
@testable import DoveBevo

final class MenuV2ComparisonTests: XCTestCase {
    private let key = "m0123456789abcdef01234567"
    private let cell = "u0nd9"

    private func venue() throws -> SavedVenue {
        try SavedVenuePolicy.venue(url: URL(string: "https://www.dovebevo.com/bar/\(key)?c=\(cell)")!, label: "Saved actual name")
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
            "price_scope": "menu_item_only", "venue": ["key": key, "cell": cell, "name": "Current venue"],
            "stored_offer_count": count, "offers": offers, "next_after": next as Any? ?? NSNull(),
            "fees": [], "fee_coverage": ["status": "unknown", "source": NSNull()]
        ] as [String: Any])
    }
    private func customer() throws -> Data {
        try JSONSerialization.data(withJSONObject: [
            "schema_version": 1, "price_scope": "customer_reported_drink_item",
            "venue": ["key": key, "cell": cell, "name": "Current venue", "country": "GB"],
            "rows": [["revision": 4, "item_key": "c" + String(repeating: "b", count: 64),
                      "kind": "menu_offer", "offer_id": "a2", "name": "Spritz della casa",
                      "category": "spritz", "serving": ["label": "Calice", "ml": 200],
                      "amount_minor": 650, "currency": "GBP", "currency_exponent": 2,
                      "observed_on": "2026-11-03", "source_kind": "customer",
                      "observation_kind": "customer_reported_price", "price_scope": "drink_item"]],
            "next_after": NSNull()
        ] as [String: Any])
    }

    func testPaginatesVerifiedNamedMenuAndKeepsCustomerReportDistinct() throws {
        let saved = try venue()
        let fixture = MenuTransportFixture(pages: [
            (.menuV2(key: key, cell: cell, after: nil), try menu([offer("a1", context: "conditional", cents: 450)], count: 2, next: "a1")),
            (.menuV2(key: key, cell: cell, after: "a1"), try menu([offer("a2", context: "regular", cents: 550)], count: 2, next: nil)),
            (.customerV2(key: key, cell: cell, after: nil), try customer())
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
        XCTAssertEqual(fixture.seen.count, 3)
        let drink = try SavedDrink.validated(url: saved.url, label: saved.label, drink: "spritz", band: .normal)
        let base = FavouriteComparisonSnapshot(venues: [:], unavailable: [])
        let rows = SavedDrinkRow.rows([drink], snapshot: base, menuSnapshot: loaded)
        XCTAssertEqual(rows.count, 2, "Only exact normal-band source and linked customer prices are comparable")
        XCTAssertEqual(rows.compactMap(\.menuPrice).map(\.amountMinor), [550, 650])
    }

    func testRejectsCursorNotMatchingLastOfferAndDoesNotInventPrice() throws {
        let data = try menu([offer("a1", context: "regular", cents: 550)], count: 2, next: "wrong")
        XCTAssertNil(MenuV2JSON.menuPage(data, key: key, cell: cell))
        let saved = try venue()
        let fixture = MenuTransportFixture(pages: [(.menuV2(key: key, cell: cell, after: nil), data)])
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
