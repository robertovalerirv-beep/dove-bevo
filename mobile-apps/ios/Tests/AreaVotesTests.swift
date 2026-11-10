import UIKit
import XCTest
@testable import DoveBevo

final class AreaVotesTests: XCTestCase {
    private let area = DiscoveryArea(latitude: 45.4642, longitude: 9.19, zoom: 14)!

    private func page(_ items: [[String: Any]], next: Any = NSNull()) throws -> Data {
        try JSONSerialization.data(withJSONObject: [
            "schema_version": 1, "scope": ["cells": area.cells], "items": items, "next_after": next
        ])
    }

    private func row(key: String, target: [String: Any], count: Int) -> [String: Any] {
        ["venue": ["key": key, "cell": area.cells[0], "name": "Bar Milano", "city": "Milano"],
         "target": target,
         "drink": ["name": "Spritz", "category": "spritz", "serving_label": "Calice"],
         "count": count]
    }

    func testReadOnlyAreaResponseValidatesScopeAndExactTarget() throws {
        let source = try page([
            row(key: "n123", target: ["kind": "offer", "id": "spritz.7"], count: 8),
            row(key: "n124", target: ["kind": "customer", "id": "c" + String(repeating: "a", count: 64)], count: 3),
            row(key: "n125", target: ["kind": "legacy", "drink": "spritz", "band": "normal"], count: 1),
            row(key: "n126", target: ["kind": "europe", "drink": "spritz", "band": "normal",
                "currency": "GBP", "serving": ["unit": "drink"]], count: 1)
        ], next: "YWZ0ZXI")
        let result = try XCTUnwrap(AreaVotesPage.parse(source, requestedCells: area.cells))
        XCTAssertEqual(result.items.map(\.count), [8, 3, 1, 1])
        XCTAssertEqual(result.nextAfter, "YWZ0ZXI")
        XCTAssertEqual(result.items[0].venue.url,
                       URL(string: "https://www.dovebevo.com/bar/n123?c=\(area.cells[0])"))
        XCTAssertEqual(result.items[1].target, .customer("c" + String(repeating: "a", count: 64)))
        XCTAssertEqual(result.items[3].target, .europe("spritz", .normal, "GBP", EuropeServing(unit: "drink", ml: nil)))
        XCTAssertNil(AreaVotesPage.parse(source, requestedCells: ["u0nd9"]))
        XCTAssertNil(AreaVotesPage.parse(try page([row(key: "n123", target: ["kind": "legacy", "drink": "not-a-drink", "band": "normal"], count: 1)]), requestedCells: area.cells))
        XCTAssertNil(AreaVotesPage.parse(try page([row(key: "n123", target: ["kind": "offer", "id": "spritz.7"], count: 0)]), requestedCells: area.cells))
        XCTAssertNil(AreaVotesPage.parse(try page([row(key: "n123", target: ["kind": "europe", "drink": "spritz", "band": "normal",
            "currency": "GBP", "serving": ["unit": "ml", "ml": 500]], count: 2)]), requestedCells: area.cells))
    }

    func testEndpointUsesNineValidatedCellsAndReadOnlyLimit() throws {
        let url = try XCTUnwrap(AreaVotesClient.endpoint(area: area, after: "YWZ0ZXI"))
        let components = try XCTUnwrap(URLComponents(url: url, resolvingAgainstBaseURL: false))
        XCTAssertEqual(components.path, "/api/mobile/v2/drink-votes/area")
        XCTAssertEqual(components.queryItems?.first(where: { $0.name == "cells" })?.value, area.cells.joined(separator: ","))
        XCTAssertEqual(components.queryItems?.first(where: { $0.name == "limit" })?.value, "50")
        XCTAssertEqual(components.queryItems?.first(where: { $0.name == "after" })?.value, "YWZ0ZXI")
        XCTAssertEqual(components.queryItems?.first(where: { $0.name == "include_europe" })?.value, "1")
        XCTAssertNil(AreaVotesClient.endpoint(area: area, after: "bad&limit=1000"))
    }

