import UIKit

/// Information destinations use existing app capabilities. No account, history
/// or contribution count is invented to fill a reference-design menu.
final class AppInformationViewController: UITableViewController {
    private let onMap: () -> Void
    private let onBrowser: () -> Void
    private let items: [(String, String, String)] = [
        ("Cambia zona nella mappa", "map", "map"),
        ("Come funziona", "info.circle", "how"),
        ("Linee guida della community", "person.2", "rules"),
        ("Privacy", "hand.raised", "privacy"),
        ("Permessi posizione", "location", "location"),
        ("Apri nel browser", "safari", "browser"),
        ("Contatti", "envelope", "contact"),
        ("Versione app", "app.badge", "version")
    ]

    init(onMap: @escaping () -> Void, onBrowser: @escaping () -> Void) {
        self.onMap = onMap; self.onBrowser = onBrowser
        super.init(style: .insetGrouped)
        title = "Altro"
    }
    required init?(coder: NSCoder) { return nil }

    override func viewDidLoad() {
        super.viewDidLoad()
        NativeAppearance.configure(navigationController); NativeAppearance.configure(tableView)
        tableView.accessibilityIdentifier = "information.list"
        tableView.rowHeight = UITableView.automaticDimension; tableView.estimatedRowHeight = 56
        tableView.register(UITableViewCell.self, forCellReuseIdentifier: "information")
        let art = UIImageView(image: UIImage(named: "CommunityCheers")); art.contentMode = .scaleAspectFit
        art.isAccessibilityElement = false; art.translatesAutoresizingMaskIntoConstraints = false
        let message = UILabel(); message.text = "Stessi posti.\nPiù trasparenza."
        message.font = .preferredFont(forTextStyle: .headline); message.adjustsFontForContentSizeCategory = true
        message.numberOfLines = 0; message.textColor = NativeAppearance.ink
        let banner = UIStackView(arrangedSubviews: [art, message]); banner.alignment = .center; banner.spacing = 8
        banner.isLayoutMarginsRelativeArrangement = true
        banner.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 16, leading: 16, bottom: 16, trailing: 16)
        banner.layer.cornerRadius = NativeAppearance.radius
        banner.backgroundColor = NativeAppearance.secondary
        banner.translatesAutoresizingMaskIntoConstraints = false
        let footer = UIView(); footer.addSubview(banner)
        NSLayoutConstraint.activate([
            banner.topAnchor.constraint(equalTo: footer.topAnchor, constant: 16),
            banner.bottomAnchor.constraint(equalTo: footer.bottomAnchor, constant: -20),
            banner.leadingAnchor.constraint(equalTo: footer.leadingAnchor, constant: 20),
            banner.trailingAnchor.constraint(equalTo: footer.trailingAnchor, constant: -20),
            art.widthAnchor.constraint(equalToConstant: 100), art.heightAnchor.constraint(equalToConstant: 100)
        ])
        tableView.tableFooterView = footer
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        guard let footer = tableView.tableFooterView else { return }
        let size = footer.systemLayoutSizeFitting(CGSize(width: tableView.bounds.width, height: 0),
            withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel)
        if footer.frame.size != size { footer.frame.size = size; tableView.tableFooterView = footer }
    }

    override func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int { items.count }

    override func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "information", for: indexPath)
        let item = items[indexPath.row]
        var content = cell.defaultContentConfiguration()
        content.text = item.0; content.image = UIImage(systemName: item.1)
        content.textProperties.color = NativeAppearance.ink
        content.textProperties.font = .preferredFont(forTextStyle: .body)
        content.textProperties.numberOfLines = 0; content.imageProperties.tintColor = NativeAppearance.ink
        if item.2 == "version" {
            let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "—"
            let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "—"
            content.secondaryText = "\(version) (\(build))"
        }
        content.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 16, leading: 16, bottom: 16, trailing: 12)
        cell.contentConfiguration = content; cell.backgroundConfiguration = NativeAppearance.card()
        cell.accessoryType = item.2 == "version" ? .none : .disclosureIndicator
        cell.accessibilityIdentifier = "information.\(item.2)"
        cell.selectionStyle = item.2 == "version" ? .none : .default
        return cell
    }

    override func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        switch items[indexPath.row].2 {
        case "map": onMap()
        case "browser": onBrowser()
        case "privacy": navigationController?.pushViewController(PrivacyViewController(), animated: true)
        case "rules":
            let text = (try? RulesAcceptance.rulesText()) ?? "Le regole non sono disponibili in questa versione. Contatta \(PrivacyPolicy.supportEmail)."
            navigationController?.pushViewController(AppInformationTextController(title: "Linee guida", text: text), animated: true)
        case "how":
            let text = "Scegli una città nella mappa e il drink che ti interessa. Apri un locale per vedere i prezzi e le informazioni disponibili.\n\nScopri confronta i prezzi nella zona dell'ultima mappa. Valute e formati diversi restano separati. Le immagini dei drink sono illustrative.\n\nSalva un drink nel suo locale: i Preferiti restano su questo dispositivo, senza registrazione. Le conferme, i nuovi prezzi e i consigli sui drink sono pubblici.\n\nLa mappa e i prezzi richiedono internet. Un prezzo da menu online riporta la fonte e la data di verifica; non prova un acquisto."
            navigationController?.pushViewController(AppInformationTextController(title: "Come funziona", text: text), animated: true)
        case "location":
            let alert = UIAlertController(title: "Permessi posizione", message: "La posizione è facoltativa. Puoi scegliere una città nella mappa anche senza condividerla. Puoi gestire i permessi di Dove bevo nelle Impostazioni di iOS.", preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "Chiudi", style: .cancel))
            alert.addAction(UIAlertAction(title: "Impostazioni", style: .default) { _ in
                if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
            })
            present(alert, animated: true)
        case "contact":
            UIApplication.shared.open(PrivacyPolicy.supportURL, options: [:]) { [weak self] opened in
                guard !opened, let self else { return }
                let alert = UIAlertController(title: "Contatta Dove bevo",
                    message: "Puoi scrivere a \(PrivacyPolicy.supportEmail) dalla tua app di posta.", preferredStyle: .alert)
                alert.addAction(UIAlertAction(title: "Chiudi", style: .default))
                self.present(alert, animated: true)
            }
        default: break
        }
    }
}

private final class AppInformationTextController: UIViewController {
    private let content: String
    init(title: String, text: String) { content = text; super.init(nibName: nil, bundle: nil); self.title = title }
    required init?(coder: NSCoder) { return nil }
    override func viewDidLoad() {
        super.viewDidLoad(); view.backgroundColor = NativeAppearance.canvas
        let text = UITextView(); text.translatesAutoresizingMaskIntoConstraints = false
        text.isEditable = false; text.isSelectable = true; text.text = content
        text.font = .preferredFont(forTextStyle: .body); text.adjustsFontForContentSizeCategory = true
        text.textColor = NativeAppearance.ink; text.backgroundColor = NativeAppearance.surface
        text.textContainerInset = UIEdgeInsets(top: 20, left: 16, bottom: 28, right: 16)
        view.addSubview(text)
        NSLayoutConstraint.activate([
            text.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor), text.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            text.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor), text.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor)
        ])
    }
}
