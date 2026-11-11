import XCTest
@testable import DoveBevo

final class MapReturnRouteTests: XCTestCase {
    func testCapturedDiscoveryAreaReturnsToTheSameCityWithLocaleIndependentCoordinates() throws {
        let area = try XCTUnwrap(DiscoveryArea(latitude: 45.4642, longitude: 9.19, zoom: 14))
        let route = try XCTUnwrap(MapReturnRoute.forArea(area))
        XCTAssertTrue(MapReturnRoute.valid(route))
        XCTAssertEqual(URLComponents(url: route, resolvingAgainstBaseURL: false)?.queryItems?.first?.value,
                       "45.46420,9.19000")
        let london = try XCTUnwrap(DiscoveryArea(latitude: 51.5074, longitude: -0.1278, zoom: 14))
        let foreignRoute = try XCTUnwrap(MapReturnRoute.forArea(london))
        XCTAssertTrue(MapReturnRoute.valid(foreignRoute))
        XCTAssertEqual(URLComponents(url: foreignRoute, resolvingAgainstBaseURL: false)?.queryItems?.first?.value,
                       "51.50740,-0.12780")
        XCTAssertNil(MapReturnRoute.forArea(nil))
    }

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
