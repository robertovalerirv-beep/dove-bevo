import CoreFoundation
import Foundation

enum AreaVoteTarget: Equatable {
    case offer(String)
    case customer(String)
    case legacy(String, ComparisonBand)
    case europe(String, ComparisonBand, String, EuropeServing)

    var identity: String {
        switch self {
        case .offer(let id): return "offer:\(id)"
        case .customer(let id): return "customer:\(id)"
        case .legacy(let drink, let band): return "legacy:\(drink):\(band.rawValue)"
        case .europe(let drink, let band, let currency, let serving):
            return "europe:\(drink):\(band.rawValue):\(currency):\(serving.key)"
        }
    }
}

struct AreaVoteItem: Equatable {
    let venue: SavedVenue
    let city: String?
    let target: AreaVoteTarget
    let drinkName: String
    let category: String?
    let servingLabel: String?
    let count: Int
    var identity: String { "\(venue.url.absoluteString)|\(target.identity)" }
}

struct AreaVotesPage: Equatable {
    static let maximumResponseBytes = 256 * 1024
    let cells: [String]
    let items: [AreaVoteItem]
    let nextAfter: String?

    static func parse(_ data: Data, requestedCells: [String]) -> AreaVotesPage? {
        guard data.count <= maximumResponseBytes,
              let root = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              ComparisonJSON.integer(root["schema_version"], minimum: 1, maximum: 1) == 1,
              let scope = root["scope"] as? [String: Any],
              let cells = scope["cells"] as? [String], cells == requestedCells,
              let raw = root["items"] as? [[String: Any]], raw.count <= 50,
              let cursor = root["next_after"],
              cursor is NSNull || ((cursor as? String).map(validCursor) == true) else { return nil }
        var items: [AreaVoteItem] = []; var seen = Set<String>()
        for value in raw {
            guard let venue = value["venue"] as? [String: Any],
                  let key = venue["key"] as? String,
                  ComparisonJSON.matches(key, "^(?:[nwru][1-9][0-9]{0,14}|m[0-9a-f]{24})$"),
                  let cell = venue["cell"] as? String, cells.contains(cell),
                  let name = ComparisonJSON.name(venue["name"]),
                  let cityValue = venue["city"], cityValue is NSNull || ComparisonJSON.name(cityValue) != nil,
                  let canonical = SavedVenuePolicy.canonicalURL(URL(string: "https://www.dovebevo.com/bar/\(key)?c=\(cell)")),
                  let saved = try? SavedVenuePolicy.venue(url: canonical, label: name),
                  let targetObject = value["target"] as? [String: Any],
                  let target = parseTarget(targetObject),
                  let drink = value["drink"] as? [String: Any],
                  let drinkName = cleanText(drink["name"], maximum: 512),
                  let categoryValue = drink["category"],
                  categoryValue is NSNull || (categoryValue as? String).map({ code in DrinkCategory.all.contains { $0.code == code } }) == true,
                  let servingValue = drink["serving_label"],
                  servingValue is NSNull || cleanText(servingValue, maximum: 256) != nil,
                  let count = ComparisonJSON.integer(value["count"], minimum: 1, maximum: 9_007_199_254_740_991) else { return nil }
            let item = AreaVoteItem(venue: saved, city: venue["city"] as? String,
                                    target: target, drinkName: drinkName,
                                    category: drink["category"] as? String,
                                    servingLabel: drink["serving_label"] as? String, count: count)
            if case .legacy(let code, _) = target, item.category != code { return nil }
            if case .europe(let code, _, _, _) = target, item.category != code { return nil }
            guard seen.insert(item.identity).inserted else { return nil }
            items.append(item)
        }
        guard !(items.isEmpty && cursor is String),
              zip(items, items.dropFirst()).allSatisfy({ pair in pair.0.count >= pair.1.count }) else { return nil }
        return AreaVotesPage(cells: cells, items: items, nextAfter: cursor as? String)
    }

    private static func parseTarget(_ value: [String: Any]) -> AreaVoteTarget? {
        switch value["kind"] as? String {
        case "offer":
            guard let id = value["id"] as? String,
                  ComparisonJSON.matches(id, "^[A-Za-z0-9._:-]{1,128}$") else { return nil }
            return .offer(id)
        case "customer":
            guard let id = value["id"] as? String,
                  ComparisonJSON.matches(id, "^c[0-9a-f]{64}$") else { return nil }
            return .customer(id)
        case "legacy":
            guard let code = value["drink"] as? String,
                  DrinkCategory.all.contains(where: { $0.code == code }),
                  let band = value["band"] as? String, ["normal", "happy_hour"].contains(band) else { return nil }
            return .legacy(code, band == "normal" ? .normal : .happyHour)
        case "europe":
            guard Set(value.keys) == ["kind", "drink", "band", "currency", "serving"],
                  let code = value["drink"] as? String,
                  let band = value["band"] as? String, ["normal", "happy_hour"].contains(band),
                  let currency = value["currency"] as? String, ["EUR", "GBP"].contains(currency),
                  let rawServing = value["serving"] as? [String: Any],
                  Set(rawServing.keys).isSubset(of: ["unit", "ml"]),
                  let unit = rawServing["unit"] as? String else { return nil }
            let ml = rawServing["ml"].flatMap { ComparisonJSON.integer($0, minimum: 1, maximum: 2000) }
            guard rawServing["ml"] == nil || ml != nil,
                  let serving = SavedEuropeDrink.serving(from: "\(unit):\(ml.map { String($0) } ?? "")", drink: code) else { return nil }
            return .europe(code, band == "normal" ? .normal : .happyHour, currency, serving)
        default: return nil
        }
    }

