import UIKit

/// A single native choice: the drink and price band at this verified venue.
final class FavouriteSaveChooser: UITableViewController {
    let venue: SavedVenue
    var onChoose: ((String, ComparisonBand) -> Void)?
    var onCancel: (() -> Void)?
    private var chosenDrink: DrinkCategory?
    let bandControl = UISegmentedControl(items: ["Normale", "Happy hour"])

    init(venue: SavedVenue) {
        self.venue = venue
        super.init(style: .insetGrouped)
    }
    required init?(coder: NSCoder) { return nil }

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "Salva un drink"
        NativeAppearance.configure(navigationController)
        NativeAppearance.configure(tableView)
        tableView.accessibilityIdentifier = "favorites.saveChooser"
        tableView.rowHeight = UITableView.automaticDimension
        tableView.estimatedRowHeight = 56
        tableView.register(UITableViewCell.self, forCellReuseIdentifier: "choice")
        navigationItem.leftBarButtonItem = UIBarButtonItem(title: "Annulla", style: .plain, target: self, action: #selector(cancel))
        let save = UIBarButtonItem(title: "Salva", style: .done, target: self, action: #selector(save))
        save.accessibilityIdentifier = "favorites.saveDrink"
        navigationItem.rightBarButtonItem = save
        bandControl.selectedSegmentIndex = 0
        bandControl.accessibilityIdentifier = "favorites.saveBand"
    }

    override func numberOfSections(in tableView: UITableView) -> Int { 1 }
    override func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int { DrinkCategory.all.count }
    override func tableView(_ tableView: UITableView, titleForHeaderInSection section: Int) -> String? {
        "Scegli cosa bere da \(venue.label)"
    }
    override func tableView(_ tableView: UITableView, viewForFooterInSection section: Int) -> UIView? {
        let footer = UIView()
        let stack = UIStackView(arrangedSubviews: [bandControl])
        stack.translatesAutoresizingMaskIntoConstraints = false
        footer.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: footer.topAnchor, constant: 12),
            stack.bottomAnchor.constraint(equalTo: footer.bottomAnchor, constant: -12),
            stack.leadingAnchor.constraint(equalTo: footer.leadingAnchor, constant: 16),
            stack.trailingAnchor.constraint(equalTo: footer.trailingAnchor, constant: -16)
        ])
        return footer
    }
    override func tableView(_ tableView: UITableView, heightForFooterInSection section: Int) -> CGFloat { 72 }
    override func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let category = DrinkCategory.all[indexPath.row]
        let cell = tableView.dequeueReusableCell(withIdentifier: "choice", for: indexPath)
        var content = cell.defaultContentConfiguration()
        content.text = category.name
        content.textProperties.font = .preferredFont(forTextStyle: .body)
        cell.contentConfiguration = content
        cell.backgroundConfiguration = NativeAppearance.card()
        cell.accessoryType = category.code == chosenDrink?.code ? .checkmark : .none
        cell.accessibilityIdentifier = "favorites.saveDrink.\(category.code)"
        cell.accessibilityTraits = [.button]
        return cell
    }
    override func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        chosenDrink = DrinkCategory.all[indexPath.row]
        tableView.reloadData()
    }
    override func tableView(_ tableView: UITableView, titleForFooterInSection section: Int) -> String? { nil }
    @objc func save() {
        guard let chosenDrink else {
            let alert = UIAlertController(title: "Scegli un drink", message: "Seleziona il drink da salvare in questo locale.", preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "OK", style: .default))
            present(alert, animated: true)
            return
        }
        onChoose?(chosenDrink.code, bandControl.selectedSegmentIndex == 1 ? .happyHour : .normal)
    }
    @objc private func cancel() { onCancel?(); dismiss(animated: true) }
    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        if isBeingDismissed || navigationController?.isBeingDismissed == true { onCancel?() }
    }
}

/// Retain one explicit save intent through its read, chooser and local write.
@MainActor final class FavouriteSaveCapture {
    struct Context: Equatable { let id: UUID; let document: URL; let venue: SavedVenue }
    private var pending: Context?
    var isPending: Bool { pending != nil }
    func begin(document: URL, venue: SavedVenue) -> Context {
        let value = Context(id: UUID(), document: document, venue: venue); pending = value; return value
    }
    func matches(_ value: Context, currentURL: URL?, active: Bool) -> Bool {
        pending == value && currentURL == value.document && active
    }
    func consume(_ value: Context, currentURL: URL?, active: Bool) -> Bool {
        guard pending == value else { return false }
        pending = nil; return currentURL == value.document && active
    }
    func invalidate() { pending = nil }
}
