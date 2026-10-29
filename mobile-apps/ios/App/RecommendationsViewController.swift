import UIKit

/// A native public-vote screen bound to one already validated venue. No page
/// script, navigation or browser session is used by its HTTP client.
final class RecommendationsViewController: UITableViewController {
    private let venue: SavedVenue
    private let client: RecommendationServing
    private let activityCheck: (() -> Bool)?
    private var visible = false
    private var lifecycleActive = true
    private var generation = UUID()
    private var request: RecommendationRequest?
    private var busy = false
    private var pendingDrink: String?
    private var snapshot: RecommendationSnapshot?
    private var status = "Caricamento dei consigli…"
    private let statusLabel = UILabel()
    private var categories = DrinkCategory.all
    private var renderedCategory: UIContentSizeCategory?

    init(venue: SavedVenue, client: RecommendationServing = RecommendationClient(), activityCheck: (() -> Bool)? = nil) {
        self.venue = venue
        self.client = client
        self.activityCheck = activityCheck
        super.init(style: .insetGrouped)
        let center = NotificationCenter.default
        for name in [UIApplication.willResignActiveNotification, UIApplication.didEnterBackgroundNotification] {
            center.addObserver(self, selector: #selector(appDeactivated), name: name, object: nil)
        }
        center.addObserver(self, selector: #selector(appActivated), name: UIApplication.didBecomeActiveNotification, object: nil)
        for name in [UIScene.willDeactivateNotification, UIScene.didEnterBackgroundNotification] {
            center.addObserver(self, selector: #selector(sceneDeactivated), name: name, object: nil)
        }
        center.addObserver(self, selector: #selector(sceneActivated), name: UIScene.didActivateNotification, object: nil)
    }

    required init?(coder: NSCoder) { return nil }

    deinit {
        request?.cancel()
        NotificationCenter.default.removeObserver(self)
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "Drink consigliati"
        NativeAppearance.configure(navigationController)
        NativeAppearance.configure(tableView)
        tableView.accessibilityIdentifier = "recommendations.list"
        tableView.register(RecommendationCell.self, forCellReuseIdentifier: "recommendation")
        tableView.rowHeight = UITableView.automaticDimension
        tableView.estimatedRowHeight = 96
        navigationItem.rightBarButtonItem = UIBarButtonItem(title: "Ricarica", style: .plain, target: self, action: #selector(refresh))
        navigationItem.rightBarButtonItem?.accessibilityIdentifier = "recommendations.retry"
        let name = UILabel()
        name.text = venue.label
        name.font = .preferredFont(forTextStyle: .title2)
        name.textColor = NativeAppearance.ink
        name.accessibilityIdentifier = "recommendations.venueName"
        name.accessibilityTraits = .header
        let introduction = UILabel()
        introduction.text = "Consiglia i drink che hai provato qui. I consigli sono pubblici nelle app. Le categorie non indicano ciò che il locale serve."
        introduction.font = .preferredFont(forTextStyle: .subheadline)
        introduction.textColor = NativeAppearance.muted
        for label in [name, introduction] { label.numberOfLines = 0; label.adjustsFontForContentSizeCategory = true }
        let header = UIView()
        let stack = UIStackView(arrangedSubviews: [name, introduction])
        stack.axis = .vertical
        stack.spacing = 12
        stack.translatesAutoresizingMaskIntoConstraints = false
        header.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: header.topAnchor, constant: 16),
            stack.bottomAnchor.constraint(equalTo: header.bottomAnchor, constant: -16),
            stack.leadingAnchor.constraint(equalTo: header.leadingAnchor, constant: 20),
            stack.trailingAnchor.constraint(equalTo: header.trailingAnchor, constant: -20)
        ])
        tableView.tableHeaderView = header
        statusLabel.numberOfLines = 0
        statusLabel.font = .preferredFont(forTextStyle: .body)
        statusLabel.textColor = NativeAppearance.muted
        statusLabel.adjustsFontForContentSizeCategory = true
        statusLabel.textAlignment = .center
        statusLabel.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 16, leading: 20, bottom: 20, trailing: 20)
        tableView.tableFooterView = statusLabel
        render()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        visible = true
        if activityCheck?() == true || (UIApplication.shared.applicationState == .active &&
            viewIfLoaded?.window?.windowScene?.activationState == .foregroundActive) { lifecycleActive = true }
        refresh()
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        visible = false
        retire()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        if renderedCategory != traitCollection.preferredContentSizeCategory {
            renderedCategory = traitCollection.preferredContentSizeCategory
            render()
        }
        if let header = tableView.tableHeaderView {
            let size = header.systemLayoutSizeFitting(CGSize(width: tableView.bounds.width, height: 0),
                                                     withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel)
            if header.frame.width != tableView.bounds.width || header.frame.height != size.height {
                header.frame = CGRect(x: 0, y: 0, width: tableView.bounds.width, height: size.height)
                tableView.tableHeaderView = header
            }
        }
        let width = max(tableView.bounds.width - 40, 1)
        let height = statusLabel.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude)).height + 36
        if statusLabel.frame.width != tableView.bounds.width || statusLabel.frame.height != height {
            statusLabel.frame = CGRect(x: 0, y: 0, width: tableView.bounds.width, height: height)
            tableView.tableFooterView = statusLabel
        }
    }

    private var canInteract: Bool {
        guard visible, lifecycleActive else { return false }
        if let activityCheck { return activityCheck() }
        guard UIApplication.shared.applicationState == .active,
              let scene = viewIfLoaded?.window?.windowScene else { return false }
        return scene.activationState == .foregroundActive
    }

    @objc func refresh() {
        guard canInteract, !busy else { return }
        startLoad(reconciling: false)
    }

    private func startLoad(reconciling: Bool, notice: String? = nil) {
        guard canInteract else { retire(); return }
        let token = beginRequest(drink: nil)
        snapshot = nil
        status = reconciling ? "Esito del consiglio non confermato. Verifico lo stato aggiornato…" : "Caricamento dei consigli…"
        render()
        let handle = client.load(venue: venue) { [weak self] result in
            guard let self, self.accepts(token) else { return }
            self.finishRequest()
            switch result {
            case .success(let snapshot): self.accept(snapshot, notice: notice)
            case .failure(let error):
                self.snapshot = nil
                self.status = error.message
                self.render()
            }
        }
        retain(handle, token: token)
    }

    private func toggle(_ code: String) {
        guard canInteract, !busy, let previous = snapshot?.value(for: code) else { return }
        let token = beginRequest(drink: code)
        status = "Aggiornamento del consiglio…"
        render()
        let handle = client.set(venue: venue, drink: code, recommended: !previous.recommended) { [weak self] result in
            guard let self, self.accepts(token) else { return }
            self.finishRequest()
            switch result {
            case .success(let snapshot): self.accept(snapshot)
            case .failure(let error):
                // A timeout/cancellation may occur after the server committed.
                // Never retry the write blindly or claim the old state is current.
                let notice = error == .rateLimited ? error.message : "Consigli aggiornati dopo un problema di invio. Controlla se il tuo consiglio è selezionato."
                self.startLoad(reconciling: true, notice: notice)
            }
        }
        retain(handle, token: token)
    }

    private func beginRequest(drink: String?) -> UUID {
        request?.cancel()
        request = nil
        generation = UUID()
        busy = true
        pendingDrink = drink
        return generation
    }

    private func retain(_ handle: RecommendationRequest, token: UUID) {
        // Real transport completes asynchronously; also handle synchronous
        // injected collaborators without retaining an already finished task.
        if generation == token && busy { request = handle } else { handle.cancel() }
    }

    private func accepts(_ token: UUID) -> Bool {
        guard generation == token, busy else { return false }
        guard canInteract else { retire(); return false }
        return true
    }

    private func finishRequest() { request = nil; busy = false; pendingDrink = nil }

    private func accept(_ value: RecommendationSnapshot, notice: String? = nil) {
        guard value.venueKey == venue.url.lastPathComponent else {
            snapshot = nil
            status = RecommendationError.invalidResponse.message
            render()
            return
        }
        snapshot = value
        categories = value.sortedCategories
        let summary = value.drinks.allSatisfy({ $0.count == 0 }) ? "Ancora nessun consiglio" : "Consigli aggiornati"
        status = [notice, summary].compactMap { $0 }.joined(separator: "\n")
        render()
        UIAccessibility.post(notification: .announcement, argument: status)
    }

    private func retire() {
        generation = UUID()
        request?.cancel()
        finishRequest()
        snapshot = nil
        status = "Consigli da aggiornare. Tocca Riprova."
        if isViewLoaded { render() }
    }

    @objc private func appDeactivated(_ notification: Notification) { lifecycleActive = false; retire() }
    @objc private func appActivated(_ notification: Notification) { lifecycleActive = true; refresh() }

    @objc private func sceneDeactivated(_ notification: Notification) {
        guard let scene = notification.object as? UIWindowScene, scene === viewIfLoaded?.window?.windowScene else { return }
        lifecycleActive = false
        retire()
    }

    @objc private func sceneActivated(_ notification: Notification) {
        guard let scene = notification.object as? UIWindowScene, scene === viewIfLoaded?.window?.windowScene else { return }
        lifecycleActive = true
        refresh()
    }

    private func render() {
        guard isViewLoaded else { return }
        navigationItem.rightBarButtonItem?.isEnabled = !busy && canInteract
        navigationItem.rightBarButtonItem?.title = snapshot == nil && !busy ? "Riprova" : "Ricarica"
        statusLabel.text = status
        statusLabel.accessibilityIdentifier = snapshot == nil ? (busy ? "recommendations.loading" : "recommendations.unavailable") : "recommendations.loaded"
        tableView.reloadData()
        view.setNeedsLayout()
    }

    override func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int { DrinkCategory.all.count }

    override func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "recommendation", for: indexPath) as! RecommendationCell
        let category = categories[indexPath.row]
        cell.configure(category: category, value: snapshot?.value(for: category.code),
                       enabled: canInteract && !busy && snapshot != nil, pending: pendingDrink == category.code) { [weak self] in
            self?.toggle(category.code)
        }
        return cell
    }
}

