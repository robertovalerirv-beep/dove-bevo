import UIKit
import WebKit
import XCTest
@testable import DoveBevo

final class DiscoveryControllerTests: XCTestCase {
    @MainActor func testReferenceDiscoveryPrivateFixtureRendersDrinkSelectorAndRealRows() throws {
        let (controller, mounted) = try referenceFixture(category: .large)
        defer { mounted.close() }
        let selector = try XCTUnwrap(descendants(controller.view).compactMap { $0 as? UIButton }.first {
            $0.accessibilityIdentifier == "discovery.drinkSelector"
        })
        XCTAssertGreaterThanOrEqual(selector.bounds.height, 48)
        XCTAssertEqual(selector.accessibilityValue, "Spritz")
        XCTAssertNotNil(selector.menu)
        XCTAssertEqual(selector.menu?.children.count, DrinkCategory.all.count)
        XCTAssertTrue(descendants(controller.view).compactMap { $0 as? DiscoveryCategoryButton }.isEmpty,
                      "Drink selection belongs only in the dropdown")
        controller.selectDrink("beer_draft")
        XCTAssertEqual(controller.tableView.numberOfRows(inSection: 0), 0)
        controller.selectDrink("spritz")
        XCTAssertEqual(controller.tableView.numberOfRows(inSection: 0), 3)
        let first = try XCTUnwrap(controller.tableView.cellForRow(at: IndexPath(row: 0, section: 0)))
        XCTAssertTrue(first.window === mounted.window)
        XCTAssertGreaterThanOrEqual(first.bounds.height, 48)
        XCTAssertLessThanOrEqual(first.bounds.height, 115, "Full-width evidence must not turn simple rows into large cards")
        XCTAssertTrue(first.accessibilityValue?.contains("5,50 €") == true)
        mounted.attach(to: self, name: "Scopri-populated")
    }

    @MainActor func testFeaturedCardsAreRealSelectedDrinkRowsAndOpenTheirVenues() throws {
        var opened: URL?
        let (controller, mounted) = try referenceFixture(category: .large, onOpen: { opened = $0 })
        defer { mounted.close() }
        let cards = descendants(controller.view).compactMap { $0 as? DiscoveryFeaturedCard }
        XCTAssertEqual(cards.count, 3)
        let strip = try XCTUnwrap(descendants(controller.view).compactMap { $0 as? DiscoveryFeaturedStrip }.first)
        let first = try XCTUnwrap(cards.first)
        XCTAssertTrue(first.window === mounted.window)
        XCTAssertTrue(descendants(controller.view).compactMap { ($0 as? UILabel)?.text }
            .contains("Immagini illustrative dei drink, non foto dei locali"),
            "The page must visibly disclose that drink artwork is illustrative")
        XCTAssertLessThanOrEqual(strip.bounds.height, 260, "Featured prices should not fill most of the Discover screen")
        XCTAssertLessThanOrEqual(first.bounds.width, 176)
        XCTAssertLessThanOrEqual(cards[1].frame.maxX, strip.bounds.width + 1,
                                 "Two complete prices should fit before horizontal scrolling on a regular iPhone")
        for label in descendants(first).compactMap({ $0 as? UILabel }).filter({ !($0.text ?? "").isEmpty }) {
            let needed = label.sizeThatFits(CGSize(width: label.bounds.width, height: .greatestFiniteMagnitude)).height
            XCTAssertLessThanOrEqual(needed, label.bounds.height + 1, label.text ?? "")
        }
        XCTAssertEqual(first.accessibilityIdentifier, "discovery.featured.n901")
        XCTAssertTrue(first.accessibilityLabel?.contains("Locale fixture A") == true)
        XCTAssertTrue(first.accessibilityValue?.contains("5,50 €") == true)
        XCTAssertTrue(first.accessibilityValue?.contains("Formato non dichiarato") == true)
        first.sendActions(for: .touchUpInside)
        XCTAssertEqual(opened, URL(string: "https://www.dovebevo.com/bar/n901?c=u0nd9"))
        XCTAssertEqual(controller.tableView.numberOfRows(inSection: 0), 3, "The complete ranked list remains below the visual sample")
        controller.selectDrink("beer_draft")
        XCTAssertTrue(descendants(controller.view).compactMap { $0 as? DiscoveryFeaturedCard }.isEmpty)
        XCTAssertEqual(controller.tableView.numberOfRows(inSection: 0), 0)
    }

