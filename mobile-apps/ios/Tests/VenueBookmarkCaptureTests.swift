import Foundation
import XCTest
@testable import DoveBevo

final class VenueBookmarkCaptureTests: XCTestCase {
    private let first = URL(string: "https://www.dovebevo.com/bar/n123?c=u0nd9")!
    private let second = URL(string: "https://www.dovebevo.com/bar/w456?c=u0nd8")!

    func testActualPublicNameIsSavedWithoutAFormOrTechnicalFallback() throws {
        let capture = VenueBookmarkCapture()
        let request = try XCTUnwrap(capture.begin(url: first))
        let venue = try capture.complete(request, value: snapshot(first, name: "  Caffè Centrale 🍹  "), currentUsableURL: first)
        XCTAssertEqual(venue.url, first)
        XCTAssertEqual(venue.label, "Caffè Centrale 🍹")
        XCTAssertFalse(capture.isPending)
        XCTAssertThrowsError(try capture.complete(request, value: snapshot(first), currentUsableURL: first), "A callback can be consumed only once")
    }

    func testNameBoundUsesUTF16AndNeverTruncatesOrInventsAName() throws {
        for name in ["A", String(repeating: "a", count: 120), String(repeating: "🍹", count: 60)] {
            let capture = VenueBookmarkCapture()
            let request = try XCTUnwrap(capture.begin(url: first))
            XCTAssertEqual(try capture.complete(request, value: snapshot(first, name: name), currentUsableURL: first).label, name)
        }
        for name in ["", " \u{2003} ", String(repeating: "a", count: 121), String(repeating: "🍹", count: 61),
                     "Bar\nNuovo", "Bar\tNuovo", "Bar\u{7f}", "Bar\u{85}", "Bar\u{0}", "Bar\u{fffd}"] {
            let capture = VenueBookmarkCapture()
            let request = try XCTUnwrap(capture.begin(url: first))
            XCTAssertThrowsError(try capture.complete(request, value: snapshot(first, name: name), currentUsableURL: first), name)
        }
    }

    func testChangedHrefSelectedKeyAndUnavailableCurrentPageAreRejected() throws {
        var values: [Any?] = [nil, "not a snapshot", ["href": first.absoluteString, "name": "Bar"],
                             ["href": first.absoluteString, "name": 42, "selectedKey": "n123"],
                             ["href": first.absoluteString, "name": "Bar", "selectedKey": "w456"],
                             ["href": first.absoluteString, "name": "Bar", "selectedKey": "n123", "extra": "not read"],
                             snapshot(second), snapshot(URL(string: "https://evil.example/bar/n123?c=u0nd9")!)]
        values.append(["href": "https://www.dovebevo.com/bar/n123?c=u0nd9&token=unwanted", "name": "Bar", "selectedKey": "n123"])
        for value in values {
            let capture = VenueBookmarkCapture()
            let request = try XCTUnwrap(capture.begin(url: first))
            XCTAssertThrowsError(try capture.complete(request, value: value, currentUsableURL: first))
            XCTAssertFalse(capture.isPending, "A rejected active result must allow an explicit retry")
        }
        for current in [nil, second, URL(string: "https://www.dovebevo.com/")] as [URL?] {
            let capture = VenueBookmarkCapture()
            let request = try XCTUnwrap(capture.begin(url: first))
            XCTAssertThrowsError(try capture.complete(request, value: snapshot(first), currentUsableURL: current))
        }
    }

    func testLeavingAndReturningToSameURLCannotReviveAnOldRead() throws {
        let capture = VenueBookmarkCapture()
        let old = try XCTUnwrap(capture.begin(url: first))
        capture.invalidate() // URL change, reload, Stop, recovery or native navigation.
        let current = try XCTUnwrap(capture.begin(url: first))
        XCTAssertThrowsError(try capture.complete(old, value: snapshot(first, name: "Vecchio"), currentUsableURL: first))
        XCTAssertTrue(capture.contains(current), "An obsolete completion cannot consume the replacement read")
        XCTAssertEqual(try capture.complete(current, value: snapshot(first, name: "Attuale"), currentUsableURL: first).label, "Attuale")
    }

    func testDelayedOldCompletionCannotWriteTheWrongVenueOrReplaceStoredData() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = SavedVenueStore(directoryURL: directory)
        try store.save(url: first, label: "Preferito precedente")
        let original = try Data(contentsOf: store.fileURL)
        let capture = VenueBookmarkCapture()
        let old = try XCTUnwrap(capture.begin(url: first))
        let delayedCompletion = { (value: Any?) throws in
            let venue = try capture.complete(old, value: value, currentUsableURL: self.second)
            try store.save(url: venue.url, label: venue.label)
        }
        capture.invalidate()
        let current = try XCTUnwrap(capture.begin(url: second))
        XCTAssertThrowsError(try delayedCompletion(snapshot(first, name: "Nome vecchio")))
        XCTAssertEqual(try Data(contentsOf: store.fileURL), original)
        let correct = try capture.complete(current, value: snapshot(second, name: "Secondo locale"), currentUsableURL: second)
        try store.save(url: correct.url, label: correct.label)
        XCTAssertEqual(try store.load().map(\.label), ["Secondo locale", "Preferito precedente"])
    }

    func testOnlyOneCaptureStartsUntilExplicitCompletionOrInvalidation() throws {
        let capture = VenueBookmarkCapture()
        XCTAssertNil(capture.begin(url: URL(string: "https://www.dovebevo.com/")!))
        let firstRequest = try XCTUnwrap(capture.begin(url: first))
        XCTAssertNil(capture.begin(url: first))
        XCTAssertNil(capture.begin(url: second))
        capture.invalidate()
        XCTAssertFalse(capture.contains(firstRequest))
        XCTAssertNotNil(capture.begin(url: second))
    }

    func testLegacyCustomAndDefaultLabelsRemainUnchangedIncludingLongEmojiLabels() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let oldEmoji = String(repeating: "🍹", count: 80)
        let original = try JSONSerialization.data(withJSONObject: [
            ["url": first.absoluteString, "label": "Locale n123"],
            ["url": second.absoluteString, "label": oldEmoji]
        ])
        let store = SavedVenueStore(directoryURL: directory)
        try original.write(to: store.fileURL)
        XCTAssertEqual(try store.load().map(\.label), ["Locale n123", oldEmoji])
        XCTAssertEqual(try Data(contentsOf: store.fileURL), original, "Reading does not rewrite old records")
        let capture = VenueBookmarkCapture()
        let request = try XCTUnwrap(capture.begin(url: first))
        let venue = try capture.complete(request, value: snapshot(first, name: "Nome pubblico attuale"), currentUsableURL: first)
        try store.save(url: venue.url, label: venue.label)
        XCTAssertEqual(try store.load().map(\.label), ["Nome pubblico attuale", oldEmoji])
    }

    private func snapshot(_ url: URL, name: String = "Bar Centrale") -> [String: Any] {
        ["href": url.absoluteString, "name": name, "selectedKey": url.lastPathComponent]
    }
}
