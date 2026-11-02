import Foundation

/// Independent mobile price values. These are never decoded into legacy EUR tuples.
struct EuropeServing: Equatable {
    let unit: String
    let ml: Int?
    var key: String { "\(unit):\(ml.map { String($0) } ?? "")" }
    var label: String {
        if unit == "ml" { return "\(ml ?? 0) ml" }
        if unit == "glass" { return "Calice" + (ml.map { " · \($0) ml" } ?? " · volume non dichiarato") }
        return "Drink singolo"
    }
}

struct EuropePrice: Equatable {
    let drink: String
    let band: ComparisonBand
    let currency: String
    let amountMinor: Int
    let serving: EuropeServing
    let observedOn: String?
    let confirmedOn: String?
    let confirmations: Int
    let quarantined: Bool
    let revision: String
    let sourceURL: URL?
    let sourceSHA256: String?
    let sourceCheckedOn: String?
    let menuItem: String?
    var group: String { "\(currency)|\(serving.key)" }
    var groupLabel: String { "\(currency) · \(serving.label)" }
    var amount: String { String(format: "%d,%02d %@", amountMinor / 100, amountMinor % 100, currency == "GBP" ? "£" : "€") }
    func details(today: String) -> String {
        let evidence: String
        if let checked = sourceCheckedOn {
            evidence = "Da menu online · Fonte verificata il \(checked)\n\(menuItem ?? "")\nFonte: \(sourceURL?.host ?? "")"
        } else { evidence = "Segnalato il \(observedOn ?? "")" }
        let count = confirmations == 1 ? "1 conferma" : "\(confirmations) conferme"
        let old = (observedOn ?? sourceCheckedOn).flatMap(ComparisonJSON.day).map { date in
            (ComparisonJSON.day(today)?.timeIntervalSince(date) ?? .infinity) > 90 * 86400
        } ?? true
        let age = old ? (sourceCheckedOn == nil ? " · Da confermare: oltre 90 giorni" : " · Menu da riverificare: oltre 90 giorni") : ""
        return "\(groupLabel)\n\(evidence)\n\(count)" + (confirmedOn.map { " · Confermato il \($0)" } ?? "") + age
    }
}

struct EuropeVenue: Equatable {
    let key: String
    let name: String
    let cell: String
    let latitude: Double
    let longitude: Double
    let city: String
    let country: String
    let currency: String
    var prices: [EuropePrice] = []
    var url: URL { URL(string: "https://www.dovebevo.com/bar/\(key)?c=\(cell)")! }
}

struct EuropeCatalog {
    let version: String
    let venues: [String: EuropeVenue]
}

struct EuropeSnapshot {
    var venues: [String: EuropeVenue] = [:]
    var unavailableCells = Set<String>()
}

enum NativeComparablePrice {
    case legacy(FavouritePrice), europe(EuropePrice)
    var amountMinor: Int { switch self { case .legacy(let p): return p.cents; case .europe(let p): return p.amountMinor } }
    var group: String { switch self { case .legacy: return "EUR|legacy-unknown"; case .europe(let p): return p.group } }
    var groupLabel: String { switch self { case .legacy: return "EUR · Formato non dichiarato"; case .europe(let p): return p.groupLabel } }
    var amount: String { switch self { case .legacy(let p): return String(format: "%d,%02d €", p.cents / 100, p.cents % 100); case .europe(let p): return p.amount } }
    func details(today: String) -> String {
        switch self {
        case .europe(let price): return price.details(today: today)
        case .legacy(let price):
            let count = price.confirmations == 1 ? "1 conferma" : "\(price.confirmations) conferme"
            return "Segnalato il \(price.observedOn) · \(count)" + (price.isOld(today: today) ? " · Da confermare: oltre 90 giorni" : "") + "\n\(groupLabel)"
        }
    }
}

struct DiscoveryPresentedRow {
    let key: String; let name: String; let url: URL
    let latitude: Double; let longitude: Double; let location: String
    let price: NativeComparablePrice
}

