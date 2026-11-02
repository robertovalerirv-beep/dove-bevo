import UIKit
import XCTest
@testable import DoveBevo

final class DiscoveryCardsTests: XCTestCase {
    func testCategorySummaryNeverRanksDifferentCurrencyOrServingTogether() throws {
        let catalog = try EuropeFixtures.catalog()
        let london = try EuropeJSON.resolve(EuropeFixtures.cell("gcpvj"), catalog: catalog, cell: "gcpvj", today: "2026-11-02")
        let paris = try EuropeJSON.resolve(EuropeFixtures.cell("u09tv"), catalog: catalog, cell: "u09tv", today: "2026-11-02")
        let area = try XCTUnwrap(DiscoveryArea(latitude: 51.5074, longitude: -0.1278, zoom: 14))
        let snapshot = DiscoverySnapshot(area: area, venues: [], unavailableCells: [],
            europe: EuropeSnapshot(venues: london.venues.merging(paris.venues) { first, _ in first }))
        let beer = snapshot.displayRows(drink: "beer_draft", band: .normal)
        XCTAssertEqual(beer.count, 3)
        let mixed = DiscoveryCategorySummary(rows: beer, loading: false)
        XCTAssertEqual(mixed.headline, "3 prezzi")
        XCTAssertEqual(mixed.detail, "Valute o formati diversi")
        XCTAssertFalse(mixed.headline.contains("Da"))
        let pint = try XCTUnwrap(beer.first { $0.price.group == "GBP|ml:500" })
        let same = DiscoveryCategorySummary(rows: [pint], loading: false)
        XCTAssertEqual(same.headline, "Da 6,50 £")
        XCTAssertTrue(same.detail.contains("GBP")); XCTAssertTrue(same.detail.contains("500 ml"))
        XCTAssertEqual(DiscoveryCategorySummary(rows: beer, loading: true).headline, "Caricamento…")
        XCTAssertEqual(DiscoveryCategorySummary(rows: [], loading: false).headline, "Nessun prezzo")
    }

    @MainActor func testPhotographicFiltersKeepAllNineRealCategoriesAndSelectedIdentity() throws {
        let controller = DiscoveryViewController(activityCheck: { false }, onOpen: { _ in }, onMap: {})
        controller.loadViewIfNeeded()
        let cards = descendants(controller.view).compactMap { $0 as? DiscoveryCategoryButton }
        XCTAssertEqual(cards.count, 9)
        XCTAssertEqual(Set(cards.compactMap(\.accessibilityIdentifier)), Set(DrinkCategory.all.map { "discovery.drink.\($0.code)" }))
        let spritz = try XCTUnwrap(cards.first { $0.accessibilityIdentifier == "discovery.drink.spritz" })
        XCTAssertTrue(spritz.isSelected)
        XCTAssertTrue(descendants(spritz).compactMap { $0 as? UIImageView }.contains { $0.image != nil })
        XCTAssertTrue(spritz.accessibilityValue?.contains("Immagine illustrativa") == true)
        let beer = try XCTUnwrap(cards.first { $0.accessibilityIdentifier == "discovery.drink.beer_draft" })
        beer.sendActions(for: .touchUpInside)
        XCTAssertTrue(beer.isSelected); XCTAssertFalse(spritz.isSelected)
        let size = beer.systemLayoutSizeFitting(CGSize(width: 132, height: 0),
            withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel)
        XCTAssertGreaterThanOrEqual(size.height, 48)
    }

    @MainActor func testCompactRowRetainsExactPoundsServingMenuEvidenceAndLargeText() throws {
        let catalog = try EuropeFixtures.catalog()
        let london = try EuropeJSON.resolve(EuropeFixtures.cell("gcpvj"), catalog: catalog, cell: "gcpvj", today: "2026-11-02")
        let price = try XCTUnwrap(london.venues["n1001"]?.prices.first { $0.serving.ml == 500 })
        let row = DiscoveryPresentedRow(key: "n1001", name: "Actual London venue", url: ComparisonFixtures.saved("n1001", cell: "gcpvj").url,
            latitude: 51.5074, longitude: -0.1278, location: "London", price: .europe(price))
        let cell = DiscoveryVenueCell(style: .default, reuseIdentifier: nil)
        cell.configure(row: row, category: DrinkCategory.all[0], band: .normal, rank: 1, distance: "100 m", today: "2026-11-02",
            traits: UITraitCollection(preferredContentSizeCategory: .accessibilityExtraExtraExtraLarge))
        let text = descendants(cell).compactMap { ($0 as? UILabel)?.text }.joined(separator: "\n")
        for expected in ["Actual London venue", "6,50 £", "500 ml", "GBP", "Fonte verificata il 2026-11-01", "Menu item", "100 m dal centro mappa"] {
            XCTAssertTrue(text.contains(expected), expected)
        }
        XCTAssertFalse(text.contains("€")); XCTAssertFalse(text.contains("Segnalato il"))
        let size = cell.contentView.systemLayoutSizeFitting(CGSize(width: 320, height: 0),
            withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel)
        XCTAssertGreaterThanOrEqual(size.height, 48)
        XCTAssertLessThan(size.height, 1800, "Large text grows vertically rather than truncating price evidence")
        XCTAssertTrue(cell.accessibilityValue?.contains("1 nel formato GBP") == true)
    }

    @MainActor private func descendants(_ view: UIView) -> [UIView] { view.subviews.flatMap { [$0] + descendants($0) } }
}
