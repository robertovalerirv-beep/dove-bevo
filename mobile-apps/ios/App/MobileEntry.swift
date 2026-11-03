import Foundation

/// Private bookmark IDs stay canonical; sharing uses a real app document for app-only venues.
enum MobileEntry {
    static let homeURL = URL(string: "https://www.dovebevo.com/mobile/")!
    static let markerScript = "document.documentElement.getAttribute('data-dovebevo-mobile-shell') === '1'"
    static let searchScript = """
    (() => {
      if (document.documentElement.getAttribute('data-dovebevo-mobile-shell') !== '1' ||
          !['/mobile/', '/mobile/index.html'].includes(location.pathname)) return false;
      const button = document.querySelector('button[data-dovebevo-search="1"], button.search-field, button.europe-search');
      if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
      button.click();
      return true;
    })()
    """

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
              validVenueQuery(rawQuery),
              let rawCell = rawQuery.split(separator: "&").first(where: { $0.hasPrefix("c=") })?.dropFirst(2),
              String(rawCell).range(of: #"\A[0-9b-hjkmnp-z]{5}\z"#, options: .regularExpression) != nil,
              let items = components.queryItems,
              [2, 3, 4].contains(items.count),
              let path = items.first(where: { $0.name == "path" })?.value,
              let cell = items.first(where: { $0.name == "c" })?.value,
              path.range(of: #"\A/bar/(?:[nwru][1-9][0-9]{0,14}|m[0-9a-f]{24})\z"#, options: .regularExpression) != nil,
              cell.range(of: #"\A[0-9b-hjkmnp-z]{5}\z"#, options: .regularExpression) != nil else { return nil }
        return URL(string: "https://www.dovebevo.com\(path)?c=\(cell)")
    }

    private static func validVenueQuery(_ raw: String) -> Bool {
        let pairs = raw.split(separator: "&", omittingEmptySubsequences: false)
        let keys = pairs.map { String($0.prefix { $0 != "=" }) }
        guard Set(keys).count == pairs.count else { return false }
        if keys.count == 2 { return Set(keys) == ["path", "c"] }
        if keys.count == 3 {
            return raw.range(of: #"\Apath=%2Fbar%2F(?:[nwru][1-9][0-9]{0,14}|m[0-9a-f]{24})&c=[0-9b-hjkmnp-z]{5}&offer=[A-Za-z0-9._:-]{1,128}\z"#, options: .regularExpression) != nil
        }
        guard keys.count == 4, Set(keys) == ["path", "c", "drink", "hh"],
              let drink = pairs.first(where: { $0.hasPrefix("drink=") })?.dropFirst(6),
              DrinkCategory.all.contains(where: { $0.code == String(drink) }),
              let hh = pairs.first(where: { $0.hasPrefix("hh=") })?.dropFirst(3), ["0", "1"].contains(String(hh)) else { return false }
        return true
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
        let base = "\(homeURL.absoluteString)?path=%2Fbar%2F\(canonical.lastPathComponent)&c=\(cell)"
        if let original = URLComponents(url: url, resolvingAgainstBaseURL: false),
           let raw = original.percentEncodedQuery, isEntryPath(original.percentEncodedPath), validVenueQuery(raw),
           let items = original.queryItems, items.count == 4,
           let drink = items.first(where: { $0.name == "drink" })?.value,
           let hh = items.first(where: { $0.name == "hh" })?.value {
            return URL(string: "\(base)&drink=\(drink)&hh=\(hh)")
        }
        if let original = URLComponents(url: url, resolvingAgainstBaseURL: false),
           let raw = original.percentEncodedQuery, isEntryPath(original.percentEncodedPath), validVenueQuery(raw),
           let items = original.queryItems, items.count == 3,
           let offer = items.first(where: { $0.name == "offer" })?.value {
            return URL(string: "\(base)&offer=\(offer)")
        }
        return URL(string: base)
    }

    static func offerDocument(_ venue: URL, offerID: String) -> URL? {
        guard offerID.range(of: #"\A[A-Za-z0-9._:-]{1,128}\z"#, options: .regularExpression) != nil,
              let canonical = SavedVenuePolicy.canonicalURL(venue), let base = venueDocument(canonical) else { return nil }
        return URL(string: "\(base.absoluteString)&offer=\(offerID)")
    }

    static func drinkDocument(_ venue: URL, drink: String, band: ComparisonBand) -> URL? {
        guard DrinkCategory.all.contains(where: { $0.code == drink }),
              let canonical = SavedVenuePolicy.canonicalURL(venue), let base = venueDocument(canonical) else { return nil }
        return URL(string: "\(base.absoluteString)&drink=\(drink)&hh=\(band.rawValue)")
    }

    static func drinkFocus(_ url: URL) -> (drink: String, band: ComparisonBand)? {
        guard publicVenue(url) != nil, let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems,
              items.count == 4, let drink = items.first(where: { $0.name == "drink" })?.value,
              let hh = items.first(where: { $0.name == "hh" })?.value, let number = Int(hh), let band = ComparisonBand(rawValue: number) else { return nil }
        return (drink, band)
    }

    static func shareURL(_ url: URL) -> URL {
        guard URLPolicy.isWebsite(url) else { return URLPolicy.homeURL }
        if isDocument(url) {
            return SavedVenuePolicy.canonicalURL(url).flatMap(venueDocument) ?? URLPolicy.homeURL
        }
        if let venue = SavedVenuePolicy.canonicalURL(url) { return venue }
        guard let parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
              parts.percentEncodedQuery == nil, parts.percentEncodedFragment == nil,
              parts.percentEncodedPath.range(of: #"\A/(?:privacy|regole|copertura|roma|milano|torino|napoli)?/?\z"#, options: .regularExpression) != nil else { return URLPolicy.homeURL }
        return URL(string: "https://www.dovebevo.com\(parts.percentEncodedPath)") ?? URLPolicy.homeURL
    }
}
