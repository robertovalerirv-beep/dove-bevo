import CoreFoundation
import Foundation

enum ComparisonBand: Int, CaseIterable {
    case normal = 0, happyHour = 1
    var name: String { self == .normal ? "Normale" : "Happy hour" }
}

extension DrinkCategory {
    var allowedCents: ClosedRange<Int> {
        switch code {
        case "beer_draft": return 250...1200
        case "spritz": return 250...1500
        case "negroni", "sbagliato", "gin_tonic", "gin_lemon": return 400...2000
        case "wine_glass": return 200...1500
        case "alcohol_free": return 200...1200
        case "water": return 50...600
        default: return 0...0
        }
    }
}

enum ComparisonReadError: Error { case invalidData, unavailable }

struct FavouritePrice: Equatable {
    let drink: String
    let band: ComparisonBand
    let cents: Int
    let observedOn: String
    let confirmations: Int
    let quarantined: Bool

    func isOld(today: String) -> Bool {
        guard let observed = ComparisonJSON.day(observedOn), let current = ComparisonJSON.day(today) else { return true }
        return current.timeIntervalSince(observed) > 90 * 86_400
    }
}

struct CurrentFavouriteVenue: Equatable {
    let key: String
    let name: String
    let prices: [FavouritePrice]

    func price(drink: String, band: ComparisonBand) -> FavouritePrice? {
        prices.first { $0.drink == drink && $0.band == band && !$0.quarantined }
    }
}

struct FavouriteComparisonSnapshot {
    let venues: [URL: CurrentFavouriteVenue]
    let unavailable: Set<URL>
}

struct FavouriteComparisonRow {
    let saved: SavedVenue
    let current: CurrentFavouriteVenue?
    let price: FavouritePrice?
    let unavailable: Bool
    var name: String { current?.name ?? saved.label }

    static func sorted(saved: [SavedVenue], snapshot: FavouriteComparisonSnapshot?, drink: String, band: ComparisonBand) -> [FavouriteComparisonRow] {
        saved.map { entry in
            let current = snapshot?.venues[entry.url]
            return FavouriteComparisonRow(saved: entry, current: current, price: current?.price(drink: drink, band: band),
                                          unavailable: snapshot?.unavailable.contains(entry.url) ?? true)
        }.sorted {
            if let left = $0.price, let right = $1.price, left.cents != right.cents { return left.cents < right.cents }
            if ($0.price != nil) != ($1.price != nil) { return $0.price != nil }
            let order = $0.name.localizedCaseInsensitiveCompare($1.name)
            return order == .orderedSame ? $0.saved.url.absoluteString < $1.saved.url.absoluteString : order == .orderedAscending
        }
    }
}

enum ComparisonJSON {
    static func integer(_ value: Any?, minimum: Int = 0, maximum: Int = 9_007_199_254_740_991) -> Int? {
        guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID() else { return nil }
        let encoding = String(cString: number.objCType)
        guard ["c", "C", "s", "S", "i", "I", "l", "L", "q", "Q"].contains(encoding) else { return nil }
        if ["C", "S", "I", "L", "Q"].contains(encoding), number.uint64Value > UInt64(Int64.max) { return nil }
        guard number.int64Value >= Int64(minimum), number.int64Value <= Int64(maximum) else { return nil }
        return Int(number.int64Value)
    }

    static func number(_ value: Any?, range: ClosedRange<Double>) -> Double? {
        guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(),
              number.doubleValue.isFinite, range.contains(number.doubleValue) else { return nil }
        return number.doubleValue
    }

    static func matches(_ value: String, _ pattern: String) -> Bool {
        value.range(of: pattern, options: .regularExpression) == value.startIndex..<value.endIndex
    }

    static func key(_ value: Any?, prefixes: String = "nwru") -> String? {
        guard let text = value as? String, matches(text, "^[\(prefixes)][1-9][0-9]{0,14}$") else { return nil }
        return text
    }

    static func name(_ value: Any?) -> String? {
        guard let text = value as? String, !text.isEmpty, text == text.trimmingCharacters(in: .whitespacesAndNewlines),
              text.utf16.count <= 120, !text.unicodeScalars.contains(where: {
                  $0.value < 32 || (127...159).contains($0.value) || $0.value == 0xfffd
              }) else { return nil }
        return text
    }

