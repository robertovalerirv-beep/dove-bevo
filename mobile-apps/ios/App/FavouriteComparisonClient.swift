import Foundation

enum ComparisonEndpoint: Equatable {
    case health, venues(version: String, cell: String), prices(cell: String), mobileCatalog, mobilePrices(cell: String)
    case menuV2(key: String, cell: String, after: String?), customerV2(key: String, cell: String, after: String?)
    case menuV2Cell(cell: String, categories: [String], after: String?)

    var maximumBytes: Int {
        switch self { case .health: return 8192; case .venues, .mobileCatalog, .mobilePrices: return 2 * 1024 * 1024; case .prices: return 512 * 1024
        case .menuV2, .customerV2, .menuV2Cell: return 1_048_576 }
    }

    func url() throws -> URL {
        switch self {
        case .menuV2Cell(let cell, let categories, let after):
            let allowed = Set(DrinkCategory.all.map(\.code))
            guard ComparisonJSON.matches(cell, "^[0-9b-hjkmnp-z]{5}$"),
                  !categories.isEmpty, categories.count <= 9, Set(categories).count == categories.count,
                  categories.allSatisfy({ allowed.contains($0) }),
                  after == nil || ComparisonJSON.matches(after!, "^(?:[nwr][1-9][0-9]{0,14}|m[0-9a-f]{24})$") else {
                throw ComparisonReadError.invalidData
            }
            let suffix = after.map { "&after=\($0)" } ?? ""
            return URL(string: "https://www.dovebevo.com/api/mobile/v2/menu/cells/\(cell)?categories=\(categories.joined(separator: ","))\(suffix)")!
        case .menuV2(let key, let cell, let after), .customerV2(let key, let cell, let after):
            let cursorPattern: String
            switch self {
            case .customerV2: cursorPattern = "^[oc][0-9a-f]{64}$"
            default: cursorPattern = "^[A-Za-z0-9._:-]{1,128}$"
            }
            guard ComparisonJSON.matches(key, "^(?:[nwr][1-9][0-9]{0,14}|m[0-9a-f]{24})$"),
                  ComparisonJSON.matches(cell, "^[0-9b-hjkmnp-z]{5}$"),
                  after == nil || ComparisonJSON.matches(after!, cursorPattern) else { throw ComparisonReadError.invalidData }
            let family: String
            switch self { case .menuV2: family = "menu"; default: family = "customer-prices" }
            let suffix = after.map { "&after=\($0)" } ?? ""
            return URL(string: "https://www.dovebevo.com/api/mobile/v2/\(family)/venues/\(key)?cell=\(cell)&limit=\(family == "menu" ? 100 : 50)\(suffix)")!
        case .mobileCatalog: return URL(string: "https://www.dovebevo.com/mobile-data/catalog.json")!
        case .mobilePrices(let cell):
            guard ComparisonJSON.matches(cell, "^[0-9b-hjkmnp-z]{5}$") else { throw ComparisonReadError.invalidData }
            return URL(string: "https://www.dovebevo.com/api/mobile/prices/cells/\(cell)")!
        case .health: return URL(string: "https://www.dovebevo.com/api/health")!
        case .venues(let version, let cell):
            guard ComparisonJSON.matches(version, "^[0-9]{8}$"), ComparisonJSON.matches(cell, "^[0-9b-hjkmnp-z]{5}$") else { throw ComparisonReadError.invalidData }
            return URL(string: "https://www.dovebevo.com/data/\(version)/v/\(cell).json")!
        case .prices(let cell):
            guard ComparisonJSON.matches(cell, "^[0-9b-hjkmnp-z]{5}$") else { throw ComparisonReadError.invalidData }
            return URL(string: "https://www.dovebevo.com/api/prices/\(cell)")!
        }
    }
}

protocol ComparisonReadTransport {
    func get(_ endpoint: ComparisonEndpoint, completion: @escaping (Result<Data, ComparisonReadError>) -> Void) -> RecommendationRequest
}

protocol FavouriteComparisonServing {
    func load(_ saved: [SavedVenue], completion: @escaping (FavouriteComparisonSnapshot) -> Void) -> RecommendationRequest
}

final class ComparisonCancellation: RecommendationRequest {
    private let action: () -> Void
    init(_ action: @escaping () -> Void = {}) { self.action = action }
    func cancel() { action() }
}

final class FavouriteComparisonClient: FavouriteComparisonServing {
    private let transport: ComparisonReadTransport
    private let includeEurope: Bool
    private let today: () -> String
    private let schedule: (TimeInterval, @escaping () -> Void) -> RecommendationRequest

