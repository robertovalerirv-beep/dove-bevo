import Foundation
import XCTest
@testable import DoveBevo

final class RecommendationTests: XCTestCase {
    func testCatalogAndSortingUseCountThenStableCatalogOrder() throws {
        XCTAssertEqual(DrinkCategory.all.map(\.code), ["beer_draft", "spritz", "negroni", "sbagliato", "gin_tonic", "gin_lemon", "wine_glass", "alcohol_free", "water"])
        let value = try RecommendationSnapshot.parse(body(counts: ["spritz": 4, "water": 4]), venueKey: "n123")
        XCTAssertEqual(value.sortedCategories.prefix(3).map(\.code), ["spritz", "water", "beer_draft"])
        XCTAssertEqual(value.value(for: "beer_draft")?.count, 0)
    }

    func testSnapshotRejectsWrongIdentityCodesShapesAndNumericCoercion() throws {
        let valid = try JSONSerialization.jsonObject(with: body()) as! [String: Any]
        let rows = valid["drinks"] as! [[String: Any]]
        var cases: [[String: Any]] = [[:], ["venue_key": "w999", "drinks": rows],
                                      ["venue_key": "n123", "drinks": Array(rows.dropLast())],
                                      ["venue_key": "n123", "drinks": rows + [rows[0]]]]
        let invalidFields: [(String, Any)] = [("count", true), ("count", -1), ("count", 1.5),
                                              ("count", 9_007_199_254_740_992), ("recommended", 1),
                                              ("recommended", "true"), ("drink", "unknown")]
        for (field, invalid) in invalidFields {
            var changed = rows
            changed[0][field] = invalid
            cases.append(["venue_key": "n123", "drinks": changed])
        }
        var duplicate = rows
        duplicate[1] = rows[0]
        cases.append(["venue_key": "n123", "drinks": duplicate])
        for value in cases {
            XCTAssertThrowsError(try RecommendationSnapshot.parse(JSONSerialization.data(withJSONObject: value), venueKey: "n123"))
        }
        XCTAssertThrowsError(try RecommendationSnapshot.parse(Data(repeating: 32, count: 32_769), venueKey: "n123"))
        XCTAssertThrowsError(try RecommendationSnapshot.parse(Data("not JSON".utf8), venueKey: "n123"))
    }

    func testEndpointUsesOnlyStrictCapturedVenueAndCell() throws {
        let venue = SavedVenue(url: URL(string: "https://www.dovebevo.com/bar/n123?c=u0nd9")!, label: "Nome non trasmesso")
        XCTAssertEqual(try RecommendationClient.endpoint(for: venue).absoluteString, "https://www.dovebevo.com/api/mobile/venues/n123/recommendations?c=u0nd9")
        for raw in ["https://evil.example/bar/n123?c=u0nd9", "https://www.dovebevo.com/bar/n123?c=u0nd9&extra=1",
                    "https://www.dovebevo.com/bar/n123?c=u0nd9&c=u0nd9", "https://www.dovebevo.com/"] {
            XCTAssertThrowsError(try RecommendationClient.endpoint(for: SavedVenue(url: URL(string: raw)!, label: "Bar")))
        }
    }

    func testIdentityPersistsAcrossStoreInstancesIsExcludedFromBackupAndDiffersAfterReinstall() throws {
        try withDirectory { directory in
            let first = RecommendationVoterStore(directory: directory.appendingPathComponent("first"))
            let id = try first.identity()
            XCTAssertTrue(RecommendationVoterStore.isValid(id))
            XCTAssertEqual(try RecommendationVoterStore(directory: directory.appendingPathComponent("first")).identity(), id)
            XCTAssertEqual(try first.fileURL.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup, true)
            XCTAssertEqual(try first.fileURL.deletingLastPathComponent().resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup, true)
            XCTAssertNotEqual(try RecommendationVoterStore(directory: directory.appendingPathComponent("reinstalled")).identity(), id)
        }
    }

