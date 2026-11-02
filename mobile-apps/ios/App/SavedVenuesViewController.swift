import UIKit

/// Native, app-private favourites with a disposable public-price read model.
final class SavedVenuesViewController: UITableViewController {
    private let store: SavedVenueStore
    private let drinkStore: SavedDrinkStore
    private let client: FavouriteComparisonServing
    private let activityCheck: (() -> Bool)?
    private let onOpen: (URL) -> Void
    private var venues: [SavedVenue] = []
    private var rows: [FavouriteComparisonRow] = []
    private var drinks: [SavedDrink] = []
    private var drinkRows: [SavedDrinkRow] = []
    private var drinksFailed = false
    private let kindControl = UISegmentedControl(items: ["Locali", "Drink"])
    private var showingDrinks: Bool { kindControl.selectedSegmentIndex == 1 }
    private var snapshot: FavouriteComparisonSnapshot?
    private var request: RecommendationRequest?
    private var generation = UUID()
    private var visible = false
    private var lifecycleActive = true
    private var busy = false
    private var storeFailed = false
    private var drink = DrinkCategory.all[0]
    private var band = ComparisonBand.normal
    private var renderedCategory: UIContentSizeCategory?
    var isDestinationSelected: (() -> Bool)?
    private let drinkButton = UIButton(type: .system)
    private let bandControl = ComparisonBandSelector()
    private let statusLabel = UILabel()
    private lazy var refreshButton = UIBarButtonItem(title: "Ricarica", style: .plain, target: self, action: #selector(refresh))

    init(store: SavedVenueStore, drinkStore: SavedDrinkStore = SavedDrinkStore(), client: FavouriteComparisonServing = FavouriteComparisonClient(),
         activityCheck: (() -> Bool)? = nil, onOpen: @escaping (URL) -> Void) {
        self.store = store; self.drinkStore = drinkStore; self.client = client; self.activityCheck = activityCheck; self.onOpen = onOpen
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
        title = "Preferiti"
        NativeAppearance.configure(navigationController)
        NativeAppearance.configure(tableView)
        tableView.accessibilityIdentifier = "savedVenues.list"
        tableView.register(UITableViewCell.self, forCellReuseIdentifier: "venue")
        tableView.rowHeight = UITableView.automaticDimension
        tableView.estimatedRowHeight = 104
        tableView.sectionHeaderHeight = UITableView.automaticDimension
        editButtonItem.title = "Rimuovi"
        editButtonItem.accessibilityLabel = "Rimuovi preferiti"
        editButtonItem.accessibilityIdentifier = "savedVenues.edit"
        kindControl.selectedSegmentIndex = 0
        kindControl.accessibilityIdentifier = "favorites.kind"
        kindControl.addTarget(self, action: #selector(kindChanged), for: .valueChanged)
        kindControl.heightAnchor.constraint(greaterThanOrEqualToConstant: 48).isActive = true
        drinkButton.accessibilityIdentifier = "favorites.drink"
        drinkButton.titleLabel?.font = .preferredFont(forTextStyle: .body)
        drinkButton.titleLabel?.adjustsFontForContentSizeCategory = true
        drinkButton.titleLabel?.numberOfLines = 0
        drinkButton.contentHorizontalAlignment = .leading
        drinkButton.showsMenuAsPrimaryAction = true
        drinkButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 48).isActive = true
        bandControl.accessibilityIdentifier = "favorites.band"
        bandControl.accessibilityLabel = "Fascia di prezzo"
        bandControl.heightAnchor.constraint(greaterThanOrEqualToConstant: 48).isActive = true
        bandControl.addTarget(self, action: #selector(bandChanged), for: .valueChanged)
        statusLabel.numberOfLines = 0
        statusLabel.font = .preferredFont(forTextStyle: .body)
        statusLabel.textColor = NativeAppearance.muted
        statusLabel.adjustsFontForContentSizeCategory = true
        statusLabel.text = "I nomi salvati sono disponibili anche offline."
        let heading = UILabel()
        heading.text = "I tuoi preferiti"
        heading.font = .preferredFont(forTextStyle: .title2)
        heading.textColor = NativeAppearance.ink
        heading.numberOfLines = 0
        heading.adjustsFontForContentSizeCategory = true
        heading.accessibilityTraits = .header
        let introduction = UILabel()
        introduction.text = "Locali e drink salvati solo in questa app. I prezzi si aggiornano da internet."
        introduction.font = .preferredFont(forTextStyle: .subheadline)
        introduction.textColor = NativeAppearance.muted
        introduction.numberOfLines = 0
        introduction.adjustsFontForContentSizeCategory = true
        let header = UIView()
        let stack = UIStackView(arrangedSubviews: [heading, introduction, kindControl, drinkButton, bandControl, statusLabel])
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

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        reloadVenues()
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
    }

    private var canRead: Bool {
        guard visible, lifecycleActive, isDestinationSelected?() != false else { return false }
        if let activityCheck { return activityCheck() }
        guard UIApplication.shared.applicationState == .active,
              let scene = viewIfLoaded?.window?.windowScene, scene.activationState == .foregroundActive else { return false }
        if let tabs = tabBarController { return tabs.selectedViewController === navigationController }
        return navigationController?.topViewController === self
    }

    private func reloadVenues() {
        do { venues = try store.load(); storeFailed = false }
        catch { storeFailed = true }
        do { drinks = try drinkStore.load(); drinksFailed = false }
        catch { drinksFailed = true }
        render()
    }

    @objc func refresh() {
        guard canRead else { return }
        retire()
        reloadVenues()
        let selected = showingDrinks ? drinks.map(\.venue) : venues
        guard !(showingDrinks ? drinksFailed : storeFailed), !selected.isEmpty else { return }
        var seen = Set<URL>()
        let requested = selected.filter { seen.insert($0.url).inserted }
        let token = UUID(); generation = token; busy = true
        render()
        let handle = client.load(requested) { [weak self] value in
            guard let self, self.generation == token, self.busy else { return }
            guard self.canRead else { self.retire(); return }
            self.request = nil; self.busy = false; self.snapshot = value
            self.render()
        }
        if generation == token && busy { request = handle } else { handle.cancel() }
    }

    private func retire() {
        generation = UUID(); request?.cancel(); request = nil; busy = false; snapshot = nil
        if isViewLoaded { render() }
    }

    private func render() {
        guard isViewLoaded else { return }
        rows = FavouriteComparisonRow.sorted(saved: venues, snapshot: snapshot, drink: drink.code, band: band)
        drinkRows = SavedDrinkRow.rows(drinks, snapshot: snapshot)
        drinkButton.isHidden = showingDrinks; bandControl.isHidden = showingDrinks
        var picker = NativeAppearance.button(traits: traitCollection)
        picker.baseBackgroundColor = NativeAppearance.surface
        picker.background.strokeColor = NativeAppearance.line
        picker.background.strokeWidth = 1
        picker.title = "Confronta: \(drink.name)"
        picker.image = UIImage(systemName: "chevron.down")
        picker.imagePlacement = .trailing; picker.imagePadding = 8
        picker.titleLineBreakMode = .byWordWrapping
        drinkButton.configuration = picker
        drinkButton.titleLabel?.numberOfLines = 0
        drinkButton.titleLabel?.adjustsFontForContentSizeCategory = true
        drinkButton.accessibilityLabel = "Drink da confrontare: \(drink.name)"
        drinkButton.menu = UIMenu(children: DrinkCategory.all.map { category in
            UIAction(title: category.name, state: category.code == drink.code ? .on : .off) { [weak self] _ in
                self?.selectDrink(category.code)
            }
        })
        let failed = showingDrinks ? drinksFailed : storeFailed
        let empty = showingDrinks ? drinks.isEmpty : venues.isEmpty
        editButtonItem.isEnabled = !empty && !failed
        refreshButton.isEnabled = canRead && !busy
        refreshButton.title = failed ? "Riprova" : "Ricarica"
        refreshButton.accessibilityIdentifier = failed ? "savedVenues.retry" : "favorites.refresh"
        navigationItem.rightBarButtonItems = failed ? [refreshButton] : [editButtonItem, refreshButton]
        if failed {
            statusLabel.text = "Non riesco a leggere i preferiti. I dati non sono stati modificati. Riprova."
            statusLabel.accessibilityIdentifier = "favorites.unavailable"
        } else if empty {
            statusLabel.text = showingDrinks ? "Non hai ancora drink salvati. Apri un locale con un prezzo visibile e scegli Salva drink dalla barra in basso." : "Non hai ancora preferiti. Apri un locale nella mappa e tocca Salva nei preferiti."
            statusLabel.accessibilityIdentifier = "favorites.empty"
        } else if busy {
            statusLabel.text = "Caricamento dei prezzi segnalati…"
            statusLabel.accessibilityIdentifier = "favorites.loading"
        } else if let snapshot {
            statusLabel.text = snapshot.unavailable.isEmpty ? "Prezzi segnalati aggiornati. Ogni prezzo mostra la sua data." : "Alcuni locali non sono disponibili. Tocca Ricarica per riprovare."
            statusLabel.accessibilityIdentifier = snapshot.unavailable.isEmpty ? "favorites.loaded" : "favorites.partial"
        } else {
            statusLabel.text = "I nomi salvati sono disponibili offline. Ricarica per confrontare i prezzi."
            statusLabel.accessibilityIdentifier = "favorites.unavailable"
        }
        tableView.reloadData(); view.setNeedsLayout()
    }

    func selectDrink(_ code: String) {
        guard let category = DrinkCategory.all.first(where: { $0.code == code }) else { return }
        drink = category; render()
    }

    func selectSavedDrinks(_ selected: Bool) {
        guard showingDrinks != selected else { return }
        kindControl.selectedSegmentIndex = selected ? 1 : 0
        setEditing(false, animated: false)
        retire(); reloadVenues(); refresh()
    }
    @objc private func kindChanged() {
        setEditing(false, animated: false); retire(); reloadVenues(); refresh()
    }

    @objc private func bandChanged() {
        band = bandControl.selectedBand; render()
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

    override func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int { showingDrinks ? drinkRows.count : rows.count }
    override func setEditing(_ editing: Bool, animated: Bool) {
        super.setEditing(editing, animated: animated)
        editButtonItem.title = editing ? "Fine" : "Rimuovi"
        editButtonItem.accessibilityLabel = editing ? "Fine" : "Rimuovi preferiti"
    }

    override func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "venue", for: indexPath)
        let savedDrink = showingDrinks ? drinkRows[indexPath.row].saved : nil
        let row = showingDrinks ? drinkRows[indexPath.row].comparison : rows[indexPath.row]
        let category = savedDrink?.category ?? drink
        let priceBand = savedDrink?.band ?? band
        let details: String
        let visual = NSMutableAttributedString(string: "\(category.name) · \(priceBand.name)\n", attributes: [
            .font: UIFont.preferredFont(forTextStyle: .subheadline, compatibleWith: traitCollection), .foregroundColor: NativeAppearance.muted
        ])
        if let price = row.displayPrice {
            let amount = price.amount
            let evidence = price.details(today: ComparisonJSON.today())
            details = "\(amount) · \(priceBand.name)\n\(evidence)"
            visual.append(NSAttributedString(string: "\(amount)\n", attributes: [
                .font: UIFontMetrics(forTextStyle: .title2).scaledFont(for: UIFont.systemFont(ofSize: 22, weight: .bold), compatibleWith: traitCollection), .foregroundColor: NativeAppearance.ink
            ]))
            visual.append(NSAttributedString(string: evidence, attributes: [
                .font: UIFont.preferredFont(forTextStyle: .footnote, compatibleWith: traitCollection), .foregroundColor: NativeAppearance.muted
            ]))
        } else if busy { details = "Caricamento prezzi…" }
        else if row.unavailable { details = "Prezzo non disponibile" }
        else { details = "Nessun prezzo segnalato per \(category.name) · \(priceBand.name)" }
        if row.displayPrice == nil {
            visual.append(NSAttributedString(string: details, attributes: [
                .font: UIFont.preferredFont(forTextStyle: .body, compatibleWith: traitCollection), .foregroundColor: NativeAppearance.muted
            ]))
        }
        var content = cell.defaultContentConfiguration()
        content.text = row.name; content.secondaryAttributedText = visual
        content.textProperties.font = .preferredFont(forTextStyle: .headline, compatibleWith: traitCollection); content.textProperties.numberOfLines = 0
        content.textProperties.color = NativeAppearance.ink
        content.secondaryTextProperties.font = .preferredFont(forTextStyle: .body, compatibleWith: traitCollection); content.secondaryTextProperties.numberOfLines = 0
        content.textToSecondaryTextVerticalPadding = 8
        content.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 20, leading: 16, bottom: 20, trailing: 12)
        cell.backgroundConfiguration = NativeAppearance.card()
        cell.tintColor = NativeAppearance.muted
        cell.contentConfiguration = content; cell.accessoryType = .disclosureIndicator
        cell.accessibilityIdentifier = "savedVenue.\(row.saved.url.lastPathComponent)"
        if let price = row.europePrice { cell.accessibilityIdentifier = "savedVenue.\(row.saved.url.lastPathComponent).\(price.group)" }
        if let savedDrink { cell.accessibilityIdentifier = "savedDrink.\(savedDrink.identity).\(row.displayPrice?.group ?? "unavailable")" }
        cell.accessibilityLabel = savedDrink == nil ? row.name : "\(category.name) · \(priceBand.name) · \(row.name)"
        cell.accessibilityValue = "\(category.name), \(details)"
        cell.accessibilityHint = "Apre il locale nella mappa"
        return cell
    }