    init(transport: ComparisonReadTransport = ComparisonHTTPTransport(), includeEurope: Bool = true, today: @escaping () -> String = { ComparisonJSON.today() },
         schedule: @escaping (TimeInterval, @escaping () -> Void) -> RecommendationRequest = { delay, action in
             let item = DispatchWorkItem(block: action)
             DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: item)
             return ComparisonCancellation { item.cancel() }
         }) {
        self.transport = transport
        self.includeEurope = includeEurope
        self.today = today
        self.schedule = schedule
    }

    func load(_ saved: [SavedVenue], completion: @escaping (FavouriteComparisonSnapshot) -> Void) -> RecommendationRequest {
        let operation = ComparisonLoad(saved: saved, transport: transport, includeEurope: includeEurope, today: today, completion: completion)
        operation.start(schedule: schedule)
        return operation
    }
}

private final class ComparisonLoad: RecommendationRequest {
    private let saved: [SavedVenue]
    private let transport: ComparisonReadTransport
    private let includeEurope: Bool
    private var catalog: EuropeCatalog?
    private var europe = EuropeSnapshot()
    private let today: () -> String
    private var completion: ((FavouriteComparisonSnapshot) -> Void)?
    private var deadline: RecommendationRequest?
    private var pending = Set<UUID>()
    private var handles: [UUID: RecommendationRequest] = [:]
    private var queued: [String] = []
    private var activeCells = Set<String>()
    private var version = ""
    private var results: [URL: CurrentFavouriteVenue] = [:]
    private var unavailable = Set<URL>()

    init(saved: [SavedVenue], transport: ComparisonReadTransport, includeEurope: Bool, today: @escaping () -> String,
         completion: @escaping (FavouriteComparisonSnapshot) -> Void) {
        self.saved = saved
        self.transport = transport
        self.includeEurope = includeEurope
        self.today = today
        self.completion = completion
    }

    func start(schedule: (TimeInterval, @escaping () -> Void) -> RecommendationRequest) {
        guard saved.count <= 50, Set(saved.map(\.url)).count == saved.count,
              saved.allSatisfy({ ComparisonJSON.cell(from: $0) != nil }) else { finish(); return }
        guard !saved.isEmpty else { finish(); return }
        deadline = schedule(60) { [weak self] in self?.finish() }
        if includeEurope {
            fetch(.mobileCatalog) { [weak self] result in
                guard let self else { return }
                self.catalog = try? EuropeJSON.catalog(result.get())
                self.startHealth()
            }
        } else { startHealth() }
    }

    private func startHealth() {
        fetch(.health) { [weak self] result in
            guard let self else { return }
            do {
                self.version = try ComparisonJSON.version(result.get())
                self.queued = Array(Set(self.saved.compactMap { ComparisonJSON.cell(from: $0) })).sorted()
                self.pump()
            } catch {
                if self.includeEurope {
                    self.queued = Array(Set(self.saved.compactMap { ComparisonJSON.cell(from: $0) })).sorted()
                    self.pump()
                } else { self.finish() }
            }
        }
    }

    private func pump() {
        guard completion != nil else { return }
        while activeCells.count < 3 && !queued.isEmpty {
            let cell = queued.removeFirst()
            activeCells.insert(cell)
            if includeEurope && !EuropeJSON.italianCell(cell) { fetchEurope(cell, resolved: nil); continue }
            let needsStatic = saved.contains { ComparisonJSON.cell(from: $0) == cell && !$0.url.lastPathComponent.hasPrefix("u") }
            if needsStatic && !version.isEmpty {
                fetch(.venues(version: version, cell: cell)) { [weak self] result in
                    self?.fetchPrices(cell, staticData: try? result.get())
                }
            } else { fetchPrices(cell, staticData: nil) }
        }
        if queued.isEmpty && activeCells.isEmpty { finish() }
    }

    private func fetchPrices(_ cell: String, staticData: Data?) {
        fetch(.prices(cell: cell)) { [weak self] result in
            guard let self else { return }
            let resolved = try? ComparisonJSON.resolve(staticData: staticData, priceData: result.get(), cell: cell, today: self.today())
            self.fetchEurope(cell, resolved: resolved)
        }
    }

    private func fetchEurope(_ cell: String, resolved: [String: CurrentFavouriteVenue]?) {
        guard let catalog, catalog.venues.values.contains(where: { $0.cell == cell }) else {
            completed(cell, venues: resolved); return
        }
        fetch(.mobilePrices(cell: cell)) { [weak self] result in
            guard let self else { return }
            let governed = Set(catalog.venues.keys)
            if let mobile = try? EuropeJSON.resolve(result.get(), catalog: catalog, cell: cell, today: self.today()) {
                self.europe.venues.merge(mobile.venues) { _, latest in latest }
                let filtered = resolved?.filter { !mobile.hidden.contains($0.key) && (!governed.contains($0.key) || mobile.legacy.contains($0.key)) }
                self.completed(cell, venues: filtered)
            } else {
                self.europe.unavailableCells.insert(cell)
                self.completed(cell, venues: resolved?.filter { !governed.contains($0.key) })
            }
        }
    }

