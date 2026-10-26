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

        let searchField = website.textFields["Cerca una città o un bar"]
        XCTAssertTrue(searchField.waitForExistence(timeout: 15), "Website city search field missing")
        searchField.tap()
        searchField.typeText("Milano")
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
        XCTAssertTrue(app.buttons["browser.share"].isEnabled)
        let mapScreenshot = XCTAttachment(screenshot: app.screenshot())
        mapScreenshot.name = "DoveBevo-live-Milano-map"
        mapScreenshot.lifetime = .keepAlways
        add(mapScreenshot)
    }
}
