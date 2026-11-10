import UIKit

/// Read-only community recommendations around the last selected map centre.
final class AreaVotesViewController: UITableViewController {
    private let client: AreaVotesServing
    private let activityCheck: (() -> Bool)?
    private let onOpen: (URL) -> Void
    private let onMap: () -> Void
    private(set) var area: DiscoveryArea?
    private(set) var rows: [AreaVoteItem] = []
    private var nextAfter: String?
    private var request: RecommendationRequest?
    private var generation = UUID()
    private var visible = false
    private var lifecycleActive = true
    private var busy = false
    private var hasLoaded = false
    private var loadFailed = false
    private let statusLabel = UILabel()
    private let moreButton = UIButton(type: .system)
    private let chooseMapButton = UIButton(type: .system)
    var isDestinationSelected: (() -> Bool)?
    var onReloadMenuChanged: (() -> Void)?
    var canReloadFromMore: Bool { canRead && area != nil && !busy }
    func reloadFromMore() { guard canReloadFromMore else { return }; refresh() }
    private lazy var moreOverlaySpace: UIBarButtonItem = {
        let spacer = UIView(frame: CGRect(x: 0, y: 0, width: 56, height: 48))
        spacer.isUserInteractionEnabled = false
        return UIBarButtonItem(customView: spacer)
    }()

