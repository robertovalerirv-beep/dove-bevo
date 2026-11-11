import XCTest
@testable import DoveBevo

final class MapReturnRouteTests: XCTestCase {
    func testOnlyTrustedCityRoutesCanBeRetained() {
        XCTAssertTrue(MapReturnRoute.valid(MobileEntry.homeURL))
        XCTAssertTrue(MapReturnRoute.valid(URL(string: "https://www.dovebevo.com/mobile/?at=45.46420%2C9.19000")))
        XCTAssertTrue(MapReturnRoute.valid(URL(string: "https://www.dovebevo.com/mobile/?at=40.8518,14.2681")))
        for raw in [
            "https://example.com/mobile/?at=45.4642,9.19",
            "https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9",
            "https://www.dovebevo.com/mobile/?at=95,9",
            "https://www.dovebevo.com/mobile/?at=45,190",
            "https://www.dovebevo.com/mobile/?at=45,9&extra=1"
        ] {
            XCTAssertFalse(MapReturnRoute.valid(URL(string: raw)), raw)
        }
    }
}
