import UIKit
import XCTest
@testable import DoveBevo

final class SavedEuropeDrinkTests: XCTestCase {
    private let venue = SavedVenue(url: URL(string: "https://www.dovebevo.com/bar/n1001?c=gcpvj")!, label: "London fixture")

    func testExactPrivateItemsKeepBandCurrencyAndServingWithoutCachingAmount() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = SavedEuropeDrinkStore(directoryURL: root)
        let small = try XCTUnwrap(SavedEuropeDrink.validated(venue: venue, drink: "beer_draft", band: .normal,
                currency: "GBP", serving: EuropeServing(unit: "ml", ml: 250)))
        let large = try XCTUnwrap(SavedEuropeDrink.validated(venue: venue, drink: "beer_draft", band: .normal,
                currency: "GBP", serving: EuropeServing(unit: "ml", ml: 500)))
        let happy = try XCTUnwrap(SavedEuropeDrink.validated(venue: venue, drink: "beer_draft", band: .happyHour,
                currency: "GBP", serving: EuropeServing(unit: "ml", ml: 250)))
        XCTAssertEqual(Set([small.identity, large.identity, happy.identity]).count, 3)
        try store.save(small); try store.save(large); try store.save(happy)
        XCTAssertEqual(try store.load(), [happy, large, small])
        let bytes = try String(contentsOf: store.fileURL, encoding: .utf8)
        XCTAssertTrue(bytes.contains("\"currency\":\"GBP\""))
        XCTAssertTrue(bytes.contains("\"serving\":\"ml:250\""))
        XCTAssertFalse(bytes.contains("amount"), "Only the exact preference is private; prices are re-read live")
        try store.remove(large)
        XCTAssertEqual(try store.load(), [happy, small])
    }

    func testRejectsWrongServingCurrencyAndCorruptedPrivateRecord() throws {
        XCTAssertNil(SavedEuropeDrink.serving(from: "ml:", drink: "beer_draft"))
        XCTAssertNil(SavedEuropeDrink.serving(from: "glass:150", drink: "beer_draft"))
        XCTAssertNil(SavedEuropeDrink.serving(from: "ml:0500", drink: "beer_draft"))
        XCTAssertNil(SavedEuropeDrink.serving(from: "drink:500", drink: "spritz"))
        XCTAssertEqual(SavedEuropeDrink.serving(from: "glass:", drink: "wine_glass"), EuropeServing(unit: "glass", ml: nil))
        XCTAssertNil(SavedEuropeDrink.validated(venue: venue, drink: "spritz", band: .normal,
                currency: "USD", serving: EuropeServing(unit: "drink", ml: nil)))
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = SavedEuropeDrinkStore(directoryURL: root)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let forged: [String: Any] = ["version": 1, "items": [["url": venue.url.absoluteString, "label": venue.label,
            "drink": "beer_draft", "hh": 0, "currency": "EUR", "serving": "drink:"]]]
        try JSONSerialization.data(withJSONObject: forged).write(to: store.fileURL)
        XCTAssertThrowsError(try store.load())
    }

    @MainActor func testFavouriteShowsExactCurrentPriceAndUnavailableStateWithoutChangingPrivateItem() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let saved = try XCTUnwrap(SavedEuropeDrink.validated(venue: venue, drink: "beer_draft", band: .normal,
            currency: "GBP", serving: EuropeServing(unit: "ml", ml: 500)))
        let store = SavedEuropeDrinkStore(directoryURL: root.appendingPathComponent("drinks"))
        try store.save(saved)
        let original = try Data(contentsOf: store.fileURL)
        let catalog = try EuropeFixtures.catalog()
        let cell = try EuropeJSON.resolve(EuropeFixtures.cell("gcpvj"), catalog: catalog, cell: "gcpvj", today: "2026-11-02")
        let fixture = EuropeFavouriteRead(snapshot: FavouriteComparisonSnapshot(venues: [:], unavailable: [], europe: EuropeSnapshot(venues: cell.venues)))
        var opened: URL?
        let controller = SavedVenuesViewController(store: SavedVenueStore(directoryURL: root.appendingPathComponent("venues")),
            drinkStore: SavedDrinkStore(directoryURL: root.appendingPathComponent("legacy-drinks")),
            europeDrinkStore: store, client: fixture, activityCheck: { true }) { opened = $0 }
        controller.loadViewIfNeeded(); controller.beginAppearanceTransition(true, animated: false); controller.endAppearanceTransition()
        let index = IndexPath(row: 0, section: 0)
        XCTAssertEqual(controller.tableView.numberOfRows(inSection: 0), 1)
        let row = controller.tableView(controller.tableView, cellForRowAt: index)
        XCTAssertTrue(row.accessibilityValue?.contains("6,50 £") == true)
        XCTAssertTrue(row.accessibilityValue?.contains("500 ml") == true)
        XCTAssertFalse(row.accessibilityValue?.contains("3,50 £") == true)
        controller.tableView(controller.tableView, didSelectRowAt: index)
        XCTAssertEqual(opened, venue.url)
        XCTAssertEqual(try Data(contentsOf: store.fileURL), original)
        fixture.snapshot = FavouriteComparisonSnapshot(venues: [:], unavailable: [venue.url], europe: EuropeSnapshot())
        controller.refresh()
        let missing = controller.tableView(controller.tableView, cellForRowAt: index)
        XCTAssertTrue(missing.accessibilityValue?.contains("Prezzo non disponibile ora") == true)
        XCTAssertFalse(missing.accessibilityValue?.contains("6,50 £") == true)
        XCTAssertEqual(try Data(contentsOf: store.fileURL), original)
        controller.beginAppearanceTransition(false, animated: false); controller.endAppearanceTransition()
    }
}

private final class EuropeFavouriteRead: FavouriteComparisonServing {
    var snapshot: FavouriteComparisonSnapshot
    init(snapshot: FavouriteComparisonSnapshot) { self.snapshot = snapshot }
    func load(_ saved: [SavedVenue], completion: @escaping (FavouriteComparisonSnapshot) -> Void) -> RecommendationRequest {
        completion(snapshot); return TestRecommendationRequest()
    }
}
