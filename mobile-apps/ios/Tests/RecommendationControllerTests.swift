import UIKit
import XCTest
@testable import DoveBevo

final class RecommendationControllerTests: XCTestCase {
    private var retainedCells: [UITableViewCell] = []

    @MainActor
    func testUnavailableDoesNotBecomeZeroAndOnlyConfirmedDataEnablesButtons() throws {
        defer { retainedCells.removeAll() }
        let (controller, client) = makeController()
        XCTAssertEqual(client.calls.count, 1)
        XCTAssertEqual(controller.tableView(controller.tableView, numberOfRowsInSection: 0), 9)
        let before = try button(controller, row: 0)
        XCTAssertFalse(before.isEnabled)
        XCTAssertTrue(before.accessibilityLabel!.contains("Conteggio non disponibile"))
        try client.complete(0, .failure(.network))
        XCTAssertFalse(try button(controller, row: 0).isEnabled)
        XCTAssertTrue(try button(controller, row: 0).accessibilityLabel!.contains("Conteggio non disponibile"))
        controller.refresh()
        try client.complete(1, .success(snapshot()))
        XCTAssertTrue(try button(controller, row: 0).isEnabled)
        XCTAssertTrue(try button(controller, row: 0).accessibilityLabel!.contains("0 consigli"))
    }

    @MainActor
    func testActualNativeButtonsSerializeDoubleTapsSortAndUndoOwnState() throws {
        defer { retainedCells.removeAll() }
        let (controller, client) = makeController()
        try client.complete(0, .success(snapshot(counts: ["spritz": 7, "water": 7], selected: ["spritz"])))
        let own = try button(controller, row: 0)
        XCTAssertEqual(own.accessibilityIdentifier, "recommendations.toggle.spritz")
        XCTAssertTrue(own.isEnabled, "The first recommendation action must be enabled before its real native tap")
        XCTAssertTrue(own.accessibilityTraits.contains(.selected))
        XCTAssertTrue(own.accessibilityLabel!.contains("Annulla consiglio"))
        let other = try button(controller, row: 1)
        XCTAssertTrue(other.isEnabled, "Another loaded row must also be actionable before a write starts")
        own.sendActions(for: .touchUpInside)
        XCTAssertEqual(client.calls.count, 2, "The first enabled native tap must issue one POST after the initial GET")
        let firstWrite = try client.call(at: 1)
        XCTAssertEqual(firstWrite.venue, venue)
        XCTAssertEqual(firstWrite.drink, "spritz")
        XCTAssertEqual(firstWrite.recommended, false)
        own.sendActions(for: .touchUpInside)
        other.sendActions(for: .touchUpInside)
        XCTAssertEqual(client.calls.count, 2, "Only one full-snapshot write may be outstanding")
        XCTAssertFalse(try button(controller, row: 0).isEnabled)
        try client.complete(1, .success(snapshot(counts: ["spritz": 6, "water": 7])))
        XCTAssertEqual(try button(controller, row: 0).accessibilityIdentifier, "recommendations.toggle.water")
        XCTAssertFalse(try button(controller, row: 1).accessibilityTraits.contains(.selected))
    }

    @MainActor
    func testUncertainWriteReconcilesWithGETRatherThanRepeatingMutation() throws {
        defer { retainedCells.removeAll() }
        let (controller, client) = makeController()
        try client.complete(0, .success(snapshot()))
        try button(controller, row: 0).sendActions(for: .touchUpInside)
        try client.complete(1, .failure(.network))
        XCTAssertEqual(client.calls.count, 3)
        XCTAssertNil((try client.call(at: 2)).drink, "An ambiguous POST must be followed by GET")
        XCTAssertFalse(try button(controller, row: 0).isEnabled)
        XCTAssertTrue(try button(controller, row: 0).accessibilityLabel!.contains("Conteggio non disponibile"))
        try client.complete(2, .failure(.network))
        controller.refresh()
        XCTAssertEqual(client.calls.count, 4)
        XCTAssertNil((try client.call(at: 3)).drink)
        try client.complete(3, .success(snapshot(counts: ["beer_draft": 1], selected: ["beer_draft"])))
        XCTAssertTrue(try button(controller, row: 0).accessibilityTraits.contains(.selected))
        XCTAssertTrue(try button(controller, row: 0).isEnabled)
    }

    @MainActor
    func testDismissalAndRealAppDeactivationRetireDelayedResponsesAcrossReactivation() throws {
        defer { retainedCells.removeAll() }
        let (controller, client) = makeController()
        let center = NotificationCenter.default
        center.post(name: UIApplication.willResignActiveNotification, object: UIApplication.shared)
        XCTAssertTrue((try client.call(at: 0)).request.cancelled)
        try client.complete(0, .success(snapshot(counts: ["water": 99])))
        XCTAssertFalse(try button(controller, row: 0).isEnabled)
        center.post(name: UIApplication.didBecomeActiveNotification, object: UIApplication.shared)
        XCTAssertEqual(client.calls.count, 2)
        // An old response remains obsolete even after returning to the same scene.
        try client.complete(0, .success(snapshot(counts: ["water": 99])))
        XCTAssertFalse(try button(controller, row: 0).isEnabled)
        try client.complete(1, .success(snapshot(counts: ["spritz": 2])))
        XCTAssertEqual(try button(controller, row: 0).accessibilityIdentifier, "recommendations.toggle.spritz")
        controller.refresh()
        controller.beginAppearanceTransition(false, animated: false)
        controller.endAppearanceTransition()
        XCTAssertTrue((try client.call(at: 2)).request.cancelled)
        try client.complete(2, .success(snapshot(counts: ["water": 99])))
        XCTAssertFalse(try button(controller, row: 0).isEnabled)
        XCTAssertTrue(client.calls.allSatisfy { $0.drink == nil })
    }

