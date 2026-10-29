import UIKit

enum BottomNavigationAction: Int, CaseIterable {
    case home, map, favourites, save, recommendations

    var title: String {
        switch self {
        case .home: return "Home"
        case .map: return "Mappa"
        case .favourites: return "Preferiti"
        case .save: return "Salva"
        case .recommendations: return "Consigliati"
        }
    }
    var label: String {
        switch self {
        case .save: return "Salva nei preferiti"
        case .recommendations: return "Drink consigliati"
        default: return title
        }
    }
    var identifier: String {
        switch self {
        case .home: return "browser.home"
        case .map: return "tab.map"
        case .favourites: return "tab.favorites"
        case .save: return "browser.saveVenue"
        case .recommendations: return "browser.recommendations"
        }
    }
    var symbol: String {
        switch self {
        case .home: return "house"
        case .map: return "map"
        case .favourites: return "bookmark"
        case .save: return "bookmark"
        case .recommendations: return "hand.thumbsup"
        }
    }
}

/// Native buttons give commands and destinations their actual full touch and
/// accessibility bounds. Two rows keep larger text readable on narrow phones.
final class NativeBottomBar: UIView {
    private let stack = UIStackView()
    private(set) var buttons: [UIButton] = []
    private var columns = 0
    private var destination = 0
    private var venueActionsEnabled = false
    private var renderedCategory: UIContentSizeCategory?
    var onSelect: ((BottomNavigationAction) -> Void)?

    override init(frame: CGRect) {
        super.init(frame: frame)
        accessibilityIdentifier = "native.bottomNavigation"
        accessibilityLabel = "Navigazione e azioni del locale"
        accessibilityContainerType = .semanticGroup
        shouldGroupAccessibilityChildren = true
        isAccessibilityElement = false
        backgroundColor = NativeAppearance.surface
        let separator = UIView()
        separator.backgroundColor = NativeAppearance.line
        separator.translatesAutoresizingMaskIntoConstraints = false
        addSubview(separator)
        stack.axis = .vertical
        stack.spacing = 4
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        NSLayoutConstraint.activate([
            separator.topAnchor.constraint(equalTo: topAnchor),
            separator.leadingAnchor.constraint(equalTo: leadingAnchor),
            separator.trailingAnchor.constraint(equalTo: trailingAnchor),
            separator.heightAnchor.constraint(equalToConstant: 0.5),
            stack.topAnchor.constraint(equalTo: topAnchor, constant: 4),
            stack.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -4),
            stack.leadingAnchor.constraint(equalTo: safeAreaLayoutGuide.leadingAnchor, constant: 4),
            stack.trailingAnchor.constraint(equalTo: safeAreaLayoutGuide.trailingAnchor, constant: -4)
        ])
        for action in BottomNavigationAction.allCases {
            let button = NativeBottomButton(type: .system)
            button.tag = action.rawValue
            button.accessibilityIdentifier = action.identifier
            button.accessibilityLabel = action.label
            button.titleLabel?.font = .preferredFont(forTextStyle: .caption2)
            button.titleLabel?.adjustsFontForContentSizeCategory = true
            button.titleLabel?.numberOfLines = 0
            button.titleLabel?.isAccessibilityElement = false
            button.imageView?.isAccessibilityElement = false
            button.heightAnchor.constraint(greaterThanOrEqualToConstant: 56).isActive = true
            button.widthAnchor.constraint(greaterThanOrEqualToConstant: 48).isActive = true
            button.addTarget(self, action: #selector(selectAction), for: .touchUpInside)
            buttons.append(button)
        }
        arrange(columns: 5)
        update(destination: 0, venueActionsEnabled: false)
    }

    required init?(coder: NSCoder) { return nil }

    override func layoutSubviews() {
        if renderedCategory != traitCollection.preferredContentSizeCategory {
            renderedCategory = traitCollection.preferredContentSizeCategory
            update(destination: destination, venueActionsEnabled: venueActionsEnabled)
        }
        let usableWidth = bounds.width - safeAreaInsets.left - safeAreaInsets.right
        let requiredColumns = usableWidth < 360 || traitCollection.preferredContentSizeCategory.isAccessibilityCategory ? 3 : 5
        if bounds.width > 0 && columns != requiredColumns { arrange(columns: requiredColumns) }
        super.layoutSubviews()
    }

