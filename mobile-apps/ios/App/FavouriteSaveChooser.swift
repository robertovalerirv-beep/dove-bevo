import UIKit

final class FavouriteSaveChooser: UITableViewController {
    enum Choice { case venue, drink }
    let venue: SavedVenue
    let price: PriceShareSnapshot?
    var onChoose: ((Choice) -> Void)?
    var onCancel: (() -> Void)?

    init(venue: SavedVenue, price: PriceShareSnapshot?) {
        self.venue = venue; self.price = price
        super.init(style: .insetGrouped)
    }
    required init?(coder: NSCoder) { return nil }
    override func viewDidLoad() {
        super.viewDidLoad()
        title = "Salva nei preferiti"
        NativeAppearance.configure(navigationController); NativeAppearance.configure(tableView)
        tableView.accessibilityIdentifier = "favorites.saveChooser"
        tableView.rowHeight = UITableView.automaticDimension; tableView.estimatedRowHeight = 96
        tableView.register(UITableViewCell.self, forCellReuseIdentifier: "choice")
        navigationItem.leftBarButtonItem = UIBarButtonItem(title: "Annulla", style: .plain, target: self, action: #selector(cancel))
    }
    override func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int { 2 }
    override func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "choice", for: indexPath)
        var content = cell.defaultContentConfiguration()
        if indexPath.row == 0 {
            content.text = "Salva locale"; content.secondaryText = venue.label
            content.image = UIImage(systemName: "bookmark")
            cell.accessibilityIdentifier = "favorites.saveVenue"
        } else if let price {
            content.text = "Salva \(price.drinkName) · \(price.bandLabel)"
            content.secondaryText = "\(venue.label)\n\(price.amount) · \(price.servingLabel)"
            content.image = UIImage(systemName: "bookmark.fill")
            cell.accessibilityIdentifier = "favorites.saveDrink"
        } else {
            content.text = "Drink non disponibile"
            content.secondaryText = "Apri un locale con un prezzo visibile per salvare quel drink. Puoi comunque salvare il locale."
            content.image = UIImage(systemName: "bookmark.slash")
            cell.accessibilityIdentifier = "favorites.saveDrinkUnavailable"
        }
        content.textProperties.font = .preferredFont(forTextStyle: .headline)
        content.textProperties.numberOfLines = 0; content.secondaryTextProperties.numberOfLines = 0
        content.textProperties.color = NativeAppearance.ink; content.secondaryTextProperties.color = NativeAppearance.muted
        content.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 16, leading: 16, bottom: 16, trailing: 16)
        cell.contentConfiguration = content; cell.backgroundConfiguration = NativeAppearance.card()
        cell.isUserInteractionEnabled = indexPath.row == 0 || price != nil
        cell.selectionStyle = cell.isUserInteractionEnabled ? .default : .none
        cell.accessibilityLabel = [content.text, content.secondaryText].compactMap { $0 }.joined(separator: ". ")
        cell.accessibilityTraits = cell.isUserInteractionEnabled ? [.button] : [.notEnabled]
        return cell
    }
    override func tableView(_ tableView: UITableView, titleForFooterInSection section: Int) -> String? {
        "Solo su questo dispositivo. Non pubblichi prezzi o consigli e non salvi una copia del prezzo. I nomi sono quelli del locale e del drink."
    }
    override func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        guard indexPath.row == 0 || (indexPath.row == 1 && price != nil) else { return }
        onChoose?(indexPath.row == 0 ? .venue : .drink)
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
