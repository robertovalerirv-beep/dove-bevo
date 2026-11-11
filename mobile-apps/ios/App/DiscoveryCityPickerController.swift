import UIKit

/// Native city navigation for Scopri. The list is rebuilt from published map
/// data each time it opens; it never posts a venue, price, or location.
final class DiscoveryCityPickerController: UITableViewController, UISearchResultsUpdating {
    private let directory: DiscoveryCityDirectoryServing
    private let onSelect: (DiscoveryCity) -> Void
    private let selected: DiscoveryCity?
    private var request: RecommendationRequest?
    private var generation = UUID()
    private var result: DiscoveryCityDirectoryResult?
    private var italian: [DiscoveryCity] = []
    private var european: [DiscoveryCity] = []
    private var loading = false
    private var failed = false
    private let search = UISearchController(searchResultsController: nil)

    init(directory: DiscoveryCityDirectoryServing, selected: DiscoveryCity?, onSelect: @escaping (DiscoveryCity) -> Void) {
        self.directory = directory; self.selected = selected; self.onSelect = onSelect
        super.init(style: .insetGrouped)
        title = "Scegli città"
    }

    required init?(coder: NSCoder) { return nil }
    deinit { request?.cancel() }

    override func viewDidLoad() {
        super.viewDidLoad()
        NativeAppearance.configure(navigationController)
        NativeAppearance.configure(tableView)
        tableView.accessibilityIdentifier = "discovery.cityList"
        tableView.rowHeight = UITableView.automaticDimension
        tableView.estimatedRowHeight = 56
        navigationItem.leftBarButtonItem = UIBarButtonItem(title: "Annulla", style: .plain, target: self, action: #selector(cancelPicker))
        search.searchBar.placeholder = "Cerca una città"
        search.obscuresBackgroundDuringPresentation = false
        search.searchResultsUpdater = self
        navigationItem.searchController = search
        navigationItem.hidesSearchBarWhenScrolling = false
        definesPresentationContext = true
        loadCities()
    }

    @objc private func cancelPicker() { dismiss(animated: true) }
    @objc private func retry() { loadCities() }

    func loadCities() {
        request?.cancel(); request = nil
        let token = UUID(); generation = token
        loading = true; failed = false; result = nil
        filterAndRender()
        let handle = directory.load { [weak self] response in
            guard let self, self.generation == token else { return }
            self.request = nil; self.loading = false
            switch response {
            case .success(let value): self.result = value; self.failed = false
            case .failure: self.result = nil; self.failed = true
            }
            self.filterAndRender()
        }
        if generation == token && loading { request = handle } else { handle.cancel() }
    }

    func updateSearchResults(for searchController: UISearchController) { filterAndRender() }

    private func filterAndRender() {
        guard isViewLoaded else { return }
        let query = search.searchBar.text?.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: Locale(identifier: "it_IT"))
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let matches: (DiscoveryCity) -> Bool = { city in
            query.isEmpty || city.name.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: Locale(identifier: "it_IT")).contains(query)
        }
        italian = result?.italian.filter(matches) ?? []
        european = result?.european.filter(matches) ?? []
        navigationItem.rightBarButtonItem = failed || (result != nil && italian.isEmpty && european.isEmpty && query.isEmpty)
            ? UIBarButtonItem(title: "Riprova", style: .plain, target: self, action: #selector(retry)) : nil
        if loading || failed || (italian.isEmpty && european.isEmpty) {
            let label = UILabel(frame: tableView.bounds)
            label.numberOfLines = 0; label.textAlignment = .center
            label.font = .preferredFont(forTextStyle: .body)
            label.adjustsFontForContentSizeCategory = true
            label.textColor = NativeAppearance.muted
            label.text = loading ? "Caricamento città…" : failed ? "Città non disponibili. Controlla la connessione e scegli Riprova." :
                query.isEmpty ? "Nessuna città disponibile." : "Nessuna città corrisponde alla ricerca."
            label.accessibilityIdentifier = loading ? "discovery.cityLoading" : failed ? "discovery.cityError" : "discovery.cityEmpty"
            tableView.backgroundView = label
        } else { tableView.backgroundView = nil }
        tableView.reloadData()
    }

    override func numberOfSections(in tableView: UITableView) -> Int { 2 }
    override func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        section == 0 ? italian.count : european.count
    }
    override func tableView(_ tableView: UITableView, titleForHeaderInSection section: Int) -> String? {
        let count = section == 0 ? italian.count : european.count
        guard count > 0 else { return nil }
        return section == 0 ? "Città italiane" : "Città europee"
    }
    override func tableView(_ tableView: UITableView, titleForFooterInSection section: Int) -> String? {
        section == 1 && result?.europeanAvailable == false
            ? "Le città europee non sono disponibili ora. Riapri la scelta della città per riprovare." : nil
    }
    override func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let city = indexPath.section == 0 ? italian[indexPath.row] : european[indexPath.row]
        let cell = UITableViewCell(style: .subtitle, reuseIdentifier: nil)
        cell.textLabel?.text = city.name
        cell.textLabel?.font = .preferredFont(forTextStyle: .body)
        cell.textLabel?.adjustsFontForContentSizeCategory = true
        cell.detailTextLabel?.text = city.countryName
        cell.detailTextLabel?.font = .preferredFont(forTextStyle: .caption1)
        cell.detailTextLabel?.adjustsFontForContentSizeCategory = true
        cell.accessoryType = city == selected ? .checkmark : .disclosureIndicator
        cell.accessibilityIdentifier = "discovery.city.\(city.id)"
        cell.accessibilityLabel = "\(city.name), \(city.countryName)"
        cell.accessibilityHint = "Mostra i prezzi dei drink nella zona centrale di \(city.name)"
        return cell
    }
    override func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        let city = indexPath.section == 0 ? italian[indexPath.row] : european[indexPath.row]
        guard city.area != nil else { return }
        onSelect(city)
        dismiss(animated: true)
    }
}
