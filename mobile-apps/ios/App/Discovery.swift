import Foundation

struct DiscoveryArea: Equatable {
    let latitude: Double
    let longitude: Double
    let zoom: Double

    init?(latitude: Double, longitude: Double, zoom: Double) {
        guard latitude.isFinite, longitude.isFinite, zoom.isFinite,
              (-85.051129...85.051129).contains(latitude), (-180...180).contains(longitude),
              (13...24).contains(zoom) else { return nil }
        self.latitude = latitude; self.longitude = longitude == 180 ? -180 : longitude; self.zoom = zoom
    }

    /// Geohash5 has 13 longitude bits and 12 latitude bits. The bounded
    /// neighbourhood describes the map centre, not the entire visible map.
    var cells: [String] {
        let step = 360.0 / 8192.0
        var result = Set<String>()
        for y in -1...1 {
            for x in -1...1 {
                var lon = longitude + Double(x) * step
                if lon > 180 { lon -= 360 }
                if lon < -180 { lon += 360 }
                result.insert(ComparisonJSON.cellForCoordinates(latitude: latitude + Double(y) * step, longitude: lon))
            }
        }
        return result.sorted()
    }

    func distance(latitude: Double, longitude: Double) -> Double {
        let radians = Double.pi / 180
        let first = self.latitude * radians, second = latitude * radians
        let deltaLat = (latitude - self.latitude) * radians, deltaLon = (longitude - self.longitude) * radians
        let value = pow(sin(deltaLat / 2), 2) + cos(first) * cos(second) * pow(sin(deltaLon / 2), 2)
        return 6_371_000 * 2 * asin(sqrt(min(1, max(0, value))))
    }
}

struct DiscoveryVenue: Equatable {
    let key: String
    let name: String
    let cell: String
    let latitude: Double
    let longitude: Double
    let address: String
    let city: String?
    let prices: [FavouritePrice]

    var url: URL { URL(string: "https://www.dovebevo.com/bar/\(key)?c=\(cell)")! }
    func price(drink: String, band: ComparisonBand) -> FavouritePrice? {
        prices.first { $0.drink == drink && $0.band == band && !$0.quarantined }
    }
}

struct DiscoverySnapshot {
    let area: DiscoveryArea
    let venues: [DiscoveryVenue]
    let unavailableCells: Set<String>
    var europe: EuropeSnapshot? = nil
    var menu: [String: MenuV2CellVenue] = [:]
    var menuUnavailableCells: Set<String> = []
    var partialCells: Set<String> { unavailableCells.union(menuUnavailableCells) }

    func displayRows(drink: String, band: ComparisonBand) -> [DiscoveryPresentedRow] {
        let original = rows(drink: drink, band: band).filter { europe?.venues[$0.venue.key] == nil }.map { row in
            DiscoveryPresentedRow(key: row.venue.key, name: row.venue.name, url: row.venue.url, latitude: row.venue.latitude,
                longitude: row.venue.longitude, location: [row.venue.address, row.venue.city ?? ""].filter { !$0.isEmpty }.joined(separator: " · "), price: .legacy(row.price))
        }
        let added = (europe?.venues.values.map { $0 } ?? []).flatMap { venue in
            venue.prices.filter { $0.drink == drink && $0.band == band && !$0.quarantined }.map { price in
                DiscoveryPresentedRow(key: venue.key, name: venue.name, url: venue.url, latitude: venue.latitude, longitude: venue.longitude,
                    location: venue.city, price: .europe(price))
            }
        }
        let ownerMenus = menu.values.flatMap { venue in
            venue.samples.filter { $0.category == drink && $0.band == band }.map { price in
                DiscoveryPresentedRow(key: venue.key, name: venue.name, url: venue.url,
                    latitude: venue.latitude, longitude: venue.longitude,
                    location: [venue.address, venue.city].filter { !$0.isEmpty }.joined(separator: " · "),
                    price: .menuV2(price))
            }
        }
        return Self.rankRows(original + added + ownerMenus, around: area)
    }

