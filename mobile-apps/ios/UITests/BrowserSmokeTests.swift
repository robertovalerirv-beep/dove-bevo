import XCTest
import CoreGraphics

final class BrowserSmokeTests: XCTestCase {
    private var app: XCUIApplication!
    private static let liveMapLabels = [
        "Mappa interattiva dei bar",
        "Mappa interattiva dei bar, region"
    ]
    private static let liveCoveragePattern = #"^(?:([0-9]+) bar su ([0-9]+) qui hanno un prezzo|([0-9]+)/([0-9]+) con prezzo)$"#

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
        for label in ["Cerca città o bar", "Milano · Cerca città o bar", "Paris · Cerca città o bar"] {
            XCTAssertTrue(citySearchPredicate().evaluate(with: ["label": label]))
        }
        for label in ["Cerca città", "Milano · Cerca città o bar extra", "\n · Cerca città o bar"] {
            XCTAssertFalse(citySearchPredicate().evaluate(with: ["label": label]))
        }
        XCTAssertTrue(citySearchPredicate(city: "Milano").evaluate(with: ["label": "Milano · Cerca città o bar"]))
        XCTAssertTrue(citySearchPredicate(city: "Milano").evaluate(with: ["label": "Cerca città o bar"]))
        XCTAssertFalse(citySearchPredicate(city: "Milano").evaluate(with: ["label": "Torino · Cerca città o bar"]))
        XCTAssertFalse(app.navigationBars["Dove bevo"].exists, "The map has no duplicate native header")
        for identifier in ["tab.home", "tab.search", "tab.map", "tab.favorites", "browser.more", "browser.recommendations", "browser.saveVenue"] {
            XCTAssertTrue(app.buttons[identifier].exists, identifier)
        }
        let bottomBar = app.descendants(matching: .any)["native.bottomNavigation"]
        XCTAssertEqual(bottomBar.buttons.count, 6)
        for (identifier, label) in [("tab.home", "Home"), ("tab.search", "Cerca"), ("tab.map", "Mappa"), ("tab.favorites", "Preferiti"), ("browser.saveVenue", "Salva nei preferiti"), ("browser.recommendations", "Drink consigliati")] {
            let control = bottomBar.buttons[identifier]
            XCTAssertTrue(control.exists, "All six controls must be in the bottom bar: \(identifier)")
            XCTAssertEqual(control.label, label)
            XCTAssertGreaterThanOrEqual(control.frame.width, 48)
            XCTAssertGreaterThanOrEqual(control.frame.height, 48)
            XCTAssertTrue(bottomBar.frame.contains(control.frame))
        }
        XCTAssertGreaterThanOrEqual(bottomBar.frame.minY, app.frame.midY)
        let topMore = app.buttons["browser.more"]
        XCTAssertEqual(topMore.label, "Altre opzioni")
        XCTAssertGreaterThanOrEqual(topMore.frame.width, 48)
        XCTAssertGreaterThanOrEqual(topMore.frame.height, 48)
        XCTAssertLessThanOrEqual(topMore.frame.maxY, app.webViews["browser.website"].frame.minY + 0.5,
                                 "The top three-dot menu must not cover the map city or currency")
        XCTAssertFalse(bottomBar.frame.contains(topMore.frame), "Overflow stays at the top, outside bottom navigation")
        XCTAssertTrue(bottomBar.buttons["tab.map"].isSelected)
        XCTAssertFalse(bottomBar.buttons["tab.favorites"].isSelected)
        XCTAssertFalse(bottomBar.buttons["browser.saveVenue"].isEnabled)
        XCTAssertFalse(bottomBar.buttons["browser.recommendations"].isEnabled)
        XCTAssertEqual(app.buttons.matching(identifier: "tab.favorites").count, 1)
        XCTAssertEqual(app.buttons["tab.search"].label, "Cerca")
        XCTAssertTrue(app.buttons["tab.search"].isHittable, "The bottom search action must be reachable without a map header")
        XCTAssertFalse(app.buttons["Condividi"].exists)
        XCTAssertFalse(app.buttons["Ricarica"].exists)
        app.buttons["browser.more"].tap()
        XCTAssertTrue(app.buttons["Condividi"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Ricarica"].exists || app.buttons["Interrompi"].exists)
        for label in ["Home", "Cerca", "Preferiti", "Salva nei preferiti", "Drink consigliati"] {
            XCTAssertEqual(app.buttons.matching(NSPredicate(format: "label == %@", label)).count, 1,
                           "More must not duplicate a bottom control: \(label)")
        }
        XCTAssertFalse(app.buttons["tab.search"].isSelected, "Cerca opens search; Mappa is the current destination")
        XCTAssertFalse(app.buttons["Scopri"].exists, "Home is a bottom destination rather than a duplicate menu action")
        app.buttons["Informazioni"].tap()
        returnFromNativeInformation()
    }

    func testBundledPrivacyContactAndNativeBack() {
        XCTAssertTrue(app.buttons["browser.more"].waitForExistence(timeout: 10))
        openPrivacyAndReturn()
        // The website is deliberately excluded from accessibility while native
        // recovery covers it; this native-only case does not require internet.
        XCTAssertTrue(app.buttons["tab.search"].exists)
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
        app.buttons["browser.more"].tap()
        XCTAssertFalse(app.buttons["Condividi"].exists, "Hidden map actions are absent from Preferiti")
        app.buttons["Privacy"].tap()
        XCTAssertTrue(app.navigationBars["Privacy"].waitForExistence(timeout: 5))
        app.navigationBars["Privacy"].buttons.firstMatch.tap()
        XCTAssertTrue(app.navigationBars["Preferiti"].waitForExistence(timeout: 5))
        app.buttons["browser.more"].tap()
        app.buttons["Informazioni"].tap()
        XCTAssertTrue(app.navigationBars["Altro"].waitForExistence(timeout: 5))
        app.navigationBars["Altro"].buttons.firstMatch.tap()
        XCTAssertTrue(app.navigationBars["Preferiti"].waitForExistence(timeout: 5))
        app.buttons["tab.map"].tap()
        XCTAssertFalse(app.navigationBars["Dove bevo"].exists)
        XCTAssertTrue(app.buttons["tab.search"].exists)
        assertReloadInMoreMenu()
        app.buttons["tab.favorites"].tap()
        app.buttons["tab.search"].tap()
        XCTAssertTrue(app.buttons["tab.map"].isSelected)
        XCTAssertFalse(app.navigationBars["Scopri"].exists, "Cerca must open map search, not Discover")
        app.buttons["tab.home"].tap()
        XCTAssertTrue(app.navigationBars["Scopri"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.tables["discovery.list"].exists)
        XCTAssertTrue(app.staticTexts["discovery.chooseArea"].exists, "An uncaptured map area must not invent a nearby feed")
        XCTAssertFalse(app.buttons["tab.map"].isSelected)
        XCTAssertTrue(app.buttons["tab.home"].isSelected)
        XCTAssertFalse(app.buttons["browser.saveVenue"].isEnabled)
        XCTAssertFalse(app.buttons["browser.recommendations"].isEnabled)
        attachState(named: "DoveBevo-native-discovery-choose-map-area")
        app.buttons["tab.map"].tap()
        XCTAssertFalse(app.navigationBars["Dove bevo"].exists)
        XCTAssertTrue(app.buttons["tab.map"].isSelected)
    }

    /// This deliberately requires live HTTPS website readiness. A native
    /// toolbar or an offline/retry screen does not count as a working map.
    func testLiveWebsiteCitySearchAndMap() {
        let website = app.webViews.firstMatch
        XCTAssertTrue(website.waitForExistence(timeout: 20), "WKWebView did not appear")
        let searchButton = app.buttons["tab.search"]
        XCTAssertTrue(searchButton.waitForExistence(timeout: 20), "The native bottom search action did not appear")
        let locateButton = website.buttons["Vicino a me"]
        XCTAssertTrue(locateButton.waitForExistence(timeout: 90), "Live website did not become ready; inspect screenshot and network/challenge state")
        let loading = app.descendants(matching: .any)["browser.loading"]
        let error = app.descendants(matching: .any)["browser.error"]
        // Web content can enter the accessibility tree before WKNavigation's
        // didFinish. Require both native load completion and a reachable action.
        let ready = NSPredicate { _, _ in
            !loading.exists && !error.exists &&
                locateButton.exists && searchButton.exists && searchButton.isHittable
        }
        let readiness = XCTNSPredicateExpectation(predicate: ready, object: nil)
        let readinessResult = XCTWaiter.wait(for: [readiness], timeout: 30)
        attachState(named: "DoveBevo-live-before-search-tap")
        XCTAssertEqual(readinessResult, .completed, "Native loading and the website search action did not become ready together")
        XCTAssertTrue(locateButton.exists)
        XCTAssertTrue(ready.evaluate(with: nil), "Page readiness changed before the single search tap")
        assertOnlyNativeSearch(in: website)
        assertShareAndReloadAvailable()
        assertNoSharePresentation()
        XCTAssertTrue(searchButton.isHittable, "Menu dismissal must leave the bottom Cerca action reachable")
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
        // The hosted simulator can already have ordinary keys after the first
        // focus. A second tap on that focused field triggered the iOS keyboard
        // tutorial and stalled its accessibility snapshot in an exact run.
        // Tap only when the actual keyboard is not yet usable.
        if !ordinaryKeyboardVisible() {
            searchField.tap()
            dismissKeyboardIntroductionIfPresent(searchField: searchField)
        }
        waitForOrdinaryKeyboard()
        attachScreen(named: "DoveBevo-live-city-search-before-input")
        searchField.typeText("Milano")
        // iOS may show its Slide to Type introduction after the first real
        // keystrokes. The page can already have the query and results while
        // XCTest still reads the field's stale placeholder through that overlay.
        dismissKeyboardIntroductionIfPresent(searchField: searchField)
        let typedValue = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "value == %@", "Milano"), object: searchField)
        let typedResult = XCTWaiter.wait(for: [typedValue], timeout: 15)
        if typedResult != .completed { attachState(named: "DoveBevo-live-city-value-not-ready") }
        XCTAssertEqual(typedResult, .completed, "The actual website input must receive Milano after keyboard onboarding")
        XCTAssertEqual(searchField.value as? String, "Milano", "The actual website input must receive the query")
        let city = website.descendants(matching: .any).matching(
            NSPredicate(format: "label BEGINSWITH[c] %@ AND label CONTAINS[c] %@", "Milano", "Città")
        ).firstMatch
        XCTAssertTrue(city.waitForExistence(timeout: 30), "Live city data did not return Milano")
        var lastSearchSample = "No complete search visibility sample"
        let searchVisible = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            let started = Date()
            let fieldExists = searchField.exists
            let cityExists = city.exists
            guard fieldExists && cityExists else {
                lastSearchSample = "fieldExists=\(fieldExists), cityExists=\(cityExists)"
                return false
            }
            // Application.frame caused repeated AX lookups while the keyboard
            // was open. Sample the actual app window and each rectangle once.
            let windowFrame = self.app.windows.firstMatch.frame
            let websiteFrame = website.frame
            let fieldFrame = searchField.frame
            let cityFrame = city.frame
            let queryMatches = (searchField.value as? String) == "Milano"
            let fieldHittable = searchField.isHittable
            let cityHittable = city.isHittable
            var keyboardFrame = CGRect.null
            for keyboard in self.app.keyboards.allElementsBoundByIndex {
                guard keyboard.exists else { continue }
                let candidateFrame = keyboard.frame
                if self.isOrdinaryKeyboard(keyboard, frame: candidateFrame, windowFrame: windowFrame) {
                    keyboardFrame = candidateFrame
                    break
                }
            }
            let fieldVisible = Self.frameVisibleAboveKeyboard(fieldFrame, websiteFrame: websiteFrame,
                                                              windowFrame: windowFrame, keyboardFrame: keyboardFrame)
            let cityVisible = Self.frameVisibleAboveKeyboard(cityFrame, websiteFrame: websiteFrame,
                                                             windowFrame: windowFrame, keyboardFrame: keyboardFrame)
            lastSearchSample = """
            seconds=\(Date().timeIntervalSince(started))
            fieldExists=\(fieldExists), cityExists=\(cityExists), queryMatches=\(queryMatches)
            fieldHittable=\(fieldHittable), cityHittable=\(cityHittable)
            ordinaryKeyboard=\(!keyboardFrame.isNull), fieldVisible=\(fieldVisible), cityVisible=\(cityVisible)
            window=\(windowFrame), website=\(websiteFrame)
            field=\(fieldFrame), city=\(cityFrame), keyboard=\(keyboardFrame)
            """
            return queryMatches && fieldHittable && cityHittable && fieldVisible && cityVisible
        }, object: nil)
        let visibilityResult = XCTWaiter.wait(for: [searchVisible], timeout: 45)
        let sampleAttachment = XCTAttachment(string: lastSearchSample)
        sampleAttachment.name = "DoveBevo-search-visibility-sample"
        sampleAttachment.lifetime = .keepAlways
        add(sampleAttachment)
        attachState(named: "DoveBevo-live-search-input-and-first-city-above-keyboard")
        XCTAssertEqual(visibilityResult, .completed,
                       "The original input and first Milano result must both remain visible above the ordinary keyboard before tapping")
        city.tap()

        let searchClosed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: searchField)
        XCTAssertEqual(XCTWaiter.wait(for: [searchClosed], timeout: 15), .completed,
                       "Selecting the real Milano result must close the search sheet")
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
        assertOnlyNativeSearch(in: website)
        assertNoNativeRecovery()
        assertShareAndReloadAvailable()
        openPrivacyAndReturn()
        XCTAssertTrue(interactiveMap().exists, "Returning from native privacy must retain the website map")
        XCTAssertTrue(hasVisiblePositiveCoverage(), "Returning from native privacy must retain live price coverage")
        assertOnlyNativeSearch(in: app.webViews["browser.website"])
        XCTAssertFalse(app.webViews["browser.website"].buttons["Esplora la mappa"].exists)
        XCTAssertFalse(app.webViews["browser.website"].staticTexts["La mappa non si carica: controlla la connessione e ricarica la pagina."].exists)
        assertNoNativeRecovery()
        assertShareAndReloadAvailable()
        verifyLiveSavedVenueRoundTrip()
        verifyLiveDiscoveryReadOnly()
        attachScreen(named: "DoveBevo-live-Milano-map")
    }

    private func verifyLiveDiscoveryReadOnly() {
        // The real viewed map area is captured when Home opens Discover.
        // All discovery requests are existing public GETs; no price or vote.
        app.buttons["tab.home"].tap()
        XCTAssertTrue(app.navigationBars["Scopri"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["tab.home"].isSelected)
        XCTAssertFalse(app.buttons["browser.saveVenue"].isEnabled)
        XCTAssertFalse(app.buttons["browser.recommendations"].isEnabled)
        let table = app.tables["discovery.list"]
        XCTAssertTrue(table.waitForExistence(timeout: 5))
        let loaded = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            self.app.staticTexts["discovery.loaded"].exists || self.app.staticTexts["discovery.partial"].exists
        }, object: nil)
        let result = XCTWaiter.wait(for: [loaded], timeout: 65)
        attachState(named: "DoveBevo-live-native-discovery-prices-read-only")
        XCTAssertEqual(result, .completed, "Discovery must load actual prices from the current public map neighbourhood")
        XCTAssertFalse(app.staticTexts["discovery.chooseArea"].exists)
        XCTAssertGreaterThan(table.cells.count, 0, "The current live map area must yield a real nearby price for the selected drink")
        let drinkSelector = app.buttons["discovery.drinkSelector"]
        XCTAssertTrue(drinkSelector.exists)
        XCTAssertEqual(drinkSelector.value as? String, "Birra media")
        drinkSelector.tap()
        // Scope the system menu: the native Discover card is also a Spritz button.
        let spritzOption = app.collectionViews.buttons["Spritz"]
        XCTAssertTrue(spritzOption.waitForExistence(timeout: 5))
        XCTAssertTrue(spritzOption.isHittable)
        spritzOption.tap()
        XCTAssertEqual(drinkSelector.value as? String, "Spritz")
        drinkSelector.tap()
        let beerOption = app.collectionViews.buttons["Birra media"]
        XCTAssertTrue(beerOption.waitForExistence(timeout: 5))
        XCTAssertTrue(beerOption.isHittable)
        beerOption.tap()
        XCTAssertEqual(drinkSelector.value as? String, "Birra media")
        let venue = table.cells.firstMatch
        XCTAssertTrue(venue.identifier.hasPrefix("discovery.venue."))
        XCTAssertTrue((venue.value as? String)?.contains("€") == true)
        XCTAssertTrue((venue.value as? String)?.contains("dal centro mappa") == true)
        if !venue.isHittable { table.swipeUp() }
        XCTAssertTrue(venue.isHittable)
        venue.tap()
        XCTAssertFalse(app.navigationBars["Dove bevo"].exists)
        let website = app.webViews["browser.website"]
        XCTAssertTrue(website.links["Indicazioni"].waitForExistence(timeout: 45), "The native card opens its actual canonical venue in the retained map")
        waitForNativePageReady()
        let close = website.buttons["Chiudi"]
        XCTAssertTrue(close.exists); close.tap()
        XCTAssertTrue(interactiveMap().waitForExistence(timeout: 15))
        XCTAssertTrue(hasVisiblePositiveCoverage())
    }

    private func verifyLiveSavedVenueRoundTrip() {
        let website = app.webViews["browser.website"]
        // A fresh owned installation lets this test remove only its own entry.
        // Never clear preferences, overwrite an existing choice or contribute data.
        app.buttons["tab.favorites"].tap()
        XCTAssertTrue(app.navigationBars["Preferiti"].waitForExistence(timeout: 10))
        let initialSavedTable = app.tables["savedVenues.list"]
        let emptyMessage = initialSavedTable.descendants(matching: .any).matching(
            NSPredicate(format: "label BEGINSWITH[c] %@", "Non hai ancora drink salvati.")
        ).firstMatch
        guard initialSavedTable.waitForExistence(timeout: 5), initialSavedTable.cells.count == 0,
              emptyMessage.waitForExistence(timeout: 5), !app.buttons["savedVenues.retry"].exists else {
            XCTFail("Live bookmark QA requires an owned empty installation; existing records were left unchanged")
            return
        }
        app.buttons["tab.map"].tap()
        XCTAssertFalse(app.navigationBars["Dove bevo"].exists)
        XCTAssertTrue(hasVisiblePositiveCoverage(), "The native list must preserve the live map")
        let listButton = website.buttons["Elenco"]
        XCTAssertTrue(listButton.waitForExistence(timeout: 10))
        XCTAssertTrue(listButton.isHittable)
        listButton.tap()
        let listTitle = website.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "Bar nella zona")).firstMatch
        XCTAssertTrue(listTitle.waitForExistence(timeout: 10))
        attachState(named: "DoveBevo-live-default-tutti-list")
        let menuLinks = website.links.matching(NSPredicate(format: "label MATCHES %@", ".*[1-9][0-9]* (voce|voci) menu.*"))
        XCTAssertTrue(menuLinks.firstMatch.waitForExistence(timeout: 20), "Tutti must expose an actual verified owner-menu count")
        let pricedLinks = website.links.matching(NSPredicate(format: "label MATCHES %@", ".*[1-9][0-9]* (prezzo segnalato|prezzi segnalati).*"))
        XCTAssertTrue(pricedLinks.firstMatch.waitForExistence(timeout: 20), "Tutti must expose an actual positive reported-price count")
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
            XCTFail("No existing reported-price venue became reachable in Elenco")
            return
        }
        // ListSheet puts the existing public venue name before count/address.
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
        verifyLiveVenueHistoryReadOnly(venueName: publicName)
        verifyLiveVenueAndPriceFormReadOnly(venueName: publicName)
        verifyLiveRecommendationsReadOnly(venueName: publicName)
        saveCurrentDrinkAtVenue()
        app.buttons["tab.favorites"].tap()
        let savedTable = app.tables["savedVenues.list"]
        let savedRow = savedTable.cells.matching(NSPredicate(format: "label CONTAINS %@", publicName)).firstMatch
        XCTAssertTrue(savedRow.waitForExistence(timeout: 10), "One explicit drink must be saved under the actual venue name")
        XCTAssertEqual(savedTable.cells.count, 1)
        XCTAssertFalse(app.textFields["savedVenue.name"].exists)
        let savedDrinkLabel = "Birra media · Normale · \(publicName)"
        XCTAssertEqual(savedRow.label, savedDrinkLabel, "The sole favourite must be the chosen drink at this venue")
        verifyLiveFavouriteComparisonReadOnly()
        attachScreen(named: "DoveBevo-live-native-saved-venue")
        app.buttons["tab.map"].tap()
        XCTAssertFalse(app.navigationBars["Dove bevo"].exists)
        let initialCloseBar = website.buttons["Chiudi"]
        XCTAssertTrue(initialCloseBar.waitForExistence(timeout: 10))
        initialCloseBar.tap()
        let venueClosed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: website.links["Indicazioni"])
        XCTAssertEqual(XCTWaiter.wait(for: [venueClosed], timeout: 15), .completed)
        XCTAssertTrue(interactiveMap().waitForExistence(timeout: 15))
        XCTAssertTrue(hasVisiblePositiveCoverage())
        app.buttons["tab.favorites"].tap()
        XCTAssertTrue(app.navigationBars["Preferiti"].waitForExistence(timeout: 10))
        let reopenRow = app.tables["savedVenues.list"].cells.matching(
            NSPredicate(format: "label == %@", savedDrinkLabel)
        ).firstMatch
        XCTAssertTrue(reopenRow.waitForExistence(timeout: 10))
        XCTAssertTrue(reopenRow.label.contains(publicName))
        reopenRow.tap()
        XCTAssertFalse(app.navigationBars["Dove bevo"].exists)
        XCTAssertTrue(website.links["Indicazioni"].waitForExistence(timeout: 45))
        XCTAssertTrue(website.staticTexts[publicName].waitForExistence(timeout: 15), "Reopen must show the actual saved venue name")
        waitForNativePageReady()
        // Saving the reopened venue must update that same record, not create a
        // different URL/key or ask the tester to provide an invented name.
        saveCurrentDrinkAtVenue()
        app.buttons["tab.favorites"].tap()
        XCTAssertEqual(app.tables["savedVenues.list"].cells.count, 1)
        let qaRow = app.tables["savedVenues.list"].cells.matching(
            NSPredicate(format: "label == %@", savedDrinkLabel)
        ).firstMatch
        XCTAssertTrue(qaRow.waitForExistence(timeout: 10))
        XCTAssertTrue(qaRow.label.contains(publicName))
        qaRow.swipeLeft()
        let remove = app.buttons["Rimuovi"]
        XCTAssertTrue(remove.waitForExistence(timeout: 5))
        remove.tap()
        let removed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: qaRow)
        XCTAssertEqual(XCTWaiter.wait(for: [removed], timeout: 10), .completed, "Remove only the test's private bookmark")
        XCTAssertEqual(app.tables["savedVenues.list"].cells.count, 0)
        app.buttons["tab.map"].tap()
        XCTAssertFalse(app.navigationBars["Dove bevo"].exists)
        let closeBar = website.buttons["Chiudi"]
        XCTAssertTrue(closeBar.waitForExistence(timeout: 10))
        closeBar.tap()
        XCTAssertTrue(interactiveMap().waitForExistence(timeout: 45))
        let mapReady = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == false"), object: website.buttons["Esplora la mappa"]
        )
        XCTAssertEqual(XCTWaiter.wait(for: [mapReady], timeout: 45), .completed)
        let coverage = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in self.hasVisiblePositiveCoverage() }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [coverage], timeout: 45), .completed, "The final map still requires genuine positive price coverage")
        XCTAssertFalse(website.staticTexts["La mappa non si carica: controlla la connessione e ricarica la pagina."].exists)
        assertOnlyNativeSearch(in: website)
        assertNoNativeRecovery()
        assertShareAndReloadAvailable()
    }

    private func verifyLiveFavouriteComparisonReadOnly() {
        XCTAssertTrue(app.buttons["tab.favorites"].isSelected)
        let finished = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            self.app.staticTexts["favorites.loaded"].exists || self.app.staticTexts["favorites.partial"].exists
        }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [finished], timeout: 60), .completed, "The saved drink comparison must finish with an explicit result")
        let selector = app.buttons["favorites.drink"]
        XCTAssertTrue(selector.exists)
        selector.tap()
        let menuButtons = app.collectionViews.buttons
        let drinkActions = ["Birra media", "Spritz", "Negroni", "Sbagliato", "Gin tonic", "Gin lemon", "Calice di vino", "Analcolico", "Acqua", "Tutti i drink"]
        for name in drinkActions {
            XCTAssertTrue(menuButtons[name].exists, name)
        }
        let visibleDrinkActions = menuButtons.allElementsBoundByIndex.map(\.label).filter { drinkActions.contains($0) }
        XCTAssertEqual(visibleDrinkActions, drinkActions, "The accessible menu must offer all nine drink categories before Tutti i drink")
        menuButtons["Spritz"].tap()
        XCTAssertTrue(selector.label.contains("Spritz"))
        XCTAssertEqual(app.tables["savedVenues.list"].cells.count, 0)
        selector.tap(); app.collectionViews.buttons["Birra media"].tap()
        XCTAssertTrue(selector.label.contains("Birra media"))
        XCTAssertEqual(app.tables["savedVenues.list"].cells.count, 1)
        XCTAssertFalse(app.segmentedControls["favorites.kind"].exists)
        XCTAssertTrue(app.buttons["favorites.refresh"].exists)
    }

    private func verifyLiveVenueHistoryReadOnly(venueName: String) {
        // The actual user tap on an existing public venue creates its SPA
        // history entry. Exercise native Back/Forward, never JavaScript history
        // calls or a programmatic substitute for the user's interaction.
        let website = app.webViews["browser.website"]
        app.buttons["browser.more"].tap()
        let back = app.buttons["Indietro"]
        XCTAssertTrue(back.exists && back.isEnabled)
        back.tap()
        let closed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: website.links["Indicazioni"])
        XCTAssertEqual(XCTWaiter.wait(for: [closed], timeout: 15), .completed)
        XCTAssertTrue(interactiveMap().exists)
        XCTAssertTrue(hasVisiblePositiveCoverage())
        XCTAssertFalse(app.buttons["browser.saveVenue"].isEnabled)
        assertNoNativeRecovery()
        assertShareAndReloadAvailable()
        app.buttons["browser.more"].tap()
        let forward = app.buttons["Avanti"]
        XCTAssertTrue(forward.exists && forward.isEnabled)
        forward.tap()
        XCTAssertTrue(website.links["Indicazioni"].waitForExistence(timeout: 30))
        XCTAssertTrue(website.staticTexts[venueName].waitForExistence(timeout: 10))
        waitForNativePageReady()
    }

    private func waitForOrdinaryKeyboard(timeout: TimeInterval = 15) {
        let ready = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            self.ordinaryKeyboardVisible()
        }, object: nil)
        let result = XCTWaiter.wait(for: [ready], timeout: timeout)
        if result != .completed { attachState(named: "DoveBevo-original-field-keyboard-not-ready") }
        XCTAssertEqual(result, .completed, "The existing field must have an ordinary visible keyboard before typing")
    }

    private func ordinaryKeyboardVisible() -> Bool {
        let windowFrame = app.windows.firstMatch.frame
        return app.keyboards.allElementsBoundByIndex.contains { keyboard in
            guard keyboard.exists else { return false }
            return isOrdinaryKeyboard(keyboard, frame: keyboard.frame, windowFrame: windowFrame)
        }
    }

    private func isOrdinaryKeyboard(_ keyboard: XCUIElement, frame: CGRect, windowFrame: CGRect) -> Bool {
        guard keyboard.exists else { return false }
        guard frame.width >= 250, frame.height >= 150, windowFrame.intersects(frame) else { return false }
        // A tiny UIKeyboardLayoutStar Preview is not a usable keyboard.
        return keyboard.keys.matching(NSPredicate(format: "label IN %@", ["m", "M"] as NSArray)).allElementsBoundByIndex.contains { key in
            // iOS 27's keyboard tutorial can leave the real keys in a second
            // keyboard window. XCTest marked its visible m key non-hittable in
            // the captured tree despite a full 40x54 pt key on screen. The
            // subsequent typeText and field-value checks prove usability.
            guard key.exists else { return false }
            let keyFrame = key.frame
            return keyFrame.width >= 20 && keyFrame.height >= 20 && windowFrame.contains(keyFrame)
        }
    }

    private func verifyLiveVenueAndPriceFormReadOnly(venueName: String) {
        let website = app.webViews["browser.website"]
        let normalViewport = website.frame
        XCTAssertTrue(website.staticTexts[venueName].exists)
        XCTAssertTrue(website.links["Indicazioni"].exists)
        let priceAction = website.buttons.matching(NSPredicate(format: "label IN %@", ["Confermo", "Confermato", "Già confermato"] as NSArray)).firstMatch
        XCTAssertTrue(priceAction.waitForExistence(timeout: 30), "Capture the actual priced venue after its public price rows load; never activate a confirmation")
        let addHere = website.buttons["Aggiungi un prezzo qui"]
        XCTAssertTrue(addHere.waitForExistence(timeout: 10))
        attachScreen(named: "DoveBevo-live-venue-detail-read-only")
        for _ in 0..<3 {
            if addHere.isHittable { break }
            website.swipeUp()
        }
        XCTAssertTrue(addHere.isHittable)
        addHere.tap()
        // The venue is already selected. Choosing a fixed catalogue category
        // only opens its empty form; never tap a one-touch public price chip.
        XCTAssertTrue(app.staticTexts["Che cosa hai preso?"].waitForExistence(timeout: 10))
        let category = website.buttons["Birra media"]
        XCTAssertTrue(category.isHittable)
        category.tap()
        let price = app.textFields["Prezzo in euro"]
        XCTAssertTrue(price.waitForExistence(timeout: 10))
        XCTAssertTrue(website.staticTexts[venueName].exists)
        let submit = website.buttons["Salva"]
        XCTAssertTrue(submit.exists)
        XCTAssertFalse(submit.isEnabled, "An untouched empty price must never enable public submission")
        attachScreen(named: "DoveBevo-live-price-form-empty-read-only")
        XCTAssertTrue(price.isHittable)
        // The category tap normally focuses this form inside its real user
        // gesture. Retapping an already focused field opens Paste/Autofill.
        if ordinaryDecimalKeyboard() == nil { price.tap() }
        let keyboardReady = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in self.ordinaryDecimalKeyboard() != nil }, object: nil)
        let result = XCTWaiter.wait(for: [keyboardReady], timeout: 15)
        if result != .completed { attachState(named: "DoveBevo-live-price-keyboard-not-ready") }
        XCTAssertEqual(result, .completed, "The actual decimal price field must show usable software number keys")
        guard let keyboard = ordinaryDecimalKeyboard() else {
            XCTFail("The real decimal keyboard disappeared before inspecting the focused field")
            return
        }
        let viewportReady = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            guard let current = self.ordinaryDecimalKeyboard() else { return false }
            let frame = website.frame
            return frame.height > 0 && frame.height < normalViewport.height &&
                abs(frame.minY - normalViewport.minY) <= 0.5 && abs(frame.width - normalViewport.width) <= 0.5 &&
                frame.maxY <= current.frame.minY
        }, object: nil)
        let viewportResult = XCTWaiter.wait(for: [viewportReady], timeout: 10)
        attachState(named: "DoveBevo-live-price-field-with-keyboard-read-only")
        XCTAssertEqual(viewportResult, .completed, "The real web viewport must resize above the docked keyboard")
        XCTAssertTrue(price.isHittable)
        XCTAssertTrue(visibleAboveKeyboard(price, keyboard: keyboard), "The focused price field must remain visible above the keyboard")
        // A long list of real nearby price examples may place the final button
        // lower in this sheet. Scroll only; leave the value empty and disabled.
        for _ in 0..<3 {
            if let current = ordinaryDecimalKeyboard(), visibleAboveKeyboard(submit, keyboard: current) { break }
            website.swipeUp()
        }
        attachState(named: "DoveBevo-live-price-action-with-keyboard-read-only")
        guard let finalKeyboard = ordinaryDecimalKeyboard() else {
            XCTFail("Inspect the submit control while the real decimal keyboard is still visible")
            return
        }
        XCTAssertTrue(visibleAboveKeyboard(submit, keyboard: finalKeyboard), "The final price action must be reachable by scrolling above the keyboard")
        XCTAssertFalse(submit.isEnabled)
        let value = price.value as? String ?? ""
        XCTAssertTrue(value.isEmpty || value == "0,00", "This inspection must never type or prefill a test price")
        let close = website.buttons.matching(NSPredicate(format: "label == %@", "Chiudi")).allElementsBoundByIndex.filter { $0.isHittable }
        XCTAssertEqual(close.count, 1, "Close only the active form using its visible native HTML dialog control")
        guard let closeForm = close.first else { return }
        closeForm.tap()
        let closed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: price)
        XCTAssertEqual(XCTWaiter.wait(for: [closed], timeout: 10), .completed)
        let keyboardClosed = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in self.ordinaryDecimalKeyboard() == nil }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [keyboardClosed], timeout: 10), .completed)
        let restoredViewport = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            let frame = website.frame
            return abs(frame.minX - normalViewport.minX) <= 0.5 && abs(frame.minY - normalViewport.minY) <= 0.5 &&
                abs(frame.width - normalViewport.width) <= 0.5 && abs(frame.height - normalViewport.height) <= 0.5
        }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [restoredViewport], timeout: 10), .completed, "Closing the form must restore the original browser viewport")
        XCTAssertTrue(website.staticTexts[venueName].exists)
        XCTAssertTrue(website.links["Indicazioni"].exists)
        waitForNativePageReady()
        assertNoNativeRecovery()
    }

    private func ordinaryDecimalKeyboard() -> XCUIElement? {
        let windowFrame = app.windows.firstMatch.frame
        return app.keyboards.allElementsBoundByIndex.first { keyboard in
            guard keyboard.exists else { return false }
            let keyboardFrame = keyboard.frame
            guard keyboardFrame.width >= 250, keyboardFrame.height >= 150,
                  windowFrame.intersects(keyboardFrame) else { return false }
            return keyboard.keys.matching(NSPredicate(format: "label IN %@", ["1", "2"] as NSArray)).allElementsBoundByIndex.contains { key in
                guard key.exists && key.isHittable else { return false }
                let keyFrame = key.frame
                return keyFrame.width >= 20 && keyFrame.height >= 20 && windowFrame.contains(keyFrame)
            }
        }
    }

    private func visibleAboveKeyboard(_ element: XCUIElement, keyboard: XCUIElement) -> Bool {
        guard element.exists else { return false }
        let frame = element.frame
        let websiteFrame = app.webViews["browser.website"].frame
        let windowFrame = app.windows.firstMatch.frame
        return Self.frameVisibleAboveKeyboard(frame, websiteFrame: websiteFrame,
                                               windowFrame: windowFrame, keyboardFrame: keyboard.frame)
    }

    private static func frameVisibleAboveKeyboard(_ frame: CGRect, websiteFrame: CGRect,
                                                  windowFrame: CGRect, keyboardFrame: CGRect) -> Bool {
        let rectangles = [frame, websiteFrame, windowFrame, keyboardFrame]
        return rectangles.allSatisfy { rectangle in
            !rectangle.isNull && !rectangle.isInfinite && rectangle.width > 0 && rectangle.height > 0 &&
                [rectangle.minX, rectangle.minY, rectangle.maxX, rectangle.maxY].allSatisfy { $0.isFinite }
        } && frame.width >= 44 && frame.height >= 44 &&
            windowFrame.contains(frame) && websiteFrame.contains(frame) && frame.maxY <= keyboardFrame.minY
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

    private func saveCurrentDrinkAtVenue() {
        let save = app.buttons["browser.saveVenue"]
        let enabled = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in save.exists && save.isEnabled }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [enabled], timeout: 10), .completed)
        save.tap()
        let chooser = app.tables["favorites.saveChooser"]
        XCTAssertTrue(chooser.waitForExistence(timeout: 10))
        chooser.cells["favorites.saveDrink.beer_draft"].tap()
        app.buttons["favorites.saveDrink"].tap()
        let confirmation = app.alerts["Preferito salvato"]
        XCTAssertTrue(confirmation.waitForExistence(timeout: 10))
        confirmation.buttons["Chiudi"].tap()
        XCTAssertFalse(app.navigationBars["Dove bevo"].exists)
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
        let reload = app.buttons["Ricarica"]
        let stop = app.buttons["Interrompi"]
        let available = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            reload.exists || stop.exists
        }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [available], timeout: 5), .completed)
        dismissMoreMenu()
    }

    private func dismissMoreMenu() {
        // Select a real, harmless native menu action rather than a coordinate
        // behind the context menu. Returning from the top menu preserves this browser.
        let information = app.buttons["Informazioni"]
        XCTAssertTrue(information.waitForExistence(timeout: 5))
        XCTAssertTrue(information.isHittable)
        information.tap()
        returnFromNativeInformation()
        let closed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: app.buttons["Condividi"])
        XCTAssertEqual(XCTWaiter.wait(for: [closed], timeout: 5), .completed)
        assertNoSharePresentation()
        XCTAssertTrue(app.buttons["tab.map"].isSelected)
        XCTAssertFalse(app.navigationBars["Dove bevo"].exists)
    }

    private func returnFromNativeInformation() {
        let information = app.navigationBars["Altro"]
        XCTAssertTrue(information.waitForExistence(timeout: 5))
        let list = app.tables["information.list"]
        XCTAssertTrue(list.exists, "Informazioni must open the real native menu")
        for identifier in ["information.how", "information.rules", "information.privacy", "information.contact"] {
            XCTAssertTrue(list.cells[identifier].exists, identifier)
        }
        let back = information.buttons["Torna alla mappa"]
        XCTAssertTrue(back.exists && back.isHittable)
        back.tap()
        XCTAssertFalse(app.navigationBars["Dove bevo"].exists)
        XCTAssertFalse(app.tables["information.list"].exists)
    }

    private func assertNoSharePresentation() {
        XCTAssertFalse(app.otherElements["ShareSheet.RemoteContainerView"].exists, "Menu dismissal must never activate Share")
        XCTAssertFalse(app.otherElements["ActivityListView"].exists)
        XCTAssertFalse(app.otherElements["UIActivityContentView"].exists)
        let map = app.buttons["tab.map"]
        XCTAssertTrue(map.exists && map.isHittable && map.isSelected, "The native map must be usable after dismissing More without a blocking share sheet")
    }

    private func citySearchPredicate(city: String? = nil) -> NSPredicate {
        // The pre-deployment native gate runs against the current public web
        // bundle too. Its exact legacy label is valid alongside the new city label.
        let prefix = city.map { "(?:" + NSRegularExpression.escapedPattern(for: $0) + " · )?" }
            ?? #"(?:[^\r\n\p{Cc}\u2028\u2029]{1,120} · )?"#
        return NSPredicate(format: "label MATCHES %@", "\\A" + prefix + "Cerca città o bar\\z")
    }

    private func assertOnlyNativeSearch(in website: XCUIElement, file: StaticString = #filePath, line: UInt = #line) {
        let nativeSearch = app.buttons["tab.search"]
        XCTAssertTrue(nativeSearch.exists && nativeSearch.isHittable, "The bottom Cerca action must remain reachable", file: file, line: line)
        XCTAssertEqual(website.buttons.matching(citySearchPredicate()).count, 0,
                       "The old top search lens must be absent from the accessible web map", file: file, line: line)
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
              let pricedRange = Range(match.range(at: 1), in: label) ?? Range(match.range(at: 3), in: label),
              let totalRange = Range(match.range(at: 2), in: label) ?? Range(match.range(at: 4), in: label),
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
        XCTAssertFalse(app.navigationBars["Dove bevo"].exists)
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
        // The actual failed-run screenshot showed ordinary keys after this tap,
        // although the tutorial-disappearance predicate timed out. Require the
        // usable visible keyboard instead of inferring readiness from absence.
        waitForOrdinaryKeyboard(timeout: 10)
        attachState(named: "DoveBevo-keyboard-introduction-after-continue")
        XCTAssertTrue(searchField.exists, "The original city search sheet was lost while dismissing the tutorial")
        XCTAssertTrue(searchField.isHittable, "The original city search field must remain reachable with the ordinary keyboard")
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
