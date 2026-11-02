import Foundation

protocol RecommendationRequest: AnyObject { func cancel() }

protocol RecommendationServing {
    @discardableResult
    func load(venue: SavedVenue, completion: @escaping (Result<RecommendationSnapshot, RecommendationError>) -> Void) -> RecommendationRequest
    @discardableResult
    func set(venue: SavedVenue, drink: String, recommended: Bool,
             completion: @escaping (Result<RecommendationSnapshot, RecommendationError>) -> Void) -> RecommendationRequest
}

protocol RecommendationTransport {
    func send(_ request: URLRequest, completion: @escaping (Result<Data, RecommendationError>) -> Void) -> RecommendationRequest
}

private final class EmptyRecommendationRequest: RecommendationRequest { func cancel() {} }

final class RecommendationClient: RecommendationServing {
    private let voter: RecommendationVoterProviding
    private let transport: RecommendationTransport

    init(voter: RecommendationVoterProviding = RecommendationVoterStore(), transport: RecommendationTransport = RecommendationHTTPTransport()) {
        self.voter = voter
        self.transport = transport
    }

    static func endpoint(for venue: SavedVenue) throws -> URL {
        guard let canonical = SavedVenuePolicy.canonicalURL(venue.url), canonical == venue.url,
              let query = URLComponents(url: canonical, resolvingAgainstBaseURL: false)?.percentEncodedQuery,
              let endpoint = URL(string: "https://www.dovebevo.com/api/mobile/venues/\(canonical.lastPathComponent)/recommendations?\(query)") else {
            throw RecommendationError.invalidContext
        }
        return endpoint
    }

    static func isEndpoint(_ url: URL?) -> Bool {
        guard let url, let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              components.scheme == "https", components.percentEncodedHost == "www.dovebevo.com",
              components.percentEncodedUser == nil, components.percentEncodedPassword == nil,
              components.port == nil || components.port == 443, components.percentEncodedFragment == nil,
              let query = components.percentEncodedQuery else { return false }
        let path = components.percentEncodedPath
        return path.range(of: #"^/api/mobile/venues/[nwru][1-9][0-9]{0,14}/recommendations$"#, options: .regularExpression) == path.startIndex..<path.endIndex &&
            query.range(of: #"^c=[0-9b-hjkmnp-z]{5}$"#, options: .regularExpression) == query.startIndex..<query.endIndex
    }

    func load(venue: SavedVenue, completion: @escaping (Result<RecommendationSnapshot, RecommendationError>) -> Void) -> RecommendationRequest {
        send(venue: venue, mutation: nil, completion: completion)
    }

    func set(venue: SavedVenue, drink: String, recommended: Bool,
             completion: @escaping (Result<RecommendationSnapshot, RecommendationError>) -> Void) -> RecommendationRequest {
        guard DrinkCategory.all.contains(where: { $0.code == drink }) else {
            DispatchQueue.main.async { completion(.failure(.invalidContext)) }
            return EmptyRecommendationRequest()
        }
        return send(venue: venue, mutation: (drink, recommended), completion: completion)
    }

    private func send(venue: SavedVenue, mutation: (String, Bool)?,
                      completion: @escaping (Result<RecommendationSnapshot, RecommendationError>) -> Void) -> RecommendationRequest {
        do {
            let url = try Self.endpoint(for: venue)
            let identity = try voter.identity()
            guard RecommendationVoterStore.isValid(identity) else { throw RecommendationError.identityUnavailable }
            var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 15)
            request.httpShouldHandleCookies = false
            request.setValue(identity, forHTTPHeaderField: "X-DoveBevo-Voter")
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            if let mutation {
                request.httpMethod = "POST"
                request.setValue("https://www.dovebevo.com", forHTTPHeaderField: "Origin")
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                request.httpBody = try JSONSerialization.data(withJSONObject: ["drink": mutation.0, "recommended": mutation.1])
            }
            return transport.send(request) { result in
                completion(result.flatMap { data in
                    do { return .success(try RecommendationSnapshot.parse(data, venueKey: venue.url.lastPathComponent)) }
                    catch { return .failure(.invalidResponse) }
                })
            }
        } catch {
            let failure = error as? RecommendationError ?? .invalidContext
            DispatchQueue.main.async { completion(.failure(failure)) }
            return EmptyRecommendationRequest()
        }
    }
}

/// Each request has an ephemeral session: no WebView cookies, credentials, cache
/// or redirect destination is shared. The delegate caps bytes as they arrive.
final class RecommendationHTTPTransport: RecommendationTransport {
    private let configuration: URLSessionConfiguration