    /// Keep each original currency separate, then show ascending amounts
    /// within it. Serving remains visible; different servings are not a
    /// like-for-like comparison. A total tie has a stable source identity.
    static func rankRows(_ values: [DiscoveryPresentedRow], around area: DiscoveryArea) -> [DiscoveryPresentedRow] {
        values.sorted { first, second in
            if Self.currency(first.price) != Self.currency(second.price) {
                return Self.currency(first.price) < Self.currency(second.price)
            }
            let firstAmount = Self.normalizedAmount(first.price), secondAmount = Self.normalizedAmount(second.price)
            if firstAmount != secondAmount {
                return firstAmount < secondAmount
            }
            if first.price.discoveryGroup != second.price.discoveryGroup {
                return first.price.discoveryGroup < second.price.discoveryGroup
            }
            let firstDistance = area.distance(latitude: first.latitude, longitude: first.longitude)
            let secondDistance = area.distance(latitude: second.latitude, longitude: second.longitude)
            if firstDistance != secondDistance { return firstDistance < secondDistance }
            let firstName = first.name.lowercased(), secondName = second.name.lowercased()
            if firstName != secondName { return firstName < secondName }
            if first.name != second.name { return first.name < second.name }
            if first.key != second.key { return first.key < second.key }
            return Self.tieKey(first.price) < Self.tieKey(second.price)
        }
    }

    static func currency(_ price: NativeComparablePrice) -> String {
        switch price {
        case .legacy: return "EUR"
        case .europe(let value): return value.currency
        case .menuV2(let value): return value.currency
        }
    }

    /// Thousandths of the original currency unit. Every accepted menu
    /// exponent is 0...3, so this stays exact and within Int64 bounds.
    private static func normalizedAmount(_ price: NativeComparablePrice) -> Int64 {
        let exponent: Int
        switch price {
        case .legacy, .europe: exponent = 2
        case .menuV2(let value): exponent = value.exponent
        }
        let scale: [Int64] = [1000, 100, 10, 1]
        return Int64(price.amountMinor) * scale[exponent]
    }

    private static func tieKey(_ price: NativeComparablePrice) -> String {
        switch price {
        case .legacy(let value): return "legacy|\(value.observedOn)"
        case .europe(let value): return "europe|\(value.revision)|\(value.menuItem ?? "")"
        case .menuV2(let value): return "menu|\(value.id)"
        }
    }

    func rows(drink: String, band: ComparisonBand) -> [(venue: DiscoveryVenue, price: FavouritePrice)] {
        venues.compactMap { venue in venue.price(drink: drink, band: band).map { (venue: venue, price: $0) } }.sorted {
            if $0.price.cents != $1.price.cents { return $0.price.cents < $1.price.cents }
            let order = $0.venue.name.localizedCaseInsensitiveCompare($1.venue.name)
            return order == .orderedSame ? $0.venue.key < $1.venue.key : order == .orderedAscending
        }
    }
}

enum DiscoveryJSON {
    struct Cell { let venues: [DiscoveryVenue]; let incomplete: Bool }
    private struct Metadata {
        let key: String; let name: String; let latitude: Double; let longitude: Double
        let address: String; let city: String?
    }

    static func resolve(staticData: Data?, priceData: Data, cell: String, today: String) throws -> Cell {
        // Reuse the existing whole-response validation, price limits, date and
        // moderation filters. Metadata can only describe these resolved keys.
        let current = try ComparisonJSON.resolve(staticData: staticData, priceData: priceData, cell: cell, today: today)
        let file = staticData.flatMap { try? metadata($0, cell: cell) }
        var values = file ?? [:]
        guard let live = try JSONSerialization.jsonObject(with: priceData) as? [String: Any],
              let approved = live["u"] as? [[Any]] else { throw ComparisonReadError.invalidData }
        for row in approved {
            guard row.count == 5, let key = ComparisonJSON.key(row[0], prefixes: "u"),
                  let name = ComparisonJSON.name(row[1]),
                  let lat = ComparisonJSON.number(row[3], range: -90...90),
                  let lon = ComparisonJSON.number(row[4], range: -180...180) else { throw ComparisonReadError.invalidData }
            values[key] = Metadata(key: key, name: name, latitude: lat, longitude: lon, address: "", city: nil)
        }
        let venues = values.values.compactMap { meta -> DiscoveryVenue? in
            guard let venue = current[meta.key], venue.name == meta.name else { return nil }
            return DiscoveryVenue(key: meta.key, name: meta.name, cell: cell, latitude: meta.latitude,
                                  longitude: meta.longitude, address: meta.address, city: meta.city, prices: venue.prices)
        }
        return Cell(venues: venues, incomplete: file == nil)
    }

