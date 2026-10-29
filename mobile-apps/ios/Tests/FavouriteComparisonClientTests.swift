import Foundation
import XCTest
@testable import DoveBevo

final class FavouriteComparisonClientTests: XCTestCase {
    func testSharedCellReadsOnceAndAllCategoriesAreResolvedWithoutMutations() throws {
        let transport = DelayedComparisonTransport()
        let client = FavouriteComparisonClient(transport: transport, today: { "2026-10-29" })
        var received: FavouriteComparisonSnapshot?
        let operation = client.load([ComparisonFixtures.saved("n123"), ComparisonFixtures.saved("n124")]) { received = $0 }
        defer { operation.cancel() }
        XCTAssertEqual(transport.calls.map(\.endpoint), [.health])
        try transport.complete(0, .success(ComparisonFixtures.health))
        XCTAssertEqual(try transport.call(1).endpoint, .venues(version: "20261027", cell: "u0nd9"))
        try transport.complete(1, .success(ComparisonFixtures.staticCell()))
        try transport.complete(2, .success(ComparisonFixtures.prices([["n123", "spritz", 0, 600, "2026-10-28", 2, 0]])))
        XCTAssertEqual(transport.calls.count, 3)
        XCTAssertEqual(received?.venues[ComparisonFixtures.saved("n123").url]?.price(drink: "spritz", band: .normal)?.cents, 600)
        XCTAssertTrue(received?.unavailable.contains(ComparisonFixtures.saved("n124").url) == true)
    }

    func testGlobalDeadlineRetiresQueuedAndActiveWorkAtThreeRequestCap() throws {
        let transport = DelayedComparisonTransport()
        let timer = ManualComparisonDeadline()
        let client = FavouriteComparisonClient(transport: transport, today: { "2026-10-29" }, schedule: timer.schedule)
        let saved = ["u0nd9", "u0nd8", "u0nd7", "u0nd6"].enumerated().map { ComparisonFixtures.saved("n\($0.offset + 1)", cell: $0.element) }
        var received: FavouriteComparisonSnapshot?
        let operation = client.load(saved) { received = $0 }
        defer { operation.cancel() }
        try transport.complete(0, .success(ComparisonFixtures.health))
        XCTAssertEqual(timer.delay, 60)
        XCTAssertEqual(transport.outstanding, 3)
        XCTAssertEqual(transport.calls.count, 4)
        timer.fire()
        XCTAssertEqual(received?.unavailable.count, 4)
        XCTAssertEqual(transport.outstanding, 0)
        try transport.complete(1, .success(ComparisonFixtures.staticCell()))
        XCTAssertEqual(transport.calls.count, 4, "Retired callbacks must not start queued cells or more requests")
    }

    func testUserOnlySkipsStaticAndMixedStaticFailureStillAllowsApprovedUser() throws {
        for mixed in [false, true] {
            let transport = DelayedComparisonTransport()
            let client = FavouriteComparisonClient(transport: transport, today: { "2026-10-29" })
            let user = ComparisonFixtures.saved("u5")
            var output: FavouriteComparisonSnapshot?
            let operation = client.load(mixed ? [user, ComparisonFixtures.saved("n123")] : [user]) { output = $0 }
            defer { operation.cancel() }
            try transport.complete(0, .success(ComparisonFixtures.health))
            if mixed { try transport.complete(1, .failure(.unavailable)) }
            let priceIndex = mixed ? 2 : 1
            XCTAssertEqual(try transport.call(priceIndex).endpoint, .prices(cell: "u0nd9"))
            try transport.complete(priceIndex, .success(ComparisonFixtures.prices([], users: [["u5", "Approvato", 1, 45.4642, 9.19]])))
            XCTAssertEqual(output?.venues[user.url]?.name, "Approvato")
            XCTAssertEqual(transport.calls.count, mixed ? 3 : 2)
            if mixed { XCTAssertTrue(output?.unavailable.contains(ComparisonFixtures.saved("n123").url) == true) }
        }
    }

    func testCancelAndFailedHealthCannotPublishEmptySuccessOrStartCells() throws {
        let transport = DelayedComparisonTransport()
        let client = FavouriteComparisonClient(transport: transport)
        var output: FavouriteComparisonSnapshot?
        let operation = client.load([ComparisonFixtures.saved("n123")]) { output = $0 }
        operation.cancel()
        try transport.complete(0, .success(ComparisonFixtures.health))
        XCTAssertNil(output)
        XCTAssertEqual(transport.calls.count, 1)
        let failed = client.load([ComparisonFixtures.saved("n123")]) { output = $0 }
        defer { failed.cancel() }
        try transport.complete(1, .success(Data("<html>error</html>".utf8)))
        XCTAssertTrue(output?.venues.isEmpty == true)
        XCTAssertEqual(output?.unavailable.count, 1)
        XCTAssertEqual(transport.calls.count, 2)
    }
}

final class DelayedComparisonTransport: ComparisonReadTransport {
    struct Call { let endpoint: ComparisonEndpoint; let request: TestRecommendationRequest; let completion: (Result<Data, ComparisonReadError>) -> Void; var completed = false }
    var calls: [Call] = []
    var outstanding: Int { calls.filter { !$0.completed && !$0.request.cancelled }.count }
    func get(_ endpoint: ComparisonEndpoint, completion: @escaping (Result<Data, ComparisonReadError>) -> Void) -> RecommendationRequest {
        let request = TestRecommendationRequest()
        calls.append(Call(endpoint: endpoint, request: request, completion: completion))
        return request
    }
    func call(_ index: Int, file: StaticString = #filePath, line: UInt = #line) throws -> Call {
        try XCTUnwrap(calls.indices.contains(index) ? calls[index] : nil, "Expected comparison read \(index)", file: file, line: line)
    }
    func complete(_ index: Int, _ result: Result<Data, ComparisonReadError>, file: StaticString = #filePath, line: UInt = #line) throws {
        let pending = try call(index, file: file, line: line)
        calls[index].completed = true
        pending.completion(result)
    }
}

final class ManualComparisonDeadline {
    var delay: TimeInterval?
    var action: (() -> Void)?
    let request = TestRecommendationRequest()
    func schedule(_ delay: TimeInterval, _ action: @escaping () -> Void) -> RecommendationRequest {
        self.delay = delay; self.action = action; return request
    }
    func fire() { if !request.cancelled { action?() } }
}
