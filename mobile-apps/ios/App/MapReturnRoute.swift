import Foundation

/// A retained city route is a trusted map document, never a venue or arbitrary URL.
enum MapReturnRoute {
    static func valid(_ url: URL?) -> Bool {
        guard let url, URLPolicy.isWebsite(url),
              let parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
              parts.percentEncodedPath == "/mobile/", parts.percentEncodedFragment == nil else { return false }
        guard let raw = parts.percentEncodedQuery else { return true }
        let query = raw.replacingOccurrences(of: "%2C", with: ",", options: .caseInsensitive)
        guard query.range(of: #"\Aat=-?[0-9]{1,2}(?:\.[0-9]{1,5})?,-?[0-9]{1,3}(?:\.[0-9]{1,5})?\z"#,
                          options: .regularExpression) != nil else { return false }
        let values = query.dropFirst(3).split(separator: ",")
        guard values.count == 2, let lat = Double(values[0]), let lon = Double(values[1]) else { return false }
        return (-90...90).contains(lat) && (-180...180).contains(lon)
    }
}