    private func completed(_ cell: String, venues: [String: CurrentFavouriteVenue]?) {
        guard completion != nil else { return }
        for entry in saved where ComparisonJSON.cell(from: entry) == cell {
            if let known = catalog?.venues[entry.url.lastPathComponent], known.cell != cell {
                unavailable.insert(entry.url); continue
            }
            if let venue = europe.venues[entry.url.lastPathComponent], venue.url == entry.url { unavailable.remove(entry.url) }
            else if let venue = venues?[entry.url.lastPathComponent] { results[entry.url] = venue }
            else { unavailable.insert(entry.url) }
        }
        activeCells.remove(cell)
        pump()
    }

    private func fetch(_ endpoint: ComparisonEndpoint, completion callback: @escaping (Result<Data, ComparisonReadError>) -> Void) {
        guard completion != nil else { return }
        let token = UUID()
        pending.insert(token)
        let handle = transport.get(endpoint) { [weak self] result in
            guard let self, self.completion != nil, self.pending.remove(token) != nil else { return }
            self.handles.removeValue(forKey: token)
            callback(result)
        }
        if pending.contains(token) { handles[token] = handle } else { handle.cancel() }
    }

    func cancel() {
        completion = nil
        deadline?.cancel()
        deadline = nil
        pending.removeAll()
        queued.removeAll()
        activeCells.removeAll()
        let requests = Array(handles.values)
        handles.removeAll()
        requests.forEach { $0.cancel() }
    }

    private func finish() {
        guard let callback = completion else { return }
        let available = Set(results.keys).union(europe.venues.values.map(\.url))
        let missing = Set(saved.map(\.url)).subtracting(available)
        let value = FavouriteComparisonSnapshot(venues: results, unavailable: unavailable.union(missing), europe: includeEurope ? europe : nil)
        cancel()
        callback(value)
    }
}

final class ComparisonHTTPTransport: ComparisonReadTransport {
    private let configuration: URLSessionConfiguration
    init(configuration: URLSessionConfiguration = .ephemeral) { self.configuration = configuration }

    func get(_ endpoint: ComparisonEndpoint, completion: @escaping (Result<Data, ComparisonReadError>) -> Void) -> RecommendationRequest {
        guard let url = try? endpoint.url() else {
            DispatchQueue.main.async { completion(.failure(.invalidData)) }
            return ComparisonCancellation()
        }
        let operation = ComparisonHTTPOperation(url: url, maximum: endpoint.maximumBytes, completion: completion)
        operation.start(configuration)
        return operation
    }
}

private final class ComparisonHTTPOperation: NSObject, RecommendationRequest, URLSessionDataDelegate, @unchecked Sendable {
    private let url: URL
    private let maximum: Int
    private var completion: ((Result<Data, ComparisonReadError>) -> Void)?
    private var session: URLSession?
    private var task: URLSessionDataTask?
    private var accepted = false
    private var body = Data()

    init(url: URL, maximum: Int, completion: @escaping (Result<Data, ComparisonReadError>) -> Void) {
        self.url = url; self.maximum = maximum; self.completion = completion
        super.init()
    }

    func start(_ configuration: URLSessionConfiguration) {
        let config = configuration.copy() as! URLSessionConfiguration
        config.httpCookieStorage = nil
        config.httpShouldSetCookies = false
        config.urlCredentialStorage = nil
        config.urlCache = nil
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.timeoutIntervalForRequest = 15
        config.timeoutIntervalForResource = 15
        config.waitsForConnectivity = false
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 15)
        request.httpMethod = "GET"
        request.httpShouldHandleCookies = false
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let session = URLSession(configuration: config, delegate: self, delegateQueue: nil)
        self.session = session
        task = session.dataTask(with: request)
        task?.resume()
    }

    func cancel() { task?.cancel() }

    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
        finish(.failure(.invalidData))
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
                    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        guard let http = response as? HTTPURLResponse, http.url == url, http.statusCode == 200,
              http.mimeType?.lowercased() == "application/json", http.expectedContentLength <= Int64(maximum) else {
            completionHandler(.cancel); finish(.failure(.unavailable)); return
        }
        accepted = true
        completionHandler(.allow)
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard completion != nil else { return }
        guard accepted, data.count <= maximum - body.count else { task?.cancel(); finish(.failure(.invalidData)); return }
        body.append(data)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        finish(error == nil && accepted ? .success(body) : .failure(.unavailable))
    }

    private func finish(_ result: Result<Data, ComparisonReadError>) {
        guard let callback = completion else { return }
        completion = nil
        session?.finishTasksAndInvalidate()
        session = nil
        DispatchQueue.main.async { callback(result) }
    }
}
