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
    func testOpeningFavoritesThenRemovingCannotBeUndoneByAnOlderSaveCompletion() throws {
        try withStore { store in
            let url = URL(string: "https://www.dovebevo.com/bar/n123?c=u0nd9")!
            try store.save(url: url, label: "Preferito precedente")
            let capture = VenueBookmarkCapture()
            let browser = BrowserViewController(savedVenues: store, bookmarkCapture: capture)
            let navigation = UINavigationController(rootViewController: browser)
            let request = try XCTUnwrap(capture.begin(url: url))
            XCTAssertTrue(capture.contains(request))
            // This is the actual More-menu action's presentation path. Keep
            // the navigation stack offscreen: no WebView or website is needed.
            browser.showSavedVenues()
            let list = try XCTUnwrap(navigation.topViewController as? SavedVenuesViewController)
            XCTAssertFalse(browser.isViewLoaded)
            XCTAssertFalse(capture.isPending)
            list.loadViewIfNeeded()
            list.tableView(list.tableView, commit: .delete, forRowAt: IndexPath(row: 0, section: 0))
            XCTAssertTrue(try store.load().isEmpty)
            let delayedCompletion = {
                let venue = try capture.complete(request, value: [
                    "href": url.absoluteString, "name": "Nome pubblico", "selectedKey": "n123"
                ], currentUsableURL: url)
                try store.save(url: venue.url, label: venue.label)
            }
            XCTAssertThrowsError(try delayedCompletion())
            XCTAssertTrue(try store.load().isEmpty, "The removed favorite must not be recreated by the old callback")
        }
    }

    @MainActor
    func testApplicationDeactivationRetiresDelayedSaveAcrossReactivation() throws {
        try withStore { store in
            let url = URL(string: "https://www.dovebevo.com/bar/n123?c=u0nd9")!
            try store.save(url: url, label: "Preferito precedente")
            let original = try Data(contentsOf: store.fileURL)
            let capture = VenueBookmarkCapture()
            let browser = BrowserViewController(savedVenues: store, bookmarkCapture: capture)
            let navigation = UINavigationController(rootViewController: browser)
            let center = NotificationCenter.default
            defer { center.post(name: UIApplication.didBecomeActiveNotification, object: UIApplication.shared) }
            // An unrelated scene notification must not retire this controller's
            // request. UIKit's real scene object is required for scene scoping.
            let unrelated = try XCTUnwrap(capture.begin(url: url))
            center.post(name: UIScene.willDeactivateNotification, object: NSObject())
            XCTAssertTrue(capture.contains(unrelated))
            capture.invalidate()
            for notification in [UIApplication.willResignActiveNotification, UIApplication.didEnterBackgroundNotification] {
                let request = try XCTUnwrap(capture.begin(url: url))
                XCTAssertTrue(capture.contains(request))
                // Exercise the actual NotificationCenter subscription, not a
                // test-only call into the capture's invalidate helper.
                center.post(name: notification, object: UIApplication.shared)
                XCTAssertFalse(capture.isPending)
                center.post(name: UIApplication.didBecomeActiveNotification, object: UIApplication.shared)
                let delayedCompletion = {
                    let venue = try capture.complete(request, value: [
                        "href": url.absoluteString, "name": "Risultato in ritardo", "selectedKey": "n123"
                    ], currentUsableURL: url)
                    try store.save(url: venue.url, label: venue.label)
                }
                XCTAssertThrowsError(try delayedCompletion())
                XCTAssertEqual(try Data(contentsOf: store.fileURL), original)
                XCTAssertTrue(navigation.topViewController === browser)
                XCTAssertNil(browser.presentedViewController)
                XCTAssertFalse(browser.isViewLoaded, "This native lifecycle test must not create a website")
            }
        }
    }

    private func withStore(_ action: (SavedVenueStore) throws -> Void) throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        try action(SavedVenueStore(directoryURL: root.appendingPathComponent("SavedVenues", isDirectory: true)))
    }
}