    init(client: AreaVotesServing = AreaVotesClient(), activityCheck: (() -> Bool)? = nil,
         onOpen: @escaping (URL) -> Void, onMap: @escaping () -> Void = {}) {
        self.client = client; self.activityCheck = activityCheck; self.onOpen = onOpen; self.onMap = onMap
        super.init(style: .insetGrouped)
        let center = NotificationCenter.default
        for name in [UIApplication.willResignActiveNotification, UIApplication.didEnterBackgroundNotification] {
            center.addObserver(self, selector: #selector(appDeactivated), name: name, object: nil)
        }
        center.addObserver(self, selector: #selector(appActivated), name: UIApplication.didBecomeActiveNotification, object: nil)
    }

    required init?(coder: NSCoder) { return nil }
    deinit { request?.cancel(); NotificationCenter.default.removeObserver(self) }

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "Consigliati"
        NativeAppearance.configure(navigationController)
        NativeAppearance.configure(tableView)
        tableView.accessibilityIdentifier = "areaVotes.list"
        tableView.register(UITableViewCell.self, forCellReuseIdentifier: "vote")
        tableView.rowHeight = UITableView.automaticDimension
        tableView.estimatedRowHeight = 96
        navigationItem.rightBarButtonItems = [moreOverlaySpace]
        let heading = UILabel()
        heading.text = "Consigliati in questa zona"
        heading.font = .preferredFont(forTextStyle: .title2)
        heading.textColor = NativeAppearance.ink
        heading.accessibilityTraits = .header
        let detail = UILabel()
        detail.text = "Drink consigliati dalle persone vicino al centro della mappa. Tocca Mappa per cambiare zona. I conteggi sono pubblici; qui non si vota."
        detail.font = .preferredFont(forTextStyle: .subheadline)
        detail.textColor = NativeAppearance.muted
        for label in [heading, detail] { label.numberOfLines = 0; label.adjustsFontForContentSizeCategory = true }
        let header = UIView()
        let stack = UIStackView(arrangedSubviews: [heading, detail])
        stack.axis = .vertical; stack.spacing = 8; stack.translatesAutoresizingMaskIntoConstraints = false
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
        moreButton.accessibilityIdentifier = "areaVotes.loadMore"
        moreButton.setTitle("Carica altri", for: .normal)
        moreButton.titleLabel?.font = .preferredFont(forTextStyle: .body)
        moreButton.titleLabel?.adjustsFontForContentSizeCategory = true
        moreButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 48).isActive = true
        moreButton.addTarget(self, action: #selector(loadMore), for: .touchUpInside)
        chooseMapButton.accessibilityIdentifier = "areaVotes.chooseMap"
        chooseMapButton.setTitle("Scegli una città sulla mappa", for: .normal)
        chooseMapButton.titleLabel?.font = .preferredFont(forTextStyle: .body)
        chooseMapButton.titleLabel?.adjustsFontForContentSizeCategory = true
        chooseMapButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 48).isActive = true
        chooseMapButton.addTarget(self, action: #selector(openMap), for: .touchUpInside)
        let footer = UIView()
        let footerStack = UIStackView(arrangedSubviews: [statusLabel, chooseMapButton, moreButton])
        footerStack.axis = .vertical; footerStack.spacing = 12; footerStack.translatesAutoresizingMaskIntoConstraints = false
        footer.addSubview(footerStack)
        NSLayoutConstraint.activate([
            footerStack.topAnchor.constraint(equalTo: footer.topAnchor, constant: 16),
            footerStack.bottomAnchor.constraint(equalTo: footer.bottomAnchor, constant: -16),
            footerStack.leadingAnchor.constraint(equalTo: footer.leadingAnchor, constant: 20),
            footerStack.trailingAnchor.constraint(equalTo: footer.trailingAnchor, constant: -20)
        ])
        tableView.tableFooterView = footer
        render()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        visible = true
        if activityCheck?() == true || UIApplication.shared.applicationState == .active { lifecycleActive = true }
        refresh()
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        visible = false; retire()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        for header in [tableView.tableHeaderView, tableView.tableFooterView].compactMap({ $0 }) {
            let size = header.systemLayoutSizeFitting(CGSize(width: tableView.bounds.width, height: 0),
                withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel)
            if header.frame.width != tableView.bounds.width || header.frame.height != size.height {
                header.frame = CGRect(x: 0, y: 0, width: tableView.bounds.width, height: size.height)
                if header === tableView.tableHeaderView { tableView.tableHeaderView = header }
                else { tableView.tableFooterView = header }
            }
        }
    }

    private var canRead: Bool {
        guard visible, lifecycleActive, isDestinationSelected?() != false else { return false }
        if let activityCheck { return activityCheck() }
        guard UIApplication.shared.applicationState == .active,
              let scene = viewIfLoaded?.window?.windowScene else { return false }
        return scene.activationState == .foregroundActive
    }

    func setArea(_ area: DiscoveryArea?) {
        guard self.area != area else { return }
        retire()
        self.area = area; rows.removeAll(); nextAfter = nil; hasLoaded = false; loadFailed = false
        render()
        if canRead { refresh() }
    }

    @objc func refresh() {
        guard canRead, area != nil, !busy else { return }
        rows.removeAll(); nextAfter = nil; hasLoaded = false; loadFailed = false
        loadPage(after: nil)
    }

    @objc private func loadMore() {
        guard canRead, !busy, let after = nextAfter else { return }
        loadPage(after: after)
    }

    @objc private func openMap() { onMap() }

    private func loadPage(after: String?) {
        guard canRead, !busy, let area else { return }
        let token = UUID(); generation = token; busy = true
        render()
        let handle = client.load(area: area, after: after) { [weak self] result in
            guard let self, self.generation == token, self.canRead else { return }
            self.request = nil; self.busy = false
            switch result {
            case .failure:
                self.hasLoaded = true; self.loadFailed = true
                if after == nil { self.rows.removeAll(); self.nextAfter = nil }
            case .success(let page):
                guard page.cells == area.cells,
                      Set(self.rows.map(\.identity)).isDisjoint(with: page.items.map(\.identity)),
                      self.rows.last == nil || page.items.first == nil ||
                        self.rows.last!.count >= page.items.first!.count,
                      after == nil || page.nextAfter != after else {
                    self.hasLoaded = true; self.nextAfter = nil; self.render(); return
                }
                self.hasLoaded = true; self.loadFailed = false
                self.rows += page.items; self.nextAfter = page.nextAfter
            }
            self.render()
        }
        if generation == token && busy { request = handle } else { handle.cancel() }
    }

    private func retire() {
        generation = UUID(); request?.cancel(); request = nil; busy = false
        if isViewLoaded { render() }
    }

    private func render() {
        guard isViewLoaded else { return }
        if area == nil {
            statusLabel.text = "Apri Mappa e scegli una città, poi torna qui per vedere i consigli in quella zona."
            statusLabel.accessibilityIdentifier = "areaVotes.chooseArea"
        } else if busy {
            statusLabel.text = rows.isEmpty ? "Caricamento dei consigli…" : "Caricamento di altri consigli…"
            statusLabel.accessibilityIdentifier = "areaVotes.loading"
        } else if loadFailed {
            statusLabel.text = rows.isEmpty
                ? "Consigli non disponibili. Controlla la connessione e scegli Ricarica in Altre opzioni."
                : "Altri consigli non disponibili ora. I conteggi già caricati restano visibili; riprova con Carica altri."
            statusLabel.accessibilityIdentifier = "areaVotes.unavailable"
        } else if !hasLoaded {
            statusLabel.text = "Apri Altre opzioni e scegli Ricarica per leggere i consigli."
            statusLabel.accessibilityIdentifier = "areaVotes.unavailable"
        } else if rows.isEmpty {
            statusLabel.text = "Nessun drink consigliato in questa zona. I voti possono comparire quando le persone consigliano un drink."
            statusLabel.accessibilityIdentifier = "areaVotes.empty"
        } else {
            statusLabel.text = nextAfter == nil ? "\(rows.count) drink consigliati in questa zona." : "Mostrati \(rows.count) drink consigliati in questa zona. Carica altri per continuare."
            statusLabel.accessibilityIdentifier = "areaVotes.loaded"
        }
        moreButton.isHidden = nextAfter == nil || busy
        chooseMapButton.isHidden = area != nil
        tableView.reloadData(); view.setNeedsLayout()
        onReloadMenuChanged?()
    }

    @objc private func appDeactivated(_ notification: Notification) { lifecycleActive = false; retire() }
    @objc private func appActivated(_ notification: Notification) { lifecycleActive = true; refresh() }

    override func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int { rows.count }

    override func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let item = rows[indexPath.row]
        let cell = tableView.dequeueReusableCell(withIdentifier: "vote", for: indexPath)
        var content = cell.defaultContentConfiguration()
        content.text = item.drinkName
        let place = [item.venue.label, item.city].compactMap { $0 }.joined(separator: " · ")
        let format: String
        if case .europe(_, _, let currency, let serving) = item.target {
            format = "\(currency) · \(serving.label)"
        } else { format = item.servingLabel ?? "Formato non dichiarato" }
        content.secondaryText = "\(place)\n\(format) · \(item.count) \(item.count == 1 ? "consiglio" : "consigli")"
        content.textProperties.font = .preferredFont(forTextStyle: .headline, compatibleWith: traitCollection)
        content.secondaryTextProperties.numberOfLines = 0
        content.textToSecondaryTextVerticalPadding = 8
        cell.contentConfiguration = content
        cell.backgroundConfiguration = NativeAppearance.card()
        cell.accessoryType = .disclosureIndicator
        cell.accessibilityIdentifier = "areaVotes.item.\(indexPath.row)"
        cell.accessibilityLabel = "\(item.drinkName), \(place), \(item.count) \(item.count == 1 ? "consiglio" : "consigli")"
        cell.accessibilityHint = "Apre il locale nella mappa; qui non si vota"
        return cell
    }

    override func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        guard rows.indices.contains(indexPath.row) else { return }
        onOpen(rows[indexPath.row].venue.url)
    }
}
