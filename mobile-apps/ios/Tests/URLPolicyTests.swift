import Foundation
import XCTest
@testable import DoveBevo

final class URLPolicyTests: XCTestCase {
    private func url(_ value: String) -> URL { URL(string: value)! }

    func testOnlyExactHTTPSWebsiteOriginsAreTrusted() {
        for value in [
            "https://www.dovebevo.com/", "https://dovebevo.com/prezzi?drink=birra#map",
            "https://WWW.DOVEBEVO.COM/", "https://www.dovebevo.com:443/"
        ] {
            XCTAssertTrue(URLPolicy.isWebsite(url(value)), value)
        }
        for value in [
            "http://www.dovebevo.com/", "https://www.dovebevo.com.evil.example/",
            "https://evil-dovebevo.com/", "https://sub.dovebevo.com/",
            "https://dovebevo.com./", "https://www.dovebevo.com:8443/",
            "https://name@www.dovebevo.com/", "https://www.dovebevo.com@evil.example/",
            "file:///www.dovebevo.com/", "javascript:alert(1)", "about:blank",
            "https://www.dovebevo.com%2eevil.example/"
        ] {
            XCTAssertFalse(URLPolicy.isWebsite(url(value)), value)
        }
    }

    func testTrustedWebsiteNavigationDoesNotNeedAnArtificialUserGesture() {
        // Initial native load, website redirects, SPA history and form/session
        // requests remain ordinary top-level website navigations.
        XCTAssertEqual(destination("https://www.dovebevo.com/?city=milano"), .website)
        XCTAssertEqual(destination("https://dovebevo.com/", fromWebsite: false), .website)
    }

    func testExternalHTTPSMapsMailAndPhoneRequireATrustedUserLink() {
        for value in [
            "https://maps.apple.com/?ll=45.46,9.19", "https://www.google.com/maps/",
            "https://www.openstreetmap.org/", "https://example.org/privacy",
            "mailto:ciao@example.org", "tel:+3902123456"
        ] {
            XCTAssertEqual(destination(value, userLink: true), .external, value)
            XCTAssertEqual(destination(value), .blocked, "Automatic handoff: \(value)")
            XCTAssertEqual(destination(value, userLink: true, fromWebsite: false), .blocked, "Untrusted frame: \(value)")
        }
    }

    func testUnsafeAndUnknownSchemesNeverLeaveTheApp() {
        for value in [
            "http://example.org/", "http://www.dovebevo.com/", "file:///etc/passwd",
            "javascript:alert(1)", "data:text/html,hello", "blob:https://www.dovebevo.com/id",
            "intent://example.org/", "custom-app://action", "about:blank",
            "https://user:password@example.org/", "mailto:", "tel:"
        ] {
            XCTAssertEqual(destination(value, userLink: true), .blocked, value)
        }
    }

    func testChallengeAndBlankSubframesStayInsideWebKit() {
        for value in [
            "https://challenges.cloudflare.com/turnstile/v0/example",
            "https://www.dovebevo.com/embedded", "about:blank", "about:srcdoc",
            "blob:https://challenges.cloudflare.com/example", "data:text/html,hello"
        ] {
            XCTAssertEqual(destination(value, mainFrame: false), .webFrame, value)
            XCTAssertEqual(destination(value, mainFrame: false, userLink: true), .webFrame, value)
        }
    }

    func testSubframesCannotLaunchExternalApplications() {
        for value in ["mailto:ciao@example.org", "tel:123", "custom-app://action", "http://example.org/", "file:///tmp/page"] {
            XCTAssertEqual(destination(value, mainFrame: false, userLink: true), .blocked, value)
        }
    }

    private func destination(
        _ value: String,
        mainFrame: Bool = true,
        userLink: Bool = false,
        fromWebsite: Bool = true
    ) -> URLPolicy.Destination {
        URLPolicy.destination(
            for: url(value), isMainFrame: mainFrame,
            isUserActivatedLink: userLink, isFromWebsite: fromWebsite
        )
    }
}
