import Foundation
import WebKit

/// The identical reviewed asset is bundled by both phone apps. It can only
/// add the owned stylesheet to a genuine visitor document with its CSP nonce.
/// No page data or nonce is returned to native code; no bridge is installed.
@MainActor enum AppPresentationTheme {
    static let source: String? = {
        guard let url = Bundle.main.url(forResource: "app-theme", withExtension: "js"),
              let data = try? Data(contentsOf: url), data.count <= 32 * 1024 else { return nil }
        guard let core = String(data: data, encoding: .utf8) else { return nil }
        if let artURL = Bundle.main.url(forResource: "drink-art", withExtension: "js"),
           let artData = try? Data(contentsOf: artURL), !artData.isEmpty,
           artData.count <= 256 * 1024,
           let art = String(data: artData, encoding: .utf8) {
            return art + "\n" + core
        }
        return core
    }()

    static func install(in configuration: WKWebViewConfiguration) {
        if let url = Bundle.main.url(forResource: "app-theme-start", withExtension: "js"),
           let data = try? Data(contentsOf: url), data.count <= 8 * 1024,
           let bootstrap = String(data: data, encoding: .utf8) {
            configuration.userContentController.addUserScript(WKUserScript(
                source: bootstrap, injectionTime: .atDocumentStart,
                forMainFrameOnly: true, in: .defaultClient))
        }
        guard let source else { return }
        let script = WKUserScript(source: source, injectionTime: .atDocumentEnd,
                                  forMainFrameOnly: true, in: .defaultClient)
        configuration.userContentController.addUserScript(script)
    }

    static func canApply(to url: URL?) -> Bool {
        if MobileEntry.isDocument(url) { return true }
        guard let url, URLPolicy.isWebsite(url) else { return false }
        let path = url.path(percentEncoded: true)
        return path.isEmpty || path == "/" || path.range(of: #"\A/bar/[nwru][1-9][0-9]{0,14}\z"#, options: .regularExpression) != nil
    }

    static func applyAfterFinish(to webView: WKWebView) {
        guard let url = webView.url, canApply(to: url), let source else { return }
        // A module-rendered visitor app may mount after both documentEnd and
        // didFinish. Try immediately, then retry only this same trusted document
        // for a short bounded window. The asset keeps its own visitor/CSP gates.
        webView.evaluateJavaScript(source, in: nil, in: .defaultClient) { [weak webView] result in
            guard let webView, webView.url == url, !webView.isLoading,
                  canApply(to: webView.url) else { return }
            if case .success(let value) = result, value as? Bool == true { return }
            let token = UUID().uuidString
            let marker = """
            (() => {
              const url = new URL(location.href);
              if (window.top !== window || url.protocol !== 'https:' ||
                  !['dovebevo.com', 'www.dovebevo.com'].includes(url.hostname) ||
                  url.username || url.password || (url.port && url.port !== '443') ||
                  !/^(?:\\/|\\/mobile\\/(?:index\\.html)?|\\/bar\\/[nwru][1-9][0-9]{0,14})$/.test(url.pathname)) return null;
              return window.__dovebevoNativeThemeDocumentToken ||
                (window.__dovebevoNativeThemeDocumentToken = '\(token)');
            })()
            """
            webView.evaluateJavaScript(marker, in: nil, in: .defaultClient) { [weak webView] result in
                guard let webView, webView.url == url, !webView.isLoading,
                      case .success(let value) = result, let documentToken = value as? String else { return }
                retry(source, on: webView, url: url, documentToken: documentToken,
                      attemptsLeft: 16, deadline: Date().addingTimeInterval(8))
            }
        }
    }

    private static func retry(_ source: String, on webView: WKWebView, url: URL,
                              documentToken: String, attemptsLeft: Int, deadline: Date) {
        guard attemptsLeft > 0, Date() < deadline, webView.url == url,
              !webView.isLoading, canApply(to: webView.url) else { return }
        webView.evaluateJavaScript("window.__dovebevoNativeThemeDocumentToken", in: nil,
                                   in: .defaultClient) { [weak webView] marker in
            guard let webView, webView.url == url, !webView.isLoading,
                  case .success(let value) = marker, value as? String == documentToken else { return }
            webView.evaluateJavaScript(source, in: nil, in: .defaultClient) { [weak webView] result in
                guard let webView, webView.url == url, !webView.isLoading else { return }
                if case .success(let value) = result, value as? Bool == true { return }
                guard attemptsLeft > 1, Date() < deadline else { return }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { [weak webView] in
                    guard let webView else { return }
                    retry(source, on: webView, url: url, documentToken: documentToken,
                          attemptsLeft: attemptsLeft - 1, deadline: deadline)
                }
            }
        }
    }
}
