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
        for identifier in ["browser.back", "browser.forward", "browser.home", "browser.share", "browser.reload", "browser.more"] {
            XCTAssertTrue(app.buttons[identifier].exists, identifier)
        }
        XCTAssertEqual(app.buttons["browser.home"].label, "Home")
        XCTAssertEqual(app.buttons["browser.share"].label, "Condividi")
        app.buttons["browser.more"].tap()
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
        XCTAssertTrue(app.buttons["browser.reload"].exists)
    }

    func testNativeSavedVenuesListReturnsToTheExistingBrowser() {
        XCTAssertTrue(app.buttons["browser.more"].waitForExistence(timeout: 10))
        app.buttons["browser.more"].tap()
        XCTAssertTrue(app.buttons["Salva locale"].exists)
        XCTAssertFalse(app.buttons["Salva locale"].isEnabled, "The initial home/map page is not a venue to save")
        app.buttons["Locali salvati"].tap()
        XCTAssertTrue(app.navigationBars["Locali salvati"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.tables["savedVenues.list"].exists)
        app.navigationBars["Locali salvati"].buttons["Torna alla mappa"].tap()
        XCTAssertTrue(app.navigationBars["Dove bevo"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["browser.home"].exists)
        XCTAssertTrue(app.buttons["browser.reload"].exists)
    }

    /// This deliberately requires live HTTPS website readiness. A native
    /// toolbar or an offline/retry screen does not count as a working map.
    func testLiveWebsiteCitySearchAndMap() {
        let website = app.webViews.firstMatch
        XCTAssertTrue(website.waitForExistence(timeout: 20), "WKWebView did not appear")
        let searchButton = website.buttons["Cerca città o bar"]
        XCTAssertTrue(searchButton.waitForExistence(timeout: 90), "Live website did not become ready; inspect screenshot and network/challenge state")
        let shareButton = app.buttons["browser.share"]
        let loading = app.descendants(matching: .any)["browser.loading"]
        let error = app.descendants(matching: .any)["browser.error"]
        // Web content can enter the accessibility tree before WKNavigation's
        // didFinish. Require both native load completion and a reachable action.
        let ready = NSPredicate { _, _ in
            shareButton.isEnabled && !loading.exists && !error.exists &&
                searchButton.exists && searchButton.isHittable
        }
        let readiness = XCTNSPredicateExpectation(predicate: ready, object: nil)
        let readinessResult = XCTWaiter.wait(for: [readiness], timeout: 30)
        attachState(named: "DoveBevo-live-before-search-tap")
        XCTAssertEqual(readinessResult, .completed, "Native loading and the website search action did not become ready together")
        XCTAssertTrue(website.buttons["Vicino a me"].exists)
        XCTAssertTrue(ready.evaluate(with: nil), "Page readiness changed before the single search tap")
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
        XCTAssertTrue(app.buttons["browser.share"].isEnabled)
        openPrivacyAndReturn()
        XCTAssertTrue(interactiveMap().exists, "Returning from native privacy must retain the website map")
        XCTAssertTrue(hasVisiblePositiveCoverage(), "Returning from native privacy must retain live price coverage")
        XCTAssertTrue(app.webViews["browser.website"].buttons["Cerca città o bar"].exists)
        XCTAssertFalse(app.webViews["browser.website"].buttons["Esplora la mappa"].exists)
        XCTAssertFalse(app.webViews["browser.website"].staticTexts["La mappa non si carica: controlla la connessione e ricarica la pagina."].exists)
        assertNoNativeRecovery()
        XCTAssertTrue(app.buttons["browser.share"].isEnabled)
        verifyLiveSavedVenueRoundTrip()
        attachScreen(named: "DoveBevo-live-Milano-map")
    }

    private func verifyLiveSavedVenueRoundTrip() {
        let website = app.webViews["browser.website"]
        // This QA flow may remove only its own new record. Verify the owned
        // installation has an empty, successfully read list through real UI;
        // do not seed/clear preferences or touch a populated installation.
        app.buttons["browser.more"].tap()
        app.buttons["Locali salvati"].tap()
        XCTAssertTrue(app.navigationBars["Locali salvati"].waitForExistence(timeout: 10))
        let initialSavedTable = app.tables["savedVenues.list"]
        let emptyMessage = initialSavedTable.descendants(matching: .any).matching(
            NSPredicate(format: "label BEGINSWITH[c] %@", "Non hai ancora salvato un locale.")
        ).firstMatch
        let emptyMessageAppeared = emptyMessage.waitForExistence(timeout: 5)
        guard initialSavedTable.exists, initialSavedTable.cells.count == 0, emptyMessageAppeared,
              !app.buttons["savedVenues.retry"].exists else {
            XCTFail("Live saved-venue QA requires an owned empty installation; existing local data was left unchanged")
            return
        }
        app.navigationBars["Locali salvati"].buttons["Torna alla mappa"].tap()
        XCTAssertTrue(app.navigationBars["Dove bevo"].waitForExistence(timeout: 10))
        XCTAssertTrue(hasVisiblePositiveCoverage(), "Opening the native saved list must preserve the live map")
        let listButton = website.buttons["Elenco"]
        XCTAssertTrue(listButton.waitForExistence(timeout: 10))
        XCTAssertTrue(listButton.isHittable)
        listButton.tap()
        let listTitle = website.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "Bar nella zona")).firstMatch
        XCTAssertTrue(listTitle.waitForExistence(timeout: 10))
        // These are actual visible website venue links with existing prices,
        // not seeded records, invented URLs or public contribution actions.
        let pricedLinks = website.links.matching(NSPredicate(format: "label CONTAINS %@", "€"))
        XCTAssertTrue(pricedLinks.firstMatch.waitForExistence(timeout: 20), "Positive map coverage must have an existing priced venue in Elenco")
        var visibleVenue: XCUIElement?
        for _ in 0..<12 {
            if let venue = pricedLinks.allElementsBoundByIndex.first(where: { $0.exists && $0.isHittable }) {
                visibleVenue = venue
                break
            }
            XCTAssertTrue(listTitle.exists, "Keep scrolling only the real open venue list")
            website.swipeUp()
        }
        guard let visibleVenue else {
            attachState(named: "DoveBevo-live-priced-venue-not-hittable")
            XCTFail("No existing priced venue became reachable in the open Elenco")
            return
        }
        visibleVenue.tap()
        XCTAssertTrue(website.links["Indicazioni"].waitForExistence(timeout: 30), "The selected real bar must load its venue sheet")
        waitForNativePageReady()
        openNativeSaveForm()
        let name = app.textFields["savedVenue.name"]
        XCTAssertTrue(name.waitForExistence(timeout: 10))
        let initialName = name.value as? String ?? ""
        guard initialName.isEmpty || initialName == name.placeholderValue else {
            // Do not overwrite/remove somebody's existing local saved choice.
            XCTFail("The live QA flow requires an unsaved venue; the existing saved name was left unchanged")
            return
        }
        let qaName = "Dove Bevo QA \(UUID().uuidString)"
        name.tap()
        name.typeText(qaName)
        XCTAssertEqual(name.value as? String, qaName)
        app.buttons["savedVenue.confirm"].tap()
        XCTAssertTrue(app.navigationBars["Locali salvati"].waitForExistence(timeout: 10))
        let savedTable = app.tables["savedVenues.list"]
        let savedRow = savedTable.cells.matching(NSPredicate(format: "label == %@", qaName)).firstMatch
        XCTAssertTrue(savedRow.waitForExistence(timeout: 10), "A successful native save must appear in the real native list")
        XCTAssertTrue(savedRow.identifier.hasPrefix("savedVenue."))
        let savedKey = String(savedRow.identifier.dropFirst("savedVenue.".count))
        XCTAssertFalse(savedKey.isEmpty)
        attachScreen(named: "DoveBevo-live-native-saved-venue")
        // Leave the venue before reopening it. Merely popping the native list
        // without loading its link must not satisfy the reopen proof.
        app.navigationBars["Locali salvati"].buttons["Torna alla mappa"].tap()
        XCTAssertTrue(app.navigationBars["Dove bevo"].waitForExistence(timeout: 10))
        let initialCloseBar = website.buttons["Chiudi"]
        XCTAssertTrue(initialCloseBar.waitForExistence(timeout: 10))
        initialCloseBar.tap()
        let venueClosed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: website.links["Indicazioni"])
        XCTAssertEqual(XCTWaiter.wait(for: [venueClosed], timeout: 15), .completed)
        XCTAssertTrue(interactiveMap().waitForExistence(timeout: 15))
        XCTAssertTrue(hasVisiblePositiveCoverage(), "Returning from the original venue must preserve the Milano map")
        app.buttons["browser.more"].tap()
        app.buttons["Locali salvati"].tap()
        XCTAssertTrue(app.navigationBars["Locali salvati"].waitForExistence(timeout: 10))
        let reopenRow = app.tables["savedVenues.list"].cells.matching(NSPredicate(format: "label == %@", qaName)).firstMatch
        XCTAssertTrue(reopenRow.waitForExistence(timeout: 10))
        reopenRow.tap()
        XCTAssertTrue(app.navigationBars["Dove bevo"].waitForExistence(timeout: 10))
        XCTAssertTrue(website.links["Indicazioni"].waitForExistence(timeout: 45), "Reopening the saved link must load the real venue")
        waitForNativePageReady()

        // The native form derives its placeholder from the current canonical
        // venue key and pre-fills only a saved record with that exact URL. This
        // checks the reopened route through real UI without extracting the DOM.
        openNativeSaveForm()
        let reopenedName = app.textFields["savedVenue.name"]
        XCTAssertTrue(reopenedName.waitForExistence(timeout: 10))
        XCTAssertEqual(reopenedName.placeholderValue, "Locale \(savedKey)")
        XCTAssertEqual(reopenedName.value as? String, qaName, "Reopen must return to the exact saved venue URL")
        let cancelledMarker = "-cancel"
        reopenedName.tap()
        reopenedName.typeText(cancelledMarker)
        XCTAssertNotEqual(reopenedName.value as? String, qaName, "Actually edit the name before testing Cancel")
        XCTAssertTrue((reopenedName.value as? String)?.contains(cancelledMarker) == true)
        app.buttons["savedVenue.cancel"].tap()
        XCTAssertTrue(app.navigationBars["Dove bevo"].waitForExistence(timeout: 10))
        app.buttons["browser.more"].tap()
        app.buttons["Locali salvati"].tap()
        XCTAssertTrue(app.navigationBars["Locali salvati"].waitForExistence(timeout: 10))
        let qaRow = app.tables["savedVenues.list"].cells.matching(NSPredicate(format: "label == %@", qaName)).firstMatch
        XCTAssertTrue(qaRow.waitForExistence(timeout: 10), "Cancel must preserve the original saved name")
        XCTAssertEqual(app.tables["savedVenues.list"].cells.matching(NSPredicate(format: "label CONTAINS %@", cancelledMarker)).count, 0)
        qaRow.swipeLeft()
        let remove = app.buttons["Rimuovi"]
        XCTAssertTrue(remove.waitForExistence(timeout: 5))
        remove.tap()
        let removed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: qaRow)
        XCTAssertEqual(XCTWaiter.wait(for: [removed], timeout: 10), .completed, "Remove only the unique local QA record")
        app.navigationBars["Locali salvati"].buttons["Torna alla mappa"].tap()
        XCTAssertTrue(app.navigationBars["Dove bevo"].waitForExistence(timeout: 10))

        // The website's own close action returns this public bar to its map;
        // it handles both SPA history and a directly reopened saved link.
        let closeBar = website.buttons["Chiudi"]
        XCTAssertTrue(closeBar.waitForExistence(timeout: 10))
        closeBar.tap()
        XCTAssertTrue(website.buttons["Cerca città o bar"].waitForExistence(timeout: 15))
        XCTAssertTrue(interactiveMap().waitForExistence(timeout: 45))
        let mapReady = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == false"), object: website.buttons["Esplora la mappa"]
        )
        XCTAssertEqual(XCTWaiter.wait(for: [mapReady], timeout: 45), .completed, "The map must finish loading after closing the reopened venue")
        let coverage = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in self.hasVisiblePositiveCoverage() }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [coverage], timeout: 45), .completed, "The final screenshot still requires genuine positive price coverage")
        XCTAssertFalse(website.staticTexts["La mappa non si carica: controlla la connessione e ricarica la pagina."].exists)
        assertNoNativeRecovery()
        XCTAssertTrue(app.buttons["browser.share"].isEnabled)
    }

    private func waitForNativePageReady() {
        let ready = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            self.app.buttons["browser.share"].isEnabled && self.app.buttons["browser.reload"].label == "Ricarica" &&
                !self.app.descendants(matching: .any)["browser.loading"].exists &&
                !self.app.descendants(matching: .any)["browser.error"].exists
        }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 45), .completed, "Native page loading must finish before saving the current venue")
    }

    private func openNativeSaveForm() {
        app.buttons["browser.more"].tap()
        let save = app.buttons["Salva locale"]
        let enabled = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in save.exists && save.isEnabled }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [enabled], timeout: 10), .completed, "The actual current website venue must be eligible for native saving")
        save.tap()
        XCTAssertTrue(app.navigationBars["Salva locale"].waitForExistence(timeout: 10))
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