    override func tableView(_ tableView: UITableView, titleForFooterInSection section: Int) -> String? {
        if showingDrinks { return "Ogni drink conserva la sua fascia Normale o Happy hour. Tutti i formati e le valute disponibili sono mostrati separatamente. I prezzi si ricaricano da internet e non sono salvati nel preferito. Rimuovere un drink non rimuove il locale o altri drink. Preferiti privati in questa app." }
        return "Prezzi ordinati per valuta e formato; valute o volumi diversi non sono confrontabili. I prezzi italiani precedenti non dichiarano il formato. I preferiti sono privati e salvati in questa app. L'elenco è disponibile offline; mappa e prezzi richiedono internet. Rimuovi una voce con Rimuovi o scorrendo la riga."
    }

    override func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        if showingDrinks {
            guard drinkRows.indices.contains(indexPath.row) else { return }
            let value = drinkRows[indexPath.row].saved
            guard let target = MobileEntry.drinkDocument(value.venue.url, drink: value.drink, band: value.band) else { return }
            onOpen(target); return
        }
        guard rows.indices.contains(indexPath.row), let url = SavedVenuePolicy.canonicalURL(rows[indexPath.row].saved.url) else { return }
        onOpen(url)
    }
    override func tableView(_ tableView: UITableView, canEditRowAt indexPath: IndexPath) -> Bool { true }
    override func tableView(_ tableView: UITableView, titleForDeleteConfirmationButtonForRowAt indexPath: IndexPath) -> String? { "Rimuovi" }
    override func tableView(_ tableView: UITableView, commit editingStyle: UITableViewCell.EditingStyle, forRowAt indexPath: IndexPath) {
        guard editingStyle == .delete else { return }
        if showingDrinks {
            guard drinkRows.indices.contains(indexPath.row) else { return }
            do {
                let value = drinkRows[indexPath.row].saved
                try drinkStore.remove(value); retire(); drinks.removeAll { $0.identity == value.identity }
                if drinks.isEmpty { setEditing(false, animated: true) }
                render(); UIAccessibility.post(notification: .announcement, argument: "Drink rimosso dai preferiti")
            } catch {
                let alert = UIAlertController(title: "Drink non rimosso", message: "La lista precedente è stata mantenuta. Riprova.", preferredStyle: .alert)
                alert.addAction(UIAlertAction(title: "Chiudi", style: .cancel)); present(alert, animated: true)
            }
            return
        }
        guard rows.indices.contains(indexPath.row) else { return }
        do {
            let url = rows[indexPath.row].saved.url
            try store.remove(url: url)
            retire(); venues.removeAll { $0.url == url }
            if venues.isEmpty { setEditing(false, animated: true) }
            render()
            UIAccessibility.post(notification: .announcement, argument: "Locale rimosso dai preferiti")
        } catch {
            let alert = UIAlertController(title: "Locale non rimosso", message: "La lista precedente è stata mantenuta. Riprova.", preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "Chiudi", style: .cancel)); present(alert, animated: true)
        }
    }
}


