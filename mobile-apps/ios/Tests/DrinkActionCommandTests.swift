import XCTest
@testable import DoveBevo

final class DrinkActionCommandTests: XCTestCase {
    private let venue = URL(string: "https://www.dovebevo.com/bar/n4170005990?c=u0nd9")!
    private let base = "https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn4170005990&c=u0nd9"
    private let customer = "o" + String(repeating: "a", count: 64)

    func testExactCommandsAreAcceptedForCurrentVenue() {
        XCTAssertEqual(DrinkActionCommand.parse(URL(string: base + "&save_drink=spritz&band=normal")!, currentVenue: venue),
                       .saveDrink("spritz", .normal))
        XCTAssertEqual(DrinkActionCommand.parse(URL(string: base + "&save_drink=beer_draft&band=happy_hour")!, currentVenue: venue),
                       .saveDrink("beer_draft", .happyHour))
        XCTAssertEqual(DrinkActionCommand.parse(URL(string: base + "&save_customer=" + customer)!, currentVenue: venue),
                       .saveCustomer(customer))
    }

    func testRejectsForeignVenueMalformedIdentityAndExtraQuery() {
        let wrong = URL(string: "https://www.dovebevo.com/bar/n4170005991?c=u0nd9")!
        let invalid = [
            base + "&save_drink=spritz&band=normal&extra=1",
            base + "&band=normal&save_drink=spritz",
            base + "&save_drink=unknown&band=normal",
            base + "&save_drink=spritz&band=normal&save_drink=spritz",
            base + "&save_drink=%73pritz&band=normal",
            base + "&save_customer=" + customer.uppercased(),
            base + "&save_customer=" + customer + "#x",
            base + "&recommend_drink=spritz",
            base + "&recommend_drink=unknown",
            base.replacingOccurrences(of: "%2Fbar%2F", with: "%252Fbar%252F") + "&recommend_drink=spritz",
            base.replacingOccurrences(of: "www.dovebevo.com", with: "evil.example") + "&recommend_drink=spritz"
        ]
        invalid.forEach { XCTAssertNil(DrinkActionCommand.parse(URL(string: $0)!, currentVenue: venue), $0) }
        XCTAssertNil(DrinkActionCommand.parse(URL(string: base + "&save_drink=spritz&band=normal")!, currentVenue: wrong))
    }
}
