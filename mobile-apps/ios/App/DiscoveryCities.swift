import Foundation

/// A city centre taken from the same published places and mobile catalogue
/// that power the map. Selecting one reads the existing area endpoints only.
struct DiscoveryCity: Equatable {
    let id: String
    let name: String
    let country: String
    let latitude: Double
    let longitude: Double

    var area: DiscoveryArea? { DiscoveryArea(latitude: latitude, longitude: longitude, zoom: 14) }
    var countryName: String {
        switch country {
        case "IT": return "Italia"
        case "GB": return "Regno Unito"
        case "FR": return "Francia"
        case "ES": return "Spagna"
        case "DE": return "Germania"
        default: return country
        }
    }
}

struct DiscoveryCityDirectoryResult {
    let italian: [DiscoveryCity]
    let european: [DiscoveryCity]
    let europeanAvailable: Bool
}

protocol DiscoveryCityDirectoryServing {
    func load(_ completion: @escaping (Result<DiscoveryCityDirectoryResult, ComparisonReadError>) -> Void) -> RecommendationRequest
}

final class DiscoveryCityDirectory: DiscoveryCityDirectoryServing {
    private let transport: ComparisonReadTransport

    init(transport: ComparisonReadTransport = ComparisonHTTPTransport()) { self.transport = transport }

    func load(_ completion: @escaping (Result<DiscoveryCityDirectoryResult, ComparisonReadError>) -> Void) -> RecommendationRequest {
        let operation = DiscoveryCityLoad(transport: transport, completion: completion)
        operation.start()
        return operation
    }
}

private final class DiscoveryCityLoad: RecommendationRequest {
    private let transport: ComparisonReadTransport
    private var completion: ((Result<DiscoveryCityDirectoryResult, ComparisonReadError>) -> Void)?
    private var handles: [RecommendationRequest] = []

    init(transport: ComparisonReadTransport,
         completion: @escaping (Result<DiscoveryCityDirectoryResult, ComparisonReadError>) -> Void) {
        self.transport = transport; self.completion = completion
    }

    func start() {
        fetch(.health) { [weak self] response in
            guard let self else { return }
            guard let version = try? ComparisonJSON.version(response.get()) else {
                self.finish(.failure(.unavailable)); return
            }
            self.fetch(.places(version: version)) { [weak self] response in
                guard let self else { return }
                guard let places = try? DiscoveryCityJSON.italianPlaces(response.get()) else {
                    self.finish(.failure(.unavailable)); return
                }
                self.fetch(.mobileCatalog) { [weak self] response in
                    guard let self else { return }
                    let catalog = try? EuropeJSON.catalog(response.get())
                    self.finish(.success(DiscoveryCityJSON.directory(places: places, catalog: catalog)))
                }
            }
        }
    }

    private func fetch(_ endpoint: ComparisonEndpoint,
                       _ callback: @escaping (Result<Data, ComparisonReadError>) -> Void) {
        let handle = transport.get(endpoint) { [weak self] result in
            guard self?.completion != nil else { return }
            callback(result)
        }
        if completion == nil { handle.cancel() } else { handles.append(handle) }
    }

    private func finish(_ result: Result<DiscoveryCityDirectoryResult, ComparisonReadError>) {
        guard let callback = completion else { return }
        completion = nil; handles.removeAll(); callback(result)
    }

    func cancel() {
        completion = nil
        handles.forEach { $0.cancel() }
        handles.removeAll()
    }
}

enum DiscoveryCityJSON {
    // Use the same featured order as the mobile map search, omitting places
    // absent from the live file. Remaining Italian cities follow their real
    // mapped venue counts, without displaying a possibly stale count.
    private static let featured = ["Milano", "Roma", "Torino", "Napoli", "Firenze",
                                   "Bologna", "Venezia", "Genova", "Palermo", "Bari"]

    static func italianPlaces(_ data: Data) throws -> [(city: DiscoveryCity, bars: Int)] {
        guard data.count <= 2 * 1024 * 1024,
              let rows = try JSONSerialization.jsonObject(with: data) as? [[Any]], rows.count <= 50_000 else {
            throw ComparisonReadError.invalidData
        }
        var places: [(DiscoveryCity, Int)] = []
        var seen = Set<String>()
        for row in rows {
            guard row.count == 5,
                  let id = ComparisonJSON.integer(row[0], minimum: 1),
                  let name = ComparisonJSON.name(row[1]),
                  let latitude = ComparisonJSON.number(row[2], range: 35...48),
                  let longitude = ComparisonJSON.number(row[3], range: 6...19),
                  let bars = ComparisonJSON.integer(row[4], minimum: 0) else { throw ComparisonReadError.invalidData }
            // Different municipalities can share a name. The published file
            // is ordered by venue count, so keep the first real map centre.
            guard seen.insert(key(name)).inserted else { continue }
            places.append((DiscoveryCity(id: "it-place-\(id)", name: name, country: "IT",
                                         latitude: latitude, longitude: longitude), bars))
        }
        return places
    }

    static func directory(places: [(city: DiscoveryCity, bars: Int)], catalog: EuropeCatalog?) -> DiscoveryCityDirectoryResult {
        var byName = Dictionary(uniqueKeysWithValues: places.map { (key($0.city.name), $0) })
        var italian: [DiscoveryCity] = []
        for name in featured {
            if let place = byName.removeValue(forKey: key(name)) { italian.append(place.city) }
        }
        italian += byName.values.filter { $0.bars > 0 }
            .sorted { $0.bars == $1.bars ? $0.city.name.localizedStandardCompare($1.city.name) == .orderedAscending : $0.bars > $1.bars }
            .prefix(30).map { $0.city }

        var extraItalian: [DiscoveryCity] = []
        var european: [DiscoveryCity] = []
        if let catalog {
            let groups = Dictionary(grouping: catalog.venues.values) { "\($0.country)|\(key($0.city))" }
            for (group, venues) in groups {
                guard let first = venues.first, !venues.isEmpty else { continue }
                let city = DiscoveryCity(id: "catalog-\(group)", name: first.city, country: first.country,
                    latitude: venues.reduce(0) { $0 + $1.latitude } / Double(venues.count),
                    longitude: venues.reduce(0) { $0 + $1.longitude } / Double(venues.count))
                guard city.area != nil else { continue }
                if city.country == "IT" {
                    if !italian.contains(where: { key($0.name) == key(city.name) }) &&
                        !extraItalian.contains(where: { key($0.name) == key(city.name) }) { extraItalian.append(city) }
                } else { european.append(city) }
            }
        }
        italian += extraItalian.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
        european.sort {
            let order = $0.name.localizedStandardCompare($1.name)
            return order == .orderedSame ? $0.country < $1.country : order == .orderedAscending
        }
        return DiscoveryCityDirectoryResult(italian: italian, european: european, europeanAvailable: catalog != nil)
    }

    private static func key(_ text: String) -> String {
        text.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: Locale(identifier: "it_IT"))
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
