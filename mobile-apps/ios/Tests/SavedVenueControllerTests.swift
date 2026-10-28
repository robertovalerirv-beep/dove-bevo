import UIKit
import XCTest
@testable import DoveBevo

final class SavedVenueControllerTests: XCTestCase {
    @MainActor
    func testNativeListOpensCanonicalLinkAndDeletionSurvivesReload() throws {
        try withStore { store in
            let venue = URL(string: "https://www.dovebevo.com/bar/n123?c=u0nd9")!
            try store.save(url: venue, label: "Il mio bar")
            var opened: URL?
            let controller = SavedVenuesViewController(store: store) { opened = $0 }
            controller.loadViewIfNeeded()
            controller.view.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
            controller.tableView.layoutIfNeeded()
            let row = IndexPath(row: 0, section: 0)
            XCTAssertEqual(controller.tableView.numberOfRows(inSection: 0), 1)
            let cell = try XCTUnwrap(controller.tableView.cellForRow(at: row))
            XCTAssertEqual(cell.accessibilityLabel, "Il mio bar")
            controller.tableView(controller.tableView, didSelectRowAt: row)
            XCTAssertEqual(opened, venue)
            controller.tableView(controller.tableView, commit: .delete, forRowAt: row)
            XCTAssertEqual(controller.tableView(controller.tableView, numberOfRowsInSection: 0), 0)
            XCTAssertTrue(try store.load().isEmpty)
            let reloaded = SavedVenuesViewController(store: store) { _ in XCTFail("No automatic navigation") }
            reloaded.loadViewIfNeeded()
            XCTAssertEqual(reloaded.tableView(reloaded.tableView, numberOfRowsInSection: 0), 0)
        }
    }

    @MainActor
    func testCancelNativeSaveFormNeverWritesOrInvokesSuccess() throws {
        try withStore { store in
            let venue = URL(string: "https://www.dovebevo.com/bar/n123?c=u0nd9")!
            try store.save(url: venue, label: "Prima")
            let previous = try Data(contentsOf: store.fileURL)
            let root = UIViewController()
            let navigation = UINavigationController(rootViewController: root)
            var saves = 0
            let form = SaveVenueViewController(url: venue, store: store) { saves += 1 }
            navigation.pushViewController(form, animated: false)
            form.loadViewIfNeeded()
            let field = try XCTUnwrap(find(UITextField.self, identifier: "savedVenue.name", in: form.view))
            field.text = "Non salvare"
            try activate(form.navigationItem.leftBarButtonItem)
            XCTAssertTrue(navigation.topViewController === root)
            XCTAssertEqual(saves, 0)
            XCTAssertEqual(try Data(contentsOf: store.fileURL), previous)
        }
    }

    @MainActor
    func testNativeSaveValidatesBeforePersistenceAndKeepsEntryForRetry() throws {
        try withStore { store in
            let venue = URL(string: "https://www.dovebevo.com/bar/n123?c=u0nd9")!
            var saves = 0
            let form = SaveVenueViewController(url: venue, store: store) { saves += 1 }
            form.loadViewIfNeeded()
            let field = try XCTUnwrap(find(UITextField.self, identifier: "savedVenue.name", in: form.view))
            let error = try XCTUnwrap(find(UILabel.self, identifier: "savedVenue.error", in: form.view))
            field.text = String(repeating: "a", count: 81)
            try activate(form.navigationItem.rightBarButtonItem)
            XCTAssertEqual(saves, 0)
            XCTAssertFalse(error.isHidden)
            XCTAssertEqual(field.text, String(repeating: "a", count: 81), "Keep the user's entry to correct")
            XCTAssertFalse(FileManager.default.fileExists(atPath: store.fileURL.path))
            field.text = "Nuovo bar 🍹"
            try activate(form.navigationItem.rightBarButtonItem)
            try activate(form.navigationItem.rightBarButtonItem, requireDelivery: false)
            XCTAssertEqual(saves, 1)
            XCTAssertEqual(try store.load().map(\.label), ["Nuovo bar 🍹"])
        }
    }

    @MainActor
    func testStorageFailureDoesNotCallNativeSuccessOrLoseTheName() throws {
        try withStore { store in
            let blocked = store.fileURL.deletingLastPathComponent()
            try FileManager.default.createDirectory(at: blocked.deletingLastPathComponent(), withIntermediateDirectories: true)
            try Data("This fixture blocks creating the storage directory".utf8).write(to: blocked)
            var saves = 0
            let form = SaveVenueViewController(url: URL(string: "https://www.dovebevo.com/bar/n123?c=u0nd9")!, store: store) { saves += 1 }
            form.loadViewIfNeeded()
            let field = try XCTUnwrap(find(UITextField.self, identifier: "savedVenue.name", in: form.view))
            let error = try XCTUnwrap(find(UILabel.self, identifier: "savedVenue.error", in: form.view))
            field.text = "Da riprovare"
            try activate(form.navigationItem.rightBarButtonItem)
            XCTAssertEqual(saves, 0)
            XCTAssertFalse(error.isHidden)
            XCTAssertEqual(field.text, "Da riprovare")
            XCTAssertEqual(try String(contentsOf: blocked, encoding: .utf8), "This fixture blocks creating the storage directory")
        }
    }

    @MainActor
    private func activate(_ item: UIBarButtonItem?, requireDelivery: Bool = true) throws {
        let item = try XCTUnwrap(item)
        let action = try XCTUnwrap(item.action)
        let delivered = UIApplication.shared.sendAction(action, to: item.target, from: item, for: nil)
        if requireDelivery { XCTAssertTrue(delivered) }
    }

    @MainActor
    private func find<T: UIView>(_ type: T.Type, identifier: String, in view: UIView) -> T? {
        if let result = view as? T, result.accessibilityIdentifier == identifier { return result }
        return view.subviews.lazy.compactMap { self.find(type, identifier: identifier, in: $0) }.first
    }

    private func withStore(_ action: (SavedVenueStore) throws -> Void) throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        try action(SavedVenueStore(directoryURL: root.appendingPathComponent("SavedVenues", isDirectory: true)))
    }
}
