import Foundation

/// Real app-document URLs are distinct from public bookmark/share URLs.
enum MobileEntry {
    static let homeURL = URL(string: "https://www.dovebevo.com/mobile/")!
    static let markerScript = "document.documentElement.getAttribute('data-dovebevo-mobile-shell') === '1'"

    static func publicVenue(_ url: URL?) -> URL? {
        guard let url, url.absoluteString.utf8.count <= 512, URLPolicy.isWebsite(url),
              !url.absoluteString.contains("\\"),
              let scheme = url.scheme,
              ["www.dovebevo.com", "dovebevo.com", "www.dovebevo.com:443", "dovebevo.com:443"].contains(
                url.absoluteString.dropFirst(scheme.count + 3).prefix { $0 != "/" && $0 != "?" && $0 != "#" }.lowercased()),
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let authority = components.percentEncodedHost?.lowercased(),
              ["www.dovebevo.com", "dovebevo.com"].contains(authority),
              components.percentEncodedFragment == nil,
              isEntryPath(components.percentEncodedPath), let rawQuery = components.percentEncodedQuery,
              Set(rawQuery.split(separator: "&").map { String($0.prefix { $0 != "=" }) }) == ["path", "c"],
              let rawCell = rawQuery.split(separator: "&").first(where: { $0.hasPrefix("c=") })?.dropFirst(2),
              String(rawCell).range(of: #"\A[0-9b-hjkmnp-z]{5}\z"#, options: .regularExpression) != nil,
              let items = components.queryItems,
              items.count == 2, Set(items.map(\.name)) == ["path", "c"],
              let path = items.first(where: { $0.name == "path" })?.value,
              let cell = items.first(where: { $0.name == "c" })?.value,
              path.range(of: #"\A/bar/[nwru][1-9][0-9]{0,14}\z"#, options: .regularExpression) != nil,
              cell.range(of: #"\A[0-9b-hjkmnp-z]{5}\z"#, options: .regularExpression) != nil else { return nil }
        return URL(string: "https://www.dovebevo.com\(path)?c=\(cell)")
    }

    static func isEntryPath(_ path: String) -> Bool {
        path == "/mobile/" || path == "/mobile/index.html"
    }

    static func isDocument(_ url: URL?) -> Bool {
        guard let url, URLPolicy.isWebsite(url) else { return false }
        return isEntryPath(url.path(percentEncoded: true))
    }

    static func documentURL(_ url: URL) -> URL {
        if let venue = venueDocument(url) { return venue }
        guard URLPolicy.isWebsite(url), let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              components.percentEncodedPath == "/", components.percentEncodedFragment == nil else { return url }
        if components.percentEncodedQuery == nil { return homeURL }
        if let items = components.queryItems, items.count == 1, items[0].name == "at",
           let at = items[0].value,
           at.range(of: #"\A-?[0-9]{1,2}(?:\.[0-9]{1,5})?,-?[0-9]{1,3}(?:\.[0-9]{1,5})?\z"#, options: .regularExpression) != nil {
            var target = URLComponents(url: homeURL, resolvingAgainstBaseURL: false)!
            target.queryItems = [URLQueryItem(name: "at", value: at)]
            return target.url ?? homeURL
        }
        return url
    }

    static func venueDocument(_ url: URL) -> URL? {
        guard let canonical = SavedVenuePolicy.canonicalURL(url),
              let source = URLComponents(url: canonical, resolvingAgainstBaseURL: false),
              let cell = source.queryItems?.first(where: { $0.name == "c" })?.value else { return nil }
        // Encode slashes identically to the production JS URLSearchParams contract.
        return URL(string: "\(homeURL.absoluteString)?path=%2Fbar%2F\(canonical.lastPathComponent)&c=\(cell)")
    }
}
