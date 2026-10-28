import UIKit
import XCTest
@testable import DoveBevo

final class FavouriteComparisonControllerTests: XCTestCase {
    @MainActor
    func testHiddenViewDoesNotLoadSavedListOrFetchAndNetworkNamesNeverRewriteFile() throws {
        try withStore { store in
            let saved = ComparisonFixtures.saved("n123")
            try store.save(url: saved.url, label: saved.label)
            let original = try Data(contentsOf: store.fileURL)
            let client = DelayedFavouriteService()
            let controller = SavedVenuesViewController(store: store, client: client, activityCheck: { true }) { _ in }
            controller.loadViewIfNeeded()
            XCTAssertEqual(controller.tableView(controller.tableView, numberOfRowsInSection: 0), 0)
            XCTAssertTrue(client.calls.isEmpty, "Loading a hidden tab must not read the network")
            appear(controller)
            XCTAssertEqual(client.calls.count, 1)
            try client.complete(0, snapshot(saved, name: "Nome attuale", prices: [price(.normal, 800)]))
            let cell = try row(controller)
            XCTAssertEqual(cell.accessibilityLabel, "Nome attuale")
            XCTAssertTrue(try XCTUnwrap(cell.accessibilityValue).contains("8,00 €"))
            XCTAssertTrue(try XCTUnwrap(cell.accessibilityValue).contains("2026-10-28"))
            XCTAssertEqual(try Data(contentsOf: store.fileURL), original)
        }
    }

    @MainActor
    func testSelectorsUseSameSnapshotWithoutRequestsAndNeverMixBands() throws {
        try withStore { store in
            let saved = ComparisonFixtures.saved("n123")
            try store.save(url: saved.url, label: saved.label)
            let client = DelayedFavouriteService()
            let controller = SavedVenuesViewController(store: store, client: client, activityCheck: { true }) { _ in }
            appear(controller)
            try client.complete(0, snapshot(saved, name: "Nome", prices: [price(.happyHour, 500)]))
            XCTAssertTrue(try XCTUnwrap(row(controller).accessibilityValue).contains("Nessun prezzo segnalato"))
            let band = try XCTUnwrap(descendants(controller.view).compactMap { $0 as? UIButton }.first { $0.accessibilityIdentifier == "favorites.band.happyHour" })
            XCTAssertGreaterThanOrEqual(band.bounds.height, 48)
            XCTAssertEqual(band.configuration?.titleLineBreakMode, .byWordWrapping)
            band.sendActions(for: .touchUpInside)
            XCTAssertTrue(band.accessibilityTraits.contains(.selected))
            XCTAssertTrue(try XCTUnwrap(row(controller).accessibilityValue).contains("5,00 €"))
            controller.selectDrink("spritz")
            XCTAssertTrue(try XCTUnwrap(row(controller).accessibilityValue).contains("Nessun prezzo segnalato"))
            XCTAssertEqual(client.calls.count, 1)
        }
    }

    @MainActor
    func testCoordinatorRetainsMapStackUntilFavouriteIntentThenPopsToSameBrowser() throws {
        try withStore { store in
            let saved = ComparisonFixtures.saved("n123")
            try store.save(url: saved.url, label: saved.label)
            let client = DelayedFavouriteService()
            var websiteLoads: [URL] = []
            let browser = BrowserViewController(savedVenues: store, websiteLoader: { _, request in
                if let url = request.url { websiteLoads.append(url) }
                return nil
            })
            let tabs = NativeTabsController(store: store, comparisonClient: client, browser: browser)
            tabs.loadViewIfNeeded()
            let browserView = browser.view
            XCTAssertEqual(websiteLoads, [URLPolicy.homeURL], "The owned loader must positively intercept the initial website request")
            XCTAssertTrue(client.calls.isEmpty, "A hidden favourites destination must not request comparisons")
            let recommendations = RecommendationsViewController(venue: saved, client: DelayedRecommendationClient(), activityCheck: { false })
            tabs.mapNavigation.pushViewController(recommendations, animated: false)
            let initialLoads = websiteLoads
            tabs.selectedIndex = 1; tabs.selectedIndex = 0
            XCTAssertTrue(tabs.mapNavigation.topViewController === recommendations, "Plain tab return preserves its existing stack")
            XCTAssertEqual(websiteLoads, initialLoads)
            tabs.selectedIndex = 1
            appear(tabs.favourites)
            tabs.favourites.tableView(tabs.favourites.tableView, didSelectRowAt: IndexPath(row: 0, section: 0))
            XCTAssertEqual(tabs.selectedIndex, 0)
            XCTAssertEqual(tabs.mapNavigation.viewControllers.count, 1)
            XCTAssertTrue(tabs.mapNavigation.topViewController === browser)
            XCTAssertTrue(browser.view === browserView)
            XCTAssertEqual(websiteLoads, [URLPolicy.homeURL, saved.url], "Opening the favourite must issue exactly its validated request through the owned loader")
            XCTAssertTrue(client.calls.isEmpty, "The offscreen owned coordinator fixture cannot start live comparisons")
        }
    }