    @MainActor func testCompactDiscoverHeaderShowsPricesBeforeArtworkDisclosureWithoutLosingFilters() throws {
        let (controller, mounted) = try referenceFixture(category: .large)
        defer { mounted.close() }
        let header = try XCTUnwrap(controller.tableView.tableHeaderView)
        let stack = try XCTUnwrap(header.subviews.compactMap { $0 as? UIStackView }.first)
        let city = try XCTUnwrap(descendants(header).compactMap { $0 as? UIButton }.first {
            $0.accessibilityIdentifier == "discovery.citySelector"
        })
        let drink = try XCTUnwrap(descendants(header).compactMap { $0 as? UIButton }.first {
            $0.accessibilityIdentifier == "discovery.drinkSelector"
        })
        let band = try XCTUnwrap(descendants(header).first { $0.accessibilityIdentifier == "discovery.band" })
        let featured = try XCTUnwrap(descendants(header).compactMap { $0 as? DiscoveryFeaturedStrip }.first)
        let artworkNote = try XCTUnwrap(descendants(header).compactMap { $0 as? UILabel }.first {
            $0.text == "Immagini illustrative dei drink, non foto dei locali"
        })
        XCTAssertEqual(stack.arrangedSubviews.count, 7, "Selected values replace repeated city, drink and band headings")
        XCTAssertEqual(city.accessibilityLabel, "Scegli città")
        XCTAssertEqual(drink.accessibilityLabel, "Scegli cosa bere")
        XCTAssertEqual(band.accessibilityLabel, "Fascia di prezzo")
        for control in [city, drink, band] { XCTAssertGreaterThanOrEqual(control.bounds.height, 48) }
        XCTAssertLessThan(featured.frame.minY, 260, "Featured prices should start near the filters")
        XCTAssertGreaterThan(artworkNote.frame.minY, featured.frame.minY,
                             "The artwork caveat remains visible below the real price preview")
        XCTAssertFalse(artworkNote.isHidden)
    }