    static func day(_ value: String) -> Date? {
        guard matches(value, "^[0-9]{4}-[0-9]{2}-[0-9]{2}$") else { return nil }
        let parts = value.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3, parts[0] >= 1 else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        guard let date = calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2])) else { return nil }
        let actual = calendar.dateComponents([.year, .month, .day], from: date)
        guard actual.year == parts[0], actual.month == parts[1], actual.day == parts[2] else { return nil }
        return date
    }

    static func today(_ date: Date = Date()) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Rome")!
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year!, parts.month!, parts.day!)
    }

    static func version(_ data: Data) throws -> String {
        guard data.count <= 8192, let object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              object["status"] as? String == "ok", let version = object["data_version"] as? String,
              matches(version, "^[0-9]{8}$") else { throw ComparisonReadError.invalidData }
        return version
    }

    static func cell(from saved: SavedVenue) -> String? {
        guard SavedVenuePolicy.canonicalURL(saved.url) == saved.url else { return nil }
        return URLComponents(url: saved.url, resolvingAgainstBaseURL: false)?.queryItems?.first?.value
    }

    static func cellForCoordinates(latitude: Double, longitude: Double) -> String {
        let alphabet = Array("0123456789bcdefghjkmnpqrstuvwxyz")
        var latitudeRange = (-90.0, 90.0)
        var longitudeRange = (-180.0, 180.0)
        var even = true
        var output = ""
        for _ in 0..<5 {
            var value = 0
            for _ in 0..<5 {
                value <<= 1
                if even {
                    let middle = (longitudeRange.0 + longitudeRange.1) / 2
                    if longitude >= middle { value |= 1; longitudeRange.0 = middle } else { longitudeRange.1 = middle }
                } else {
                    let middle = (latitudeRange.0 + latitudeRange.1) / 2
                    if latitude >= middle { value |= 1; latitudeRange.0 = middle } else { latitudeRange.1 = middle }
                }
                even.toggle()
            }
            output.append(alphabet[value])
        }
        return output
    }

    private static func coordinates(_ latitude: Any, _ longitude: Any, cell: String) -> Bool {
        guard let lat = number(latitude, range: -90...90), let lon = number(longitude, range: -180...180) else { return false }
        return cellForCoordinates(latitude: lat, longitude: lon) == cell
    }

    private static func staticNames(_ data: Data, cell: String) throws -> [String: String] {
        guard data.count <= 2 * 1024 * 1024,
              let file = try JSONSerialization.jsonObject(with: data) as? [String: Any], Set(file.keys) == ["c", "v"],
              let cities = file["c"] as? [[Any]], let rows = file["v"] as? [[Any]] else { throw ComparisonReadError.invalidData }
        for city in cities {
            guard city.count == 2, integer(city[0], minimum: 1) != nil, name(city[1]) != nil else { throw ComparisonReadError.invalidData }
        }
        var names: [String: String] = [:]
        for row in rows {
            guard row.count == 7, let id = key(row[0], prefixes: "nwr"), let label = name(row[1]), names[id] == nil,
                  integer(row[2], maximum: 4) != nil, coordinates(row[3], row[4], cell: cell), row[5] is String,
                  integer(row[6], minimum: -1, maximum: cities.count - 1) != nil else { throw ComparisonReadError.invalidData }
            names[id] = label
        }
        return names
    }

    static func resolve(staticData: Data?, priceData: Data, cell: String, today: String) throws -> [String: CurrentFavouriteVenue] {
        guard matches(cell, "^[0-9b-hjkmnp-z]{5}$"), day(today) != nil, priceData.count <= 512 * 1024,
              let live = try JSONSerialization.jsonObject(with: priceData) as? [String: Any],
              Set(live.keys).isSuperset(of: ["p", "u", "pend", "h"]), Set(live.keys).isSubset(of: ["p", "u", "pend", "h", "g"]),
              let prices = live["p"] as? [[Any]], let approved = live["u"] as? [[Any]],
              let pending = live["pend"] as? [[Any]], let hidden = live["h"] as? [Any] else { throw ComparisonReadError.invalidData }
        // A failed static asset proves nothing about OSM venues. The separately
        // validated approved-u list can still establish current user venues.
        var names = staticData.flatMap { try? staticNames($0, cell: cell) } ?? [:]
        for row in approved {
            guard row.count == 5, let id = key(row[0], prefixes: "u"), let label = name(row[1]), names[id] == nil,
                  integer(row[2], maximum: 4) != nil, coordinates(row[3], row[4], cell: cell) else { throw ComparisonReadError.invalidData }
            names[id] = label
        }
        var pendingKeys = Set<String>()
        for row in pending {
            guard row.count == 6, let id = key(row[0], prefixes: "u"), name(row[1]) != nil, names[id] == nil,
                  pendingKeys.insert(id).inserted, integer(row[2], maximum: 4) != nil,
                  coordinates(row[3], row[4], cell: cell),
                  integer(row[5]) != nil else { throw ComparisonReadError.invalidData }
        }
        var hiddenKeys = Set<String>()
        for value in hidden {
            guard let id = key(value), hiddenKeys.insert(id).inserted else { throw ComparisonReadError.invalidData }
        }
        if let verified = live["g"] {
            guard let values = verified as? [Any] else { throw ComparisonReadError.invalidData }
            var seen = Set<String>()
            for value in values { guard let id = key(value), seen.insert(id).inserted else { throw ComparisonReadError.invalidData } }
        }
        var rowsByKey: [String: [FavouritePrice]] = [:]
        var pairs = Set<String>()
        for row in prices {
            guard row.count == 7, let id = key(row[0]), let drink = row[1] as? String,
                  let category = DrinkCategory.all.first(where: { $0.code == drink }),
                  let hour = integer(row[2], maximum: 1), let band = ComparisonBand(rawValue: hour),
                  let cents = integer(row[3], minimum: category.allowedCents.lowerBound, maximum: category.allowedCents.upperBound),
                  let date = row[4] as? String, day(date) != nil, date <= today,
                  let confirmations = integer(row[5]), let quarantine = integer(row[6], maximum: 1),
                  pairs.insert("\(id)|\(drink)|\(hour)").inserted else { throw ComparisonReadError.invalidData }
            rowsByKey[id, default: []].append(FavouritePrice(drink: drink, band: band, cents: cents, observedOn: date,
                                                          confirmations: confirmations, quarantined: quarantine == 1))
        }
        var resolved: [String: CurrentFavouriteVenue] = [:]
        for (key, name) in names where !hiddenKeys.contains(key) && !pendingKeys.contains(key) {
            resolved[key] = CurrentFavouriteVenue(key: key, name: name, prices: rowsByKey[key] ?? [])
        }
        return resolved
    }
}
