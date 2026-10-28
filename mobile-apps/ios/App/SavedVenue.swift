import Foundation

struct SavedVenue: Equatable {
    let url: URL
    let label: String
}

/// A saved venue is a public website link, never a generic page or a copy of
/// location, price, session or authentication data.
enum SavedVenuePolicy {
    static let maximumLabelScalars = 80

    enum ValidationError: Error {
        case invalidURL
        case invalidLabel
    }

    static func canonicalURL(_ url: URL?) -> URL? {
        guard let url, URLPolicy.isWebsite(url),
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let host = components.percentEncodedHost?.lowercased(),
              ["www.dovebevo.com", "dovebevo.com"].contains(host),
              components.percentEncodedFragment == nil,
              matchesEntirely(components.percentEncodedPath, pattern: #"/bar/[nwru][1-9][0-9]{0,14}"#),
              let query = components.percentEncodedQuery,
              matchesEntirely(query, pattern: #"c=[0-9b-hjkmnp-z]{5}"#) else { return nil }
        return URL(string: "https://www.dovebevo.com\(components.percentEncodedPath)?\(query)")
    }

    static func venue(url: URL, label: String) throws -> SavedVenue {
        guard let canonical = canonicalURL(url) else { throw ValidationError.invalidURL }
        guard !label.unicodeScalars.contains(where: { $0.value < 32 || (127...159).contains($0.value) }) else {
            throw ValidationError.invalidLabel
        }
        let trimmed = label.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.unicodeScalars.count <= maximumLabelScalars else { throw ValidationError.invalidLabel }
        let key = canonical.lastPathComponent
        return SavedVenue(url: canonical, label: trimmed.isEmpty ? "Locale \(key)" : trimmed)
    }

    private static func matchesEntirely(_ value: String, pattern: String) -> Bool {
        guard let range = value.range(of: pattern, options: .regularExpression) else { return false }
        return range.lowerBound == value.startIndex && range.upperBound == value.endIndex
    }
}
