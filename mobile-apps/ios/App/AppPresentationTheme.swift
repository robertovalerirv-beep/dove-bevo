import Foundation
import WebKit

/// The identical reviewed asset is bundled by both phone apps. It can only
/// add the owned stylesheet to a genuine visitor document with its CSP nonce.
/// No page data or nonce is returned to native code; no bridge is installed.
@MainActor enum AppPresentationTheme {
    static let source: String? = {
        guard let url = Bundle.main.url(forResource: "app-theme", withExtension: "js"),
              let data = try? Data(contentsOf: url), data.count <= 32 * 1024 else { return nil }
        return String(data: data, encoding: .utf8)
    }()

    static func install(in configuration: WKWebViewConfiguration) {
        guard let source else { return }
        let script = WKUserScript(source: source, injectionTime: .atDocumentEnd,
                                  forMainFrameOnly: true, in: .defaultClient)
        configuration.userContentController.addUserScript(script)
    }

    static func canApply(to url: URL?) -> Bool {
        guard let url, URLPolicy.isWebsite(url) else { return false }
        let path = url.path(percentEncoded: true)
        return path.isEmpty || path == "/" || path.range(of: #"\A/bar/[nwru][1-9][0-9]{0,14}\z"#, options: .regularExpression) != nil
    }

    static func applyAfterFinish(to webView: WKWebView) {
        guard canApply(to: webView.url), let source else { return }
        // A module-rendered visitor app may mount after documentEnd. This one
        // bounded idempotent attempt also runs the asset's own origin, main
        // frame, visitor-markup and CSP checks. No observer or retry is added.
        webView.evaluateJavaScript(source, in: nil, in: .defaultClient) { _ in }
    }
}