private final class RecommendationCell: UITableViewCell {
    private let nameLabel = UILabel()
    private let countLabel = UILabel()
    private let button = UIButton(type: .system)
    private var onToggle: (() -> Void)?

    override init(style: UITableViewCell.CellStyle, reuseIdentifier: String?) {
        super.init(style: style, reuseIdentifier: reuseIdentifier)
        selectionStyle = .none
        backgroundConfiguration = NativeAppearance.card()
        nameLabel.font = .preferredFont(forTextStyle: .headline)
        nameLabel.textColor = NativeAppearance.ink
        countLabel.font = .preferredFont(forTextStyle: .body)
        countLabel.textColor = NativeAppearance.muted
        for label in [nameLabel, countLabel] { label.numberOfLines = 0; label.adjustsFontForContentSizeCategory = true }
        button.titleLabel?.font = .preferredFont(forTextStyle: .body)
        button.titleLabel?.adjustsFontForContentSizeCategory = true
        button.titleLabel?.numberOfLines = 0
        button.contentHorizontalAlignment = .leading
        button.heightAnchor.constraint(greaterThanOrEqualToConstant: 48).isActive = true
        button.addTarget(self, action: #selector(tapped), for: .touchUpInside)
        let stack = UIStackView(arrangedSubviews: [nameLabel, countLabel, button])
        stack.axis = .vertical
        stack.spacing = 10
        stack.translatesAutoresizingMaskIntoConstraints = false
        contentView.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 22),
            stack.bottomAnchor.constraint(equalTo: contentView.bottomAnchor, constant: -22),
            stack.leadingAnchor.constraint(equalTo: contentView.layoutMarginsGuide.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: contentView.layoutMarginsGuide.trailingAnchor)
        ])
    }

    required init?(coder: NSCoder) { return nil }

    func configure(category: DrinkCategory, value: DrinkRecommendation?, enabled: Bool, pending: Bool, onToggle: @escaping () -> Void) {
        self.onToggle = onToggle
        accessibilityIdentifier = "recommendations.row.\(category.code)"
        nameLabel.text = category.name
        countLabel.text = value.map { $0.count == 1 ? "1 consiglio" : "\($0.count) consigli" } ?? "Conteggio non disponibile"
        let action = value?.recommended == true ? "Annulla consiglio" : "Consiglia"
        var configuration = NativeAppearance.button(selected: value?.recommended == true, traits: traitCollection)
        configuration.title = pending ? "Invio…" : action
        configuration.image = UIImage(systemName: value?.recommended == true ? "hand.thumbsup.fill" : "hand.thumbsup")
        if !enabled { configuration.baseForegroundColor = NativeAppearance.muted }
        button.configuration = configuration
        button.titleLabel?.numberOfLines = 0
        button.isEnabled = enabled
        button.accessibilityIdentifier = "recommendations.toggle.\(category.code)"
        button.accessibilityLabel = "\(category.name), \(countLabel.text ?? ""), \(pending ? "invio in corso" : action)"
        button.accessibilityHint = "Modifica il tuo consiglio pubblico per questo locale"
        button.accessibilityTraits = value?.recommended == true ? [.button, .selected] : [.button]
    }

    @objc private func tapped() { if button.isEnabled { onToggle?() } }
}