    func testCorruptOversizedOrSymlinkIdentityIsNeverReplacedOrFollowed() throws {
        try withDirectory { directory in
            let store = RecommendationVoterStore(directory: directory)
            for bad in [Data("corrupt".utf8), Data(repeating: 97, count: 1024)] {
                try bad.write(to: store.fileURL)
                XCTAssertThrowsError(try store.identity())
                XCTAssertEqual(try Data(contentsOf: store.fileURL), bad)
            }
            try FileManager.default.removeItem(at: store.fileURL)
            let target = directory.appendingPathComponent("target")
            let original = Data(UUID().uuidString.lowercased().utf8)
            try original.write(to: target)
            try FileManager.default.createSymbolicLink(at: store.fileURL, withDestinationURL: target)
            XCTAssertThrowsError(try store.identity())
            XCTAssertEqual(try Data(contentsOf: target), original)
        }
    }

    func testClientSendsSetOperationWithoutNameLocationCookieOrWebCredentials() throws {
        let transport = RecordingRecommendationTransport()
        let client = RecommendationClient(voter: TestRecommendationVoter(), transport: transport)
        let venue = SavedVenue(url: URL(string: "https://www.dovebevo.com/bar/n123?c=u0nd9")!, label: "Nome privato")
        _ = client.load(venue: venue) { _ in }
        _ = client.set(venue: venue, drink: "spritz", recommended: false) { _ in }
        XCTAssertEqual(transport.requests.count, 2)
        let get = transport.requests[0]
        XCTAssertEqual(get.httpMethod, "GET")
        XCTAssertFalse(get.httpShouldHandleCookies)
        XCTAssertNil(get.value(forHTTPHeaderField: "Cookie"))
        XCTAssertEqual(get.value(forHTTPHeaderField: "X-DoveBevo-Voter"), TestRecommendationVoter.value)
        let post = transport.requests[1]
        XCTAssertEqual(post.httpMethod, "POST")
        XCTAssertEqual(post.value(forHTTPHeaderField: "Origin"), "https://www.dovebevo.com")
        XCTAssertEqual(post.value(forHTTPHeaderField: "Content-Type"), "application/json")
        let payload = try XCTUnwrap(try JSONSerialization.jsonObject(with: XCTUnwrap(post.httpBody)) as? [String: Any])
        XCTAssertEqual(Set(payload.keys), ["drink", "recommended"])
        XCTAssertEqual(payload["drink"] as? String, "spritz")
        XCTAssertEqual(payload["recommended"] as? Bool, false)
        XCTAssertFalse(post.url!.absoluteString.contains(TestRecommendationVoter.value))
    }

    func testMalformedInstallationIdentityAndUnknownDrinkCannotReachTransport() {
        struct InvalidIdentity: RecommendationVoterProviding { func identity() throws -> String { "not-an-installation" } }
        let transport = RecordingRecommendationTransport()
        let client = RecommendationClient(voter: InvalidIdentity(), transport: transport)
        let venue = SavedVenue(url: URL(string: "https://www.dovebevo.com/bar/n123?c=u0nd9")!, label: "Bar")
        let invalidIdentity = expectation(description: "identity rejected")
        let invalidDrink = expectation(description: "drink rejected")
        _ = client.load(venue: venue) { result in
            if case .failure(.identityUnavailable) = result {} else { XCTFail("Malformed identity accepted") }
            invalidIdentity.fulfill()
        }
        _ = client.set(venue: venue, drink: "unknown", recommended: true) { result in
            if case .failure(.invalidContext) = result {} else { XCTFail("Unknown drink accepted") }
            invalidDrink.fulfill()
        }
        wait(for: [invalidIdentity, invalidDrink], timeout: 3)
        XCTAssertTrue(transport.requests.isEmpty)
    }

    private func body(counts: [String: Int] = [:]) throws -> Data {
        try JSONSerialization.data(withJSONObject: ["venue_key": "n123", "drinks": DrinkCategory.all.map {
            ["drink": $0.code, "count": counts[$0.code] ?? 0, "recommended": false] as [String: Any]
        }])
    }

    private func withDirectory(_ action: (URL) throws -> Void) throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        try action(directory)
    }
}

struct TestRecommendationVoter: RecommendationVoterProviding {
    static let value = "12345678-1234-4123-8123-123456789abc"
    func identity() throws -> String { Self.value }
}

final class TestRecommendationRequest: RecommendationRequest {
    private(set) var cancelled = false
    func cancel() { cancelled = true }
}

final class RecordingRecommendationTransport: RecommendationTransport {
    var requests: [URLRequest] = []
    func send(_ request: URLRequest, completion: @escaping (Result<Data, RecommendationError>) -> Void) -> RecommendationRequest {
        requests.append(request)
        return TestRecommendationRequest()
    }
}