/// Native buttons keep the two choices readable at accessibility text sizes.
final class ComparisonBandSelector: UIControl {
    private(set) var selectedBand = ComparisonBand.normal
    private let stack = UIStackView()
    private var buttons: [UIButton] = []
    private var renderedCategory: UIContentSizeCategory?

    override init(frame: CGRect) {
        super.init(frame: frame)
        isAccessibilityElement = false
        stack.axis = .horizontal; stack.spacing = 8; stack.distribution = .fillEqually
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: topAnchor), stack.bottomAnchor.constraint(equalTo: bottomAnchor),
            stack.leadingAnchor.constraint(equalTo: leadingAnchor), stack.trailingAnchor.constraint(equalTo: trailingAnchor)
        ])
        for band in ComparisonBand.allCases {
            let button = UIButton(type: .system)
            button.tag = band.rawValue
            button.accessibilityIdentifier = band == .normal ? "favorites.band.normal" : "favorites.band.happyHour"
            button.accessibilityLabel = "\(band.name), fascia di prezzo"
            button.titleLabel?.font = .preferredFont(forTextStyle: .body)
            button.titleLabel?.adjustsFontForContentSizeCategory = true
            button.titleLabel?.numberOfLines = 0
            button.heightAnchor.constraint(greaterThanOrEqualToConstant: 48).isActive = true
            button.addTarget(self, action: #selector(selectBand), for: .touchUpInside)
            stack.addArrangedSubview(button); buttons.append(button)
        }
        accessibilityElements = buttons
        updateButtons()
    }
    required init?(coder: NSCoder) { return nil }

    override func layoutSubviews() {
        if renderedCategory != traitCollection.preferredContentSizeCategory {
            renderedCategory = traitCollection.preferredContentSizeCategory
            updateButtons()
        }
        let axis: NSLayoutConstraint.Axis = traitCollection.preferredContentSizeCategory.isAccessibilityCategory ? .vertical : .horizontal
        if stack.axis != axis { stack.axis = axis }
        super.layoutSubviews()
    }

    @objc private func selectBand(_ sender: UIButton) {
        guard let band = ComparisonBand(rawValue: sender.tag) else { return }
        selectedBand = band; updateButtons(); sendActions(for: .valueChanged)
    }

    private func updateButtons() {
        for button in buttons {
            guard let band = ComparisonBand(rawValue: button.tag) else { continue }
            let selected = band == selectedBand
            var style = NativeAppearance.button(primary: selected, traits: traitCollection)
            if !selected {
                style.baseBackgroundColor = NativeAppearance.surface
                style.background.strokeColor = NativeAppearance.line
                style.background.strokeWidth = 1
            }
            style.title = band.name; style.titleLineBreakMode = .byWordWrapping
            style.image = selected ? UIImage(systemName: "checkmark") : nil
            style.imagePadding = 6
            button.configuration = style
            button.titleLabel?.numberOfLines = 0
            button.titleLabel?.adjustsFontForContentSizeCategory = true
            button.isSelected = selected
            button.accessibilityTraits = selected ? [.button, .selected] : [.button]
        }
    }
}
