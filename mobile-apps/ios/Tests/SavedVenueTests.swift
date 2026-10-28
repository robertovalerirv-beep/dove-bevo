import Foundation
import XCTest
@testable import DoveBevo

final class SavedVenueTests: XCTestCase {
    func testExactPublicVenueLinksCanonicalizeWithoutAdditionalData() throws {
        for prefix in ["n", "w", "r", "u"] {
            let input = try XCTUnwrap(URL(string: "https://DOVEBEVO.COM:443/bar/\(prefix)123?c=u0nd9"))
            let result = try XCTUnwrap(SavedVenuePolicy.canonicalURL(input))
            XCTAssertEqual(result.absoluteString, "https://www.dovebevo.com/bar/\(prefix)123?c=u0nd9")
        }
        XCTAssertNotNil(SavedVenuePolicy.canonicalURL(URL(string: "https://www.dovebevo.com/bar/n123456789012345?c=012bz")))
    }

    func testNonVenueAndAmbiguousLinksCannotBeSaved() {
        for input in [
            "https://www.dovebevo.com/", "https://www.dovebevo.com/?at=45.46,9.19",
            "https://www.dovebevo.com/admin", "https://www.dovebevo.com/bar/n0?c=u0nd9",
            "https://www.dovebevo.com/bar/n0123?c=u0nd9", "https://www.dovebevo.com/bar/n1234567890123456?c=u0nd9",
            "https://www.dovebevo.com/bar/x123?c=u0nd9", "https://www.dovebevo.com/bar/n١٢٣?c=u0nd9",
            "https://www.dovebevo.com/bar/n123/?c=u0nd9", "https://www.dovebevo.com/bar/%6e123?c=u0nd9",
            "https://www.dovebevo.com/bar/n123?c=%750nd9", "https://www.dovebevo.com/bar/n123?c=u0nd9&c=u0nd9",
            "https://www.dovebevo.com/bar/n123?c=u0nd9&token=private", "https://www.dovebevo.com/bar/n123?c=u0nd9#",
            "https://www.dovebevo.com/bar/n123?c=u0nd9#map", "https://www.dovebevo.com/bar/n123?c=u0nD9",
            "https://www.dovebevo.com/bar/n123?c=u0nda", "https://www.dovebevo.com/bar/n123?c=u0nd99",
            "https://www.dovebevo.com/bar/n123?c=u0nd9%0A", "https://www.dovebevo.com/bar/n123",
            "http://www.dovebevo.com/bar/n123?c=u0nd9", "https://www.dovebevo.com:8443/bar/n123?c=u0nd9",
            "https://user@www.dovebevo.com/bar/n123?c=u0nd9", "https://www.dovebevo.com.evil.example/bar/n123?c=u0nd9",
            "https://www.dovebevo.com./bar/n123?c=u0nd9", "https://www.dovebevo%2Ecom/bar/n123?c=u0nd9",
            "file:///bar/n123?c=u0nd9", "javascript:alert(1)", "/bar/n123?c=u0nd9"
        ] {
            XCTAssertNil(SavedVenuePolicy.canonicalURL(URL(string: input)), input)
        }
        XCTAssertNil(SavedVenuePolicy.canonicalURL(nil))
    }

    func testLabelsUseUnicodeScalarsTrimAndRejectControlsWithoutTruncation() throws {
        let venue = URL(string: "https://www.dovebevo.com/bar/n123?c=u0nd9")!
        XCTAssertEqual(try SavedVenuePolicy.venue(url: venue, label: " \u{2003} ").label, "Locale n123")
        XCTAssertEqual(try SavedVenuePolicy.venue(url: venue, label: "  Caffè 🍹  ").label, "Caffè 🍹")
        let eightyScalars = String(repeating: "🍹", count: 80)
        XCTAssertEqual(try SavedVenuePolicy.venue(url: venue, label: eightyScalars).label, eightyScalars)
        XCTAssertThrowsError(try SavedVenuePolicy.venue(url: venue, label: eightyScalars + "a"))
        XCTAssertThrowsError(try SavedVenuePolicy.venue(url: venue, label: String(repeating: "e\u{301}", count: 41)))
        for label in ["Bar\nNuovo", "Bar\tNuovo", "Bar\u{7f}", "Bar\u{85}", "Bar\u{0}"] {
            XCTAssertThrowsError(try SavedVenuePolicy.venue(url: venue, label: label), label)
        }
    }

