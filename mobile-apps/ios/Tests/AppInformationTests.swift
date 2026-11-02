import UIKit
import XCTest
@testable import DoveBevo

final class AppInformationTests: XCTestCase {
    @MainActor func testActualInformationMenuContainsOnlyExistingCapabilitiesAndPreservesMapReturn() throws {
        var maps = 0, browsers = 0
        let controller = AppInformationViewController(onMap: { maps += 1 }, onBrowser: { browsers += 1 })
        let navigation = UINavigationController(rootViewController: controller)
        controller.loadViewIfNeeded()
        XCTAssertEqual(controller.title, "Altro")
        let count = controller.tableView(controller.tableView, numberOfRowsInSection: 0)
        XCTAssertEqual(count, 8)
        let cells = (0..<count).map { controller.tableView(controller.tableView, cellForRowAt: IndexPath(row: $0, section: 0)) }
        XCTAssertEqual(cells.compactMap(\.accessibilityIdentifier), ["information.map", "information.how", "information.rules", "information.privacy", "information.location", "information.browser", "information.contact", "information.version"])
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "—"
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "—"
        XCTAssertEqual((cells[7].contentConfiguration as? UIListContentConfiguration)?.secondaryText, "\(version) (\(build))")
        XCTAssertFalse(cells.contains { ($0.contentConfiguration as? UIListContentConfiguration)?.text == "Le mie segnalazioni" })
        controller.tableView(controller.tableView, didSelectRowAt: IndexPath(row: 0, section: 0))
        controller.tableView(controller.tableView, didSelectRowAt: IndexPath(row: 5, section: 0))
        XCTAssertEqual(maps, 1); XCTAssertEqual(browsers, 1)
        controller.tableView(controller.tableView, didSelectRowAt: IndexPath(row: 3, section: 0))
        XCTAssertTrue(navigation.topViewController is PrivacyViewController)
    }

    @MainActor func testReferenceAltroPrivateFixtureCapturesActualNativeMenuAndCommunityArt() throws {
        let controller = AppInformationViewController(onMap: {}, onBrowser: {})
        let mounted = try OwnedReferenceWindow(root: UINavigationController(rootViewController: controller))
        defer { mounted.close() }
        XCTAssertEqual(controller.tableView.numberOfRows(inSection: 0), 8)
        let row = try XCTUnwrap(controller.tableView.cellForRow(at: IndexPath(row: 0, section: 0)))
        XCTAssertTrue(row.window === mounted.window)
        XCTAssertEqual(row.accessibilityIdentifier, "information.map")
        mounted.attach(to: self, name: "Altro-native-information")
    }

    @MainActor func testAllPhotoCategoriesAndCommunityUseBundledOriginalApprovedAssets() throws {
        for name in ["DrinkBeer", "DrinkSpritz", "DrinkNegroni", "DrinkSbagliato", "DrinkGinTonic", "DrinkWine", "DrinkAlcoholFree", "DrinkWater", "CommunityCheers", "BrandMark"] {
            let image = try XCTUnwrap(UIImage(named: name), name)
            XCTAssertGreaterThan(image.size.width, 100); XCTAssertGreaterThan(image.size.height, 100)
        }
        for category in DrinkCategory.all { XCTAssertNotNil(NativeDrinkArtwork.image(category.code), category.code) }
    }
}
