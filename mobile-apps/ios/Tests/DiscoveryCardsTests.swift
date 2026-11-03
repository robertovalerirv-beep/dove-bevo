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
        XCTAssertEqual(DiscoveryCategorySummary(rows: [], loading: false, available: false).headline, "Prezzi non caricati")
        let partial = DiscoveryCategorySummary(rows: [], loading: false, partial: true)
        XCTAssertEqual(partial.headline, "Nessun prezzo nei dati caricati")
        XCTAssertTrue(partial.detail.contains("Zona parziale"))
    }

    func testLowestOldPriceShowsItsSourceDateAndAgeOnTheCard() throws {
        let price = FavouritePrice(drink: "spritz", band: .normal, cents: 600,
                                   observedOn: "2026-06-01", confirmations: 0, quarantined: false)
        let row = DiscoveryPresentedRow(key: "n123", name: "Owned fixture", url: try XCTUnwrap(URL(string: "https://www.dovebevo.com/bar/n123?c=u0nd9")),
                                        latitude: 45.46, longitude: 9.19, location: "Milano", price: .legacy(price))
        let summary = DiscoveryCategorySummary(rows: [row], loading: false, today: "2026-11-03")
        XCTAssertEqual(summary.headline, "Da 6,00 €")
        XCTAssertTrue(summary.detail.contains("Segnalato il 2026-06-01"))
        XCTAssertTrue(summary.detail.contains("Da ricontrollare"))
    }

    func testOwnerMenuSampleShowsItsExactItemSourceAndServingWithoutClaimingTotalCost() throws {
        let price = MenuV2Price(id: "owner-spritz", venueName: "Actual venue", itemName: "Spritz della casa",
            category: "spritz", band: .normal, amountMinor: 550, currency: "EUR", exponent: 2,
            servingLabel: "Calice", servingML: 200,
            origin: .ownerMenu(try XCTUnwrap(URL(string: "https://bar.example/menu")), "2026-11-02"),
            feeNotice: "Altre spese non verificate.")
        let row = DiscoveryPresentedRow(key: "n123", name: "Actual venue",
            url: try XCTUnwrap(URL(string: "https://www.dovebevo.com/bar/n123?c=u0nd9")),
            latitude: 45.46, longitude: 9.19, location: "Milano", price: .menuV2(price))
        XCTAssertEqual(row.price.amount, "5,50 €")
        XCTAssertTrue(row.price.groupLabel.contains("Calice · 200 ml"))
        XCTAssertTrue(row.price.details(today: "2026-11-03").contains("Spritz della casa"))
        XCTAssertTrue(row.price.details(today: "2026-11-03").contains("bar.example"))
        XCTAssertTrue(row.price.details(today: "2026-11-03").contains("Altre spese non verificate"))
        let summary = DiscoveryCategorySummary(rows: [row], loading: false, today: "2026-11-03")
        XCTAssertEqual(summary.headline, "Da 5,50 €")
        XCTAssertTrue(summary.detail.contains("Menu verificato il 2026-11-02"))
    }

    func testEqualGlassServingAcrossFeedsCanShowCheapestWithoutMixingCurrencyOrVolume() throws {
        let europe = EuropePrice(drink: "spritz", band: .normal, currency: "EUR", amountMinor: 600,
            serving: EuropeServing(unit: "glass", ml: 200), observedOn: nil, confirmedOn: nil,
            confirmations: 0, quarantined: false, revision: "fixture", sourceURL: nil,
            sourceSHA256: nil, sourceCheckedOn: "2026-11-02", menuItem: "Spritz")
        let menu = MenuV2Price(id: "menu-spritz", venueName: "Another venue", itemName: "Spritz",
            category: "spritz", band: .normal, amountMinor: 550, currency: "EUR", exponent: 2,
            servingLabel: "Calice", servingML: 200,
            origin: .ownerMenu(try XCTUnwrap(URL(string: "https://bar.example/menu")), "2026-11-02"),
            feeNotice: "Altre spese non verificate.")
        let url = try XCTUnwrap(URL(string: "https://www.dovebevo.com/bar/n123?c=u0nd9"))
        let rows = [
            DiscoveryPresentedRow(key: "n123", name: "First", url: url,
                latitude: 45.46, longitude: 9.19, location: "Milano", price: .europe(europe)),
            DiscoveryPresentedRow(key: "n124", name: "Second", url: url,
                latitude: 45.46, longitude: 9.19, location: "Milano", price: .menuV2(menu))
        ]
        XCTAssertEqual(rows[0].price.group, rows[1].price.group)
        XCTAssertEqual(DiscoveryCategorySummary(rows: rows, loading: false, today: "2026-11-03").headline, "Da 5,50 €")
        let different = MenuV2Price(id: "other", venueName: "Another venue", itemName: "Spritz",
            category: "spritz", band: .normal, amountMinor: 5, currency: "GBP", exponent: 0,
            servingLabel: "Calice", servingML: 300,
            origin: .ownerMenu(try XCTUnwrap(URL(string: "https://bar.example/menu")), "2026-11-02"),
            feeNotice: "Altre spese non verificate.")
        XCTAssertNotEqual(rows[0].price.group, NativeComparablePrice.menuV2(different).group)
    }

    @MainActor func testDrinkDropdownKeepsAllNineRealCategoriesAndSelectedIdentity() throws {
        let controller = DiscoveryViewController(activityCheck: { false }, onOpen: { _ in }, onMap: {})
        controller.loadViewIfNeeded()
        let selector = try XCTUnwrap(descendants(controller.view).compactMap { $0 as? UIButton }.first {
            $0.accessibilityIdentifier == "discovery.drinkSelector"
        })
        XCTAssertEqual(selector.accessibilityLabel, "Scegli cosa bere")
        XCTAssertEqual(selector.accessibilityValue, "Birra media")
        XCTAssertTrue(selector.showsMenuAsPrimaryAction)
        let initialOptions = selector.menu?.children.compactMap { $0 as? UIAction } ?? []
        XCTAssertEqual(initialOptions.map(\.title), DrinkCategory.all.map(\.name))
        XCTAssertEqual(initialOptions.filter { $0.state == .on }.map(\.title), ["Birra media"])
        controller.selectDrink("spritz")
        XCTAssertEqual(selector.accessibilityValue, "Spritz")
        let updatedOptions = selector.menu?.children.compactMap { $0 as? UIAction } ?? []
        XCTAssertEqual(updatedOptions.filter { $0.state == .on }.map(\.title), ["Spritz"])
        let size = selector.systemLayoutSizeFitting(CGSize(width: 320, height: 0),
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