    @MainActor func testFeedPaginatesAndOpensVenueWithoutVotingControl() throws {
        let client = DelayedAreaVotesService()
        var opened: URL?
        let controller = AreaVotesViewController(client: client, activityCheck: { true }, onOpen: { opened = $0 })
        controller.isDestinationSelected = { true }
        controller.setArea(area)
        controller.loadViewIfNeeded()
        controller.beginAppearanceTransition(true, animated: false); controller.endAppearanceTransition()
        XCTAssertEqual(client.calls.count, 1)
        XCTAssertNil(client.calls[0].after)
        let first = try XCTUnwrap(AreaVotesPage.parse(try page([row(key: "n123", target: ["kind": "offer", "id": "spritz.7"], count: 8)], next: "YWZ0ZXI"), requestedCells: area.cells))
        client.complete(0, .success(first))
        XCTAssertEqual(controller.tableView.numberOfRows(inSection: 0), 1)
        let cell = controller.tableView(controller.tableView, cellForRowAt: IndexPath(row: 0, section: 0))
        XCTAssertEqual(cell.accessibilityIdentifier, "areaVotes.item.0")
        XCTAssertFalse(cell.contentView.subviews.contains { $0 is UIButton })
        let loadMore = try XCTUnwrap(controller.view.descendants.first { ($0 as? UIButton)?.accessibilityIdentifier == "areaVotes.loadMore" } as? UIButton)
        XCTAssertFalse(loadMore.isHidden)
        loadMore.sendActions(for: .touchUpInside)
        XCTAssertEqual(client.calls.count, 2)
        XCTAssertEqual(client.calls[1].after, "YWZ0ZXI")
        let second = try XCTUnwrap(AreaVotesPage.parse(try page([row(key: "n124", target: ["kind": "legacy", "drink": "spritz", "band": "normal"], count: 2)]), requestedCells: area.cells))
        client.complete(1, .success(second))
        XCTAssertEqual(controller.tableView.numberOfRows(inSection: 0), 2)
        controller.tableView(controller.tableView, didSelectRowAt: IndexPath(row: 1, section: 0))
        XCTAssertEqual(opened, URL(string: "https://www.dovebevo.com/bar/n124?c=\(area.cells[0])"))
        XCTAssertEqual(client.calls.count, 2, "Browsing a community count must not write a vote")
    }

    @MainActor func testNoMapAreaOffersExplicitCitySearchWithoutRequest() throws {
        let client = DelayedAreaVotesService()
        var openedMap = false
        let controller = AreaVotesViewController(client: client, activityCheck: { true },
                                                  onOpen: { _ in }, onMap: { openedMap = true })
        controller.isDestinationSelected = { true }
        controller.loadViewIfNeeded()
        controller.beginAppearanceTransition(true, animated: false); controller.endAppearanceTransition()
        let button = try XCTUnwrap(controller.view.descendants.first {
            ($0 as? UIButton)?.accessibilityIdentifier == "areaVotes.chooseMap"
        } as? UIButton)
        XCTAssertFalse(button.isHidden)
        XCTAssertTrue(controller.view.descendants.contains {
            ($0 as? UILabel)?.accessibilityIdentifier == "areaVotes.chooseArea"
        })
        XCTAssertTrue(client.calls.isEmpty)
        button.sendActions(for: .touchUpInside)
        XCTAssertTrue(openedMap)
    }
}

private extension UIView {
    var descendants: [UIView] { subviews + subviews.flatMap(\.descendants) }
}

private final class DelayedAreaVotesService: AreaVotesServing {
    struct Call {
        let after: String?
        let completion: (Result<AreaVotesPage, RecommendationError>) -> Void
    }
    var calls: [Call] = []
    func load(area: DiscoveryArea, after: String?, completion: @escaping (Result<AreaVotesPage, RecommendationError>) -> Void) -> RecommendationRequest {
        calls.append(Call(after: after, completion: completion))
        return AreaVotesTestRequest()
    }
    func complete(_ index: Int, _ value: Result<AreaVotesPage, RecommendationError>) {
        calls[index].completion(value)
    }
}

private final class AreaVotesTestRequest: RecommendationRequest { func cancel() {} }
