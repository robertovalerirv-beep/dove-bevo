import XCTest

final class BrowserSmokeTests: XCTestCase {
    private var app: XCUIApplication!
    private static let liveMapLabels = [
        "Mappa interattiva dei bar",
        "Mappa interattiva dei bar, region"
    ]
    private static let liveCoveragePattern = #"^([0-9]+) bar su ([0-9]+) qui hanno un prezzo$"#

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launch()
        acceptBundledRulesIfShown()
    }

    override func tearDownWithError() throws {
        attachScreen(named: "DoveBevo-\(name)")
        app.terminate()
    }

    func testNativeNavigationAndInformationAreAccessible() {
        XCTAssertTrue(app.navigationBars["Dove bevo"].waitForExistence(timeout: 10))
        for identifier in ["browser.back", "browser.forward", "browser.home", "browser.more", "browser.recommendations", "browser.saveVenue"] {
            XCTAssertTrue(app.buttons[identifier].exists, identifier)
        }
        let bottomBar = app.descendants(matching: .any)["native.bottomNavigation"]
        XCTAssertEqual(bottomBar.buttons.count, 5)
        for (identifier, label) in [("browser.home", "Home"), ("tab.map", "Mappa"), ("tab.favorites", "Preferiti"), ("browser.saveVenue", "Salva nei preferiti"), ("browser.recommendations", "Drink consigliati")] {
            let control = bottomBar.buttons[identifier]
            XCTAssertTrue(control.exists, "All five controls must be in the bottom bar: \(identifier)")
            XCTAssertEqual(control.label, label)
            XCTAssertGreaterThanOrEqual(control.frame.width, 48)
            XCTAssertGreaterThanOrEqual(control.frame.height, 48)
            XCTAssertTrue(bottomBar.frame.contains(control.frame))
        }
        XCTAssertGreaterThanOrEqual(bottomBar.frame.minY, app.frame.midY)
        XCTAssertTrue(bottomBar.buttons["tab.map"].isSelected)
        XCTAssertFalse(bottomBar.buttons["tab.favorites"].isSelected)
        XCTAssertFalse(bottomBar.buttons["browser.saveVenue"].isEnabled)
        XCTAssertFalse(bottomBar.buttons["browser.recommendations"].isEnabled)
        XCTAssertEqual(app.buttons.matching(identifier: "tab.favorites").count, 1)
        XCTAssertEqual(app.buttons["browser.home"].label, "Home")
        XCTAssertFalse(app.buttons["Condividi"].exists)
        XCTAssertFalse(app.buttons["Ricarica"].exists)
        app.buttons["browser.more"].tap()
        XCTAssertTrue(app.buttons["Condividi"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Ricarica"].exists || app.buttons["Interrompi"].exists)
        for label in ["Home", "Preferiti", "Salva nei preferiti", "Drink consigliati"] {
            XCTAssertEqual(app.buttons.matching(NSPredicate(format: "label == %@", label)).count, 1,
                           "More must not duplicate a bottom control: \(label)")
        }
        XCTAssertFalse(app.buttons["Home"].isSelected, "Home is an action, not a blank selected tab")
        app.buttons["Informazioni"].tap()
        XCTAssertTrue(app.alerts["Dove bevo"].waitForExistence(timeout: 5))
        app.alerts.buttons["Chiudi"].tap()
    }

    func testBundledPrivacyContactAndNativeBack() {
        XCTAssertTrue(app.buttons["browser.more"].waitForExistence(timeout: 10))
        openPrivacyAndReturn()
        // The website is deliberately excluded from accessibility while native
        // recovery covers it; this native-only case does not require internet.
        XCTAssertTrue(app.buttons["browser.home"].exists)
        assertReloadInMoreMenu()
    }

    func testNativeSavedVenuesListReturnsToTheExistingBrowser() {
        XCTAssertTrue(app.buttons["browser.more"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["browser.saveVenue"].exists)
        XCTAssertFalse(app.buttons["browser.saveVenue"].isEnabled, "The initial home/map page is not a venue to save")
        XCTAssertFalse(app.buttons["browser.recommendations"].isEnabled, "Recommendations require an open venue")
        app.buttons["tab.favorites"].tap()
        XCTAssertTrue(app.navigationBars["Preferiti"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.tables["savedVenues.list"].exists)
        XCTAssertFalse(app.buttons["browser.saveVenue"].isEnabled)
        XCTAssertFalse(app.buttons["browser.recommendations"].isEnabled)
        XCTAssertTrue(app.buttons["tab.favorites"].isSelected)
        XCTAssertFalse(app.buttons["tab.map"].isSelected)
        app.buttons["tab.map"].tap()
        XCTAssertTrue(app.navigationBars["Dove bevo"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["browser.home"].exists)
        assertReloadInMoreMenu()
        app.buttons["tab.favorites"].tap()
        app.buttons["browser.home"].tap()
        XCTAssertTrue(app.navigationBars["Dove bevo"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["tab.map"].isSelected)
        XCTAssertFalse(app.buttons["browser.home"].isSelected)
    }

    /// This deliberately requires live HTTPS website readiness. A native
    /// toolbar or an offline/retry screen does not count as a working map.
    func testLiveWebsiteCitySearchAndMap() {
        let website = app.webViews.firstMatch
        XCTAssertTrue(website.waitForExistence(timeout: 20), "WKWebView did not appear")
        let searchButton = website.buttons["Cerca città o bar"]
        XCTAssertTrue(searchButton.waitForExistence(timeout: 90), "Live website did not become ready; inspect screenshot and network/challenge state")
        let loading = app.descendants(matching: .any)["browser.loading"]
        let error = app.descendants(matching: .any)["browser.error"]
        // Web content can enter the accessibility tree before WKNavigation's
        // didFinish. Require both native load completion and a reachable action.
        let ready = NSPredicate { _, _ in
            !loading.exists && !error.exists &&
                searchButton.exists && searchButton.isHittable
        }
        let readiness = XCTNSPredicateExpectation(predicate: ready, object: nil)
        let readinessResult = XCTWaiter.wait(for: [readiness], timeout: 30)
        attachState(named: "DoveBevo-live-before-search-tap")
        XCTAssertEqual(readinessResult, .completed, "Native loading and the website search action did not become ready together")
        XCTAssertTrue(website.buttons["Vicino a me"].exists)
        XCTAssertTrue(ready.evaluate(with: nil), "Page readiness changed before the single search tap")
        assertShareAndReloadAvailable()
        assertNoSharePresentation()
        XCTAssertTrue(searchButton.isHittable, "Menu dismissal must leave the real city-search action reachable")
        searchButton.tap()
        attachState(named: "DoveBevo-live-after-search-tap")

        // The HTML modal and keyboard can change WebKit's nested accessibility
        // containers; keep the exact input label, queried from the application.
        let searchField = app.textFields["Cerca una città o un bar"]
        let fieldAppeared = searchField.waitForExistence(timeout: 15)
        if !fieldAppeared { attachState(named: "DoveBevo-live-search-field-missing") }
        XCTAssertTrue(fieldAppeared, "Website city search field missing")
        dismissKeyboardIntroductionIfPresent(searchField: searchField)
        XCTAssertTrue(searchField.exists, "The original city search sheet disappeared; do not reopen it after a renderer reset")
        XCTAssertTrue(searchField.isHittable, "The original city search field must remain reachable before typing")
        assertNoNativeRecovery()
        attachScreen(named: "DoveBevo-live-city-search-before-input")
        // Opening the website sheet intentionally focuses this field. A second
        // tap is unnecessary and can collide with the first keyboard intro.
        searchField.typeText("Milano")
        XCTAssertEqual(searchField.value as? String, "Milano", "The actual website input must receive the query")
        let city = website.descendants(matching: .any).matching(
            NSPredicate(format: "label BEGINSWITH[c] %@ AND label CONTAINS[c] %@", "Milano", "Città")
        ).firstMatch
        XCTAssertTrue(city.waitForExistence(timeout: 30), "Live city data did not return Milano")
        city.tap()

        XCTAssertTrue(searchButton.waitForExistence(timeout: 15), "City search did not return to the map")
        XCTAssertTrue(interactiveMap().waitForExistence(timeout: 45), "Interactive live map did not initialize")
        let mapReady = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == false"),
            object: app.webViews["browser.website"].buttons["Esplora la mappa"]
        )
        XCTAssertEqual(XCTWaiter.wait(for: [mapReady], timeout: 45), .completed, "Map style did not finish loading")
        let coverageReady = XCTNSPredicateExpectation(
            predicate: NSPredicate { _, _ in self.hasVisiblePositiveCoverage() }, object: nil
        )
        XCTAssertEqual(XCTWaiter.wait(for: [coverageReady], timeout: 45), .completed,
                       "The live map must show a positive valid count of priced venues in the current view")
        XCTAssertFalse(app.webViews["browser.website"].staticTexts["La mappa non si carica: controlla la connessione e ricarica la pagina."].exists)
        assertNoNativeRecovery()
        assertShareAndReloadAvailable()
        openPrivacyAndReturn()
        XCTAssertTrue(interactiveMap().exists, "Returning from native privacy must retain the website map")
        XCTAssertTrue(hasVisiblePositiveCoverage(), "Returning from native privacy must retain live price coverage")
        XCTAssertTrue(app.webViews["browser.website"].buttons["Cerca città o bar"].exists)
        XCTAssertFalse(app.webViews["browser.website"].buttons["Esplora la mappa"].exists)
        XCTAssertFalse(app.webViews["browser.website"].staticTexts["La mappa non si carica: controlla la connessione e ricarica la pagina."].exists)
        assertNoNativeRecovery()
        assertShareAndReloadAvailable()
        verifyLiveSavedVenueRoundTrip()
        attachScreen(named: "DoveBevo-live-Milano-map")
    }

    private func verifyLiveSavedVenueRoundTrip() {
        let website = app.webViews["browser.website"]
        // A fresh owned installation lets this test remove only its own entry.
        // Never clear preferences, overwrite an existing choice or contribute data.
        app.buttons["tab.favorites"].tap()
        XCTAssertTrue(app.navigationBars["Preferiti"].waitForExistence(timeout: 10))
        let initialSavedTable = app.tables["savedVenues.list"]
        let emptyMessage = initialSavedTable.descendants(matching: .any).matching(
            NSPredicate(format: "label BEGINSWITH[c] %@", "Non hai ancora preferiti.")
        ).firstMatch
        guard initialSavedTable.waitForExistence(timeout: 5), initialSavedTable.cells.count == 0,
              emptyMessage.waitForExistence(timeout: 5), !app.buttons["savedVenues.retry"].exists else {
            XCTFail("Live bookmark QA requires an owned empty installation; existing records were left unchanged")
            return
        }
        app.buttons["tab.map"].tap()
        XCTAssertTrue(app.navigationBars["Dove bevo"].waitForExistence(timeout: 10))
        XCTAssertTrue(hasVisiblePositiveCoverage(), "The native list must preserve the live map")
        let listButton = website.buttons["Elenco"]
        XCTAssertTrue(listButton.waitForExistence(timeout: 10))
        XCTAssertTrue(listButton.isHittable)
        listButton.tap()
        let listTitle = website.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "Bar nella zona")).firstMatch
        XCTAssertTrue(listTitle.waitForExistence(timeout: 10))
        let pricedLinks = website.links.matching(NSPredicate(format: "label CONTAINS %@", "€"))
        XCTAssertTrue(pricedLinks.firstMatch.waitForExistence(timeout: 20))
        var visibleVenue: XCUIElement?
        for _ in 0..<12 {
            if let venue = pricedLinks.allElementsBoundByIndex.first(where: { $0.exists && $0.isHittable }) {
                visibleVenue = venue
                break
            }
            XCTAssertTrue(listTitle.exists, "Scroll only the real open venue list")
            website.swipeUp()
        }
        guard let visibleVenue else {
            attachState(named: "DoveBevo-live-priced-venue-not-hittable")
            XCTFail("No existing priced venue became reachable in Elenco")
            return
        }
        // ListSheet puts the existing public venue name before price/address.
        // Derive the expected name independently from this real accessible link.
        let publicNameText = visibleVenue.staticTexts.firstMatch
        XCTAssertTrue(publicNameText.exists)
        let publicName = publicNameText.label.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !publicName.isEmpty, publicName.utf16.count <= 120, !publicName.contains("€") else {
            XCTFail("The existing venue link did not expose its actual bounded name")
            return
        }
        visibleVenue.tap()
        XCTAssertTrue(website.links["Indicazioni"].waitForExistence(timeout: 30))
        XCTAssertTrue(website.staticTexts[publicName].waitForExistence(timeout: 15))
        waitForNativePageReady()
        verifyLiveRecommendationsReadOnly(venueName: publicName)
        saveCurrentVenueInOneTap()
        app.buttons["tab.favorites"].tap()
        let savedTable = app.tables["savedVenues.list"]
        let savedRow = savedTable.cells.matching(NSPredicate(format: "label == %@", publicName)).firstMatch
        XCTAssertTrue(savedRow.waitForExistence(timeout: 10), "One menu action must save the existing name without a naming form")
        XCTAssertEqual(savedTable.cells.count, 1)
        XCTAssertFalse(app.textFields["savedVenue.name"].exists)
        XCTAssertTrue(savedRow.identifier.hasPrefix("savedVenue."))
        let savedIdentity = savedRow.identifier
        verifyLiveFavouriteComparisonReadOnly()
        attachScreen(named: "DoveBevo-live-native-saved-venue")
        app.buttons["tab.map"].tap()
        XCTAssertTrue(app.navigationBars["Dove bevo"].waitForExistence(timeout: 10))
        let initialCloseBar = website.buttons["Chiudi"]
        XCTAssertTrue(initialCloseBar.waitForExistence(timeout: 10))
        initialCloseBar.tap()
        let venueClosed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: website.links["Indicazioni"])
        XCTAssertEqual(XCTWaiter.wait(for: [venueClosed], timeout: 15), .completed)
        XCTAssertTrue(interactiveMap().waitForExistence(timeout: 15))
        XCTAssertTrue(hasVisiblePositiveCoverage())
        app.buttons["tab.favorites"].tap()
        XCTAssertTrue(app.navigationBars["Preferiti"].waitForExistence(timeout: 10))
        let reopenRow = app.tables["savedVenues.list"].cells[savedIdentity]
        XCTAssertTrue(reopenRow.waitForExistence(timeout: 10))
        XCTAssertEqual(reopenRow.label, publicName)
        reopenRow.tap()
        XCTAssertTrue(app.navigationBars["Dove bevo"].waitForExistence(timeout: 10))
        XCTAssertTrue(website.links["Indicazioni"].waitForExistence(timeout: 45))
        XCTAssertTrue(website.staticTexts[publicName].waitForExistence(timeout: 15), "Reopen must show the actual saved venue name")
        waitForNativePageReady()
        // Saving the reopened venue must update that same record, not create a
        // different URL/key or ask the tester to provide an invented name.
        saveCurrentVenueInOneTap()
        app.buttons["tab.favorites"].tap()
        XCTAssertEqual(app.tables["savedVenues.list"].cells.count, 1)
        let qaRow = app.tables["savedVenues.list"].cells[savedIdentity]
        XCTAssertTrue(qaRow.waitForExistence(timeout: 10))
        XCTAssertEqual(qaRow.label, publicName)
        qaRow.swipeLeft()
        let remove = app.buttons["Rimuovi"]
        XCTAssertTrue(remove.waitForExistence(timeout: 5))
        remove.tap()
        let removed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: qaRow)
        XCTAssertEqual(XCTWaiter.wait(for: [removed], timeout: 10), .completed, "Remove only the test's private bookmark")
        XCTAssertEqual(app.tables["savedVenues.list"].cells.count, 0)
        app.buttons["tab.map"].tap()
        XCTAssertTrue(app.navigationBars["Dove bevo"].waitForExistence(timeout: 10))
        let closeBar = website.buttons["Chiudi"]
        XCTAssertTrue(closeBar.waitForExistence(timeout: 10))
        closeBar.tap()
        XCTAssertTrue(website.buttons["Cerca città o bar"].waitForExistence(timeout: 15))
        XCTAssertTrue(interactiveMap().waitForExistence(timeout: 45))
        let mapReady = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == false"), object: website.buttons["Esplora la mappa"]
        )
        XCTAssertEqual(XCTWaiter.wait(for: [mapReady], timeout: 45), .completed)
        let coverage = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in self.hasVisiblePositiveCoverage() }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [coverage], timeout: 45), .completed, "The final map still requires genuine positive price coverage")
        XCTAssertFalse(website.staticTexts["La mappa non si carica: controlla la connessione e ricarica la pagina."].exists)
        assertNoNativeRecovery()
        assertShareAndReloadAvailable()
    }

    private func verifyLiveFavouriteComparisonReadOnly() {
        XCTAssertTrue(app.buttons["tab.favorites"].isSelected)
        XCTAssertTrue(app.staticTexts["favorites.loaded"].waitForExistence(timeout: 60), "The favourite must resolve using actual public metadata and prices")
        let selector = app.buttons["favorites.drink"]
        XCTAssertTrue(selector.exists)
        selector.tap()
        for name in ["Birra media", "Spritz", "Negroni", "Sbagliato", "Gin tonic", "Gin lemon", "Calice di vino", "Analcolico", "Acqua"] {
            XCTAssertTrue(app.buttons[name].exists, name)
        }
        app.buttons["Spritz"].tap()
        XCTAssertTrue(selector.label.contains("Spritz"))
        let happyHour = app.buttons["favorites.band.happyHour"]
        XCTAssertTrue(happyHour.exists)
        happyHour.tap()
        XCTAssertTrue(happyHour.isSelected)
        XCTAssertTrue(app.staticTexts["favorites.loaded"].exists, "Selectors must reuse the loaded snapshot")
        app.buttons["favorites.band.normal"].tap()
        selector.tap(); app.buttons["Birra media"].tap()
        XCTAssertTrue(selector.label.contains("Birra media"))
        XCTAssertTrue(app.buttons["favorites.refresh"].exists)
        // No price, recommendation or venue is written by this flow.
    }

    private func verifyLiveRecommendationsReadOnly(venueName: String) {
        // This real public-service flow performs GET only. Recommend/undo is
        // exercised with owned native transports in unit/controller tests.
        let entry = app.buttons["browser.recommendations"]
        XCTAssertTrue(entry.exists && entry.isEnabled)
        entry.tap()
        XCTAssertTrue(app.navigationBars["Drink consigliati"].waitForExistence(timeout: 10))
        let table = app.tables["recommendations.list"]
        XCTAssertTrue(table.waitForExistence(timeout: 10))
        XCTAssertEqual(app.staticTexts["recommendations.venueName"].label, venueName)
        let expected = Set(["beer_draft", "spritz", "negroni", "sbagliato", "gin_tonic", "gin_lemon", "wine_glass", "alcohol_free", "water"].map { "recommendations.row.\($0)" })
        var observed = Set<String>()
        for _ in 0..<12 {
            observed.formUnion(table.cells.allElementsBoundByIndex.map(\.identifier).filter { expected.contains($0) })
            if observed == expected && app.staticTexts["recommendations.loaded"].exists { break }
            table.swipeUp()
        }
        XCTAssertEqual(observed, expected)
        XCTAssertTrue(app.staticTexts["recommendations.loaded"].waitForExistence(timeout: 30), "Only an authoritative successful GET counts as loaded recommendations")
        XCTAssertFalse(app.staticTexts["recommendations.unavailable"].exists)
        attachScreen(named: "DoveBevo-live-native-recommendations-read-only")
        app.navigationBars["Drink consigliati"].buttons["Torna al locale"].tap()
        XCTAssertTrue(app.webViews["browser.website"].staticTexts[venueName].waitForExistence(timeout: 10))
        XCTAssertTrue(app.webViews["browser.website"].links["Indicazioni"].exists)
        assertNoNativeRecovery()
    }

    private func waitForNativePageReady() {
        let ready = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            self.app.buttons["browser.saveVenue"].isEnabled &&
                !self.app.descendants(matching: .any)["browser.loading"].exists &&
                !self.app.descendants(matching: .any)["browser.error"].exists
        }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 45), .completed, "Native page loading must finish before saving the current venue")
        assertShareAndReloadAvailable()
    }

    private func saveCurrentVenueInOneTap() {
        let save = app.buttons["browser.saveVenue"]
        let enabled = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in save.exists && save.isEnabled }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [enabled], timeout: 10), .completed, "The actual current website venue must be eligible for native saving")
        save.tap()
        let confirmation = app.alerts["Preferito salvato"]
        XCTAssertTrue(confirmation.waitForExistence(timeout: 10))
        confirmation.buttons["Chiudi"].tap()
        XCTAssertTrue(app.navigationBars["Dove bevo"].exists, "Saving stays on the existing venue")
        XCTAssertTrue(app.buttons["tab.map"].isSelected)
        XCTAssertTrue(app.webViews["browser.website"].links["Indicazioni"].exists)
        XCTAssertFalse(app.textFields["savedVenue.name"].exists)
    }

    private func assertShareAndReloadAvailable() {
        app.buttons["browser.more"].tap()
        let share = app.buttons["Condividi"]
        XCTAssertTrue(share.waitForExistence(timeout: 5))
        XCTAssertTrue(share.isEnabled, "The finished page is shareable through More")
        XCTAssertTrue(app.buttons["Ricarica"].exists && app.buttons["Ricarica"].isEnabled)
        XCTAssertFalse(app.buttons["Interrompi"].exists)
        dismissMoreMenu()
    }

    private func assertReloadInMoreMenu() {
        app.buttons["browser.more"].tap()
        XCTAssertTrue(app.buttons["Condividi"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Ricarica"].exists || app.buttons["Interrompi"].exists)
        dismissMoreMenu()
    }

    private func dismissMoreMenu() {
        // The context menu can cover the header. The observed native Mappa
        // button is below it and preserves this same browser if a tap forwards.
        let bar = app.descendants(matching: .any)["native.bottomNavigation"]
        let map = bar.buttons["tab.map"]
        XCTAssertTrue(bar.exists && map.exists)
        let frame = map.frame
        let numbers = [frame.minX, frame.minY, frame.width, frame.height]
        guard numbers.allSatisfy({ $0.isFinite }), frame.width >= 48, frame.height >= 48,
              app.frame.contains(frame), bar.frame.contains(frame), frame.minY > app.frame.midY else {
            XCTFail("There is no verified native Mappa target outside the context menu")
            return
        }
        let point = CGPoint(x: frame.midX, y: frame.midY)
        for label in ["Condividi", "Ricarica", "Interrompi", "Apri nel browser", "Permessi posizione", "Privacy", "Informazioni"] {
            let action = app.buttons[label]
            if action.exists {
                guard !action.frame.contains(point) else {
                    XCTFail("The native Mappa target overlaps a presented menu action")
                    return
                }
            }
        }
        map.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        let closed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: app.buttons["Condividi"])
        XCTAssertEqual(XCTWaiter.wait(for: [closed], timeout: 5), .completed)
        assertNoSharePresentation()
        XCTAssertTrue(map.isSelected)
    }

    private func assertNoSharePresentation() {
        XCTAssertFalse(app.otherElements["ShareSheet.RemoteContainerView"].exists, "Menu dismissal must never activate Share")
        XCTAssertFalse(app.otherElements["ActivityListView"].exists)
        XCTAssertFalse(app.otherElements["UIActivityContentView"].exists)
        XCTAssertFalse(app.sheets.firstMatch.exists)
    }

    private func interactiveMap() -> XCUIElement {
        // WebKit exposes the observed region role in the accessible label.
        // Accept only that exact variant and the website's original label.
        app.webViews["browser.website"].descendants(matching: .any).matching(
            NSPredicate(format: "label IN %@", Self.liveMapLabels as NSArray)
        ).firstMatch
    }

    private func hasVisiblePositiveCoverage() -> Bool {
        let website = app.webViews["browser.website"]
        guard website.exists else { return false }
        let websiteFrame = website.frame
        let appFrame = app.frame
        return website.staticTexts.matching(
            NSPredicate(format: "label MATCHES %@", Self.liveCoveragePattern)
        ).allElementsBoundByIndex.contains { element in
            guard element.exists else { return false }
            let frame = element.frame
            // The read-only status intentionally has pointer-events:none.
            // Require visible finite geometry rather than a tappable hit point.
            let frames = [frame, websiteFrame, appFrame]
            return frames.allSatisfy({ rectangle in
                !rectangle.isNull && !rectangle.isInfinite &&
                    rectangle.size.width > 0 && rectangle.size.height > 0 &&
                    [rectangle.minX, rectangle.minY, rectangle.maxX, rectangle.maxY,
                     rectangle.width, rectangle.height].allSatisfy { $0.isFinite }
            }) && websiteFrame.contains(frame) && appFrame.contains(frame) &&
                Self.hasPositiveCoverage(element.label)
        }
    }

    private static func hasPositiveCoverage(_ label: String) -> Bool {
        let range = NSRange(label.startIndex..<label.endIndex, in: label)
        guard label.count <= 120,
              let regex = try? NSRegularExpression(pattern: liveCoveragePattern),
              let match = regex.firstMatch(in: label, range: range), match.range == range,
              let pricedRange = Range(match.range(at: 1), in: label),
              let totalRange = Range(match.range(at: 2), in: label),
              let withPrice = Int(label[pricedRange]), let total = Int(label[totalRange]) else { return false }
        return withPrice > 0 && total >= withPrice
    }

    private func openPrivacyAndReturn() {
        app.buttons["browser.more"].tap()
        app.buttons["Privacy"].tap()
        XCTAssertTrue(app.navigationBars["Privacy"].waitForExistence(timeout: 5))
        let policy = app.textViews["privacy.text"]
        XCTAssertTrue(policy.exists)
        let text = policy.value as? String ?? ""
        XCTAssertTrue(text.contains("dovebevo@gmail.com"))
        XCTAssertGreaterThan(text.count, 500, "The full bundled policy must load")
        XCTAssertTrue(app.buttons["privacy.contact"].isHittable)
        XCTAssertEqual(app.buttons["privacy.contact"].label, "Assistenza: dovebevo@gmail.com")
        policy.swipeUp()
        XCTAssertTrue(app.buttons["privacy.contact"].isHittable)
        app.navigationBars["Privacy"].buttons["Torna alla mappa"].tap()
        XCTAssertTrue(app.navigationBars["Dove bevo"].waitForExistence(timeout: 5))
    }

    private func attachScreen(named name: String) {
        // Keep the original physical-screen PNG rather than cropping app bounds.
        let screenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        screenshot.name = name
        screenshot.lifetime = .keepAlways
        add(screenshot)
    }

    private func attachState(named name: String) {
        attachScreen(named: name)
        // This test opens the public service without account credentials.
        // Retain a bounded hierarchy at the actual interaction boundary.
        let hierarchy = XCTAttachment(string: String(app.debugDescription.prefix(32_768)))
        hierarchy.name = "\(name)-accessibility"
        hierarchy.lifetime = .keepAlways
        add(hierarchy)
    }

    private func assertNoNativeRecovery() {
        XCTAssertFalse(app.descendants(matching: .any)["browser.loading"].exists, "Native loading appeared during city search; inspect renderer diagnostics")
        XCTAssertFalse(app.descendants(matching: .any)["browser.error"].exists, "Native recovery/error UI replaced city search")
    }

    private func dismissKeyboardIntroductionIfPresent(searchField: XCUIElement) {
        // A fresh simulator may show this system tutorial instead of keys.
        // Handle only its observed prompt, never an arbitrary Continue button.
        let introduction = app.staticTexts.matching(
            NSPredicate(format: "label BEGINSWITH %@", "Speed up your typing")
        ).firstMatch
        guard introduction.waitForExistence(timeout: 2) else { return }
        attachScreen(named: "DoveBevo-keyboard-introduction-before-continue")
        let continueButton = app.buttons["Continue"]
        XCTAssertTrue(continueButton.waitForExistence(timeout: 5), "Keyboard introduction has no Continue action")
        let appFrame = app.frame
        let buttonFrame = continueButton.frame
        let dimensions = [appFrame.minX, appFrame.minY, appFrame.width, appFrame.height,
                          buttonFrame.minX, buttonFrame.minY, buttonFrame.width, buttonFrame.height]
        guard dimensions.allSatisfy({ $0.isFinite }), !appFrame.isEmpty,
              !buttonFrame.isEmpty, appFrame.contains(buttonFrame) else {
            XCTFail("The observed keyboard Continue action has no finite, visible frame")
            return
        }
        XCTAssertTrue(introduction.exists, "The keyboard tutorial disappeared before its scoped action")
        XCTAssertTrue(searchField.exists, "City search disappeared before dismissing the keyboard tutorial")
        assertNoNativeRecovery()
        // Cache the observed frame once. A coordinate tap avoids XCTest scrolling
        // or re-resolving this transient keyboard element as its process changes.
        let offset = CGVector(dx: buttonFrame.midX - appFrame.minX, dy: buttonFrame.midY - appFrame.minY)
        app.coordinate(withNormalizedOffset: .zero).withOffset(offset).tap()
        attachScreen(named: "DoveBevo-keyboard-introduction-after-continue")
        let dismissed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: introduction)
        XCTAssertEqual(XCTWaiter.wait(for: [dismissed], timeout: 10), .completed, "The observed keyboard tutorial did not dismiss")
        XCTAssertTrue(searchField.exists, "The original city search sheet was lost while dismissing the tutorial")
        assertNoNativeRecovery()
    }

    private func acceptBundledRulesIfShown() {
        let accept = app.buttons["welcome.accept"]
        guard accept.exists else { return }
        XCTAssertFalse(app.webViews.firstMatch.exists, "The website must not be created before rules acceptance")
        let scroll = app.scrollViews["welcome.scroll"]
        for _ in 0..<30 {
            if accept.isHittable { break }
            scroll.swipeUp()
        }
        XCTAssertTrue(accept.isHittable, "The full bundled rules must leave the acceptance action reachable")
        XCTAssertEqual(accept.label, "Ho almeno 18 anni e accetto")
        accept.tap()
        XCTAssertTrue(app.buttons["browser.more"].waitForExistence(timeout: 10))
    }
}
