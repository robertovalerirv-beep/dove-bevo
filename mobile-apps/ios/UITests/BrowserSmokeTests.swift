import XCTest

final class BrowserSmokeTests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launch()
    }

    override func tearDownWithError() throws {
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "DoveBevo-\(name)"
        screenshot.lifetime = .keepAlways
        add(screenshot)
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
        XCTAssertTrue(app.webViews.firstMatch.exists)
        XCTAssertTrue(app.buttons["browser.home"].exists)
    }

    /// This deliberately requires live HTTPS website readiness. A native
    /// toolbar or an offline/retry screen does not count as a working map.
    func testLiveWebsiteCitySearchAndMap() {
        let website = app.webViews.firstMatch
        XCTAssertTrue(website.waitForExistence(timeout: 20), "WKWebView did not appear")
        let searchButton = website.buttons["Cerca città o bar"]
        XCTAssertTrue(searchButton.waitForExistence(timeout: 90), "Live website did not become ready; inspect screenshot and network/challenge state")
        XCTAssertFalse(app.otherElements["browser.error"].exists)
        XCTAssertTrue(website.buttons["Vicino a me"].exists)
        searchButton.tap()

        // The HTML modal and keyboard can change WebKit's nested accessibility
        // containers; keep the exact input label, queried from the application.
        let searchField = app.textFields["Cerca una città o un bar"]
        XCTAssertTrue(searchField.waitForExistence(timeout: 15), "Website city search field missing")
        dismissKeyboardIntroductionIfPresent()
        let searchScreenshot = XCTAttachment(screenshot: app.screenshot())
        searchScreenshot.name = "DoveBevo-live-city-search-before-input"
        searchScreenshot.lifetime = .keepAlways
        add(searchScreenshot)
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
        let interactiveMap = website.descendants(matching: .any).matching(
            NSPredicate(format: "label == %@", "Mappa interattiva dei bar")
        ).firstMatch
        XCTAssertTrue(interactiveMap.waitForExistence(timeout: 45), "Interactive live map did not initialize")
        let mapReady = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == false"),
            object: website.buttons["Esplora la mappa"]
        )
        XCTAssertEqual(XCTWaiter.wait(for: [mapReady], timeout: 45), .completed, "Map style did not finish loading")
        XCTAssertFalse(website.staticTexts["La mappa non si carica: controlla la connessione e ricarica la pagina."].exists)
        XCTAssertTrue(app.buttons["browser.share"].isEnabled)
        let mapScreenshot = XCTAttachment(screenshot: app.screenshot())
        mapScreenshot.name = "DoveBevo-live-Milano-map"
        mapScreenshot.lifetime = .keepAlways
        add(mapScreenshot)
        openPrivacyAndReturn()
        XCTAssertTrue(interactiveMap.exists, "Returning from native privacy must retain the website map")
        XCTAssertTrue(searchButton.exists)
        XCTAssertTrue(app.buttons["browser.share"].isEnabled)
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

    private func dismissKeyboardIntroductionIfPresent() {
        // A fresh simulator may show this system tutorial instead of keys.
        // Handle only its observed prompt, never an arbitrary Continue button.
        let introduction = app.staticTexts.matching(
            NSPredicate(format: "label BEGINSWITH %@", "Speed up your typing")
        ).firstMatch
        guard introduction.waitForExistence(timeout: 2) else { return }
        let continueButton = app.buttons["Continue"]
        XCTAssertTrue(continueButton.waitForExistence(timeout: 5), "Keyboard introduction has no Continue action")
        let ready = XCTNSPredicateExpectation(predicate: NSPredicate(format: "hittable == true"), object: continueButton)
        XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 5), .completed, "Keyboard introduction is not on screen; inspect renderer diagnostics")
        // Re-query after readiness; one handler owns this transient control.
        app.buttons["Continue"].tap()
    }
}
