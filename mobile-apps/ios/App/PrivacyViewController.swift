import UIKit

/// A bundled, offline-readable policy. Pushing this controller leaves the live
/// website and its current navigation/session in the existing WKWebView.
final class PrivacyViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        title = "Privacy"
        view.backgroundColor = NativeAppearance.surface
        view.tintColor = NativeAppearance.ink
        NativeAppearance.configure(navigationController)

        let textView = UITextView()
        textView.translatesAutoresizingMaskIntoConstraints = false
        textView.accessibilityIdentifier = "privacy.text"
        textView.accessibilityLabel = "Informativa privacy dell'app Dove bevo"
        textView.isEditable = false
        textView.isSelectable = true
        textView.isScrollEnabled = true
        textView.font = .preferredFont(forTextStyle: .body)
        textView.adjustsFontForContentSizeCategory = true
        textView.textColor = NativeAppearance.ink
        textView.backgroundColor = NativeAppearance.surface
        textView.textContainerInset = UIEdgeInsets(top: 16, left: 16, bottom: 24, right: 16)
        do {
            textView.text = try PrivacyPolicy.load()
        } catch {
            // A packaging problem is visible instead of silently substituting
            // the website's different privacy statement.
            textView.text = "L'informativa privacy non è disponibile in questa versione. Contatta \(PrivacyPolicy.supportEmail) per riceverla."
        }

        let contactButton = UIButton(type: .system)
        contactButton.translatesAutoresizingMaskIntoConstraints = false
        contactButton.configuration = NativeAppearance.button()
        contactButton.setTitle("Scrivi a \(PrivacyPolicy.supportEmail)", for: .normal)
        contactButton.titleLabel?.font = .preferredFont(forTextStyle: .body)
        contactButton.titleLabel?.adjustsFontForContentSizeCategory = true
        contactButton.titleLabel?.numberOfLines = 0
        contactButton.accessibilityIdentifier = "privacy.contact"
        contactButton.accessibilityLabel = "Assistenza: \(PrivacyPolicy.supportEmail)"
        contactButton.addTarget(self, action: #selector(contactSupport), for: .touchUpInside)
        view.addSubview(textView)
        view.addSubview(contactButton)
        NSLayoutConstraint.activate([
            textView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            textView.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            textView.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            textView.bottomAnchor.constraint(equalTo: contactButton.topAnchor, constant: -12),
            contactButton.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 16),
            contactButton.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -16),
            contactButton.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -12),
            contactButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 44)
        ])
    }

    @objc private func contactSupport() {
        // This fixed support address opens only after an explicit native tap.
        UIApplication.shared.open(PrivacyPolicy.supportURL, options: [:]) { [weak self] opened in
            guard !opened else { return }
            let alert = UIAlertController(
                title: "Contatta Dove bevo",
                message: "Puoi scrivere a \(PrivacyPolicy.supportEmail) dalla tua app di posta.",
                preferredStyle: .alert
            )
            alert.addAction(UIAlertAction(title: "Chiudi", style: .default))
            self?.present(alert, animated: true)
        }
    }
}