    func testSaveReloadRelabelAndRemoveUseRealAtomicFile() throws {
        try withStore { store, directory in
            let first = venueURL(1)
            let second = venueURL(2)
            XCTAssertTrue(try store.load().isEmpty)
            try store.save(url: first, label: "Primo")
            try store.save(url: second, label: "Secondo")
            try store.save(url: first, label: "Primo aggiornato")
            let reloaded = SavedVenueStore(directoryURL: directory)
            XCTAssertEqual(try reloaded.load().map(\.label), ["Primo aggiornato", "Secondo"])
            XCTAssertEqual(try reloaded.load().map(\.url), [first, second])
            XCTAssertTrue(try directory.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup == true)
            let record = try XCTUnwrap((JSONSerialization.jsonObject(with: Data(contentsOf: store.fileURL)) as? [[String: String]])?.first)
            XCTAssertEqual(Set(record.keys), ["url", "label"], "Store no history, location, prices or cookies")
            try reloaded.remove(url: first)
            XCTAssertEqual(try SavedVenueStore(directoryURL: directory).load().map(\.url), [second])
            try reloaded.remove(url: second)
            XCTAssertTrue(try reloaded.load().isEmpty)
        }
    }

    func testCapacityDoesNotEvictAndDuplicateStillRelabelsAtCapacity() throws {
        try withStore { store, _ in
            for index in 1...50 { try store.save(url: venueURL(index), label: "Bar \(index)") }
            let previous = try Data(contentsOf: store.fileURL)
            XCTAssertThrowsError(try store.save(url: venueURL(51), label: "Cinquantuno")) { error in
                XCTAssertEqual(error as? SavedVenueStore.StoreError, .capacityReached)
            }
            XCTAssertEqual(try Data(contentsOf: store.fileURL), previous)
            try store.save(url: venueURL(1), label: "Nuovo nome")
            XCTAssertEqual(try store.load().count, 50)
            XCTAssertEqual(try store.load().first?.label, "Nuovo nome")
            XCTAssertEqual(try store.load().first?.url, venueURL(1))
        }
    }

    func testReadRevalidatesCorruptRecordsAndDeduplicatesWithoutFollowingLinks() throws {
        try withStore { store, directory in
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let records: [Any] = [
                ["url": venueURL(1).absoluteString, "label": "Valido"],
                ["url": "https://evil.example/bar/n2?c=u0nd9", "label": "Esterno"],
                ["url": venueURL(1).absoluteString, "label": "Duplicato"],
                ["url": venueURL(2).absoluteString, "label": "Bar\nRotto"],
                ["url": venueURL(3).absoluteString, "label": 42],
                ["url": venueURL(4).absoluteString, "label": "Quarto"],
                "not a record"
            ]
            try JSONSerialization.data(withJSONObject: records).write(to: store.fileURL)
            XCTAssertEqual(try store.load().map(\.label), ["Valido", "Quarto"])
            XCTAssertEqual(try store.load().map(\.url), [venueURL(1), venueURL(4)])
        }
    }

    func testCorruptOrOversizedPayloadCannotBeOverwrittenBySave() throws {
        try withStore { store, directory in
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            for badData in [Data("not JSON".utf8), Data(repeating: 32, count: 65_537)] {
                try badData.write(to: store.fileURL)
                XCTAssertThrowsError(try store.load())
                XCTAssertThrowsError(try store.save(url: venueURL(1), label: "Valido"))
                XCTAssertEqual(try Data(contentsOf: store.fileURL), badData)
            }
        }
    }

    func testOverCapacityStoredRecordsAreNotSilentlyEvictedByTheNextMutation() throws {
        try withStore { store, directory in
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let records = (1...51).map { ["url": venueURL($0).absoluteString, "label": "Bar \($0)"] }
            let original = try JSONSerialization.data(withJSONObject: records)
            try original.write(to: store.fileURL)
            XCTAssertThrowsError(try store.load())
            XCTAssertThrowsError(try store.save(url: venueURL(1), label: "Non modificare"))
            XCTAssertEqual(try Data(contentsOf: store.fileURL), original)
        }
    }

    func testSaveAndRemoveFailureKeepPreviousDiskRecords() throws {
        try withStore { store, directory in
            try store.save(url: venueURL(1), label: "Primo")
            let previous = try Data(contentsOf: store.fileURL)
            try FileManager.default.setAttributes([.posixPermissions: 0o500], ofItemAtPath: directory.path)
            defer { try? FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: directory.path) }
            XCTAssertThrowsError(try store.save(url: venueURL(2), label: "Secondo"))
            XCTAssertThrowsError(try store.remove(url: venueURL(1)))
            XCTAssertEqual(try Data(contentsOf: store.fileURL), previous)
            XCTAssertEqual(try store.load().map(\.label), ["Primo"])
        }
    }

    private func venueURL(_ index: Int) -> URL {
        URL(string: "https://www.dovebevo.com/bar/n\(index)?c=u0nd9")!
    }

    private func withStore(_ action: (SavedVenueStore, URL) throws -> Void) throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        let directory = root.appendingPathComponent("SavedVenues", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        try action(SavedVenueStore(directoryURL: directory), directory)
    }
}