    func button(for action: BottomNavigationAction) -> UIButton { buttons[action.rawValue] }

    func update(destination: Int, venueActionsEnabled: Bool) {
        self.destination = destination
        self.venueActionsEnabled = venueActionsEnabled
        for action in BottomNavigationAction.allCases {
            let button = button(for: action)
            let selected = (action == .map && destination == 0) || (action == .favourites && destination == 1)
            let enabled = action != .save && action != .recommendations || venueActionsEnabled
            var configuration = selected ? UIButton.Configuration.filled() : UIButton.Configuration.plain()
            configuration.baseBackgroundColor = selected ? NativeAppearance.ink : .clear
            configuration.title = action.title
            configuration.titleAlignment = .center
            configuration.titleLineBreakMode = .byWordWrapping
            let titleFont = UIFont.preferredFont(forTextStyle: .caption2, compatibleWith: traitCollection)
            configuration.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { incoming in
                var attributes = incoming
                attributes.font = titleFont
                return attributes
            }
            let symbol = selected && (action == .map || action == .favourites) ? "\(action.symbol).fill" : action.symbol
            configuration.image = UIImage(systemName: symbol, withConfiguration: UIImage.SymbolConfiguration(pointSize: 20))
            configuration.imagePlacement = .top
            configuration.imagePadding = 4
            configuration.contentInsets = NSDirectionalEdgeInsets(top: 6, leading: 4, bottom: 6, trailing: 4)
            configuration.baseForegroundColor = selected ? NativeAppearance.surface : (enabled ? NativeAppearance.ink : NativeAppearance.disabled)
            configuration.background.cornerRadius = NativeAppearance.radius
            configuration.cornerStyle = .fixed
            button.configuration = configuration
            button.titleLabel?.numberOfLines = 0
            button.titleLabel?.adjustsFontForContentSizeCategory = true
            button.isAccessibilityElement = true
            button.titleLabel?.isAccessibilityElement = false
            button.imageView?.isAccessibilityElement = false
            button.isSelected = selected
            button.isEnabled = enabled
            var traits: UIAccessibilityTraits = .button
            if selected { traits.insert(.selected) }
            if !enabled { traits.insert(.notEnabled) }
            button.accessibilityTraits = traits
        }
        button(for: .save).accessibilityHint = "Salva il nome esistente nei preferiti privati di questo dispositivo"
        button(for: .recommendations).accessibilityHint = "Mostra i consigli sui drink condivisi da tutti"
    }

    private func arrange(columns: Int) {
        self.columns = columns
        for row in stack.arrangedSubviews {
            stack.removeArrangedSubview(row)
            row.removeFromSuperview()
        }
        for first in stride(from: 0, to: buttons.count, by: columns) {
            let row = UIStackView()
            row.axis = .horizontal
            row.spacing = 0
            row.distribution = .fillEqually
            for button in buttons[first..<min(first + columns, buttons.count)] { row.addArrangedSubview(button) }
            stack.addArrangedSubview(row)
        }
        invalidateIntrinsicContentSize()
        superview?.setNeedsLayout()
    }

    @objc private func selectAction(_ sender: UIButton) {
        guard sender.isEnabled, let action = BottomNavigationAction(rawValue: sender.tag),
              (action != .save && action != .recommendations) || venueActionsEnabled else { return }
        onSelect?(action)
    }
}

/// UIButton is the single accessibility element. Configuration may recreate
/// its labels during state/trait updates, so retire only their AX subtrees
/// after native layout, while keeping the real visible title and image.
private final class NativeBottomButton: UIButton {
    override func layoutSubviews() {
        super.layoutSubviews()
        titleLabel?.isAccessibilityElement = false
        titleLabel?.accessibilityElementsHidden = true
        imageView?.isAccessibilityElement = false
        imageView?.accessibilityElementsHidden = true
    }
}
