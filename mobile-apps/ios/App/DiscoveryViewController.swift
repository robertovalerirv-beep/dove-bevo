import UIKit

/// A disposable public read model. It neither creates contributions nor saves
/// bookmarks, and uses the last explicitly captured map area rather than GPS.
final class DiscoveryViewController: UITableViewController {
    private let client: DiscoveryServing
    private let activityCheck: (() -> Bool)?
    private let onOpen: (URL) -> Void
    private let onMap: () -> Void
    private(set) var area: DiscoveryArea?
    private var snapshot: DiscoverySnapshot?
    private var rows: [DiscoveryPresentedRow] = []
    private var featuredRows: [DiscoveryPresentedRow] = []
    private var request: RecommendationRequest?
    private var generation = UUID()
    private var visible = false
    private var lifecycleActive = true
    private var busy = false
    private var drink = DrinkCategory.all[0]
    private var band = ComparisonBand.normal
    private var renderedCategory: UIContentSizeCategory?
    private let drinkSelector = UIButton(type: .system)
    private let bands = ComparisonBandSelector()
    private let statusLabel = UILabel()
    private let featuredHeading = UILabel()
    private let featuredStrip = DiscoveryFeaturedStrip()
    private var featuredWidth: CGFloat = 0
    var onReloadMenuChanged: (() -> Void)?
    var canReloadFromMore: Bool { canRead && area != nil && !busy }
    func reloadFromMore() { guard canReloadFromMore else { return }; refresh() }
    // The parent ellipsis overlays the right edge of the native navigation bar.
    private lazy var moreOverlaySpace: UIBarButtonItem = {
        let spacer = UIView(frame: CGRect(x: 0, y: 0, width: 56, height: 48))
        spacer.isUserInteractionEnabled = false
        return UIBarButtonItem(customView: spacer)
    }()
    var isDestinationSelected: (() -> Bool)?

