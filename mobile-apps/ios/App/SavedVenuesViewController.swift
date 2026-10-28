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
        title = "Locali salvati"
        tableView.accessibilityIdentifier = "savedVenues.list"
        tableView.register(UITableViewCell.self, forCellReuseIdentifier: "venue")
        tableView.rowHeight = UITableView.automaticDimension
        tableView.estimatedRowHeight = 72
        tableView.sectionHeaderHeight = UITableView.automaticDimension
        tableView.estimatedSectionHeaderHeight = 96
        editButtonItem.title = "Modifica"
        editButtonItem.accessibilityLabel = "Modifica locali salvati"
        editButtonItem.accessibilityIdentifier = "savedVenues.edit"
        reloadVenues()
    }

    @objc private func reloadVenues() {
        do {
            let loaded = try store.load()
            venues = loaded
            statusMessage = venues.isEmpty ? "Non hai ancora salvato un locale. Apri un bar nella mappa e scegli «Salva locale» da Altre opzioni." : nil
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
        editButtonItem.title = editing ? "Fine" : "Modifica"
        editButtonItem.accessibilityLabel = editing ? "Fine" : "Modifica locali salvati"
    }

    override func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "venue", for: indexPath)
        let venue = venues[indexPath.row]
        var content = cell.defaultContentConfiguration()
        content.text = venue.label
        content.secondaryText = venue.url.path
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
        "I link e i nomi scelti sono salvati nell'app. La lista è disponibile offline; per aprire la mappa e vedere i prezzi serve internet. Puoi rimuovere un locale con Modifica o scorrendo la riga."
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

/// An explicit native form keeps validation/storage errors visible without
/// dismissing the user's entry or falsely reporting a successful save.
final class SaveVenueViewController: UIViewController, UITextFieldDelegate {
    private let url: URL
    private let store: SavedVenueStore
    private let onSaved: () -> Void
    private let nameField = UITextField()
    private let errorLabel = UILabel()
    private var hasSaved = false

    init(url: URL, store: SavedVenueStore, onSaved: @escaping () -> Void) {
        self.url = url
        self.store = store
        self.onSaved = onSaved
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "Salva locale"
        view.backgroundColor = .systemGroupedBackground
        navigationItem.leftBarButtonItem = UIBarButtonItem(title: "Annulla", style: .plain, target: self, action: #selector(cancel))
        navigationItem.leftBarButtonItem?.accessibilityIdentifier = "savedVenue.cancel"
        navigationItem.rightBarButtonItem = UIBarButtonItem(title: "Salva", style: .done, target: self, action: #selector(save))
        navigationItem.rightBarButtonItem?.accessibilityIdentifier = "savedVenue.confirm"
        let explanation = UILabel()
        explanation.text = "Scegli un nome facoltativo (massimo 80 caratteri). Verrà salvato solo il link di questo locale: mappa e prezzi richiedono internet."
        explanation.font = .preferredFont(forTextStyle: .body)
        explanation.adjustsFontForContentSizeCategory = true
        explanation.numberOfLines = 0
        nameField.borderStyle = .roundedRect
        nameField.placeholder = "Locale \(url.lastPathComponent)"
        nameField.accessibilityLabel = "Nome del locale (facoltativo)"
        nameField.accessibilityIdentifier = "savedVenue.name"
        nameField.font = .preferredFont(forTextStyle: .body)
        nameField.adjustsFontForContentSizeCategory = true
        nameField.returnKeyType = .done
        nameField.autocorrectionType = .no
        nameField.delegate = self
        nameField.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
        if let existing = try? store.load().first(where: { $0.url == url }) { nameField.text = existing.label }
        errorLabel.font = .preferredFont(forTextStyle: .body)
        errorLabel.adjustsFontForContentSizeCategory = true
        errorLabel.numberOfLines = 0
        errorLabel.textColor = .systemRed
        errorLabel.accessibilityIdentifier = "savedVenue.error"
        errorLabel.isHidden = true
        let stack = UIStackView(arrangedSubviews: [explanation, nameField, errorLabel])
        stack.axis = .vertical
        stack.spacing = 16
        stack.translatesAutoresizingMaskIntoConstraints = false
        let scroll = UIScrollView()
        scroll.keyboardDismissMode = .interactive
        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(stack)
        view.addSubview(scroll)
        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            scroll.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            scroll.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor),
            stack.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: 24),
            stack.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor, constant: 24),
            stack.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor, constant: -24),
            stack.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -24),
            stack.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor, constant: -48)
        ])
    }

    @objc private func cancel() { navigationController?.popViewController(animated: true) }

    @objc private func save() {
        guard !hasSaved else { return }
        do {
            try store.save(url: url, label: nameField.text ?? "")
            hasSaved = true
            navigationItem.rightBarButtonItem?.isEnabled = false
            nameField.resignFirstResponder()
            onSaved()
        } catch SavedVenuePolicy.ValidationError.invalidLabel {
            showError("Usa al massimo 80 caratteri, senza tabulazioni o ritorni a capo. Il nome non è stato salvato.")
        } catch SavedVenueStore.StoreError.capacityReached {
            showError("Hai già salvato 50 locali. Rimuovine uno dalla lista prima di aggiungerne un altro.")
        } catch {
            showError("Non riesco a salvare il locale. I dati precedenti sono stati mantenuti. Riprova.")
        }
    }

    func textFieldShouldReturn(_ textField: UITextField) -> Bool { save(); return true }

    private func showError(_ message: String) {
        errorLabel.text = message
        errorLabel.isHidden = false
        UIAccessibility.post(notification: .layoutChanged, argument: errorLabel)
    }
}
