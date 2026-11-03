import Foundation

/// A website button can request a save; only an exact active venue and live menu offer can authorize it.
enum OfferSaveCommand {
    static let offerPattern = #"^[A-Za-z0-9._:-]{1,128}$"#
    private static let queryPattern = #"^path=%2Fbar%2F(?:[nwru][1-9][0-9]{0,14}|m[0-9a-f]{24})&c=[0-9b-hjkmnp-z]{5}&save_offer=[A-Za-z0-9._:-]{1,128}$"#

    static func offerID(from url: URL, currentVenue: URL?) -> String? {
        guard let currentVenue = SavedVenuePolicy.canonicalURL(currentVenue),
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              components.scheme == "https", components.percentEncodedHost == "www.dovebevo.com",
              components.port == nil, components.user == nil, components.password == nil,
              components.percentEncodedPath == "/mobile/", components.percentEncodedFragment == nil,
              let raw = components.percentEncodedQuery, matches(raw, queryPattern),
              let items = components.queryItems, items.count == 3,
              items.map(\.name) == ["path", "c", "save_offer"],
              let path = items[0].value, let cell = items[1].value, let id = items[2].value,
              matches(id, offerPattern),
              let target = SavedVenuePolicy.canonicalURL(URL(string: "https://www.dovebevo.com\(path)?c=\(cell)")),
              target == currentVenue else { return nil }
        return id
    }

    private static func matches(_ text: String, _ pattern: String) -> Bool {
        guard let match = text.range(of: pattern, options: .regularExpression) else { return false }
        return match.lowerBound == text.startIndex && match.upperBound == text.endIndex
    }
}
