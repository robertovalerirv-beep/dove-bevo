import Foundation

/// Only exact local favourite identities cross into the trusted app document.
enum NativeSavedDrinkKeys {
    static func venuePrefix(_ url: URL?) -> String? {
        guard let url, let canonical = SavedVenuePolicy.canonicalURL(url),
              let cell = URLComponents(url: canonical, resolvingAgainstBaseURL: false)?
                  .queryItems?.first(where: { $0.name == "c" })?.value else { return nil }
        return "\(canonical.lastPathComponent)|\(cell)|"
    }

    static func key(venue: URL, kind: String, item: String, band: Int? = nil,
                    currency: String? = nil, serving: String? = nil) -> String? {
        guard let canonical = SavedVenuePolicy.canonicalURL(venue),
              let parts = URLComponents(url: canonical, resolvingAgainstBaseURL: false),
              let cell = parts.queryItems?.first(where: { $0.name == "c" })?.value,
              !item.contains("|"), ["offer", "legacy", "customer", "europe"].contains(kind) else { return nil }
        var result = "\(canonical.lastPathComponent)|\(cell)|\(kind)|\(item)"
        if kind == "legacy" || kind == "europe" {
            guard let band, (0...1).contains(band) else { return nil }
            result += "|\(band)"
        }
        if kind == "europe" {
            guard let currency, ["EUR", "GBP"].contains(currency), let serving,
                  serving.range(of: #"\A(?:drink|glass|ml):[0-9]{0,4}\z"#,
                                options: .regularExpression) != nil else { return nil }
            result += "|\(currency)|\(serving)"
        }
        return result
    }

    static func load(drinks: SavedDrinkStore, offers: SavedMenuOfferStore,
                     customers: SavedCustomerItemStore, europe: SavedEuropeDrinkStore) throws -> [String] {
        var keys: [String] = []
        for value in try drinks.load() {
            guard let key = key(venue: value.venue.url, kind: "legacy", item: value.drink,
                                band: value.band.rawValue) else { throw SavedDrinkStore.StoreError.unreadableRecords }
            keys.append(key)
        }
        for value in try offers.load() {
            guard let key = key(venue: value.venue.url, kind: "offer", item: value.offerID)
            else { throw SavedDrinkStore.StoreError.unreadableRecords }
            keys.append(key)
        }
        for value in try customers.load() {
            guard let key = key(venue: value.venue.url, kind: "customer", item: value.itemKey)
            else { throw SavedDrinkStore.StoreError.unreadableRecords }
            keys.append(key)
        }
        for value in try europe.load() {
            guard let key = key(venue: value.venue.url, kind: "europe", item: value.drink,
                                band: value.band.rawValue, currency: value.currency,
                                serving: value.serving.key)
            else { throw SavedDrinkStore.StoreError.unreadableRecords }
            keys.append(key)
        }
        return keys
    }

    static func assignment(current: URL?, drinks: SavedDrinkStore, offers: SavedMenuOfferStore,
                           customers: SavedCustomerItemStore, europe: SavedEuropeDrinkStore) -> String {
        guard let keys = try? load(drinks: drinks, offers: offers, customers: customers, europe: europe),
              let data = try? JSONSerialization.data(withJSONObject: keys.filter {
                  guard let prefix = venuePrefix(current) else { return false }
                  return $0.hasPrefix(prefix)
              }),
              let json = String(data: data, encoding: .utf8) else {
            return "window.DoveBevoNativeSavedDrinkKeys=null;"
        }
        return "window.DoveBevoNativeSavedDrinkKeys=\(json);"
    }
}
