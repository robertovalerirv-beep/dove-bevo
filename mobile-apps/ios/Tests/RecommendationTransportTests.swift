import Foundation
import XCTest
@testable import DoveBevo

/// URLProtocol owns every request in this suite, including wrong-origin cases.
/// No fixture URL or transport override is exposed through the app's launch UI.
final class RecommendationTransportTests: XCTestCase {
    override func tearDown() {
        RecommendationURLProtocol.handler = nil
        super.tearDown()
    }

    func testActualURLSessionStreamsValidBodyWithoutCookiesAndReturnsOnMainThread() throws {
        let data = Data("{\"owned\":true}".utf8)
        RecommendationURLProtocol.handler = { request, client, proto in
            XCTAssertFalse(request.httpShouldHandleCookies)
            XCTAssertNil(request.value(forHTTPHeaderField: "Cookie"))
            client.urlProtocol(proto, didReceive: self.response(url: request.url!, status: 200), cacheStoragePolicy: .notAllowed)
            client.urlProtocol(proto, didLoad: data.prefix(4))
            client.urlProtocol(proto, didLoad: data.dropFirst(4))
            client.urlProtocolDidFinishLoading(proto)
        }
        let done = expectation(description: "bounded response")
        let task = transport().send(request()) { result in
            XCTAssertTrue(Thread.isMainThread)
            XCTAssertEqual(try? result.get(), data)
            done.fulfill()
        }
        wait(for: [done], timeout: 3)
        withExtendedLifetime(task) {}
    }

    func testActualURLSessionRejectsOversizedUnknownLengthStream() {
        RecommendationURLProtocol.handler = { request, client, proto in
            client.urlProtocol(proto, didReceive: self.response(url: request.url!, status: 200), cacheStoragePolicy: .notAllowed)
            client.urlProtocol(proto, didLoad: Data(repeating: 32, count: 32_768))
            client.urlProtocol(proto, didLoad: Data([32]))
            client.urlProtocolDidFinishLoading(proto)
        }
        assertFailure(.invalidResponse)
    }

    func testActualURLSessionRejectsWrongResponseOriginHTMLAndHTTPFailure() {
        for (url, status, contentType, expected) in [
            (URL(string: "https://evil.example/recommendations")!, 200, "application/json", RecommendationError.invalidResponse),
            (request().url!, 200, "text/html", .invalidResponse),
            (request().url!, 404, "application/json", .unavailable),
            (request().url!, 429, "application/json", .rateLimited),
            (request().url!, 302, "application/json", .network)
        ] {
            RecommendationURLProtocol.handler = { _, client, proto in
                let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": contentType])!
                client.urlProtocol(proto, didReceive: response, cacheStoragePolicy: .notAllowed)
                client.urlProtocol(proto, didLoad: Data("untrusted error text".utf8))
                client.urlProtocolDidFinishLoading(proto)
            }
            assertFailure(expected)
        }
    }

    func testActualURLSessionDeniesRedirectBeforeSendingIdentityToAnotherOrigin() {
        var requests = 0
        RecommendationURLProtocol.handler = { request, client, proto in
            requests += 1
            let redirected = URLRequest(url: URL(string: "https://evil.example/collect")!)
            let response = HTTPURLResponse(url: request.url!, statusCode: 302, httpVersion: "HTTP/1.1", headerFields: ["Location": redirected.url!.absoluteString])!
            client.urlProtocol(proto, wasRedirectedTo: redirected, redirectResponse: response)
        }
        assertFailure(.invalidResponse)
        XCTAssertEqual(requests, 1)
    }

    func testUntrustedEndpointIsRejectedBeforeEvenOwnedProtocolReceivesIt() {
        var received = false
        RecommendationURLProtocol.handler = { _, _, _ in received = true }
        for raw in ["https://evil.example/api/mobile/venues/n123/recommendations?c=u0nd9",
                    "http://www.dovebevo.com/api/mobile/venues/n123/recommendations?c=u0nd9",
                    "https://www.dovebevo.com/api/mobile/venues/n123/recommendations?c=u0nd9&c=u0nd9"] {
            let done = expectation(description: "untrusted endpoint blocked")
            let task = transport().send(URLRequest(url: URL(string: raw)!)) { result in
                if case .failure(.invalidContext) = result {} else { XCTFail("Untrusted endpoint accepted") }
                done.fulfill()
            }
            wait(for: [done], timeout: 3)
            withExtendedLifetime(task) {}
        }
        XCTAssertFalse(received)
    }

    private func assertFailure(_ expected: RecommendationError, file: StaticString = #filePath, line: UInt = #line) {
        let done = expectation(description: "response rejected")
        let task = transport().send(request()) { result in
            switch result {
            case .success: XCTFail("Untrusted response accepted", file: file, line: line)
            case .failure(let error): XCTAssertEqual(error, expected, file: file, line: line)
            }
            done.fulfill()
        }
        wait(for: [done], timeout: 3)
        withExtendedLifetime(task) {}
    }

    private func transport() -> RecommendationHTTPTransport {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [RecommendationURLProtocol.self]
        return RecommendationHTTPTransport(configuration: configuration)
    }

    private func request() -> URLRequest {
        var request = URLRequest(url: URL(string: "https://www.dovebevo.com/api/mobile/venues/n123/recommendations?c=u0nd9")!)
        request.httpShouldHandleCookies = false
        request.setValue(TestRecommendationVoter.value, forHTTPHeaderField: "X-DoveBevo-Voter")
        return request
    }

    private func response(url: URL, status: Int) -> HTTPURLResponse {
        HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json", "Cache-Control": "no-store"])!
    }
}

private final class RecommendationURLProtocol: URLProtocol, @unchecked Sendable {
    static var handler: ((URLRequest, URLProtocolClient, URLProtocol) -> Void)?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        guard let client else { return }
        guard let handler = Self.handler else {
            client.urlProtocol(self, didFailWithError: URLError(.cannotConnectToHost))
            return
        }
        handler(request, client, self)
    }
    override func stopLoading() {}
}