    private static func cleanText(_ value: Any?, maximum: Int) -> String? {
        guard let value = value as? String, !value.isEmpty,
              value == value.trimmingCharacters(in: .whitespacesAndNewlines),
              value.utf16.count <= maximum,
              !value.unicodeScalars.contains(where: { $0.value < 32 || (127...159).contains($0.value) || $0.value == 0xfffd }) else { return nil }
        return value
    }

    private static func validCursor(_ value: String) -> Bool {
        value.utf8.count <= 512 && ComparisonJSON.matches(value, "^[A-Za-z0-9_-]+={0,2}$")
    }
}

protocol AreaVotesServing {
    func load(area: DiscoveryArea, after: String?, completion: @escaping (Result<AreaVotesPage, RecommendationError>) -> Void) -> RecommendationRequest
}

final class AreaVotesClient: AreaVotesServing {
    private let sessionConfiguration: URLSessionConfiguration
    init(configuration: URLSessionConfiguration = .ephemeral) { sessionConfiguration = configuration }

    static func endpoint(area: DiscoveryArea, after: String?) -> URL? {
        guard after == nil || (after!.utf8.count <= 512 && ComparisonJSON.matches(after!, "^[A-Za-z0-9_-]+={0,2}$")) else { return nil }
        var components = URLComponents(string: "https://www.dovebevo.com/api/mobile/v2/drink-votes/area")!
        var query = [URLQueryItem(name: "cells", value: area.cells.joined(separator: ",")),
                     URLQueryItem(name: "limit", value: "50"),
                     URLQueryItem(name: "include_europe", value: "1")]
        if let after { query.append(URLQueryItem(name: "after", value: after)) }
        components.queryItems = query
        return components.url
    }

    func load(area: DiscoveryArea, after: String?, completion: @escaping (Result<AreaVotesPage, RecommendationError>) -> Void) -> RecommendationRequest {
        guard let url = Self.endpoint(area: area, after: after) else {
            DispatchQueue.main.async { completion(.failure(.invalidContext)) }
            return AreaVotesEmptyRequest()
        }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 15)
        request.httpShouldHandleCookies = false
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let operation = AreaVotesOperation(configuration: sessionConfiguration) { result in
            completion(result.flatMap { data in
                guard let page = AreaVotesPage.parse(data, requestedCells: area.cells) else { return .failure(.invalidResponse) }
                return .success(page)
            })
        }
        operation.start(request)
        return operation
    }
}

private final class AreaVotesEmptyRequest: RecommendationRequest { func cancel() {} }

/// No cookies, voter ID or POST path: this feed only reads published counts.
private final class AreaVotesOperation: NSObject, RecommendationRequest, URLSessionDataDelegate, @unchecked Sendable {
    private let configuration: URLSessionConfiguration
    private var completion: ((Result<Data, RecommendationError>) -> Void)?
    private var session: URLSession?
    private var task: URLSessionDataTask?
    private var expectedURL: URL?
    private var accepted = false
    private var body = Data()

    init(configuration: URLSessionConfiguration, completion: @escaping (Result<Data, RecommendationError>) -> Void) {
        self.configuration = configuration; self.completion = completion
        super.init()
    }

    func start(_ request: URLRequest) {
        expectedURL = request.url
        let config = configuration.copy() as! URLSessionConfiguration
        config.httpCookieStorage = nil; config.httpShouldSetCookies = false
        config.urlCredentialStorage = nil; config.urlCache = nil
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.timeoutIntervalForRequest = 15; config.timeoutIntervalForResource = 20
        config.waitsForConnectivity = false
        let session = URLSession(configuration: config, delegate: self, delegateQueue: nil)
        self.session = session
        task = session.dataTask(with: request); task?.resume()
    }

    func cancel() { task?.cancel() }

    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil); finish(.failure(.invalidResponse))
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
                    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        guard let http = response as? HTTPURLResponse, http.url == expectedURL else {
            completionHandler(.cancel); finish(.failure(.invalidResponse)); return
        }
        guard http.statusCode == 200 else {
            let failure: RecommendationError = http.statusCode == 429 ? .rateLimited
                : http.statusCode == 404 ? .unavailable : .network
            completionHandler(.cancel); finish(.failure(failure)); return
        }
        guard http.mimeType?.lowercased() == "application/json",
              http.expectedContentLength <= Int64(AreaVotesPage.maximumResponseBytes) else {
            completionHandler(.cancel); finish(.failure(.invalidResponse)); return
        }
        accepted = true; completionHandler(.allow)
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard completion != nil else { return }
        guard accepted, data.count <= AreaVotesPage.maximumResponseBytes - body.count else {
            task?.cancel(); finish(.failure(.invalidResponse)); return
        }
        body.append(data)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if error != nil { finish(.failure(.network)) }
        else { finish(accepted ? .success(body) : .failure(.invalidResponse)) }
    }

    private func finish(_ result: Result<Data, RecommendationError>) {
        guard let completion else { return }
        self.completion = nil
        task = nil; session?.invalidateAndCancel(); session = nil
        DispatchQueue.main.async { completion(result) }
    }
}
