import UIKit
import XCTest
@testable import DoveBevo

final class RulesAcceptanceTests: XCTestCase {
    func testMissingStaleAndCurrentVersionsGateWebsiteAccess() throws {
        let suite = "com.dovebevo.tests.acceptance.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let acceptance = RulesAcceptance(defaults: defaults)
        XCTAssertFalse(acceptance.isCurrent, "A fresh installation must remain on native welcome")
        defaults.set("2026-10-25", forKey: RulesAcceptance.storageKey)
        XCTAssertFalse(acceptance.isCurrent, "Old rules require explicit acceptance again")
        defaults.set("unknown-future-version", forKey: RulesAcceptance.storageKey)
        XCTAssertFalse(acceptance.isCurrent)
        acceptance.acceptCurrentVersion()
        XCTAssertTrue(acceptance.isCurrent)
        XCTAssertEqual(defaults.string(forKey: RulesAcceptance.storageKey), "2026-10-26")
        XCTAssertEqual(defaults.persistentDomain(forName: suite)?.count, 1, "Store only the accepted version")
    }

    func testCompleteRulesAreBundledForOfflineReading() throws {
        let text = try RulesAcceptance.rulesText()
        XCTAssertGreaterThan(text.count, 500)
        XCTAssertTrue(text.contains("18"), "Bundled rules must describe adult access")
    }

    @MainActor
    func testDeclineDoesNotAcceptAndDuplicateAcceptanceInvokesActionOnce() throws {
        var acceptances = 0
        let controller = WelcomeViewController { acceptances += 1 }
        controller.loadViewIfNeeded()
        let decline = try XCTUnwrap(button("welcome.decline", in: controller.view))
        let accept = try XCTUnwrap(button("welcome.accept", in: controller.view))
        decline.sendActions(for: .touchUpInside)
        XCTAssertEqual(acceptances, 0)
        XCTAssertEqual(controller.title, "Benvenuto")
        accept.sendActions(for: .touchUpInside)
        accept.sendActions(for: .touchUpInside)
        XCTAssertEqual(acceptances, 1, "One explicit acceptance must construct the browser only once")
    }

    @MainActor
    private func button(_ identifier: String, in view: UIView) -> UIButton? {
        if let button = view as? UIButton, button.accessibilityIdentifier == identifier { return button }
        return view.subviews.lazy.compactMap { self.button(identifier, in: $0) }.first
    }
}
