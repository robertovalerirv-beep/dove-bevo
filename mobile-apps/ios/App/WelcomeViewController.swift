import UIKit

/// Native, bundled content only. No web view, requests or location access are
/// constructed here; only an explicit acceptance invokes the supplied action.
final class WelcomeViewController: UIViewController {
    private let onAccept: () -> Void
    private let declineMessage = UILabel()
    private var didAccept = false

    init(onAccept: @escaping () -> Void) {
        self.onAccept = onAccept
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { return nil }

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "Benvenuto"
        navigationItem.backButtonTitle = "Torna all'inizio"
        view.backgroundColor = .systemBackground
        let scroll = UIScrollView()
        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.accessibilityIdentifier = "welcome.scroll"
        let stack = UIStackView()
        stack.axis = .vertical
        stack.spacing = 20
        stack.translatesAutoresizingMaskIntoConstraints = false
        stack.isLayoutMarginsRelativeArrangement = true
        stack.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 20, leading: 20, bottom: 24, trailing: 20)
        scroll.addSubview(stack)
        view.addSubview(scroll)
        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            scroll.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            scroll.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            stack.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
            stack.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor),
            stack.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor),
            stack.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor)
        ])

        let heading = UILabel()
        heading.text = "Prima di aprire Dove bevo"
        heading.font = .preferredFont(forTextStyle: .title1)
        heading.adjustsFontForContentSizeCategory = true
        heading.numberOfLines = 0
        heading.accessibilityTraits = .header
        stack.addArrangedSubview(heading)
        let privacy = button("Leggi la privacy", identifier: "welcome.privacy", action: #selector(showPrivacy))
        privacy.configuration = .tinted()
        privacy.setTitle("Leggi la privacy", for: .normal)
        stack.addArrangedSubview(privacy)

        let rules = UITextView()
        rules.accessibilityIdentifier = "welcome.rules"
        rules.accessibilityLabel = "Regole delle app Dove bevo"
        rules.isEditable = false
        rules.isSelectable = true
        rules.isScrollEnabled = false
        rules.font = .preferredFont(forTextStyle: .body)
        rules.adjustsFontForContentSizeCategory = true
        rules.textColor = .label
        rules.backgroundColor = .systemBackground
        rules.textContainerInset = .zero
        rules.textContainer.lineFragmentPadding = 0
        let availableRules: Bool
        do {
            rules.text = try RulesAcceptance.rulesText()
            availableRules = true
        } catch {
            rules.text = "Le regole non sono disponibili in questa versione. Puoi leggere la privacy e contattare \(PrivacyPolicy.supportEmail)."
            availableRules = false
        }
        stack.addArrangedSubview(rules)

        let accept = button("Ho almeno 18 anni e accetto", identifier: "welcome.accept", action: #selector(acceptRules))
        accept.configuration = .filled()
        accept.setTitle("Ho almeno 18 anni e accetto", for: .normal)
        accept.isEnabled = availableRules
        stack.addArrangedSubview(accept)
        stack.addArrangedSubview(button("Non accetto", identifier: "welcome.decline", action: #selector(declineRules)))
        declineMessage.font = .preferredFont(forTextStyle: .body)
        declineMessage.adjustsFontForContentSizeCategory = true
        declineMessage.numberOfLines = 0
        declineMessage.accessibilityIdentifier = "welcome.declined"
        declineMessage.isHidden = true
        stack.addArrangedSubview(declineMessage)
    }

    private func button(_ title: String, identifier: String, action: Selector) -> UIButton {
        let button = UIButton(type: .system)
        button.setTitle(title, for: .normal)
        button.titleLabel?.font = .preferredFont(forTextStyle: .body)
        button.titleLabel?.adjustsFontForContentSizeCategory = true
        button.titleLabel?.numberOfLines = 0
        button.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
        button.accessibilityIdentifier = identifier
        button.addTarget(self, action: action, for: .touchUpInside)
        return button
    }

    @objc private func showPrivacy() {
        navigationController?.pushViewController(PrivacyViewController(), animated: true)
    }

    @objc private func acceptRules() {
        guard !didAccept else { return }
        didAccept = true
        onAccept()
    }

    @objc private func declineRules() {
        declineMessage.text = "Puoi restare qui e leggere le regole e la privacy. Per aprire la mappa devi avere almeno 18 anni e accettare."
        declineMessage.isHidden = false
        UIAccessibility.post(notification: .announcement, argument: declineMessage.text)
    }
}
