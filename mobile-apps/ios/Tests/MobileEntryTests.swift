import Foundation
import XCTest
@testable import DoveBevo

final class MobileEntryTests: XCTestCase {
    func testRealAppDocumentPreservesCanonicalVenueIdentity() throws {
        let canonical = try XCTUnwrap(URL(string: "https://www.dovebevo.com/bar/n123?c=u0nd9"))
        let document = try XCTUnwrap(URL(string: "https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9"))
        XCTAssertEqual(MobileEntry.publicVenue(document), canonical)
        XCTAssertEqual(SavedVenuePolicy.canonicalURL(document), canonical)
        XCTAssertEqual(MobileEntry.venueDocument(canonical), document)
        XCTAssertEqual(MobileEntry.publicVenue(URL(string: "https://www.dovebevo.com/mobile/?c=u0nd9&path=%2Fbar%2Fn123")), canonical)
        XCTAssertNil(MobileEntry.publicVenue(canonical))
        XCTAssertNil(MobileEntry.venueDocument(URL(string: "https://evil.test/bar/n123?c=u0nd9")!))
        XCTAssertEqual(MobileEntry.documentURL(URLPolicy.homeURL), MobileEntry.homeURL)
        XCTAssertEqual(MobileEntry.shareURL(document), document, "Recipients need a real app document for foreign catalogue venues")
        XCTAssertEqual(MobileEntry.shareURL(canonical), canonical)
        XCTAssertEqual(MobileEntry.shareURL(MobileEntry.homeURL), URLPolicy.homeURL)
        XCTAssertEqual(MobileEntry.shareURL(URL(string: document.absoluteString + "&token=private")!), URLPolicy.homeURL)
        XCTAssertEqual(MobileEntry.shareURL(URL(string: "https://evil.test/bar/n123?c=u0nd9")!), URLPolicy.homeURL)
    }

    func testAmbiguousAndExternalDocumentIdentityIsRejected() {
        for raw in [
            "https://evil.test/mobile/?path=%2Fbar%2Fn123&c=u0nd9",
            "https://www.dovebevo.com@evil.test/mobile/?path=%2Fbar%2Fn123&c=u0nd9",
            "https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9#bad",
            "https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9&c=u0nd8",
            "https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9&extra=1",
            "https://www.dovebevo.com/mobile/?path=%252Fbar%252Fn123&c=u0nd9",
            "https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn0&c=u0nd9",
            "https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=wrong",
            "https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9%0a",
            "https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=%750nd9",
            "https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&%63=u0nd9",
            "https://www.dovebevo.com/mobile/"
        ] { XCTAssertNil(MobileEntry.publicVenue(URL(string: raw)), raw) }
    }
}