    @MainActor
    func testRemovalRetiresLateResponseAndCannotResurrectOrRewriteRemovedRow() throws {
        try withStore { store in
            let saved = ComparisonFixtures.saved("n123")
            try store.save(url: saved.url, label: saved.label)
            let client = DelayedFavouriteService()
            let controller = SavedVenuesViewController(store: store, client: client, activityCheck: { true }) { _ in }
            appear(controller)
            controller.tableView(controller.tableView, commit: .delete, forRowAt: IndexPath(row: 0, section: 0))
            let removed = try Data(contentsOf: store.fileURL)
            XCTAssertTrue(try client.call(0).request.cancelled)
            try client.complete(0, snapshot(saved, name: "Obsoleto", prices: [price(.normal, 800)]))
            XCTAssertEqual(controller.tableView(controller.tableView, numberOfRowsInSection: 0), 0)
            XCTAssertTrue(try store.load().isEmpty)
            XCTAssertEqual(try Data(contentsOf: store.fileURL), removed)
        }
    }

    @MainActor
    func testBackgroundAndRefreshGenerationRejectOldResultsAndUnavailableIsNotZero() throws {
        try withStore { store in
            let saved = ComparisonFixtures.saved("n123")
            try store.save(url: saved.url, label: saved.label)
            let client = DelayedFavouriteService()
            let controller = SavedVenuesViewController(store: store, client: client, activityCheck: { true }) { _ in }
            appear(controller)
            controller.refresh()
            XCTAssertTrue(try client.call(0).request.cancelled)
            try client.complete(0, snapshot(saved, name: "Vecchio", prices: [price(.normal, 500)]))
            XCTAssertEqual(try row(controller).accessibilityLabel, saved.label)
            NotificationCenter.default.post(name: UIApplication.willResignActiveNotification, object: UIApplication.shared)
            XCTAssertTrue(try client.call(1).request.cancelled)
            NotificationCenter.default.post(name: UIApplication.didBecomeActiveNotification, object: UIApplication.shared)
            XCTAssertEqual(client.calls.count, 3)
            try client.complete(1, snapshot(saved, name: "Ancora vecchio", prices: []))
            try client.complete(2, FavouriteComparisonSnapshot(venues: [:], unavailable: [saved.url]))
            let value = try XCTUnwrap(row(controller).accessibilityValue)
            XCTAssertTrue(value.contains("Prezzo non disponibile"))
            XCTAssertFalse(value.contains("0,00"))
            controller.beginAppearanceTransition(false, animated: false); controller.endAppearanceTransition()
        }
    }

    @MainActor
    private func appear(_ controller: UIViewController) {
        controller.loadViewIfNeeded(); controller.view.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
        controller.beginAppearanceTransition(true, animated: false); controller.endAppearanceTransition()
        controller.view.layoutIfNeeded()
    }
    @MainActor
    private func row(_ controller: SavedVenuesViewController) throws -> UITableViewCell {
        controller.view.layoutIfNeeded()
        return try XCTUnwrap(controller.tableView.cellForRow(at: IndexPath(row: 0, section: 0)))
    }
    @MainActor
    private func descendants(_ view: UIView) -> [UIView] { view.subviews + view.subviews.flatMap { descendants($0) } }
    private func price(_ band: ComparisonBand, _ cents: Int) -> FavouritePrice {
        FavouritePrice(drink: "beer_draft", band: band, cents: cents, observedOn: "2026-10-28", confirmations: 1, quarantined: false)
    }
    private func snapshot(_ saved: SavedVenue, name: String, prices: [FavouritePrice]) -> FavouriteComparisonSnapshot {
        FavouriteComparisonSnapshot(venues: [saved.url: CurrentFavouriteVenue(key: saved.url.lastPathComponent, name: name, prices: prices)], unavailable: [])
    }
    private func withStore(_ action: (SavedVenueStore) throws -> Void) throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        try action(SavedVenueStore(directoryURL: directory))
    }
}

final class DelayedFavouriteService: FavouriteComparisonServing {
    struct Call { let request: TestRecommendationRequest; let completion: (FavouriteComparisonSnapshot) -> Void }
    var calls: [Call] = []
    func load(_ saved: [SavedVenue], completion: @escaping (FavouriteComparisonSnapshot) -> Void) -> RecommendationRequest {
        let request = TestRecommendationRequest(); calls.append(Call(request: request, completion: completion)); return request
    }
    func call(_ index: Int, file: StaticString = #filePath, line: UInt = #line) throws -> Call {
        try XCTUnwrap(calls.indices.contains(index) ? calls[index] : nil, "Expected favourite refresh \(index)", file: file, line: line)
    }
    func complete(_ index: Int, _ value: FavouriteComparisonSnapshot) throws { try call(index).completion(value) }
}
