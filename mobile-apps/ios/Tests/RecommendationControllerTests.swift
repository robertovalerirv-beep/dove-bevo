import UIKit
import XCTest
@testable import DoveBevo

final class RecommendationControllerTests: XCTestCase {
    @MainActor
    func testUnavailableDoesNotBecomeZeroAndOnlyConfirmedDataEnablesButtons() throws {
        let (controller, client) = makeController()
        XCTAssertEqual(client.calls.count, 1)
        XCTAssertEqual(controller.tableView(controller.tableView, numberOfRowsInSection: 0), 9)
        let before = button(controller, row: 0)
        XCTAssertFalse(before.isEnabled)
        XCTAssertTrue(before.accessibilityLabel!.contains("Conteggio non disponibile"))
        client.complete(0, .failure(.network))
        XCTAssertFalse(button(controller, row: 0).isEnabled)
        XCTAssertTrue(button(controller, row: 0).accessibilityLabel!.contains("Conteggio non disponibile"))
        controller.refresh()
        client.complete(1, .success(snapshot()))
        XCTAssertTrue(button(controller, row: 0).isEnabled)
        XCTAssertTrue(button(controller, row: 0).accessibilityLabel!.contains("0 consigli"))
    }

    @MainActor
    func testActualNativeButtonsSerializeDoubleTapsSortAndUndoOwnState() throws {
        let (controller, client) = makeController()
        client.complete(0, .success(snapshot(counts: ["spritz": 7, "water": 7], selected: ["spritz"])))
        let own = button(controller, row: 0)
        XCTAssertEqual(own.accessibilityIdentifier, "recommendations.toggle.spritz")
        XCTAssertTrue(own.accessibilityTraits.contains(.selected))
        XCTAssertTrue(own.accessibilityLabel!.contains("Annulla consiglio"))
        let other = button(controller, row: 1)
        own.sendActions(for: .touchUpInside)
        own.sendActions(for: .touchUpInside)
        other.sendActions(for: .touchUpInside)
        XCTAssertEqual(client.calls.count, 2, "Only one full-snapshot write may be outstanding")
        XCTAssertEqual(client.calls[1].drink, "spritz")
        XCTAssertEqual(client.calls[1].recommended, false)
        XCTAssertFalse(button(controller, row: 0).isEnabled)
        client.complete(1, .success(snapshot(counts: ["spritz": 6, "water": 7])))
        XCTAssertEqual(button(controller, row: 0).accessibilityIdentifier, "recommendations.toggle.water")
        XCTAssertFalse(button(controller, row: 1).accessibilityTraits.contains(.selected))
    }

    @MainActor
    func testUncertainWriteReconcilesWithGETRatherThanRepeatingMutation() throws {
        let (controller, client) = makeController()
        client.complete(0, .success(snapshot()))
        button(controller, row: 0).sendActions(for: .touchUpInside)
        client.complete(1, .failure(.network))
        XCTAssertEqual(client.calls.count, 3)
        XCTAssertNil(client.calls[2].drink, "An ambiguous POST must be followed by GET")
        XCTAssertFalse(button(controller, row: 0).isEnabled)
        XCTAssertTrue(button(controller, row: 0).accessibilityLabel!.contains("Conteggio non disponibile"))
        client.complete(2, .failure(.network))
        controller.refresh()
        XCTAssertEqual(client.calls.count, 4)
        XCTAssertNil(client.calls[3].drink)
        client.complete(3, .success(snapshot(counts: ["beer_draft": 1], selected: ["beer_draft"])))
        XCTAssertTrue(button(controller, row: 0).accessibilityTraits.contains(.selected))
        XCTAssertTrue(button(controller, row: 0).isEnabled)
    }