    @MainActor func testSelectedMenuSampleIsDisclosedAboveRealPriceCards() throws {
        let client = DelayedDiscoveryService()
        let controller = DiscoveryViewController(client: client, activityCheck: { true }, onOpen: { _ in }, onMap: {})
        let area = try XCTUnwrap(DiscoveryArea(latitude: 45.4642, longitude: 9.19, zoom: 14))
        controller.setArea(area)
        controller.selectDrink("spritz")
        let mounted = try OwnedReferenceWindow(root: UINavigationController(rootViewController: controller), category: .large)
        defer { mounted.close() }
        let requested = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in client.calls.count == 1 }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [requested], timeout: 5), .completed)
        guard client.calls.count == 1 else { throw ComparisonReadError.unavailable }
        let price = MenuV2Price(id: "sample", venueName: "Locale vero", itemName: "Spritz",
            category: "spritz", band: .normal, amountMinor: 550, currency: "EUR", exponent: 2,
            servingLabel: "Calice", servingML: 200,
            origin: .ownerMenu(try XCTUnwrap(URL(string: "https://bar.example/menu")), "2026-11-01"),
            feeNotice: "Altre spese del locale non verificate.")
        let menuVenue = MenuV2CellVenue(key: "n123", cell: "u0nd9", name: "Locale vero",
            latitude: 45.4642, longitude: 9.19, address: "Via A", city: "Milano",
            matchingOfferCount: 1, samples: [price])
        var snapshot = DiscoverySnapshot(area: area, venues: [], unavailableCells: [])
        snapshot.menu = ["n123": menuVenue]
        client.complete(0, snapshot)
        mounted.layout()
        let status = try XCTUnwrap(descendants(controller.view).compactMap { $0 as? UILabel }.first {
            $0.accessibilityIdentifier == "discovery.loaded"
        })
        let strip = try XCTUnwrap(descendants(controller.view).compactMap { $0 as? DiscoveryFeaturedStrip }.first)
        XCTAssertTrue(status.text?.contains("prezzi da menu: selezione") == true)
        XCTAssertLessThan(status.frame.maxY, strip.frame.minY)
        XCTAssertEqual(descendants(controller.view).compactMap { $0 as? DiscoveryFeaturedCard }.count, 1)
    }

    @MainActor func testMenuPriceShowsStalenessAndSeparateFeeScopeBesidePrice() throws {
        let fee = "Spese separate: Coperto 2,50 € / persona (tutti gli ordini). Altre spese del locale non verificate."
        let price = MenuV2Price(id: "fixture", venueName: "Locale vero", itemName: "Spritz",
            category: "spritz", band: .normal, amountMinor: 550, currency: "EUR", exponent: 2,
            servingLabel: "Calice", servingML: 200,
            origin: .ownerMenu(try XCTUnwrap(URL(string: "https://bar.example/menu")), "2026-06-01"),
            feeNotice: fee)
        let row = DiscoveryPresentedRow(key: "n123", name: "Locale vero",
            url: try XCTUnwrap(URL(string: "https://www.dovebevo.com/bar/n123?c=u0nd9")),
            latitude: 45.46, longitude: 9.19, location: "Milano", price: .menuV2(price))
        let drink = try XCTUnwrap(DrinkCategory.all.first { $0.code == "spritz" })
        let card = DiscoveryFeaturedCard(row: row, category: drink, today: "2026-11-11")
        let cardText = descendants(card).compactMap { ($0 as? UILabel)?.text }.joined(separator: " ")
        XCTAssertTrue(cardText.contains("5,50 €"))
        XCTAssertTrue(cardText.contains("Menu da riverificare"))
        XCTAssertTrue(cardText.contains("Spese separate indicate dal menu"))
        XCTAssertTrue(cardText.contains("Altre spese non verificate"))
        XCTAssertTrue(card.accessibilityValue?.contains(fee) == true)
        let venue = DiscoveryVenueCell(style: .default, reuseIdentifier: nil)
        venue.configure(row: row, category: drink, band: .normal, rank: 1, distance: "300 m",
                        today: "2026-11-11", traits: .current)
        let venueText = descendants(venue).compactMap { ($0 as? UILabel)?.text }.joined(separator: " ")
        XCTAssertTrue(venueText.contains(fee), "The ranked row must retain the exact separate fee")
        XCTAssertTrue(venueText.contains("Menu da riverificare"))
        var conditional = price
        conditional.condition = "Dopo le 20"
        XCTAssertTrue(DiscoveryPriceCaveat.visible(for: .menuV2(conditional))?.contains("Condizioni: Dopo le 20") == true)
        XCTAssertTrue(DiscoveryPriceCaveat.full(for: .menuV2(conditional))?.contains(fee) == true)
    }

    @MainActor func testSixFiftySixEightFiveFiftyRiseWithinEuroAcrossServingsWithStableTies() throws {
        let area = try XCTUnwrap(DiscoveryArea(latitude: 45.4642, longitude: 9.19, zoom: 14))
        let menuURL = try XCTUnwrap(URL(string: "https://bar.example/menu"))
        func row(_ key: String, _ price: NativeComparablePrice) -> DiscoveryPresentedRow {
            DiscoveryPresentedRow(key: key, name: "Bar", url: URL(string: "https://www.dovebevo.com/bar/\(key)?c=u0nd9")!,
                                  latitude: 45.4642, longitude: 9.19, location: "Milano", price: price)
        }
        func menu(_ id: String, amount: Int = 600, exponent: Int = 2) -> MenuV2Price {
            MenuV2Price(id: id, venueName: "Bar", itemName: "Spritz", category: "spritz", band: .normal,
                        amountMinor: amount, currency: "EUR", exponent: exponent, servingLabel: "Calice", servingML: 200,
                        origin: .ownerMenu(menuURL, "2026-11-01"), feeNotice: "Altre spese non verificate.")
        }
        func europe(_ amount: Int, currency: String, serving: EuropeServing = EuropeServing(unit: "glass", ml: 200)) -> EuropePrice {
            EuropePrice(drink: "spritz", band: .normal, currency: currency, amountMinor: amount,
                        serving: serving, observedOn: "2026-11-01",
                        confirmedOn: nil, confirmations: 0, quarantined: false, revision: "fixture",
                        sourceURL: nil, sourceSHA256: nil, sourceCheckedOn: nil, menuItem: nil)
        }
        let sixFifty = row("n101", .europe(europe(650, currency: "EUR")))
        let six = row("n102", .menuV2(menu("a")))
        let sixFiftyOneDigit = row("n106", .menuV2(menu("exp1", amount: 65, exponent: 1)))
        let eight = row("n103", .legacy(FavouritePrice(drink: "spritz", band: .normal,
                         cents: 800, observedOn: "2026-11-01", confirmations: 0, quarantined: false)))
        let fiveFiftyEuro = row("n104", .europe(europe(550, currency: "EUR", serving: EuropeServing(unit: "ml", ml: 250))))
        let fourFiftyPounds = row("n105", .europe(europe(450, currency: "GBP")))
        let sorted = DiscoverySnapshot.rankRows([sixFifty, sixFiftyOneDigit, six, eight, fiveFiftyEuro, fourFiftyPounds], around: area)
        XCTAssertEqual(six.price.discoveryGroup, sixFifty.price.discoveryGroup)
        XCTAssertNotEqual(fiveFiftyEuro.price.discoveryGroup, six.price.discoveryGroup)
        XCTAssertEqual(sorted.map(\.price.amount), ["5,50 €", "6,00 €", "6,5 €", "6,50 €", "8,00 €", "4,50 £"])
        XCTAssertEqual(sorted.prefix(5).map { DiscoverySnapshot.currency($0.price) }, ["EUR", "EUR", "EUR", "EUR", "EUR"])
        XCTAssertEqual(DiscoverySnapshot.currency(sorted[5].price), "GBP")
        XCTAssertEqual(DiscoveryViewController.currencyHeading("EUR"), "EUR · €")
        XCTAssertEqual(DiscoveryViewController.currencyHeading("GBP"), "GBP · £")
        XCTAssertEqual(DiscoveryViewController.currencyHeading("CHF"), "CHF")
        XCTAssertEqual(DiscoveryViewController.currencyHeading("USD"), "USD")
        let category = try XCTUnwrap(DrinkCategory.all.first { $0.code == "spritz" })
        let euroCell = DiscoveryVenueCell(style: .default, reuseIdentifier: nil)
        euroCell.configure(row: sorted[0], category: category, band: .normal, rank: 1,
                           distance: "0 m", today: "2026-11-11", traits: .current, currencyHeading: "EUR · €")
        let poundCell = DiscoveryVenueCell(style: .default, reuseIdentifier: nil)
        poundCell.configure(row: sorted[5], category: category, band: .normal, rank: 1,
                            distance: "0 m", today: "2026-11-11", traits: .current, currencyHeading: "GBP · £")
        XCTAssertTrue(descendants(euroCell).compactMap { ($0 as? UILabel)?.text }.contains("EUR · €"))
        XCTAssertTrue(descendants(poundCell).compactMap { ($0 as? UILabel)?.text }.contains("GBP · £"))
        XCTAssertTrue(euroCell.accessibilityValue?.contains("Formato") == true ||
                      euroCell.accessibilityValue?.contains("250 ml") == true)
        let tieB = row("n102", .menuV2(menu("b")))
        let ties = DiscoverySnapshot.rankRows([tieB, six], around: area)
        if case .menuV2(let first) = ties[0].price { XCTAssertEqual(first.id, "a") }
        else { XCTFail("Expected named-menu source") }
    }

    @MainActor func testReferenceDiscoveryPrivateFixtureMountsActualXXXLFontsWithoutClippedEvidence() throws {
        let (controller, mounted) = try referenceFixture(category: .accessibilityExtraExtraExtraLarge)
        defer { mounted.close() }
        let index = IndexPath(row: 0, section: 0)
        controller.tableView.scrollToRow(at: index, at: .top, animated: false)
        mounted.layout()
        let cell = try XCTUnwrap(controller.tableView.cellForRow(at: index))
        XCTAssertTrue(cell.window === mounted.window)
        let labels = descendants(cell).compactMap { $0 as? UILabel }.filter { !($0.text ?? "").isEmpty }
        let name = try XCTUnwrap(labels.first { $0.text == "Locale fixture A" })
        XCTAssertGreaterThan(name.font.pointSize, 30, "A trait parameter alone does not prove actual Dynamic Type fonts")
        for label in labels {
            XCTAssertFalse(label.isHidden)
            XCTAssertGreaterThan(label.bounds.width, 0)
            let needed = label.sizeThatFits(CGSize(width: label.bounds.width, height: .greatestFiniteMagnitude)).height
            XCTAssertLessThanOrEqual(needed, label.bounds.height + 1, label.text ?? "")
        }
        let featured = try XCTUnwrap(descendants(controller.view).compactMap { $0 as? DiscoveryFeaturedCard }.first)
        for label in descendants(featured).compactMap({ $0 as? UILabel }).filter({ !($0.text ?? "").isEmpty }) {
            XCTAssertGreaterThan(label.bounds.width, 0)
            let needed = label.sizeThatFits(CGSize(width: label.bounds.width, height: .greatestFiniteMagnitude)).height
            XCTAssertLessThanOrEqual(needed, label.bounds.height + 1, label.text ?? "")
        }
        XCTAssertTrue(cell.accessibilityValue?.contains("Formato non dichiarato") == true)
        mounted.attach(to: self, name: "Scopri-populated-XXXL-scrolled-to-row")
    }

    @MainActor private func referenceFixture(category: UIContentSizeCategory,
                                             onOpen: @escaping (URL) -> Void = { _ in }) throws -> (DiscoveryViewController, OwnedReferenceWindow) {
        let client = DelayedDiscoveryService()
        let controller = DiscoveryViewController(client: client, activityCheck: { true }, onOpen: onOpen, onMap: {})
        let area = try XCTUnwrap(DiscoveryArea(latitude: 45.4642, longitude: 9.19, zoom: 14))
        controller.setArea(area)
        controller.selectDrink("spritz")
        let mounted = try OwnedReferenceWindow(root: UINavigationController(rootViewController: controller), category: category)
        let requested = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in client.calls.count == 1 }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [requested], timeout: 5), .completed)
        guard client.calls.count == 1 else { mounted.close(); throw ComparisonReadError.unavailable }
        let venues = [550, 650, 700].enumerated().map { index, cents in
            DiscoveryVenue(key: "n\(901 + index)", name: "Locale fixture \(["A", "B", "C"][index])", cell: "u0nd9",
                latitude: 45.4642, longitude: 9.19, address: "Via fixture \(index + 1)", city: "Milano",
                prices: [FavouritePrice(drink: "spritz", band: .normal, cents: cents, observedOn: "2026-11-01", confirmations: 0, quarantined: false)])
        }
        client.complete(0, DiscoverySnapshot(area: area, venues: venues, unavailableCells: []))
        mounted.layout(); controller.tableView.layoutIfNeeded()
        XCTAssertEqual(controller.tableView.numberOfRows(inSection: 0), 3)
        return (controller, mounted)
    }

    @MainActor
    func testNativeRowsShowRealDataFiltersAndCanonicalOpenWithoutSavingAnything() throws {
        let client = DelayedDiscoveryService()
        var opened: URL?
        let controller = DiscoveryViewController(client: client, activityCheck: { true }, onOpen: { opened = $0 }, onMap: {})
        let area = try XCTUnwrap(DiscoveryArea(latitude: 45.4642, longitude: 9.19, zoom: 14))
        controller.setArea(area)
        controller.loadViewIfNeeded()
        controller.beginAppearanceTransition(true, animated: false); controller.endAppearanceTransition()
        XCTAssertEqual(client.calls.count, 1)
        let price = FavouritePrice(drink: "spritz", band: .normal, cents: 550, observedOn: "2026-10-28", confirmations: 0, quarantined: false)
        let venue = DiscoveryVenue(key: "n123", name: "Real current name", cell: "u0nd9", latitude: 45.4642, longitude: 9.19,
                                   address: "Via pubblica", city: "Milano", prices: [price])
        client.complete(0, DiscoverySnapshot(area: area, venues: [venue], unavailableCells: []))
        XCTAssertEqual(controller.tableView(controller.tableView, numberOfRowsInSection: 0), 0, "Both platforms start on the first real drink filter")
        controller.selectDrink("spritz")
        XCTAssertEqual(controller.tableView(controller.tableView, numberOfRowsInSection: 0), 1)
        controller.selectDrink("beer_draft")
        XCTAssertEqual(controller.tableView(controller.tableView, numberOfRowsInSection: 0), 0, "A beer filter cannot show a Spritz price")
        controller.selectDrink("spritz")
        XCTAssertEqual(controller.tableView(controller.tableView, numberOfRowsInSection: 0), 1)
        let index = IndexPath(row: 0, section: 0)
        let cell = controller.tableView(controller.tableView, cellForRowAt: index)
        let labels = descendants(cell).compactMap { ($0 as? UILabel)?.text }
        XCTAssertTrue(labels.contains("Real current name"))
        let text = labels.joined(separator: "\n")
        for expected in ["5,50 €", "Via pubblica · Milano", "0 m dal centro mappa", "2026-10-28", "0 conferme", "Formato non dichiarato"] {
            XCTAssertTrue(text.contains(expected), expected)
        }
        XCTAssertTrue(cell.accessibilityValue?.contains("Spritz · Normale") == true, "The selected global drink and band remain explicit to VoiceOver")
        XCTAssertEqual(cell.backgroundConfiguration?.backgroundColor, NativeAppearance.surface)
        XCTAssertFalse(text.contains("Affare"), "A disposable feed must not invent a price tier")
        controller.tableView(controller.tableView, didSelectRowAt: index)
        XCTAssertEqual(opened, URL(string: "https://www.dovebevo.com/bar/n123?c=u0nd9"))
        XCTAssertEqual(client.calls.count, 1, "Filters and opening cannot post or refetch contributions")
        let hour = try XCTUnwrap(descendants(controller.view).compactMap { $0 as? UIButton }.first { $0.accessibilityIdentifier == "favorites.band.happyHour" })
        hour.sendActions(for: .touchUpInside)
        XCTAssertEqual(controller.tableView(controller.tableView, numberOfRowsInSection: 0), 0)
        controller.beginAppearanceTransition(false, animated: false); controller.endAppearanceTransition()
    }

    @MainActor
    func testHiddenDestinationBackgroundAndChangedAreaRejectLateResultsAndCancelReads() throws {
        let client = DelayedDiscoveryService()
        var selected = false
        let controller = DiscoveryViewController(client: client, activityCheck: { true }, onOpen: { _ in }, onMap: {})
        controller.isDestinationSelected = { selected }
        let first = try XCTUnwrap(DiscoveryArea(latitude: 45.4642, longitude: 9.19, zoom: 14))
        let next = try XCTUnwrap(DiscoveryArea(latitude: 41.9, longitude: 12.5, zoom: 14))
        controller.setArea(first)
        controller.loadViewIfNeeded()
        controller.beginAppearanceTransition(true, animated: false); controller.endAppearanceTransition()
        XCTAssertTrue(client.calls.isEmpty, "A visible scene does not authorize a hidden destination")
        selected = true; controller.refresh()
        XCTAssertEqual(client.calls.count, 1)
        controller.setArea(next)
        XCTAssertTrue(client.calls[0].request.cancelled)
        XCTAssertEqual(client.calls.count, 2)
        client.complete(0, DiscoverySnapshot(area: first, venues: [], unavailableCells: []))
        XCTAssertTrue(identifiers(controller).contains("discovery.loading"), "Old area completion cannot retire the newer read")
        selected = false
        client.complete(1, DiscoverySnapshot(area: next, venues: [], unavailableCells: []))
        XCTAssertFalse(identifiers(controller).contains("discovery.loaded"))
        selected = true; controller.refresh()
        XCTAssertEqual(client.calls.count, 3)
        NotificationCenter.default.post(name: UIApplication.willResignActiveNotification, object: nil)
        XCTAssertTrue(client.calls[2].request.cancelled)
        client.complete(2, DiscoverySnapshot(area: next, venues: [], unavailableCells: []))
        XCTAssertFalse(identifiers(controller).contains("discovery.empty"))
        controller.refresh()
        XCTAssertEqual(client.calls.count, 3, "Background refresh must remain inert")
        controller.beginAppearanceTransition(false, animated: false); controller.endAppearanceTransition()
    }

    @MainActor
    func testChooseAreaAndPartialResultsRemainExplicit() throws {
        let client = DelayedDiscoveryService()
        let controller = DiscoveryViewController(client: client, activityCheck: { true }, onOpen: { _ in }, onMap: {})
        controller.loadViewIfNeeded()
        controller.beginAppearanceTransition(true, animated: false); controller.endAppearanceTransition()
        XCTAssertTrue(identifiers(controller).contains("discovery.chooseArea"))
        XCTAssertTrue(client.calls.isEmpty)
        let area = try XCTUnwrap(DiscoveryArea(latitude: 45.4642, longitude: 9.19, zoom: 14))
        controller.setArea(area)
        client.complete(0, DiscoverySnapshot(area: area, venues: [], unavailableCells: [area.cells[0]]))
        XCTAssertTrue(identifiers(controller).contains("discovery.partial"))
        controller.refresh()
        client.complete(1, DiscoverySnapshot(area: area, venues: [], unavailableCells: Set(area.cells)))
        XCTAssertTrue(identifiers(controller).contains("discovery.unavailable"))
        controller.beginAppearanceTransition(false, animated: false); controller.endAppearanceTransition()
    }

    @MainActor
    func testRealIsolatedWebKitReadUsesCurrentPublicMapAttributesAndRejectsUnreadyOrDuplicateMap() throws {
        let web = WKWebView(frame: CGRect(x: 0, y: 0, width: 390, height: 700), configuration: WKWebViewConfiguration())
        let loaded = expectation(description: "Owned map area fixture")
        let delegate = DiscoveryNavigationDelegate(loaded)
        web.navigationDelegate = delegate
        let data = Data("""
        <!doctype html><html><head><meta charset="utf-8"></head><body>
        <div id="app"><div class="app"><section class="map" data-ready="true" data-center="45.46420,9.19000" data-zoom="14.0" style="width:300px;height:300px"></section></div></div>
        <script>window.URL=function(){throw new Error('page world shadow');};</script>
        </body></html>
        """.utf8)
        let url = URLPolicy.homeURL
        let response = URLResponse(url: url, mimeType: "text/html", expectedContentLength: data.count, textEncodingName: "UTF-8")
        XCTAssertNotNil(web.loadSimulatedRequest(URLRequest(url: url), response: response, responseData: data))
        wait(for: [loaded], timeout: 15)
        let value = try evaluate(web, MapAreaReader.script)
        XCTAssertEqual(MapAreaReader.area(value, currentURL: url), DiscoveryArea(latitude: 45.4642, longitude: 9.19, zoom: 14))
        _ = try evaluate(web, "document.querySelector('section.map').setAttribute('data-ready','false');true")
        XCTAssertTrue(try evaluate(web, "(\(MapAreaReader.script)) === null") as? Bool == true)
        _ = try evaluate(web, "document.querySelector('section.map').setAttribute('data-ready','true');document.querySelector('.app').appendChild(document.querySelector('section.map').cloneNode(true));true")
        XCTAssertTrue(try evaluate(web, "(\(MapAreaReader.script)) === null") as? Bool == true)
    }

    @MainActor
    private func evaluate(_ web: WKWebView, _ source: String) throws -> Any {
        let done = expectation(description: "Fixed isolated area read")
        var result: Result<Any, Error>?
        web.evaluateJavaScript(source, in: nil, in: .defaultClient) { value in result = value; done.fulfill() }
        wait(for: [done], timeout: 5)
        return try XCTUnwrap(result).get()
    }

    @MainActor private func identifiers(_ controller: UIViewController) -> [String] {
        descendants(controller.view).compactMap(\.accessibilityIdentifier)
    }
    @MainActor private func descendants(_ view: UIView) -> [UIView] { view.subviews.flatMap { [$0] + descendants($0) } }
}

private final class DelayedDiscoveryService: DiscoveryServing {
    struct Call { let area: DiscoveryArea; let request: TestRecommendationRequest; let completion: (DiscoverySnapshot) -> Void }
    var calls: [Call] = []
    func load(_ area: DiscoveryArea, completion: @escaping (DiscoverySnapshot) -> Void) -> RecommendationRequest {
        let request = TestRecommendationRequest(); calls.append(Call(area: area, request: request, completion: completion)); return request
    }
    func complete(_ index: Int, _ snapshot: DiscoverySnapshot) { calls[index].completion(snapshot) }
}

private final class DiscoveryNavigationDelegate: NSObject, WKNavigationDelegate {
    let completed: XCTestExpectation
    init(_ completed: XCTestExpectation) { self.completed = completed }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { completed.fulfill() }
}
