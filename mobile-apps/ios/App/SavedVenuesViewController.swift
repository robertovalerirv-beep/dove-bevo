import UIKit

/// The list leaves the browser controller and its WebView alive underneath it.
final class SavedVenuesViewController: UITableViewController {
    private let store: SavedVenueStore
    private let onOpen: (URL) -> Void
    private var venues: [SavedVenue] = []
    private var statusMessage: String?

    init(store: SavedVenueStore, onOpen: @escaping (URL) -> Void) {
        self.store = store
        self.onOpen = onOpen
        super.init(style: .insetGrouped)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "Preferiti"
        tableView.accessibilityIdentifier = "savedVenues.list"
        tableView.register(UITableViewCell.self, forCellReuseIdentifier: "venue")
        tableView.rowHeight = UITableView.automaticDimension
        tableView.estimatedRowHeight = 72
        tableView.sectionHeaderHeight = UITableView.automaticDimension
        tableView.estimatedSectionHeaderHeight = 96
        editButtonItem.title = "Rimuovi"
        editButtonItem.accessibilityLabel = "Rimuovi preferiti"
        editButtonItem.accessibilityIdentifier = "savedVenues.edit"
        reloadVenues()
    }

    @objc private func reloadVenues() {
        do {
            let loaded = try store.load()
            venues = loaded
            statusMessage = venues.isEmpty ? "Non hai ancora preferiti. Apri un locale nella mappa e scegli «Salva nei preferiti» da Altre opzioni." : nil
            navigationItem.rightBarButtonItem = editButtonItem
            editButtonItem.isEnabled = !venues.isEmpty
        } catch {
            statusMessage = "Non riesco a leggere i locali salvati. I dati non sono stati modificati. Riprova."
            let retry = UIBarButtonItem(title: "Riprova", style: .plain, target: self, action: #selector(reloadVenues))
            retry.accessibilityIdentifier = "savedVenues.retry"
            navigationItem.rightBarButtonItem = retry
        }
        tableView.reloadData()
    }

    override func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int { venues.count }

    override func tableView(_ tableView: UITableView, titleForHeaderInSection section: Int) -> String? { statusMessage }

    override func setEditing(_ editing: Bool, animated: Bool) {
        super.setEditing(editing, animated: animated)
        editButtonItem.title = editing ? "Fine" : "Rimuovi"
        editButtonItem.accessibilityLabel = editing ? "Fine" : "Rimuovi preferiti"
    }

    override func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "venue", for: indexPath)
        let venue = venues[indexPath.row]
        var content = cell.defaultContentConfiguration()
        content.text = venue.label
        content.secondaryText = "dovebevo.com"
        content.textProperties.font = .preferredFont(forTextStyle: .body)
        content.textProperties.numberOfLines = 0
        content.secondaryTextProperties.font = .preferredFont(forTextStyle: .footnote)
        content.secondaryTextProperties.numberOfLines = 0
        cell.contentConfiguration = content
        cell.accessoryType = .disclosureIndicator
        cell.accessibilityIdentifier = "savedVenue.\(venue.url.lastPathComponent)"
        cell.accessibilityLabel = venue.label
        cell.accessibilityHint = "Apre il locale. Mappa e prezzi richiedono internet."
        return cell
    }

    override func tableView(_ tableView: UITableView, titleForFooterInSection section: Int) -> String? {
        "I preferiti sono privati e salvati solo in questa app: non aggiungono locali o prezzi al sito. La lista è disponibile offline; mappa e prezzi richiedono internet. Puoi rimuovere un preferito con Rimuovi o scorrendo la riga."
    }

    override func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        guard venues.indices.contains(indexPath.row),
              let url = SavedVenuePolicy.canonicalURL(venues[indexPath.row].url) else { return }
        onOpen(url)
    }

    override func tableView(_ tableView: UITableView, canEditRowAt indexPath: IndexPath) -> Bool { true }

    override func tableView(_ tableView: UITableView, titleForDeleteConfirmationButtonForRowAt indexPath: IndexPath) -> String? { "Rimuovi" }

    override func tableView(_ tableView: UITableView, commit editingStyle: UITableViewCell.EditingStyle, forRowAt indexPath: IndexPath) {
        guard editingStyle == .delete, venues.indices.contains(indexPath.row) else { return }
        do {
            try store.remove(url: venues[indexPath.row].url)
            venues.remove(at: indexPath.row)
            tableView.deleteRows(at: [indexPath], with: .automatic)
            if venues.isEmpty {
                setEditing(false, animated: true)
                reloadVenues()
            }
            UIAccessibility.post(notification: .announcement, argument: "Locale rimosso dai salvati")
        } catch {
            let alert = UIAlertController(title: "Locale non rimosso", message: "Non riesco a salvare la modifica. La lista precedente è stata mantenuta. Riprova.", preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "Chiudi", style: .cancel))
            present(alert, animated: true)
        }
    }
}
