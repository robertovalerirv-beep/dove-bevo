import Network
import UIKit
import WebKit

final class BrowserViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    private var webView: WKWebView!
    private let progressView = UIProgressView(progressViewStyle: .bar)
    private let offlineLabel = UILabel()
    private let loadingView = UIStackView()
    private let errorView = UIScrollView()
    private let errorContent = UIStackView()
    private let errorTitle = UILabel()
    private let errorMessage = UILabel()
    private let retryButton = UIButton(type: .system)
    private let toolbar = UIToolbar()
    private let monitor = NWPathMonitor()
    private var observations: [NSKeyValueObservation] = []
    private var lastWebsiteURL = URLPolicy.homeURL
    private var hasLoadedPage = false
    private var isOffline = false
    private var recoveredRenderer = false

    private lazy var backButton = item("Indietro", symbol: "chevron.backward", action: #selector(goBack), id: "browser.back")
    private lazy var forwardButton = item("Avanti", symbol: "chevron.forward", action: #selector(goForward), id: "browser.forward")
    private lazy var homeButton = item("Home", symbol: "house", action: #selector(goHome), id: "browser.home")
    private lazy var shareButton = item("Condividi", symbol: "square.and.arrow.up", action: #selector(sharePage), id: "browser.share")
    private lazy var reloadButton = item("Ricarica", symbol: "arrow.clockwise", action: #selector(reloadPage), id: "browser.reload")

    override func viewDidLoad() {
        super.viewDidLoad()
        configureChrome()
        configureWebView()
        configureContent()
        observeWebView()
        startNetworkMonitor()
        loadWebsite(URLPolicy.homeURL)
    }

    deinit {
        monitor.cancel()
        observations.forEach { $0.invalidate() }
    }

    private func configureChrome() {
        title = "Dove bevo"
        view.backgroundColor = .systemBackground
        navigationController?.navigationBar.prefersLargeTitles = false
        navigationController?.navigationBar.tintColor = .label
        let appearance = UINavigationBarAppearance()
        appearance.configureWithDefaultBackground()
        navigationController?.navigationBar.standardAppearance = appearance
        navigationController?.navigationBar.scrollEdgeAppearance = appearance

        let moreButton = UIBarButtonItem(image: UIImage(systemName: "ellipsis.circle"), menu: UIMenu(children: [
            UIAction(title: "Apri nel browser", image: UIImage(systemName: "safari")) { [weak self] _ in
                self?.openCurrentPageInBrowser()
            },
            UIAction(title: "Permessi posizione", image: UIImage(systemName: "location")) { [weak self] _ in
                self?.showLocationHelp()
            },
            UIAction(title: "Privacy", image: UIImage(systemName: "hand.raised")) { [weak self] _ in
                self?.showPrivacy()
            },
            UIAction(title: "Informazioni", image: UIImage(systemName: "info.circle")) { [weak self] _ in
                self?.showInformation()
            }
        ]))
        moreButton.accessibilityLabel = "Altre opzioni"
        moreButton.accessibilityIdentifier = "browser.more"
        navigationItem.rightBarButtonItem = moreButton

        toolbar.tintColor = .label
        toolbar.accessibilityIdentifier = "browser.toolbar"
        toolbar.items = [backButton, space(), forwardButton, space(), homeButton, space(), shareButton, space(), reloadButton]
        backButton.isEnabled = false
        forwardButton.isEnabled = false
        shareButton.isEnabled = false
    }

    private func configureWebView() {
        let configuration = WKWebViewConfiguration()
        // Keep WebKit's ordinary persistent cookies and local storage. There is
        // no native API client, cookie copy, message handler or injected script.
        configuration.websiteDataStore = .default()
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.isOpaque = false
        webView.backgroundColor = .systemBackground
        webView.scrollView.backgroundColor = .systemBackground
        webView.accessibilityIdentifier = "browser.website"
        // Preserve WebKit's standard user agent and secure origin handling.
        // On supported iOS versions WebKit requests website geolocation normally
        // using NSLocationWhenInUseUsageDescription; no experimental delegate.
    }

    private func configureContent() {
        offlineLabel.text = "Connessione assente. Riprova quando torni online."
        offlineLabel.font = .preferredFont(forTextStyle: .footnote)
        offlineLabel.adjustsFontForContentSizeCategory = true
        offlineLabel.numberOfLines = 0
        offlineLabel.textAlignment = .center
        offlineLabel.backgroundColor = .secondarySystemBackground
        offlineLabel.accessibilityIdentifier = "browser.offline"
        offlineLabel.isHidden = true

        let body = UIStackView(arrangedSubviews: [offlineLabel, webView])
        body.axis = .vertical
        body.translatesAutoresizingMaskIntoConstraints = false
        toolbar.translatesAutoresizingMaskIntoConstraints = false
        progressView.translatesAutoresizingMaskIntoConstraints = false
        progressView.accessibilityLabel = "Caricamento pagina"
        view.addSubview(body)
        view.addSubview(toolbar)
        view.addSubview(progressView)
        NSLayoutConstraint.activate([
            body.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            body.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            body.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            body.bottomAnchor.constraint(equalTo: toolbar.topAnchor),
            toolbar.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            toolbar.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            toolbar.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            toolbar.heightAnchor.constraint(equalToConstant: 44),
            progressView.topAnchor.constraint(equalTo: body.topAnchor),
            progressView.leadingAnchor.constraint(equalTo: body.leadingAnchor),
            progressView.trailingAnchor.constraint(equalTo: body.trailingAnchor)
        ])

        let spinner = UIActivityIndicatorView(style: .large)
        spinner.startAnimating()
        let loadingLabel = label("Caricamento di Dove bevo…", style: .body)
        loadingView.addArrangedSubview(spinner)
        loadingView.addArrangedSubview(loadingLabel)
        configureOverlay(loadingView)
        loadingView.accessibilityIdentifier = "browser.loading"

        let image = UIImageView(image: UIImage(systemName: "wifi.exclamationmark"))
        image.tintColor = .secondaryLabel
        image.contentMode = .scaleAspectFit
        image.heightAnchor.constraint(equalToConstant: 44).isActive = true
        image.isAccessibilityElement = false
        errorTitle.font = .preferredFont(forTextStyle: .title2)
        errorTitle.adjustsFontForContentSizeCategory = true
        errorTitle.numberOfLines = 0
        errorTitle.textAlignment = .center
        errorTitle.accessibilityTraits = .header
        errorMessage.font = .preferredFont(forTextStyle: .body)
        errorMessage.adjustsFontForContentSizeCategory = true
        errorMessage.numberOfLines = 0
        errorMessage.textAlignment = .center
        errorMessage.textColor = .secondaryLabel
        retryButton.configuration = .filled()
        retryButton.setTitle("Riprova", for: .normal)
        retryButton.titleLabel?.font = .preferredFont(forTextStyle: .headline)
        retryButton.titleLabel?.adjustsFontForContentSizeCategory = true
        retryButton.accessibilityIdentifier = "browser.retry"
        retryButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
        retryButton.addTarget(self, action: #selector(retry), for: .touchUpInside)
        [image, errorTitle, errorMessage, retryButton].forEach(errorContent.addArrangedSubview)
        configureErrorOverlay()
        errorView.accessibilityIdentifier = "browser.error"
        errorView.isHidden = true
    }

    private func configureOverlay(_ stack: UIStackView) {
        stack.axis = .vertical
        stack.alignment = .fill
        stack.spacing = 16
        stack.isLayoutMarginsRelativeArrangement = true
        stack.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 24, leading: 24, bottom: 24, trailing: 24)
        stack.backgroundColor = .systemBackground
        stack.layer.cornerRadius = 16
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        let preferredWidth = stack.widthAnchor.constraint(equalTo: webView.widthAnchor, constant: -32)
        preferredWidth.priority = .defaultHigh
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: webView.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: webView.centerYAnchor),
            stack.widthAnchor.constraint(lessThanOrEqualToConstant: 400),
            preferredWidth,
            stack.leadingAnchor.constraint(greaterThanOrEqualTo: webView.leadingAnchor, constant: 16),
            stack.trailingAnchor.constraint(lessThanOrEqualTo: webView.trailingAnchor, constant: -16)
        ])
    }

    private func configureErrorOverlay() {
        // Keep recovery controls reachable in landscape and at the largest
        // accessibility text sizes, without covering the native navigation.
        errorView.translatesAutoresizingMaskIntoConstraints = false
        errorView.backgroundColor = .systemBackground
        let content = UIView()
        content.translatesAutoresizingMaskIntoConstraints = false
        errorView.addSubview(content)
        errorContent.axis = .vertical
        errorContent.alignment = .fill
        errorContent.spacing = 16
        errorContent.translatesAutoresizingMaskIntoConstraints = false
        content.addSubview(errorContent)
        view.addSubview(errorView)
        let preferredHeight = content.heightAnchor.constraint(equalTo: errorView.frameLayoutGuide.heightAnchor)
        preferredHeight.priority = .defaultLow
        let preferredWidth = errorContent.widthAnchor.constraint(equalTo: content.widthAnchor, constant: -32)
        preferredWidth.priority = .defaultHigh
        NSLayoutConstraint.activate([
            errorView.topAnchor.constraint(equalTo: webView.topAnchor),
            errorView.bottomAnchor.constraint(equalTo: webView.bottomAnchor),
            errorView.leadingAnchor.constraint(equalTo: webView.leadingAnchor),
            errorView.trailingAnchor.constraint(equalTo: webView.trailingAnchor),
            content.topAnchor.constraint(equalTo: errorView.contentLayoutGuide.topAnchor),
            content.bottomAnchor.constraint(equalTo: errorView.contentLayoutGuide.bottomAnchor),
            content.leadingAnchor.constraint(equalTo: errorView.contentLayoutGuide.leadingAnchor),
            content.trailingAnchor.constraint(equalTo: errorView.contentLayoutGuide.trailingAnchor),
            content.widthAnchor.constraint(equalTo: errorView.frameLayoutGuide.widthAnchor),
            content.heightAnchor.constraint(greaterThanOrEqualTo: errorView.frameLayoutGuide.heightAnchor),
            preferredHeight,
            errorContent.centerXAnchor.constraint(equalTo: content.centerXAnchor),
            errorContent.centerYAnchor.constraint(equalTo: content.centerYAnchor),
            errorContent.topAnchor.constraint(greaterThanOrEqualTo: content.topAnchor, constant: 16),
            errorContent.bottomAnchor.constraint(lessThanOrEqualTo: content.bottomAnchor, constant: -16),
            errorContent.leadingAnchor.constraint(greaterThanOrEqualTo: content.leadingAnchor, constant: 16),
            errorContent.trailingAnchor.constraint(lessThanOrEqualTo: content.trailingAnchor, constant: -16),
            errorContent.widthAnchor.constraint(lessThanOrEqualToConstant: 400),
            preferredWidth
        ])
    }

    private func observeWebView() {
        observations = [
            webView.observe(\.estimatedProgress, options: [.new]) { [weak self] webView, _ in
                self?.progressView.setProgress(Float(webView.estimatedProgress), animated: true)
            },
            webView.observe(\.isLoading, options: [.new]) { [weak self] webView, _ in
                self?.progressView.isHidden = !webView.isLoading
            },
            webView.observe(\.canGoBack, options: [.new]) { [weak self] webView, _ in
                self?.backButton.isEnabled = webView.canGoBack
            },
            webView.observe(\.canGoForward, options: [.new]) { [weak self] webView, _ in
                self?.forwardButton.isEnabled = webView.canGoForward
            }
        ]
    }

    private func startNetworkMonitor() {
        monitor.pathUpdateHandler = { [weak self] path in
            DispatchQueue.main.async {
                guard let self else { return }
                self.isOffline = path.status == .unsatisfied
                self.offlineLabel.isHidden = !self.isOffline
            }
        }
        monitor.start(queue: DispatchQueue(label: "com.dovebevo.app.connectivity"))
    }

    private func loadWebsite(_ url: URL) {
        guard URLPolicy.isWebsite(url) else { return }
        lastWebsiteURL = url
        errorView.isHidden = true
        loadingView.isHidden = hasLoadedPage
        webView.load(URLRequest(url: url))
    }

    private var currentWebsiteURL: URL {
        if let url = webView.url, URLPolicy.isWebsite(url) { return url }
        return lastWebsiteURL
    }

    @objc private func goBack() { webView.goBack() }
    @objc private func goForward() { webView.goForward() }
    @objc private func goHome() { loadWebsite(URLPolicy.homeURL) }
    @objc private func retry() { loadWebsite(lastWebsiteURL) }

    @objc private func reloadPage() {
        guard errorView.isHidden, hasLoadedPage else { retry(); return }
        webView.reload()
    }

    @objc private func sharePage() {
        let sheet = UIActivityViewController(activityItems: [currentWebsiteURL], applicationActivities: nil)
        sheet.popoverPresentationController?.barButtonItem = shareButton
        present(sheet, animated: true)
    }

    private func openCurrentPageInBrowser() {
        openExternal(currentWebsiteURL)
    }

    private func openExternal(_ url: URL) {
        UIApplication.shared.open(url, options: [:]) { [weak self] opened in
            guard !opened else { return }
            self?.showAlert(title: "Collegamento non disponibile", message: "Non trovo un'app per aprire questo collegamento.")
        }
    }

    private func showLocationHelp() {
        let alert = UIAlertController(
            title: "Posizione vicino a te",
            message: "Tocca «Vicino a me» nella mappa e scegli se consentire la posizione. Se hai negato il permesso, puoi cambiarlo nelle Impostazioni di iOS. Puoi sempre cercare una città senza condividere la posizione.",
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "Apri Impostazioni", style: .default) { _ in
            guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
            UIApplication.shared.open(url)
        })
        alert.addAction(UIAlertAction(title: "Chiudi", style: .cancel))
        present(alert, animated: true)
    }

    private func showInformation() {
        showAlert(
            title: "Dove bevo",
            message: "La mappa dei bar e dei prezzi di www.dovebevo.com. L'app usa il sito aggiornato e conserva la sessione su questo dispositivo. I collegamenti esterni si aprono nel browser o nell'app adatta. Serve una connessione per caricare la mappa e i prezzi. Per l'informativa completa e i contatti, apri Privacy dal menu Altre opzioni. Assistenza: \(PrivacyPolicy.supportEmail)."
        )
    }

    private func showPrivacy() {
        navigationItem.backButtonTitle = "Torna alla mappa"
        navigationController?.pushViewController(PrivacyViewController(), animated: true)
    }

    private func showAlert(title: String, message: String) {
        guard presentedViewController == nil else { return }
        let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Chiudi", style: .default))
        present(alert, animated: true)
    }

    private func showError(title: String, message: String) {
        loadingView.isHidden = true
        progressView.isHidden = true
        errorTitle.text = title
        errorMessage.text = message
        errorView.isHidden = false
        shareButton.isEnabled = false
        UIAccessibility.post(notification: .screenChanged, argument: errorTitle)
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        let mainFrame = navigationAction.targetFrame?.isMainFrame ?? true
        let userLink = navigationAction.navigationType == .linkActivated
        let trustedSource = navigationAction.sourceFrame.isMainFrame
            && navigationAction.sourceFrame.request.url.map(URLPolicy.isWebsite) == true
        switch URLPolicy.destination(
            for: url, isMainFrame: mainFrame,
            isUserActivatedLink: userLink, isFromWebsite: trustedSource
        ) {
        case .website:
            lastWebsiteURL = url
            decisionHandler(.allow)
        case .webFrame:
            decisionHandler(.allow)
        case .external:
            decisionHandler(.cancel)
            openExternal(url)
        case .blocked:
            decisionHandler(.cancel)
            if mainFrame && userLink && trustedSource {
                showAlert(title: "Collegamento non supportato", message: "Questo tipo di collegamento non può essere aperto dall'app.")
            }
        }
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationResponse: WKNavigationResponse,
        decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
    ) {
        guard navigationResponse.isForMainFrame else { decisionHandler(.allow); return }
        guard let url = navigationResponse.response.url, URLPolicy.isWebsite(url),
              navigationResponse.canShowMIMEType else {
            decisionHandler(.cancel)
            showError(title: "Pagina non disponibile", message: "Non riesco ad aprire questa pagina. Riprova tra poco.")
            return
        }
        if let response = navigationResponse.response as? HTTPURLResponse, response.statusCode >= 500 {
            decisionHandler(.cancel)
            showError(title: "Servizio non disponibile", message: "Dove bevo non risponde in questo momento. Riprova tra poco.")
            return
        }
        // 4xx pages (including a normal Cloudflare verification) stay in WebKit.
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        errorView.isHidden = true
        loadingView.isHidden = hasLoadedPage
        progressView.setProgress(0, animated: false)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        hasLoadedPage = true
        loadingView.isHidden = true
        errorView.isHidden = true
        shareButton.isEnabled = webView.url.map(URLPolicy.isWebsite) == true
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        handleNavigationError(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        handleNavigationError(error)
    }

    private func handleNavigationError(_ error: Error) {
        let error = error as NSError
        guard !(error.domain == NSURLErrorDomain && error.code == NSURLErrorCancelled) else { return }
        let message = isOffline || (error.domain == NSURLErrorDomain && error.code == NSURLErrorNotConnectedToInternet)
            ? "Controlla la connessione, poi tocca Riprova. La mappa e i prezzi richiedono internet."
            : "Non riesco a caricare il sito. Controlla la connessione e riprova."
        showError(title: "Dove bevo non si carica", message: message)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        // One automatic recovery per controller lifetime; repeated failures
        // require an explicit retry so a broken page cannot reload forever.
        guard !recoveredRenderer else {
            showError(title: "La pagina è stata interrotta", message: "Tocca Riprova per riaprire Dove bevo.")
            return
        }
        recoveredRenderer = true
        hasLoadedPage = false
        loadWebsite(currentWebsiteURL)
    }

    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        // An approved same-site target=_blank belongs in this same persistent
        // browser. External user links were already handled by the policy.
        if navigationAction.targetFrame == nil,
           let url = navigationAction.request.url, URLPolicy.isWebsite(url) {
            webView.load(navigationAction.request)
        }
        return nil
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptAlertPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping () -> Void
    ) {
        guard canPresentWebsiteDialog(frame) else { completionHandler(); return }
        let alert = UIAlertController(title: "www.dovebevo.com", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        present(alert, animated: true)
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptConfirmPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (Bool) -> Void
    ) {
        guard canPresentWebsiteDialog(frame) else { completionHandler(false); return }
        let alert = UIAlertController(title: "www.dovebevo.com", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Annulla", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "Conferma", style: .default) { _ in completionHandler(true) })
        present(alert, animated: true)
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptTextInputPanelWithPrompt prompt: String,
        defaultText: String?,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (String?) -> Void
    ) {
        guard canPresentWebsiteDialog(frame) else { completionHandler(nil); return }
        let alert = UIAlertController(title: "www.dovebevo.com", message: prompt, preferredStyle: .alert)
        alert.addTextField { $0.text = defaultText }
        alert.addAction(UIAlertAction(title: "Annulla", style: .cancel) { _ in completionHandler(nil) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { [weak alert] _ in
            completionHandler(alert?.textFields?.first?.text)
        })
        present(alert, animated: true)
    }

    private func canPresentWebsiteDialog(_ frame: WKFrameInfo) -> Bool {
        presentedViewController == nil && frame.isMainFrame
            && frame.request.url.map(URLPolicy.isWebsite) == true
    }

    private func item(_ title: String, symbol: String, action: Selector, id: String) -> UIBarButtonItem {
        let item = UIBarButtonItem(image: UIImage(systemName: symbol), style: .plain, target: self, action: action)
        item.title = title
        item.accessibilityLabel = title
        item.accessibilityIdentifier = id
        return item
    }

    private func space() -> UIBarButtonItem { UIBarButtonItem(systemItem: .flexibleSpace) }

    private func label(_ text: String, style: UIFont.TextStyle) -> UILabel {
        let label = UILabel()
        label.text = text
        label.font = .preferredFont(forTextStyle: style)
        label.adjustsFontForContentSizeCategory = true
        label.numberOfLines = 0
        label.textAlignment = .center
        return label
    }
}