    @MainActor
    func testInactiveControllerCannotIssueGETOrVote() throws {
        defer { retainedCells.removeAll() }
        let client = DelayedRecommendationClient()
        let controller = RecommendationsViewController(venue: venue, client: client, activityCheck: { false })
        prepare(controller)
        controller.refresh()
        try button(controller, row: 0).sendActions(for: .touchUpInside)
        XCTAssertTrue(client.calls.isEmpty)
    }

    @MainActor
    func testBackgroundDuringWriteCancelsUIAndReturnReadsInsteadOfRepeatingVote() throws {
        defer { retainedCells.removeAll() }
        let (controller, client) = makeController()
        try client.complete(0, .success(snapshot()))
        try button(controller, row: 0).sendActions(for: .touchUpInside)
        let center = NotificationCenter.default
        center.post(name: UIApplication.didEnterBackgroundNotification, object: UIApplication.shared)
        XCTAssertTrue((try client.call(at: 1)).request.cancelled)
        try client.complete(1, .success(snapshot(counts: ["beer_draft": 1], selected: ["beer_draft"])))
        XCTAssertFalse(try button(controller, row: 0).isEnabled)
        center.post(name: UIApplication.didBecomeActiveNotification, object: UIApplication.shared)
        XCTAssertEqual(client.calls.count, 3)
        XCTAssertNil((try client.call(at: 2)).drink)
        try client.complete(2, .success(snapshot(counts: ["beer_draft": 1], selected: ["beer_draft"])))
        XCTAssertTrue(try button(controller, row: 0).accessibilityTraits.contains(.selected))
        XCTAssertEqual(client.calls.filter { $0.drink != nil }.count, 1)
    }

    @MainActor
    private func makeController() -> (RecommendationsViewController, DelayedRecommendationClient) {
        let client = DelayedRecommendationClient()
        let controller = RecommendationsViewController(venue: venue, client: client, activityCheck: { true })
        prepare(controller)
        return (controller, client)
    }

    @MainActor
    private func prepare(_ controller: RecommendationsViewController) {
        controller.loadViewIfNeeded()
        controller.view.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
        controller.beginAppearanceTransition(true, animated: false)
        controller.endAppearanceTransition()
        controller.view.layoutIfNeeded()
    }

    private var venue: SavedVenue { SavedVenue(url: URL(string: "https://www.dovebevo.com/bar/n123?c=u0nd9")!, label: "Locale pubblico") }

    private func snapshot(counts: [String: Int] = [:], selected: Set<String> = []) -> RecommendationSnapshot {
        RecommendationSnapshot(venueKey: "n123", drinks: DrinkCategory.all.map {
            DrinkRecommendation(drink: $0.code, count: counts[$0.code] ?? 0, recommended: selected.contains($0.code))
        })
    }

    @MainActor
    private func button(_ controller: RecommendationsViewController, row: Int,
                        file: StaticString = #filePath, line: UInt = #line) throws -> UIButton {
        controller.view.layoutIfNeeded()
        let cell = try XCTUnwrap(controller.tableView.cellForRow(at: IndexPath(row: row, section: 0)),
                                 "Expected a laid-out, table-owned recommendation row", file: file, line: line)
        // UIControl does not retain its target (RecommendationCell). Keep the
        // actual managed cell alive even when a subsequent render reloads it.
        retainedCells.append(cell)
        let action = try XCTUnwrap(descendants(cell).compactMap { $0 as? UIButton }.first,
                                   "Recommendation row has no native button", file: file, line: line)
        XCTAssertTrue(action.allTargets.contains { ($0.base as? UITableViewCell) === cell },
                      "The real cell must remain the button's target", file: file, line: line)
        return action
    }

    @MainActor
    private func descendants(_ view: UIView) -> [UIView] { view.subviews + view.subviews.flatMap { descendants($0) } }
}

final class DelayedRecommendationClient: RecommendationServing {
    struct Call {
        let venue: SavedVenue
        let drink: String?
        let recommended: Bool?
        let request: TestRecommendationRequest
        let completion: (Result<RecommendationSnapshot, RecommendationError>) -> Void
    }
    var calls: [Call] = []

    func load(venue: SavedVenue, completion: @escaping (Result<RecommendationSnapshot, RecommendationError>) -> Void) -> RecommendationRequest {
        add(venue: venue, drink: nil, recommended: nil, completion: completion)
    }

    func set(venue: SavedVenue, drink: String, recommended: Bool, completion: @escaping (Result<RecommendationSnapshot, RecommendationError>) -> Void) -> RecommendationRequest {
        add(venue: venue, drink: drink, recommended: recommended, completion: completion)
    }

    private func add(venue: SavedVenue, drink: String?, recommended: Bool?, completion: @escaping (Result<RecommendationSnapshot, RecommendationError>) -> Void) -> RecommendationRequest {
        let request = TestRecommendationRequest()
        calls.append(Call(venue: venue, drink: drink, recommended: recommended, request: request, completion: completion))
        return request
    }

    func call(at index: Int, file: StaticString = #filePath, line: UInt = #line) throws -> Call {
        try XCTUnwrap(calls.indices.contains(index) ? calls[index] : nil,
                      "Expected request at index \(index); received \(calls.count) request(s)", file: file, line: line)
    }

    func complete(_ index: Int, _ result: Result<RecommendationSnapshot, RecommendationError>,
                  file: StaticString = #filePath, line: UInt = #line) throws {
        let pending = try call(at: index, file: file, line: line)
        pending.completion(result)
    }
}
