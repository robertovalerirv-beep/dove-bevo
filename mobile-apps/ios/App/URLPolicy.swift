import Foundation

/// The native shell trusts only these two HTTPS website origins. This policy
/// concerns document navigation; WebKit keeps its normal resource/CORS policy.
enum URLPolicy {
    static let homeURL = URL(string: "https://www.dovebevo.com/")!
    private static let websiteHosts: Set<String> = ["www.dovebevo.com", "dovebevo.com"]

    enum Destination: Equatable {
        case website
        case webFrame
        case external
        case blocked
    }

    static func isWebsite(_ url: URL) -> Bool {
        guard url.scheme?.lowercased() == "https",
              let host = url.host(percentEncoded: false)?.lowercased(), websiteHosts.contains(host),
              url.user(percentEncoded: false) == nil, url.password(percentEncoded: false) == nil,
              url.port == nil || url.port == 443 else { return false }
        return true
    }

    static func destination(
        for url: URL,
        isMainFrame: Bool,
        isUserActivatedLink: Bool,
        isFromWebsite: Bool
    ) -> Destination {
        if !isMainFrame {
            // Turnstile and other ordinary HTTPS frames, including their blank
            // and blob bootstrap documents, must never be sent to another app.
            switch url.scheme?.lowercased() {
            case "https":
                return url.user(percentEncoded: false) == nil && url.password(percentEncoded: false) == nil ? .webFrame : .blocked
            case "about":
                return url.absoluteString == "about:blank" || url.absoluteString == "about:srcdoc"
                    ? .webFrame : .blocked
            case "blob", "data":
                return .webFrame
            default:
                return .blocked
            }
        }

        if isWebsite(url) { return .website }
        guard isUserActivatedLink, isFromWebsite,
              url.user(percentEncoded: false) == nil, url.password(percentEncoded: false) == nil else { return .blocked }

        switch url.scheme?.lowercased() {
        case "https":
            return url.host(percentEncoded: false)?.isEmpty == false ? .external : .blocked
        case "mailto", "tel":
            return url.path(percentEncoded: false).isEmpty ? .blocked : .external
        default:
            // No arbitrary app schemes, local files, javascript URLs or HTTP.
            return .blocked
        }
    }
}
