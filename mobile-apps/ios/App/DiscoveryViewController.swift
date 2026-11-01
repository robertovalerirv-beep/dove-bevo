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
    private var rows: [(venue: DiscoveryVenue, price: FavouritePrice)] = []
    private var request: RecommendationRequest?
    private var generation = UUID()
    private var visible = false
    private var lifecycleActive = true
    private var busy = false
    private var drink = DrinkCategory.all.first { $0.code == "spritz" } ?? DrinkCategory.all[0]
    private var band = ComparisonBand.normal
    private var renderedCategory: UIContentSizeCategory?
    private var drinkButtons: [UIButton] = []
    private let bands = ComparisonBandSelector()
    private let statusLabel = UILabel()
    private lazy var refreshButton = UIBarButtonItem(title: "Ricarica", style: .plain, target: self, action: #selector(refresh))
    var isDestinationSelected: (() -> Bool)?

    init(client: DiscoveryServing = DiscoveryClient(), activityCheck: (() -> Bool)? = nil,
         onOpen: @escaping (URL) -> Void, onMap: @escaping () -> Void) {
        self.client = client; self.activityCheck = activityCheck; self.onOpen = onOpen; self.onMap = onMap
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
    deinit { request?.cancel(); NotificationCenter.default.removeObserver(self) }

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "Scopri"
        NativeAppearance.configure(navigationController)
        navigationItem.largeTitleDisplayMode = .always
        navigationController?.navigationBar.prefersLargeTitles = true
        NativeAppearance.configure(tableView)
        tableView.accessibilityIdentifier = "discovery.list"
        tableView.register(UITableViewCell.self, forCellReuseIdentifier: "discoveryVenue")
        tableView.rowHeight = UITableView.automaticDimension
        tableView.estimatedRowHeight = 144
        let map = UIBarButtonItem(title: "Mappa", style: .plain, target: self, action: #selector(showMap))
        map.accessibilityIdentifier = "discovery.map"
        refreshButton.accessibilityIdentifier = "discovery.refresh"
        navigationItem.rightBarButtonItems = [map, refreshButton]
        let heading = label("Scegli cosa bere", style: .title2)
        heading.accessibilityTraits = .header
        let introduction = label("Confronta i prezzi vicino al centro dell'ultima zona aperta nella mappa.", style: .subheadline)
        introduction.textColor = NativeAppearance.muted
        let scroll = UIScrollView()
        scroll.showsHorizontalScrollIndicator = false
        scroll.accessibilityIdentifier = "discovery.drinks"
        let choices = UIStackView()
        choices.axis = .horizontal; choices.spacing = 8; choices.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(choices)
        for (index, category) in DrinkCategory.all.enumerated() {
            let button = UIButton(type: .system)
            button.tag = index
            button.accessibilityIdentifier = "discovery.drink.\(category.code)"
            button.heightAnchor.constraint(greaterThanOrEqualToConstant: 48).isActive = true
            button.widthAnchor.constraint(greaterThanOrEqualToConstant: 48).isActive = true
            button.addTarget(self, action: #selector(drinkTapped), for: .touchUpInside)
            choices.addArrangedSubview(button); drinkButtons.append(button)
        }
        NSLayoutConstraint.activate([
            choices.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor),
            choices.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor),
            choices.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: 4),
            choices.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -4),
            scroll.heightAnchor.constraint(equalTo: choices.heightAnchor, constant: 8)
        ])
        bands.accessibilityIdentifier = "discovery.band"
        bands.accessibilityLabel = "Fascia di prezzo"
        bands.addTarget(self, action: #selector(bandChanged), for: .valueChanged)
        statusLabel.numberOfLines = 0
        statusLabel.font = .preferredFont(forTextStyle: .subheadline)
        statusLabel.textColor = NativeAppearance.muted
        statusLabel.adjustsFontForContentSizeCategory = true
        let header = UIView()
        let stack = UIStackView(arrangedSubviews: [heading, introduction, scroll, bands, statusLabel])
        stack.axis = .vertical; stack.spacing = 12; stack.translatesAutoresizingMaskIntoConstraints = false
        header.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: header.topAnchor, constant: 16),
            stack.bottomAnchor.constraint(equalTo: header.bottomAnchor, constant: -16),
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
        let allRows = snapshot?.rows(drink: drink.code, band: band) ?? []
        rows = Array(allRows.prefix(200))
        for (index, button) in drinkButtons.enumerated() {
            let category = DrinkCategory.all[index], selected = category == drink
            var style = NativeAppearance.button(primary: selected, traits: traitCollection)
            if !selected { style.baseBackgroundColor = NativeAppearance.surface; style.background.strokeColor = NativeAppearance.line; style.background.strokeWidth = 1 }
            style.title = category.name; style.titleLineBreakMode = .byWordWrapping
            button.configuration = style; button.titleLabel?.numberOfLines = 0
            button.titleLabel?.adjustsFontForContentSizeCategory = true
            button.isSelected = selected; button.accessibilityTraits = selected ? [.button, .selected] : [.button]
        }
        refreshButton.isEnabled = canRead && area != nil && !busy
        if area == nil {
            statusLabel.text = "Apri Mappa, scegli una città o avvicina la mappa, poi tocca Home per confrontare i prezzi in quella zona."
            statusLabel.accessibilityIdentifier = "discovery.chooseArea"
        } else if busy {
            statusLabel.text = "Caricamento dei prezzi della zona…"
            statusLabel.accessibilityIdentifier = "discovery.loading"
        } else if let snapshot {
            let suffix = allRows.count > 200 ? " Mostrati i primi 200 prezzi." : ""
            if snapshot.unavailableCells.count == snapshot.area.cells.count && snapshot.venues.isEmpty {
                statusLabel.text = "Prezzi della zona non disponibili. Controlla la connessione e tocca Ricarica."
                statusLabel.accessibilityIdentifier = "discovery.unavailable"
            } else if !snapshot.unavailableCells.isEmpty {
                statusLabel.text = "\(allRows.count) locali con un prezzo per \(drink.name). Alcune parti della zona non sono disponibili: Ricarica per riprovare.\(suffix)"
                statusLabel.accessibilityIdentifier = "discovery.partial"
            } else if allRows.isEmpty {
                statusLabel.text = "Nessun prezzo segnalato per \(drink.name) · \(band.name) in questa zona. Prova un altro drink o una zona diversa nella mappa."
                statusLabel.accessibilityIdentifier = "discovery.empty"
            } else {
                statusLabel.text = "\(allRows.count) locali con un prezzo per \(drink.name) · \(band.name).\(suffix)"
                statusLabel.accessibilityIdentifier = "discovery.loaded"
            }
        } else {
            statusLabel.text = "Tocca Ricarica per cercare i prezzi vicino al centro della mappa."
            statusLabel.accessibilityIdentifier = "discovery.unavailable"
        }
        tableView.reloadData(); view.setNeedsLayout()
    }

    func selectDrink(_ code: String) {
        guard let category = DrinkCategory.all.first(where: { $0.code == code }) else { return }
        drink = category; render()
    }
    @objc private func drinkTapped(_ sender: UIButton) {
        guard DrinkCategory.all.indices.contains(sender.tag) else { return }
        selectDrink(DrinkCategory.all[sender.tag].code)
    }
    @objc private func bandChanged() { band = bands.selectedBand; render() }
    @objc private func showMap() { onMap() }
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
    override func tableView(_ tableView: UITableView, titleForHeaderInSection section: Int) -> String? { rows.isEmpty ? nil : "Dal prezzo più basso" }
    override func tableView(_ tableView: UITableView, titleForFooterInSection section: Int) -> String? {
        "Prezzi segnalati nella zona del centro mappa, non una classifica personale. Le distanze sono dal centro della mappa. Mappa e prezzi richiedono internet."
    }

    override func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "discoveryVenue", for: indexPath)
        let row = rows[indexPath.row]
        let amount = String(format: "%d,%02d €", row.price.cents / 100, row.price.cents % 100)
        let metres = snapshot?.area.distance(latitude: row.venue.latitude, longitude: row.venue.longitude) ?? 0
        let distance = metres < 1000 ? "\(Int(metres.rounded())) m" : String(format: "%.1f km", metres / 1000)
        let location = [row.venue.address, row.venue.city ?? ""].filter { !$0.isEmpty }.joined(separator: " · ")
        let confirmations = row.price.confirmations == 1 ? "1 conferma" : "\(row.price.confirmations) conferme"
        let old = row.price.isOld(today: ComparisonJSON.today()) ? " · Da confermare: oltre 90 giorni" : ""
        let details = "\(drink.name) · \(band.name)\n\(amount)\n\(location.isEmpty ? "" : location + "\n")\(distance) dal centro mappa\nSegnalato il \(row.price.observedOn) · \(confirmations)\(old)"
        let visual = NSMutableAttributedString(string: "\(drink.name) · \(band.name)\n", attributes: [
            .font: UIFont.preferredFont(forTextStyle: .subheadline, compatibleWith: traitCollection), .foregroundColor: NativeAppearance.muted
        ])
        visual.append(NSAttributedString(string: "\(amount)\n", attributes: [
            .font: UIFontMetrics(forTextStyle: .title2).scaledFont(for: UIFont.systemFont(ofSize: 22, weight: .bold), compatibleWith: traitCollection), .foregroundColor: NativeAppearance.ink
        ]))
        visual.append(NSAttributedString(string: "\(location.isEmpty ? "" : location + "\n")\(distance) dal centro mappa\nSegnalato il \(row.price.observedOn) · \(confirmations)\(old)", attributes: [
            .font: UIFont.preferredFont(forTextStyle: .footnote, compatibleWith: traitCollection), .foregroundColor: NativeAppearance.muted
        ]))
        var content = cell.defaultContentConfiguration()
        content.text = row.venue.name; content.secondaryAttributedText = visual
        content.textProperties.font = .preferredFont(forTextStyle: .headline, compatibleWith: traitCollection)
        content.textProperties.color = NativeAppearance.ink; content.textProperties.numberOfLines = 0
        content.secondaryTextProperties.numberOfLines = 0; content.textToSecondaryTextVerticalPadding = 8
        content.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 16, leading: 16, bottom: 16, trailing: 12)
        cell.contentConfiguration = content; cell.backgroundConfiguration = NativeAppearance.card()
        cell.accessoryType = .disclosureIndicator; cell.tintColor = NativeAppearance.muted
        cell.accessibilityIdentifier = "discovery.venue.\(row.venue.key)"
        cell.accessibilityLabel = row.venue.name; cell.accessibilityValue = details
        cell.accessibilityHint = "Apre questo locale nella mappa"
        return cell
    }

    override func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        guard canRead, rows.indices.contains(indexPath.row),
              let url = SavedVenuePolicy.canonicalURL(rows[indexPath.row].venue.url) else { return }
        onOpen(url)
    }
}