    init(configuration: URLSessionConfiguration = .ephemeral) {
        self.configuration = configuration
    }

    func send(_ request: URLRequest, completion: @escaping (Result<Data, RecommendationError>) -> Void) -> RecommendationRequest {
        guard RecommendationClient.isEndpoint(request.url), ["GET", "POST"].contains(request.httpMethod ?? "GET") else {
            DispatchQueue.main.async { completion(.failure(.invalidContext)) }
            return EmptyRecommendationRequest()
        }
        let operation = RecommendationHTTPOperation(completion: completion)
        operation.start(request, configuration: configuration)
        return operation
    }
}

// Delegate callbacks use URLSession's serial delegate queue. Cancellation only
// touches the thread-safe task; UI completions are dispatched to the main queue.
private final class RecommendationHTTPOperation: NSObject, RecommendationRequest, URLSessionDataDelegate, @unchecked Sendable {
    private var session: URLSession?
    private var task: URLSessionDataTask?
    private var expectedURL: URL?
    private var responseAccepted = false
    private var body = Data()
    private var completion: ((Result<Data, RecommendationError>) -> Void)?

    init(completion: @escaping (Result<Data, RecommendationError>) -> Void) {
        self.completion = completion
        super.init()
    }

    func start(_ request: URLRequest, configuration: URLSessionConfiguration) {
        expectedURL = request.url
        let config = configuration.copy() as! URLSessionConfiguration
        config.httpCookieStorage = nil
        config.httpShouldSetCookies = false
        config.urlCredentialStorage = nil
        config.urlCache = nil
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.timeoutIntervalForRequest = 15
        config.timeoutIntervalForResource = 20
        config.waitsForConnectivity = false
        let session = URLSession(configuration: config, delegate: self, delegateQueue: nil)
        self.session = session
        task = session.dataTask(with: request)
        task?.resume()
    }

    func cancel() { task?.cancel() }

    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
        finish(.failure(.invalidResponse))
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
                    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        guard let http = response as? HTTPURLResponse, http.url == expectedURL,
              http.mimeType?.lowercased() == "application/json",
              http.expectedContentLength <= Int64(RecommendationSnapshot.maximumResponseBytes) else {
            completionHandler(.cancel)
            finish(.failure(.invalidResponse))
            return
        }
        guard http.statusCode == 200 else {
            let error: RecommendationError = http.statusCode == 404 ? .unavailable : http.statusCode == 429 ? .rateLimited : .network
            completionHandler(.cancel)
            finish(.failure(error))
            return
        }
        responseAccepted = true
        completionHandler(.allow)
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard completion != nil else { return }
        guard responseAccepted else { finish(.failure(.invalidResponse)); return }
        guard data.count <= RecommendationSnapshot.maximumResponseBytes - body.count else {
            task?.cancel()
            finish(.failure(.invalidResponse))
            return
        }
        body.append(data)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if error != nil { finish(.failure(.network)) }
        else { finish(responseAccepted ? .success(body) : .failure(.invalidResponse)) }
    }

    private func finish(_ result: Result<Data, RecommendationError>) {
        guard let callback = completion else { return }
        completion = nil
        session?.finishTasksAndInvalidate()
        session = nil
        DispatchQueue.main.async { callback(result) }
    }
}