enum EuropeJSON {
    struct Cell { let venues: [String: EuropeVenue]; let hidden: Set<String>; let legacy: Set<String> }
    static func italianCell(_ cell: String) -> Bool {
        var south = -90.0, north = 90.0, west = -180.0, east = 180.0, even = true
        let alphabet = Array("0123456789bcdefghjkmnpqrstuvwxyz")
        guard cell.count == 5 else { return false }
        for character in cell {
            guard let value = alphabet.firstIndex(of: character) else { return false }
            for bit in (0...4).reversed() {
                let high = value & (1 << bit) != 0
                if even { let middle = (west + east) / 2; if high { west = middle } else { east = middle } }
                else { let middle = (south + north) / 2; if high { south = middle } else { north = middle } }
                even.toggle()
            }
        }
        return north >= 35 && south <= 48 && east >= 6 && west <= 19
    }
    static func object(_ data: Data) throws -> [String: Any] {
        guard data.count <= 2 * 1024 * 1024, String(data: data, encoding: .utf8) != nil,
              let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw ComparisonReadError.invalidData }
        return object
    }
    private static func exact(_ value: [String: Any], _ keys: [String]) -> Bool { Set(value.keys) == Set(keys) }
    private static func text(_ value: Any?) -> String? {
        guard let value = ComparisonJSON.name(value), value.utf16.count >= 2 else { return nil }
        return value
    }
    private static func https(_ value: Any?) -> URL? {
        guard let raw = value as? String, raw.utf8.count <= 8192, raw.utf16.count <= 2048,
              !raw.unicodeScalars.contains(where: { $0.value <= 32 || $0.value == 127 }),
              let parts = URLComponents(string: raw), parts.scheme == "https", parts.user == nil, parts.password == nil,
              parts.fragment == nil, parts.port == nil || parts.port == 443,
              let host = parts.host, !host.isEmpty, let url = parts.url else { return nil }
        return url
    }
    static func utcToday(_ date: Date = Date()) -> String {
        let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian); formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"; return formatter.string(from: date)
    }
    private static func day(_ value: Any?, today: String) -> String? {
        guard let value = value as? String, ComparisonJSON.day(value) != nil, value <= today else { return nil }
        return value
    }
    static func catalog(_ data: Data, checkedToday: String = utcToday()) throws -> EuropeCatalog {
        let object = try EuropeJSON.object(data)
        guard exact(object, ["schema_version", "version", "venues"]), ComparisonJSON.integer(object["schema_version"]) == 1,
              let version = object["version"] as? String, ComparisonJSON.matches(version, "^[A-Za-z0-9._-]{1,100}$"),
              let rows = object["venues"] as? [[String: Any]], rows.count <= 5000 else { throw ComparisonReadError.invalidData }
        let boxes: [String: [Double]] = ["IT": [35,48,6,19], "GB": [49.8,61,-8.8,2.1], "FR": [41,51.6,-5.5,10], "ES": [27.5,44,-18.5,4.5], "DE": [47.2,55.2,5.5,15.6]]
        var venues: [String: EuropeVenue] = [:]
        for row in rows {
            guard exact(row, ["key","name","kind","lat","lon","cell","city","country","currency","google"]),
                  let key = ComparisonJSON.key(row["key"], prefixes: "nwr"), venues[key] == nil,
                  let name = text(row["name"]), let city = text(row["city"]),
                  ComparisonJSON.integer(row["kind"], minimum: 1, maximum: 4) != nil,
                  let country = row["country"] as? String, let box = boxes[country],
                  let currency = row["currency"] as? String, currency == (country == "GB" ? "GBP" : "EUR"),
                  let lat = ComparisonJSON.number(row["lat"], range: box[0]...box[1]),
                  let lon = ComparisonJSON.number(row["lon"], range: box[2]...box[3]),
                  let cell = row["cell"] as? String, ComparisonJSON.cellForCoordinates(latitude: lat, longitude: lon) == cell,
                  let google = row["google"] as? [String: Any], exact(google, ["url","review_count","checked_on"]),
                  let googleURL = https(google["url"]), let host = googleURL.host,
                  ComparisonJSON.matches(host, "^(www\\.|maps\\.)?google\\.(com|it|fr|de|es|co\\.uk)$"),
                  ComparisonJSON.integer(google["review_count"], minimum: 101, maximum: 100_000_000) != nil,
                  day(google["checked_on"], today: checkedToday) != nil else { throw ComparisonReadError.invalidData }
            venues[key] = EuropeVenue(key: key, name: name, cell: cell, latitude: lat, longitude: lon, city: city, country: country, currency: currency)
        }
        return EuropeCatalog(version: version, venues: venues)
    }
    static func resolve(_ data: Data, catalog: EuropeCatalog, cell: String, today: String, checkedToday: String = utcToday()) throws -> Cell {
        let object = try EuropeJSON.object(data)
        guard exact(object, ["schema_version","catalog_version","rows","hidden","legacy_venues"]),
              ComparisonJSON.integer(object["schema_version"]) == 1, object["catalog_version"] as? String == catalog.version,
              let rows = object["rows"] as? [[String: Any]], rows.count <= 5000,
              let hidden = object["hidden"] as? [String], let legacy = object["legacy_venues"] as? [String],
              Set(hidden).count == hidden.count, Set(legacy).count == legacy.count,
              (hidden + legacy).allSatisfy({ catalog.venues[$0]?.cell == cell }),
              legacy.allSatisfy({ catalog.venues[$0]?.country == "IT" }) else { throw ComparisonReadError.invalidData }
        var result = catalog.venues.filter { $0.value.cell == cell && !hidden.contains($0.key) && !legacy.contains($0.key) }
        var identities = Set<String>(), counts: [String: Int] = [:]
        for row in rows {
            guard exact(row, ["venue","cell","drink","hh","currency","amount_minor","serving","observed_on","confirmed_on","confirmations","status","revision","provenance"]),
                  let key = row["venue"] as? String, let venue = catalog.venues[key], venue.cell == cell, row["cell"] as? String == cell,
                  let code = row["drink"] as? String, let drink = DrinkCategory.all.first(where: { $0.code == code }),
                  let hh = ComparisonJSON.integer(row["hh"], maximum: 1), let band = ComparisonBand(rawValue: hh),
                  let currency = row["currency"] as? String, currency == venue.currency,
                  let amount = ComparisonJSON.integer(row["amount_minor"], minimum: 1, maximum: 100_000),
                  let rawServing = row["serving"] as? [String: Any],
                  Set(rawServing.keys).isSubset(of: ["unit", "ml"]), let unit = rawServing["unit"] as? String,
                  ["drink","glass","ml"].contains(unit) else { throw ComparisonReadError.invalidData }
            let volume = ComparisonJSON.integer(rawServing["ml"], minimum: 1, maximum: 2000)
            let servingValid = (code == "beer_draft" || code == "water") ? unit == "ml" : (code == "wine_glass" ? unit == "glass" : unit == "drink" && volume == nil)
            guard (rawServing["ml"] == nil || volume != nil), (unit != "ml" || volume != nil),
                  servingValid else { throw ComparisonReadError.invalidData }
            let bounds: ClosedRange<Int> = currency == "EUR" ? drink.allowedCents : (code == "water" ? 1...1500 : (code == "beer_draft" || code == "alcohol_free" ? 100...3000 : 100...5000))
            let observed = day(row["observed_on"], today: today), confirmed = day(row["confirmed_on"], today: today)
            guard bounds.contains(amount), (row["observed_on"] is NSNull || observed != nil),
                  (row["confirmed_on"] is NSNull || confirmed != nil),
                  let confirmations = ComparisonJSON.integer(row["confirmations"]),
                  let status = row["status"] as? String, ["active","quarantined"].contains(status),
                  let revision = row["revision"] as? String, ComparisonJSON.matches(revision, "^[A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{12}$"), UUID(uuidString: revision) != nil,
                  let provenance = row["provenance"] as? [String: Any], exact(provenance, ["kind","source_url","source_checked_on","source_sha256","menu_item"]),
                  let sourceKind = provenance["kind"] as? String else { throw ComparisonReadError.invalidData }
            let source = https(provenance["source_url"]), checked = day(provenance["source_checked_on"], today: checkedToday)
            let item = provenance["menu_item"] as? String
            if sourceKind == "online_menu" {
                guard observed == nil, source != nil, checked != nil,
                      let sha = provenance["source_sha256"] as? String, ComparisonJSON.matches(sha, "^[a-f0-9]{64}$"),
                      let item, !item.isEmpty, item.utf16.count <= 240 else { throw ComparisonReadError.invalidData }
            } else {
                guard sourceKind == "customer", observed != nil, provenance["source_url"] is NSNull,
                      provenance["source_checked_on"] is NSNull, provenance["source_sha256"] is NSNull, provenance["menu_item"] is NSNull else { throw ComparisonReadError.invalidData }
            }
            let serving = EuropeServing(unit: unit, ml: volume)
            guard identities.insert("\(key)|\(code)|\(hh)|\(currency)|\(serving.key)").inserted else { throw ComparisonReadError.invalidData }
            counts[key, default: 0] += 1
            guard counts[key, default: 0] <= 100 else { throw ComparisonReadError.invalidData }
            result[key]?.prices.append(EuropePrice(drink: code, band: band, currency: currency, amountMinor: amount, serving: serving,
                observedOn: observed, confirmedOn: confirmed, confirmations: confirmations, quarantined: status == "quarantined", revision: revision,
                sourceURL: source, sourceSHA256: provenance["source_sha256"] as? String, sourceCheckedOn: checked, menuItem: item))
        }
        return Cell(venues: result, hidden: Set(hidden), legacy: Set(legacy))
    }
}