    @MainActor
    func testDismissalAndRealAppDeactivationRetireDelayedResponsesAcrossReactivation() throws {
        let (controller, client) = makeController()
        let center = NotificationCenter.default
        center.post(name: UIApplication.willResignActiveNotification, object: UIApplication.shared)
        XCTAssertTrue(client.calls[0].request.cancelled)
        client.complete(0, .success(snapshot(counts: ["water": 99])))
        XCTAssertFalse(button(controller, row: 0).isEnabled)
        center.post(name: UIApplication.didBecomeActiveNotification, object: UIApplication.shared)
        XCTAssertEqual(client.calls.count, 2)
        // An old response remains obsolete even after returning to the same scene.
        client.complete(0, .success(snapshot(counts: ["water": 99])))
        XCTAssertFalse(button(controller, row: 0).isEnabled)
        client.complete(1, .success(snapshot(counts: ["spritz": 2])))
        XCTAssertEqual(button(controller, row: 0).accessibilityIdentifier, "recommendations.toggle.spritz")
        controller.refresh()
        controller.viewWillDisappear(false)
        XCTAssertTrue(client.calls[2].request.cancelled)
        client.complete(2, .success(snapshot(counts: ["water": 99])))
        XCTAssertFalse(button(controller, row: 0).isEnabled)
        XCTAssertTrue(client.calls.allSatisfy { $0.drink == nil })
    }

    @MainActor
    func testInactiveControllerCannotIssueGETOrVote() throws {
        let client = DelayedRecommendationClient()
        let controller = RecommendationsViewController(venue: venue, client: client, activityCheck: { false })
        controller.loadViewIfNeeded()
        controller.viewDidAppear(false)
        controller.refresh()
        button(controller, row: 0).sendActions(for: .touchUpInside)
        XCTAssertTrue(client.calls.isEmpty)
    }

    @MainActor
    func testBackgroundDuringWriteCancelsUIAndReturnReadsInsteadOfRepeatingVote() throws {
        let (controller, client) = makeController()
        client.complete(0, .success(snapshot()))
        button(controller, row: 0).sendActions(for: .touchUpInside)
        let center = NotificationCenter.default
        center.post(name: UIApplication.didEnterBackgroundNotification, object: UIApplication.shared)
        XCTAssertTrue(client.calls[1].request.cancelled)
        client.complete(1, .success(snapshot(counts: ["beer_draft": 1], selected: ["beer_draft"])))
        XCTAssertFalse(button(controller, row: 0).isEnabled)
        center.post(name: UIApplication.didBecomeActiveNotification, object: UIApplication.shared)
        XCTAssertEqual(client.calls.count, 3)
        XCTAssertNil(client.calls[2].drink)
        client.complete(2, .success(snapshot(counts: ["beer_draft": 1], selected: ["beer_draft"])))
        XCTAssertTrue(button(controller, row: 0).accessibilityTraits.contains(.selected))
        XCTAssertEqual(client.calls.filter { $0.drink != nil }.count, 1)
    }

    @MainActor
    private func makeController() -> (RecommendationsViewController, DelayedRecommendationClient) {
        let client = DelayedRecommendationClient()
        let controller = RecommendationsViewController(venue: venue, client: client, activityCheck: { true })
        controller.loadViewIfNeeded()
        controller.view.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
        controller.viewDidAppear(false)
        return (controller, client)
    }

    private var venue: SavedVenue { SavedVenue(url: URL(string: "https://www.dovebevo.com/bar/n123?c=u0nd9")!, label: "Locale pubblico") }

    private func snapshot(counts: [String: Int] = [:], selected: Set<String> = []) -> RecommendationSnapshot {
        RecommendationSnapshot(venueKey: "n123", drinks: DrinkCategory.all.map {
            DrinkRecommendation(drink: $0.code, count: counts[$0.code] ?? 0, recommended: selected.contains($0.code))
        })
    }

    @MainActor
    private func button(_ controller: RecommendationsViewController, row: Int) -> UIButton {
        let cell = controller.tableView(controller.tableView, cellForRowAt: IndexPath(row: row, section: 0))
        return descendants(cell).compactMap { $0 as? UIButton }.first!
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

    func complete(_ index: Int, _ result: Result<RecommendationSnapshot, RecommendationError>) { calls[index].completion(result) }
}