    init(client: DiscoveryServing = DiscoveryClient(), activityCheck: (() -> Bool)? = nil,
         onOpen: @escaping (URL) -> Void, onMap: @escaping () -> Void) {
        self.client = client; self.activityCheck = activityCheck; self.onOpen = onOpen; self.onMap = onMap
        super.init(style: .insetGrouped)
        title = "Scopri"
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
    deinit { request?.cancel(); NotificationCenter.default.removeObserver(self) }

    override func viewDidLoad() {
        super.viewDidLoad()
        NativeAppearance.configure(navigationController)
        navigationItem.largeTitleDisplayMode = .never
        navigationController?.navigationBar.prefersLargeTitles = false
        NativeAppearance.configure(tableView)
        tableView.accessibilityIdentifier = "discovery.list"
        tableView.register(DiscoveryVenueCell.self, forCellReuseIdentifier: "discoveryVenue")
        tableView.rowHeight = UITableView.automaticDimension
        tableView.estimatedRowHeight = 112
        // Mappa is already in the bottom navigation; reload lives in the
        // parent's ellipsis, leaving this header clear of duplicate actions.
        navigationItem.rightBarButtonItems = [moreOverlaySpace]
        let heading = label("Scegli cosa bere", style: .headline)
        heading.accessibilityTraits = .header
        let illustration = label("Immagini illustrative dei drink, non foto dei locali", style: .caption2)
        illustration.textColor = NativeAppearance.muted
        let bandLabel = label("Fascia di prezzo", style: .caption1)
        bandLabel.textColor = NativeAppearance.muted
        drinkSelector.accessibilityIdentifier = "discovery.drinkSelector"
        drinkSelector.accessibilityLabel = "Scegli cosa bere"
        drinkSelector.accessibilityHint = "Apre l'elenco dei drink disponibili"
        drinkSelector.showsMenuAsPrimaryAction = true
        drinkSelector.contentHorizontalAlignment = .leading
        drinkSelector.heightAnchor.constraint(greaterThanOrEqualToConstant: 48).isActive = true
        var drinkConfiguration = UIButton.Configuration.bordered()
        // The button's intrinsic size must be large enough even before its
        // table header is laid out; a height constraint alone is ignored by
        // systemLayoutSizeFitting on an unmounted UIButton.
        drinkConfiguration.contentInsets = NSDirectionalEdgeInsets(top: 16, leading: 16, bottom: 16, trailing: 16)
        drinkSelector.configuration = drinkConfiguration
        bands.accessibilityIdentifier = "discovery.band"
        bands.accessibilityLabel = "Fascia di prezzo"
        bands.addTarget(self, action: #selector(bandChanged), for: .valueChanged)
        statusLabel.numberOfLines = 0
        statusLabel.font = .preferredFont(forTextStyle: .subheadline)
        statusLabel.textColor = NativeAppearance.muted
        statusLabel.adjustsFontForContentSizeCategory = true
        featuredHeading.text = "Prezzi nella zona"
        featuredHeading.font = .preferredFont(forTextStyle: .headline)
        featuredHeading.adjustsFontForContentSizeCategory = true
        featuredHeading.textColor = NativeAppearance.ink
        featuredHeading.accessibilityTraits = .header
        featuredHeading.accessibilityIdentifier = "discovery.featuredHeading"
        let header = UIView()
        let stack = UIStackView(arrangedSubviews: [heading, drinkSelector, bandLabel, bands,
                                                   statusLabel, illustration, featuredHeading, featuredStrip])
        stack.axis = .vertical; stack.spacing = 5; stack.translatesAutoresizingMaskIntoConstraints = false
        header.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: header.topAnchor, constant: 5),
            stack.bottomAnchor.constraint(equalTo: header.bottomAnchor, constant: -5),
            stack.leadingAnchor.constraint(equalTo: header.leadingAnchor, constant: 20),
            stack.trailingAnchor.constraint(equalTo: header.trailingAnchor, constant: -20)
        ])
        tableView.tableHeaderView = header
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
        super.viewWillDisappear(animated); visible = false; retire()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        if renderedCategory != traitCollection.preferredContentSizeCategory {
            renderedCategory = traitCollection.preferredContentSizeCategory; render()
        }
        let width = max(0, tableView.bounds.width - 40)
        if !featuredRows.isEmpty && abs(featuredWidth - width) > 1 {
            configureFeatured(width: width)
        }
        if let header = tableView.tableHeaderView {
            let size = header.systemLayoutSizeFitting(CGSize(width: tableView.bounds.width, height: 0),
                                                     withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel)
            if header.frame.width != tableView.bounds.width || header.frame.height != size.height {
                header.frame = CGRect(x: 0, y: 0, width: tableView.bounds.width, height: size.height)
                tableView.tableHeaderView = header
            }
        }
    }

    func setArea(_ area: DiscoveryArea?) {
        retire()
        if self.area != area { snapshot = nil }
        self.area = area
        if isViewLoaded { render() }
        if canRead { refresh() }
    }

    private var canRead: Bool {
        guard visible, lifecycleActive, isDestinationSelected?() != false else { return false }
        if let activityCheck { return activityCheck() }
        return UIApplication.shared.applicationState == .active &&
            viewIfLoaded?.window?.windowScene?.activationState == .foregroundActive && navigationController?.topViewController === self
    }

    @objc func refresh() {
        guard canRead, let area else { return }
        retire()
        let token = UUID(); generation = token; busy = true; render()
        let handle = client.load(area) { [weak self] value in
            guard let self, self.generation == token, self.busy else { return }
            guard self.canRead, self.area == value.area else { self.retire(); return }
            self.request = nil; self.busy = false; self.snapshot = value; self.render()
        }
        if generation == token && busy { request = handle } else { handle.cancel() }
    }

    private func retire() {
        generation = UUID(); request?.cancel(); request = nil; busy = false
        if isViewLoaded { render() }
    }

    private func label(_ text: String, style: UIFont.TextStyle) -> UILabel {
        let value = UILabel(); value.text = text; value.numberOfLines = 0
        value.font = .preferredFont(forTextStyle: style); value.adjustsFontForContentSizeCategory = true
        value.textColor = NativeAppearance.ink
        return value
    }

    private func render() {
        guard isViewLoaded else { return }
        let allRows = snapshot?.displayRows(drink: drink.code, band: band) ?? []
        rows = Array(allRows.prefix(200))
        featuredRows = area == nil || busy ? [] : DiscoveryFeaturedSelection.rows(from: rows)
        configureFeatured(width: max(0, tableView.bounds.width - 40))
        var selectorConfiguration = drinkSelector.configuration ?? .bordered()
        selectorConfiguration.title = drink.name
        drinkSelector.configuration = selectorConfiguration
        drinkSelector.accessibilityValue = drink.name
        drinkSelector.menu = UIMenu(title: "Scegli cosa bere", children: DrinkCategory.all.map { category in
            UIAction(title: category.name, state: category == drink ? .on : .off) { [weak self] _ in
                self?.selectDrink(category.code)
            }
        })
        if area == nil {
            statusLabel.text = "Apri Mappa, scegli una città o avvicina la mappa, poi torna su Scopri per confrontare i prezzi in quella zona."
            statusLabel.accessibilityIdentifier = "discovery.chooseArea"
        } else if busy {
            statusLabel.text = "Caricamento dei prezzi della zona…"
            statusLabel.accessibilityIdentifier = "discovery.loading"
        } else if let snapshot {
            let suffix = allRows.count > 200 ? " Mostrati i primi 200 prezzi." : ""
            if snapshot.unavailableCells.count == snapshot.area.cells.count && snapshot.venues.isEmpty &&
                snapshot.europe?.venues.isEmpty != false && snapshot.menu.isEmpty {
                statusLabel.text = "Prezzi della zona non disponibili. Controlla la connessione, poi apri Altre opzioni e scegli Ricarica."
                statusLabel.accessibilityIdentifier = "discovery.unavailable"
            } else if !snapshot.partialCells.isEmpty {
                statusLabel.text = "\(allRows.count) prezzi per \(drink.name). Alcune parti della zona non sono disponibili: scegli Ricarica in Altre opzioni.\(suffix)"
                statusLabel.accessibilityIdentifier = "discovery.partial"
            } else if allRows.isEmpty {
                statusLabel.text = "Nessun prezzo disponibile per \(drink.name) · \(band.name) nei dati caricati di questa zona. Prova un altro drink o una zona diversa nella mappa."
                statusLabel.accessibilityIdentifier = "discovery.empty"
            } else {
                statusLabel.text = "\(allRows.count) prezzi per \(drink.name) · \(band.name).\(suffix)"
                statusLabel.accessibilityIdentifier = "discovery.loaded"
            }
        } else {
            statusLabel.text = "Apri Altre opzioni e scegli Ricarica per cercare i prezzi vicino al centro della mappa."
            statusLabel.accessibilityIdentifier = "discovery.unavailable"
        }
        tableView.reloadData(); view.setNeedsLayout()
        onReloadMenuChanged?()
    }

    func selectDrink(_ code: String) {
        guard let category = DrinkCategory.all.first(where: { $0.code == code }) else { return }
        drink = category; render()
    }
    @objc private func bandChanged() { band = bands.selectedBand; render() }
    @objc private func showMap() { onMap() }
    private func configureFeatured(width: CGFloat) {
        featuredWidth = width
        featuredHeading.isHidden = featuredRows.isEmpty
        featuredStrip.configure(rows: featuredRows, category: drink, availableWidth: width,
                                traits: traitCollection, target: self, action: #selector(openFeatured(_:)))
    }
    @objc private func openFeatured(_ sender: UIControl) {
        guard canRead, featuredRows.indices.contains(sender.tag),
              let url = SavedVenuePolicy.canonicalURL(featuredRows[sender.tag].url) else { return }
        onOpen(url)
    }
    @objc private func appDeactivated(_ notification: Notification) { lifecycleActive = false; retire() }
    @objc private func appActivated(_ notification: Notification) { lifecycleActive = true; refresh() }
    @objc private func sceneDeactivated(_ notification: Notification) {
        guard let scene = notification.object as? UIWindowScene, scene === viewIfLoaded?.window?.windowScene else { return }
        lifecycleActive = false; retire()
    }
    @objc private func sceneActivated(_ notification: Notification) {
        guard let scene = notification.object as? UIWindowScene, scene === viewIfLoaded?.window?.windowScene else { return }
        lifecycleActive = true; refresh()
    }

    override func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int { rows.count }
    override func tableView(_ tableView: UITableView, titleForHeaderInSection section: Int) -> String? { rows.isEmpty ? nil : "I più convenienti qui · per valuta e formato" }
    override func tableView(_ tableView: UITableView, titleForFooterInSection section: Int) -> String? {
        "I prezzi da menu qui sono un campione per drink: apri il locale per vedere il listino disponibile. Valute e formati diversi non sono confrontabili; i prezzi italiani precedenti non dichiarano il formato. Prezzi nella zona del centro mappa, non una classifica personale. Le distanze sono dal centro della mappa. Mappa e prezzi richiedono internet."
    }

    override func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        guard let cell = tableView.dequeueReusableCell(withIdentifier: "discoveryVenue", for: indexPath) as? DiscoveryVenueCell else {
            return UITableViewCell()
        }
        let row = rows[indexPath.row]
        let metres = snapshot?.area.distance(latitude: row.latitude, longitude: row.longitude) ?? 0
        let distance = metres < 1000 ? "\(Int(metres.rounded())) m" : String(format: "%.1f km", metres / 1000)
        let rank = rows.prefix(indexPath.row + 1).filter { $0.price.discoveryGroup == row.price.discoveryGroup }.count
        cell.configure(row: row, category: drink, band: band, rank: rank, distance: distance,
                       today: ComparisonJSON.today(), traits: traitCollection)
        cell.accessibilityIdentifier = "discovery.venue.\(row.key)"
        switch row.price {
        case .legacy: break
        case .europe, .menuV2: cell.accessibilityIdentifier = "discovery.venue.\(row.key).\(row.price.group)"
        }
        return cell
    }

    override func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        guard canRead, rows.indices.contains(indexPath.row),
              let url = SavedVenuePolicy.canonicalURL(rows[indexPath.row].url) else { return }
        onOpen(url)
    }
}