    private static func metadata(_ data: Data, cell: String) throws -> [String: Metadata] {
        guard data.count <= 2 * 1024 * 1024,
              let file = try JSONSerialization.jsonObject(with: data) as? [String: Any], Set(file.keys) == ["c", "v"],
              let cities = file["c"] as? [[Any]], let rows = file["v"] as? [[Any]] else { throw ComparisonReadError.invalidData }
        for city in cities {
            guard city.count == 2, ComparisonJSON.integer(city[0], minimum: 1) != nil,
                  ComparisonJSON.name(city[1]) != nil else { throw ComparisonReadError.invalidData }
        }
        var result: [String: Metadata] = [:]
        for row in rows {
            guard row.count == 7, let key = ComparisonJSON.key(row[0], prefixes: "nwr"),
                  let name = ComparisonJSON.name(row[1]), result[key] == nil,
                  ComparisonJSON.integer(row[2], maximum: 4) != nil,
                  let lat = ComparisonJSON.number(row[3], range: -90...90),
                  let lon = ComparisonJSON.number(row[4], range: -180...180),
                  ComparisonJSON.cellForCoordinates(latitude: lat, longitude: lon) == cell,
                  let address = row[5] as? String, address.utf16.count <= 240,
                  !address.unicodeScalars.contains(where: { $0.value < 32 || (127...159).contains($0.value) || $0.value == 0xfffd }),
                  let city = ComparisonJSON.integer(row[6], minimum: -1, maximum: cities.count - 1) else { throw ComparisonReadError.invalidData }
            result[key] = Metadata(key: key, name: name, latitude: lat, longitude: lon, address: address,
                                   city: city >= 0 ? cities[city][1] as? String : nil)
        }
        return result
    }
}

/// One fixed read of the already public map state. No bridge or page mutation.
enum MapAreaReader {
    static let script = #"""
    (() => {
        "use strict";
        const url = new URL(location.href);
        const mobile = /^\/mobile\/(?:index\.html)?$/.test(url.pathname);
        if (mobile && document.documentElement.getAttribute("data-dovebevo-mobile-shell") !== "1") return null;
        if (window.top !== window || url.protocol !== "https:" ||
            !["www.dovebevo.com", "dovebevo.com"].includes(url.hostname) ||
            url.username || url.password || (url.port && url.port !== "443") ||
            (!mobile && !/^(?:\/|\/bar\/[nwru][1-9][0-9]{0,14})$/.test(url.pathname))) return null;
        const maps = document.querySelectorAll("#app > .app section.map");
        if (maps.length !== 1 || maps[0].getAttribute("data-ready") !== "true") return null;
        const map = maps[0], box = map.getBoundingClientRect();
        for (let node = map; node; node = node.parentElement) {
            const style = getComputedStyle(node);
            if (style.display === "none" || style.visibility !== "visible" || Number(style.opacity) === 0) return null;
        }
        if (!map.isConnected || map.closest("[hidden], [inert], [aria-hidden='true']") ||
            getComputedStyle(map).display === "none" || getComputedStyle(map).visibility !== "visible" ||
            !(box.width > 0 && box.height > 0) || box.right <= 0 || box.bottom <= 0 ||
            box.left >= innerWidth || box.top >= innerHeight) return null;
        const centre = map.getAttribute("data-center") || "", zoom = map.getAttribute("data-zoom") || "";
        if (!/^-?\d{1,3}\.\d{5},-?\d{1,3}\.\d{5}$/.test(centre) || !/^\d{1,2}\.\d$/.test(zoom)) return null;
        const [latitude, longitude] = centre.split(",").map(Number);
        return { href: url.href, latitude, longitude, zoom: Number(zoom) };
    })()
    """#

    @MainActor static func area(_ value: Any?, currentURL: URL) -> DiscoveryArea? {
        guard AppPresentationTheme.canApply(to: currentURL),
              let object = value as? [String: Any], Set(object.keys) == ["href", "latitude", "longitude", "zoom"],
              let href = object["href"] as? String, href.utf8.count <= 2048, href == currentURL.absoluteString,
              let lat = ComparisonJSON.number(object["latitude"], range: -85.051129...85.051129),
              let lon = ComparisonJSON.number(object["longitude"], range: -180...180),
              let zoom = ComparisonJSON.number(object["zoom"], range: 13...24) else { return nil }
        return DiscoveryArea(latitude: lat, longitude: lon, zoom: zoom)
    }
}
