import XCTest
@testable import DoveBevo

final class PrivacyPolicyTests: XCTestCase {
    func testSharedPolicyIsBundledAsReadableUTF8WithApprovedContact() throws {
        let policy = try PrivacyPolicy.load()
        XCTAssertTrue(policy.contains(PrivacyPolicy.supportEmail), "Bundled app policy must include the approved controller/support contact")
        XCTAssertGreaterThan(policy.count, 500, "A missing-resource placeholder is not the app policy")
    }
}
