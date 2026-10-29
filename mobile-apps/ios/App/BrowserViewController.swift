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
    private let monitor = NWPathMonitor()
    private var observations: [NSKeyValueObservation] = []
    private var lastWebsiteURL = URLPolicy.homeURL
    private var hasLoadedPage = false
    private var isOffline = false
    private var recoveredRenderer = false
    private var navigationState = BrowserNavigationState()
    private let savedVenues: SavedVenueStore
    private var pageLoading = false
    private var browserVisible = false
    private let bookmarkCapture: VenueBookmarkCapture
    private let recommendationClient: RecommendationServing
    private let websiteLoader: ((WKWebView, URLRequest) -> WKNavigation?)?
    private var bookmarkTimeout: DispatchWorkItem?
    private var bookmarkLifecycleActive = true
    var onShowFavourites: (() -> Void)?
    var isMapDestinationSelected: (() -> Bool)?
    var onVenueActionsChanged: ((Bool) -> Void)?

    private lazy var backButton = item("Indietro", symbol: "chevron.backward", action: #selector(goBack), id: "browser.back")
    private lazy var forwardButton = item("Avanti", symbol: "chevron.forward", action: #selector(goForward), id: "browser.forward")
    private lazy var moreButton: UIBarButtonItem = {
        let button = UIBarButtonItem(image: UIImage(systemName: "ellipsis.circle"), menu: moreMenu())
        button.accessibilityLabel = "Altre opzioni"
        button.accessibilityIdentifier = "browser.more"
        return button
    }()

    init(savedVenues: SavedVenueStore = SavedVenueStore(), bookmarkCapture: VenueBookmarkCapture = VenueBookmarkCapture(),
         recommendationClient: RecommendationServing = RecommendationClient(),
         websiteLoader: ((WKWebView, URLRequest) -> WKNavigation?)? = nil) {
        self.savedVenues = savedVenues
        self.bookmarkCapture = bookmarkCapture
        self.recommendationClient = recommendationClient
        self.websiteLoader = websiteLoader
        super.init(nibName: nil, bundle: nil)
        observeBookmarkLifecycle()
    }

    required init?(coder: NSCoder) { return nil }

    override func viewDidLoad() {
        super.viewDidLoad()
        configureChrome()
        configureWebView()
        configureContent()
        observeWebView()
        startNetworkMonitor()
        loadWebsite(lastWebsiteURL)
    }

    deinit {
        bookmarkTimeout?.cancel()
        NotificationCenter.default.removeObserver(self)
        monitor.cancel()
        observations.forEach { $0.invalidate() }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        browserVisible = false
        invalidateBookmarkCapture()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        browserVisible = true
        // The scene may have activated while this view was detached. Refresh
        // availability from its actual scene without restoring retired work.
        if UIApplication.shared.applicationState == .active,
           viewIfLoaded?.window?.windowScene?.activationState == .foregroundActive {
            bookmarkLifecycleActive = true
        }
        updateMoreMenu()
    }

    private func configureChrome() {
        // Keep the browser header independent of the enclosing Mappa tab item.
        navigationItem.title = "Dove bevo"
        view.backgroundColor = NativeAppearance.surface
        navigationController?.navigationBar.prefersLargeTitles = false
        NativeAppearance.configure(navigationController)

        navigationItem.rightBarButtonItem = moreButton
        navigationItem.leftBarButtonItems = [backButton, forwardButton]
        backButton.isEnabled = false
        forwardButton.isEnabled = false
    }

    private func moreMenu() -> UIMenu {
        UIMenu(children: [
            UIAction(title: "Condividi", image: UIImage(systemName: "square.and.arrow.up"), identifier: UIAction.Identifier("browser.share"), attributes: canSharePage ? [] : [.disabled]) { [weak self] _ in
                self?.sharePage()
            },
            UIAction(title: pageLoading ? "Interrompi" : "Ricarica", image: UIImage(systemName: pageLoading ? "xmark" : "arrow.clockwise"), identifier: UIAction.Identifier("browser.reload")) { [weak self] _ in
                self?.reloadPage()
            },
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
        ])
    }

    private var canSaveCurrentVenue: Bool {
        !bookmarkCapture.isPending && usableVenueURL != nil
    }

    private var usableVenueURL: URL? {
        guard let webView, hasLoadedPage, !pageLoading, !webView.isLoading, !navigationState.isStopped,
              errorView.isHidden, navigationController?.topViewController === self,
              isBookmarkInteractionActive else { return nil }
        if isMapDestinationSelected?() == false { return nil }
        if let tabs = tabBarController, tabs.selectedViewController !== navigationController { return nil }
        return SavedVenuePolicy.canonicalURL(webView.url)
    }

    private var isBookmarkInteractionActive: Bool {
        guard browserVisible, bookmarkLifecycleActive, UIApplication.shared.applicationState == .active,
              let scene = viewIfLoaded?.window?.windowScene else { return false }
        return scene.activationState == .foregroundActive
    }

    private func observeBookmarkLifecycle() {
        let center = NotificationCenter.default
        for name in [UIApplication.willResignActiveNotification, UIApplication.didEnterBackgroundNotification] {
            center.addObserver(self, selector: #selector(bookmarkAppDeactivated), name: name, object: nil)
        }
        center.addObserver(self, selector: #selector(bookmarkAppActivated), name: UIApplication.didBecomeActiveNotification, object: nil)
        for name in [UIScene.willDeactivateNotification, UIScene.didEnterBackgroundNotification] {
            center.addObserver(self, selector: #selector(bookmarkSceneDeactivated), name: name, object: nil)
        }
        center.addObserver(self, selector: #selector(bookmarkSceneActivated), name: UIScene.didActivateNotification, object: nil)
    }

    @objc private func bookmarkAppDeactivated(_ notification: Notification) {
        bookmarkLifecycleActive = false
        invalidateBookmarkCapture()
    }

    @objc private func bookmarkAppActivated(_ notification: Notification) {
        bookmarkLifecycleActive = true
        updateMoreMenu()
    }

    @objc private func bookmarkSceneDeactivated(_ notification: Notification) {
        guard let scene = notification.object as? UIWindowScene,
              scene === viewIfLoaded?.window?.windowScene else { return }
        bookmarkLifecycleActive = false
        invalidateBookmarkCapture()
    }

    @objc private func bookmarkSceneActivated(_ notification: Notification) {
        guard let scene = notification.object as? UIWindowScene,
              scene === viewIfLoaded?.window?.windowScene else { return }
        bookmarkLifecycleActive = true
        updateMoreMenu()
    }

    private func updateMoreMenu() {
        // Refresh from the complete page state, even when save eligibility did
        // not change (for example home loading, finish, stop and recovery).
        if isViewLoaded { navigationItem.rightBarButtonItem?.menu = moreMenu() }
        onVenueActionsChanged?(canSaveCurrentVenue)
    }

    private var canSharePage: Bool {
        guard let webView, hasLoadedPage, !pageLoading, !webView.isLoading,
              !navigationState.isStopped, errorView.isHidden,
              navigationController?.topViewController === self else { return false }
        return isMapDestinationSelected?() != false && webView.url.map(URLPolicy.isWebsite) == true
    }

    func refreshNavigationControls() { updateMoreMenu() }
    func retireVenueActions() { invalidateBookmarkCapture() }

    private func configureWebView() {
        let configuration = WKWebViewConfiguration()
        // Keep WebKit's ordinary persistent cookies and local storage. There is
        // no cookie copy or message handler. The separate recommendation client
        // has its own ephemeral session. Both native venue actions read only the
        // public venue name in an isolated world, after an explicit user tap.
        configuration.websiteDataStore = .default()
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        AppPresentationTheme.install(in: configuration)
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.isOpaque = false
        webView.backgroundColor = NativeAppearance.surface
        webView.scrollView.backgroundColor = NativeAppearance.surface
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
        offlineLabel.backgroundColor = NativeAppearance.accent.withAlphaComponent(0.18)
        offlineLabel.textColor = NativeAppearance.ink
        offlineLabel.accessibilityIdentifier = "browser.offline"
        offlineLabel.isHidden = true

        let body = UIStackView(arrangedSubviews: [offlineLabel, webView])
        body.axis = .vertical
        body.translatesAutoresizingMaskIntoConstraints = false
        progressView.translatesAutoresizingMaskIntoConstraints = false
        progressView.accessibilityLabel = "Caricamento pagina"
        progressView.progressTintColor = NativeAppearance.accent
        view.addSubview(body)
        view.addSubview(progressView)
        NSLayoutConstraint.activate([
            body.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            body.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            body.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            body.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
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
        image.tintColor = NativeAppearance.muted
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
        errorMessage.textColor = NativeAppearance.muted
        errorTitle.textColor = NativeAppearance.ink
        retryButton.configuration = NativeAppearance.button(primary: true)
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
        stack.backgroundColor = NativeAppearance.surface
        stack.layer.cornerRadius = NativeAppearance.radius
        stack.layer.borderColor = NativeAppearance.line.cgColor
        stack.layer.borderWidth = 1
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
                guard let self else { return }
                if webView.isLoading { self.invalidateBookmarkCapture() }
                let loading = webView.isLoading && !self.navigationState.isStopped && self.errorView.isHidden
                self.progressView.isHidden = !loading
                self.updateLoadingControl(loading)
                self.updateMoreMenu()
            },
            webView.observe(\.url, options: [.new]) { [weak self] _, _ in
                self?.invalidateBookmarkCapture()
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
        pageLoading = true
        invalidateBookmarkCapture()
        lastWebsiteURL = url
        setErrorVisible(false)
        loadingView.isHidden = hasLoadedPage
        let request = URLRequest(url: url)
        if let websiteLoader { navigationState.begin(websiteLoader(webView, request)) }
        else { navigationState.begin(webView.load(request)) }
    }

    private var currentWebsiteURL: URL {
        if let url = webView.url, URLPolicy.isWebsite(url) { return url }
        return lastWebsiteURL
    }

    @objc private func goBack() {
        guard webView.canGoBack else { return }
        invalidateBookmarkCapture()
        navigationState.begin(webView.goBack())
    }
    @objc private func goForward() {
        guard webView.canGoForward else { return }
        invalidateBookmarkCapture()
        navigationState.begin(webView.goForward())
    }
    @objc func goHome() { loadWebsite(URLPolicy.homeURL) }
    @objc private func retry() { loadWebsite(lastWebsiteURL) }

    @objc private func reloadPage() {
        invalidateBookmarkCapture()
        if errorView.isHidden && webView.isLoading && !navigationState.isStopped {
            navigationState.stop()
            webView.stopLoading()
            loadingView.isHidden = true
            progressView.isHidden = true
            updateLoadingControl(false)
            updateMoreMenu()
            if !hasLoadedPage {
                showError(title: "Caricamento interrotto", message: "Tocca Riprova per caricare Dove bevo. La mappa e i prezzi richiedono internet.")
            }
            return
        }
        guard errorView.isHidden, hasLoadedPage else { retry(); return }
        pageLoading = true
        updateMoreMenu()
        navigationState.begin(webView.reload())
    }

    private func updateLoadingControl(_ loading: Bool) {
        pageLoading = loading
        updateMoreMenu()
    }

    @objc func saveCurrentVenue() {
        readCurrentVenue(failureTitle: "Preferito non salvato") { [weak self] venue in
            guard let self else { return }
            do {
                try self.savedVenues.save(url: venue.url, label: venue.label)
                self.showAlert(title: "Preferito salvato", message: "Il locale è nei tuoi Preferiti, con il suo nome. Puoi riaprirlo dalla barra in basso.")
                UIAccessibility.post(notification: .announcement, argument: "Locale aggiunto ai preferiti")
            } catch SavedVenueStore.StoreError.capacityReached {
                self.showBookmarkError("Hai già 50 preferiti. Rimuovine uno dalla lista e riprova.")
            } catch {
                self.showBookmarkError("Non riesco a salvare questo locale. I preferiti precedenti sono stati mantenuti. Riprova.")
            }
        }
    }

    @objc func showRecommendations() {
        readCurrentVenue(failureTitle: "Consigli non disponibili") { [weak self] venue in
            guard let self else { return }
            self.invalidateBookmarkCapture()
            self.navigationItem.backButtonTitle = "Torna al locale"
            self.navigationController?.pushViewController(RecommendationsViewController(venue: venue, client: self.recommendationClient), animated: true)
        }
    }

    private func readCurrentVenue(failureTitle: String, onRead: @escaping (SavedVenue) -> Void) {
        guard canSaveCurrentVenue, let url = usableVenueURL,
              let request = bookmarkCapture.begin(url: url) else {
            showVenueReadError(title: failureTitle, message: "Apri un locale e attendi che il suo nome sia visibile, poi riprova.")
            return
        }
        updateMoreMenu()
        let timeout = DispatchWorkItem { [weak self] in
            guard let self, self.bookmarkCapture.contains(request) else { return }
            self.invalidateBookmarkCapture()
            guard self.isBookmarkInteractionActive else { return }
            self.showVenueReadError(title: failureTitle, message: "Non riesco a leggere il nome del locale. Attendi che la scheda sia caricata e riprova.")
        }
        bookmarkTimeout = timeout
        DispatchQueue.main.asyncAfter(deadline: .now() + 10, execute: timeout)
        webView.evaluateJavaScript(VenueNameReader.script, in: nil, in: .defaultClient) { [weak self] result in
            guard let self, self.bookmarkCapture.contains(request) else { return }
            guard self.isBookmarkInteractionActive else {
                self.invalidateBookmarkCapture()
                return
            }
            self.bookmarkTimeout?.cancel()
            self.bookmarkTimeout = nil
            do {
                let value = try result.get()
                let venue = try self.bookmarkCapture.complete(request, value: value, currentUsableURL: self.usableVenueURL)
                self.updateMoreMenu()
                onRead(venue)
            } catch {
                self.invalidateBookmarkCapture()
                self.showVenueReadError(title: failureTitle, message: "Non riesco a leggere questo locale. Attendi che la scheda sia caricata e riprova.")
            }
        }
    }

    private func invalidateBookmarkCapture() {
        bookmarkTimeout?.cancel()
        bookmarkTimeout = nil
        bookmarkCapture.invalidate()
        updateMoreMenu()
    }

    private func showBookmarkError(_ message: String) {
        showVenueReadError(title: "Preferito non salvato", message: message)
    }

    private func showVenueReadError(title: String, message: String) {
        guard navigationController?.topViewController === self, isBookmarkInteractionActive else { return }
        showAlert(title: title, message: message)
    }

    func showSavedVenues() {
        // Opening the private list is a new user intent. Cancel before pushing,
        // not only in viewWillDisappear, so removal cannot race an older save.
        invalidateBookmarkCapture()
        if let onShowFavourites { onShowFavourites(); return }
        navigationItem.backButtonTitle = "Torna alla mappa"
        let list = SavedVenuesViewController(store: savedVenues) { [weak self] url in
            guard let self, let canonical = SavedVenuePolicy.canonicalURL(url) else { return }
            self.navigationController?.popToViewController(self, animated: false)
            self.loadWebsite(canonical)
        }
        navigationController?.pushViewController(list, animated: true)
    }

    func openSavedVenue(_ url: URL) {
        guard let canonical = SavedVenuePolicy.canonicalURL(url) else { return }
        if isViewLoaded { loadWebsite(canonical) }
        else { lastWebsiteURL = canonical; loadViewIfNeeded() }
    }

    @objc private func sharePage() {
        guard canSharePage else { return }
        let sheet = UIActivityViewController(activityItems: [currentWebsiteURL], applicationActivities: nil)
        sheet.popoverPresentationController?.barButtonItem = moreButton
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
        setErrorVisible(true)
        updateLoadingControl(false)
        UIAccessibility.post(notification: .screenChanged, argument: errorTitle)
    }

    private func setErrorVisible(_ visible: Bool) {
        if visible { invalidateBookmarkCapture() }
        errorView.isHidden = !visible
        // The recovery overlay covers the website, but the native toolbar and
        // retry action must remain reachable to VoiceOver.
        webView.accessibilityElementsHidden = visible
        updateMoreMenu()
    }

    private func showResponseError(title: String, message: String, responseURL: URL?) {
        guard navigationState.shouldPresentResponseError(for: responseURL, currentTarget: lastWebsiteURL) else { return }
        showError(title: title, message: message)
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
            showResponseError(title: "Pagina non disponibile", message: "Non riesco ad aprire questa pagina. Riprova tra poco.", responseURL: navigationResponse.response.url)
            return
        }
        if let response = navigationResponse.response as? HTTPURLResponse, response.statusCode >= 500 {
            decisionHandler(.cancel)
            showResponseError(title: "Servizio non disponibile", message: "Dove bevo non risponde in questo momento. Riprova tra poco.", responseURL: url)
            return
        }
        // 4xx pages (including a normal Cloudflare verification) stay in WebKit.
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        guard navigationState.begin(navigation) else { return }
        invalidateBookmarkCapture()
        #if DEBUG
        NSLog("DoveBevo: navigation provisional-start")
        #endif
        setErrorVisible(false)
        loadingView.isHidden = hasLoadedPage
        progressView.setProgress(0, animated: false)
        progressView.isHidden = false
        updateLoadingControl(true)
    }

    func webView(_ webView: WKWebView, didReceiveServerRedirectForProvisionalNavigation navigation: WKNavigation!) {
        guard navigationState.acceptsCallback(navigation),
              let url = webView.url, URLPolicy.isWebsite(url) else { return }
        lastWebsiteURL = url
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        guard navigationState.acceptsCallback(navigation) else { return }
        hasLoadedPage = false
        updateMoreMenu()
        #if DEBUG
        NSLog("DoveBevo: navigation commit")
        #endif
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard navigationState.acceptsCallback(navigation) else { return }
        AppPresentationTheme.applyAfterFinish(to: webView)
        #if DEBUG
        NSLog("DoveBevo: navigation finish")
        #endif
        hasLoadedPage = true
        loadingView.isHidden = true
        setErrorVisible(false)
        progressView.isHidden = true
        updateLoadingControl(false)
        updateMoreMenu()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        guard navigationState.acceptsCallback(navigation) else { return }
        handleNavigationError(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        guard navigationState.acceptsCallback(navigation) else { return }
        handleNavigationError(error)
    }

    private func handleNavigationError(_ error: Error) {
        let error = error as NSError
        #if DEBUG
        NSLog("DoveBevo: navigation failed code=%ld", error.code)
        #endif
        guard !(error.domain == NSURLErrorDomain && error.code == NSURLErrorCancelled) else { return }
        let message = isOffline || (error.domain == NSURLErrorDomain && error.code == NSURLErrorNotConnectedToInternet)
            ? "Controlla la connessione, poi tocca Riprova. La mappa e i prezzi richiedono internet."
            : "Non riesco a caricare il sito. Controlla la connessione e riprova."
        showError(title: "Dove bevo non si carica", message: message)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        #if DEBUG
        NSLog("DoveBevo: renderer terminated recovered=%@", recoveredRenderer ? "yes" : "no")
        #endif
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
