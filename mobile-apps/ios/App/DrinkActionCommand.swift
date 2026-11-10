import Foundation

/// Exact, user-activated app-only links. A website link is an intent, never proof of a price or vote.
enum DrinkActionCommand: Equatable {
    case saveDrink(String, ComparisonBand)
    case saveCustomer(String)
    case saveEurope(String, ComparisonBand, String, EuropeServing)

    private static let venue = #"(?:[nwru][1-9][0-9]{0,14}|m[0-9a-f]{24})"#
    private static let cell = #"[0-9b-hjkmnp-z]{5}"#

    static func parse(_ url: URL, currentVenue: URL?) -> DrinkActionCommand? {
        guard let current = SavedVenuePolicy.canonicalURL(currentVenue),
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              components.scheme == "https", components.percentEncodedHost == "www.dovebevo.com",
              components.port == nil, components.user == nil, components.password == nil,
              components.percentEncodedPath == "/mobile/", components.percentEncodedFragment == nil,
              let raw = components.percentEncodedQuery,
              let items = components.queryItems, items.count >= 3,
              items[0].name == "path", items[1].name == "c",
              let path = items[0].value, let cellValue = items[1].value,
              let target = SavedVenuePolicy.canonicalURL(URL(string: "https://www.dovebevo.com\(path)?c=\(cellValue)")),
              target == current else { return nil }
        let prefix = "path=%2Fbar%2F\(venue)&c=\(cell)&"
        if items.count == 4, items.map(\.name) == ["path", "c", "save_drink", "band"],
           raw.range(of: "^\(prefix)save_drink=[a-z_]+&band=(?:normal|happy_hour)$", options: .regularExpression) != nil,
           let code = items[2].value, DrinkCategory.all.contains(where: { $0.code == code }),
           let band = items[3].value {
            return .saveDrink(code, band == "normal" ? .normal : .happyHour)
        }
        if items.count == 3, items.map(\.name) == ["path", "c", "save_customer"],
           raw.range(of: "^\(prefix)save_customer=[oc][0-9a-f]{64}$", options: .regularExpression) != nil,
           let key = items[2].value {
            return .saveCustomer(key)
        }
        if items.count == 6,
           items.map(\.name) == ["path", "c", "save_europe", "band", "currency", "serving"],
           raw.range(of: "^\(prefix)save_europe=[a-z_]+&band=(?:normal|happy_hour)&currency=(?:EUR|GBP)&serving=(?:drink|glass|ml)%3A[0-9]{0,4}$", options: .regularExpression) != nil,
           let drink = items[2].value, let bandValue = items[3].value,
           let currency = items[4].value, let servingKey = items[5].value,
           let serving = SavedEuropeDrink.serving(from: servingKey, drink: drink) {
            return .saveEurope(drink, bandValue == "normal" ? .normal : .happyHour, currency, serving)
        }
        return nil
    }
}
