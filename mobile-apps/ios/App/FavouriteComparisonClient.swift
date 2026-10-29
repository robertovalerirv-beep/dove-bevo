import Foundation

enum ComparisonEndpoint: Equatable {
    case health, venues(version: String, cell: String), prices(cell: String)

    var maximumBytes: Int {
        switch self { case .health: return 8192; case .venues: return 2 * 1024 * 1024; case .prices: return 512 * 1024 }
    }

    func url() throws -> URL {
        switch self {
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
    private let today: () -> String
    private let schedule: (TimeInterval, @escaping () -> Void) -> RecommendationRequest

    init(transport: ComparisonReadTransport = ComparisonHTTPTransport(), today: @escaping () -> String = { ComparisonJSON.today() },
         schedule: @escaping (TimeInterval, @escaping () -> Void) -> RecommendationRequest = { delay, action in
             let item = DispatchWorkItem(block: action)
             DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: item)
             return ComparisonCancellation { item.cancel() }
         }) {
        self.transport = transport
        self.today = today
        self.schedule = schedule
    }

    func load(_ saved: [SavedVenue], completion: @escaping (FavouriteComparisonSnapshot) -> Void) -> RecommendationRequest {
        let operation = ComparisonLoad(saved: saved, transport: transport, today: today, completion: completion)
        operation.start(schedule: schedule)
        return operation
    }
}

private final class ComparisonLoad: RecommendationRequest {
    private let saved: [SavedVenue]
    private let transport: ComparisonReadTransport
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

    init(saved: [SavedVenue], transport: ComparisonReadTransport, today: @escaping () -> String,
         completion: @escaping (FavouriteComparisonSnapshot) -> Void) {
        self.saved = saved
        self.transport = transport
        self.today = today
        self.completion = completion
    }

    func start(schedule: (TimeInterval, @escaping () -> Void) -> RecommendationRequest) {
        guard saved.count <= 50, Set(saved.map(\.url)).count == saved.count,
              saved.allSatisfy({ ComparisonJSON.cell(from: $0) != nil }) else { finish(); return }
        guard !saved.isEmpty else { finish(); return }
        deadline = schedule(60) { [weak self] in self?.finish() }
        fetch(.health) { [weak self] result in
            guard let self else { return }
            do {
                self.version = try ComparisonJSON.version(result.get())
                self.queued = Array(Set(self.saved.compactMap { ComparisonJSON.cell(from: $0) })).sorted()
                self.pump()
            } catch { self.finish() }
        }
    }

    private func pump() {
        guard completion != nil else { return }
        while activeCells.count < 3 && !queued.isEmpty {
            let cell = queued.removeFirst()
            activeCells.insert(cell)
            let needsStatic = saved.contains { ComparisonJSON.cell(from: $0) == cell && !$0.url.lastPathComponent.hasPrefix("u") }
            if needsStatic {
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
            self.completed(cell, venues: resolved)
        }
    }

    private func completed(_ cell: String, venues: [String: CurrentFavouriteVenue]?) {
        guard completion != nil else { return }
        for entry in saved where ComparisonJSON.cell(from: entry) == cell {
            if let venue = venues?[entry.url.lastPathComponent] { results[entry.url] = venue }
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
        let missing = Set(saved.map(\.url)).subtracting(results.keys)
        let value = FavouriteComparisonSnapshot(venues: results, unavailable: unavailable.union(missing))
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
