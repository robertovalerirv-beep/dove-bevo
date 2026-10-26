import Foundation
import Capacitor

@objc(DoveBevoHttpPlugin)
public class DoveBevoHttpPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DoveBevoHttpPlugin"
    public let jsName = "DoveBevoHttp"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "request", returnType: CAPPluginReturnPromise)]
    private let mutations: Set<String> = ["/api/mobile/prices", "/api/mobile/prices/confirm", "/api/mobile/venues", "/api/mobile/reports"]

    @objc func request(_ call: CAPPluginCall) {
        guard let rawURL = call.getString("url"), let components = URLComponents(string: rawURL),
              components.scheme == "https", components.host == "mobile-preview.dovebevo.com",
              components.user == nil, components.password == nil, components.fragment == nil,
              components.port == nil || components.port == 443,
              components.percentEncodedPath.hasPrefix("/api/") || components.percentEncodedPath.hasPrefix("/data/"),
              !components.percentEncodedPath.lowercased().contains("%2e"),
              !components.path.split(separator: "/").contains(where: { $0 == "." || $0 == ".." }),
              !components.path.contains("\\"), let url = components.url else {
            call.reject("Native destination refused")
            return
        }
        let method = call.getString("method") ?? "GET"
        let body = call.getString("data")?.data(using: .utf8)
        guard (method == "GET" || method == "POST"), (body?.count ?? 0) <= 16 * 1024,
              !(method == "GET" && body != nil) else {
            call.reject("Native request body refused")
            return
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.httpBody = body
        request.httpShouldHandleCookies = false
        request.cachePolicy = .reloadIgnoringLocalCacheData
        for (name, rawValue) in call.getObject("headers") ?? [:] {
            guard let value = rawValue as? String, value.utf8.count <= 4096,
                  !value.contains("\r"), !value.contains("\n") else {
                call.reject("Native header refused")
                return
            }
            let lower = name.lowercased()
            guard ["accept", "content-type", "authorization", "x-dovebevo-native"].contains(lower),
                  lower != "authorization" || (method == "POST" && mutations.contains(components.percentEncodedPath) && value.hasPrefix("Bearer ")),
                  lower != "x-dovebevo-native" || value == "1" else {
                call.reject("Native header refused")
                return
            }
            request.setValue(value, forHTTPHeaderField: name)
        }
        // The delegate is retained by its session until completion; no shared cookie/cache state.
        DoveBevoRequest(call: call).start(request)
    }
}

private final class DoveBevoRequest: NSObject, URLSessionDataDelegate {
    private let maxResponseBytes = 2 * 1024 * 1024
    private let call: CAPPluginCall
    private var received = Data()
    private var response: HTTPURLResponse?
    private var session: URLSession?
    private var rejected = false

    init(call: CAPPluginCall) { self.call = call }

    func start(_ request: URLRequest) {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.urlCache = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.timeoutIntervalForRequest = 20
        configuration.timeoutIntervalForResource = 20
        let session = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
        self.session = session
        session.dataTask(with: request).resume()
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        guard let http = response as? HTTPURLResponse, !(300..<400).contains(http.statusCode),
              response.expectedContentLength <= maxResponseBytes else {
            rejected = true
            call.reject("Native response refused")
            completionHandler(.cancel)
            return
        }
        self.response = http
        completionHandler(.allow)
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard received.count + data.count <= maxResponseBytes else {
            if !rejected { call.reject("Native response too large") }
            rejected = true
            dataTask.cancel()
            return
        }
        received.append(data)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        defer { session.invalidateAndCancel(); self.session = nil }
        guard !rejected else { return }
        guard error == nil, let response = response, let body = String(data: received, encoding: .utf8) else {
            call.reject("Native request failed")
            return
        }
        var headers: [String: String] = [:]
        for (name, value) in response.allHeaderFields {
            let key = String(describing: name).lowercased()
            if key != "set-cookie" && key != "set-cookie2" { headers[key] = String(describing: value) }
        }
        call.resolve(["status": response.statusCode, "headers": headers, "body": body])
    }
}
