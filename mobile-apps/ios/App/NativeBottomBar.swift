import UIKit

enum BottomNavigationAction: Int, CaseIterable {
    case home, map, favourites, recommendations

    var title: String {
        switch self {
        case .home: return "Home"
        case .map: return "Mappa"
        case .favourites: return "Preferiti"
        case .recommendations: return "Consigliati"
        }
    }
    var label: String {
        switch self {
        case .recommendations: return "Consigliati in questa zona"
        default: return title
        }
    }
    var identifier: String {
        switch self {
        case .home: return "tab.home"
        case .map: return "tab.map"
        case .favourites: return "tab.favorites"
        case .recommendations: return "tab.recommendations"
        }
    }
    var symbol: String {
        switch self {
        case .home: return "house"
        case .map: return "map"
        case .favourites: return "bookmark"
        case .recommendations: return "hand.thumbsup"
        }
    }
}

/// Native buttons give commands and destinations their actual full touch and
/// accessibility bounds. Two rows keep larger text readable on narrow phones.
final class NativeBottomBar: UIView {
    private let stack = UIStackView()
    private(set) var buttons: [UIButton] = []
    private var minimumHeights: [NSLayoutConstraint] = []
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
        backgroundColor = NativeAppearance.chrome
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
            let minimumHeight = button.heightAnchor.constraint(greaterThanOrEqualToConstant: 56)
            minimumHeight.isActive = true
            minimumHeights.append(minimumHeight)
            button.widthAnchor.constraint(greaterThanOrEqualToConstant: 48).isActive = true
            button.addTarget(self, action: #selector(selectAction), for: .touchUpInside)
            buttons.append(button)
        }
        arrange(columns: 4)
        update(destination: 0, venueActionsEnabled: false)
    }

    required init?(coder: NSCoder) { return nil }

    static func columns(for usableWidth: CGFloat, fontScale: CGFloat) -> Int {
        // Each native target still has at least 56 points of horizontal room.
        // The stack has four-point insets on both sides of the safe area.
        usableWidth - 8 >= 4 * 56 * max(1, fontScale) ? 4 : 2
    }

    override func layoutSubviews() {
        if renderedCategory != traitCollection.preferredContentSizeCategory {
            renderedCategory = traitCollection.preferredContentSizeCategory
            update(destination: destination, venueActionsEnabled: venueActionsEnabled)
        }
        let usableWidth = bounds.width - safeAreaInsets.left - safeAreaInsets.right
        let normalFont = UIFont.preferredFont(forTextStyle: .caption2,
                                              compatibleWith: UITraitCollection(preferredContentSizeCategory: .large))
        let actualFont = UIFont.preferredFont(forTextStyle: .caption2, compatibleWith: traitCollection)
        let requiredColumns = Self.columns(for: usableWidth, fontScale: actualFont.pointSize / normalFont.pointSize)
        if bounds.width > 0 && columns != requiredColumns { arrange(columns: requiredColumns) }
        super.layoutSubviews()
        updateContentHeights()
    }

    private func updateContentHeights() {
        var changed = false
        for (button, minimum) in zip(buttons, minimumHeights) {
            button.layoutIfNeeded()
            guard button.bounds.width > 0, let title = button.titleLabel,
                  let image = button.imageView, let configuration = button.configuration else { continue }
            let insets = configuration.contentInsets
            let width = max(1, button.bounds.width - insets.leading - insets.trailing)
            let titleHeight = title.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude)).height
            // UIKit resolves accessibility-scaled symbols during button layout;
            // their real height can exceed the nominal 20-point configuration image.
            let symbolHeight = image.bounds.height
            let needed = ceil(insets.top + titleHeight + configuration.imagePadding + symbolHeight + insets.bottom)
            guard needed.isFinite, titleHeight > 0, symbolHeight > 0 else { continue }
            let height = max(56, needed)
            if minimum.constant != height {
                minimum.constant = height
                button.invalidateIntrinsicContentSize()
                changed = true
            }
        }
        if changed {
            // Wrapped configuration content does not always invalidate UIButton's
            // cached intrinsic height. Let Auto Layout grow/shrink these same
            // native controls and rows from the actual current-width content.
            stack.arrangedSubviews.forEach { $0.invalidateIntrinsicContentSize() }
            stack.invalidateIntrinsicContentSize()
            invalidateIntrinsicContentSize()
            superview?.setNeedsLayout()
        }
    }

    func button(for action: BottomNavigationAction) -> UIButton { buttons[action.rawValue] }

    func update(destination: Int, venueActionsEnabled: Bool) {
        self.destination = destination
        self.venueActionsEnabled = venueActionsEnabled
        for action in BottomNavigationAction.allCases {
            let button = button(for: action)
            let selected = (action == .map && destination == 0) || (action == .favourites && destination == 1) || (action == .home && destination == 2) || (action == .recommendations && destination == 3)
            var configuration = UIButton.Configuration.plain()
            let fill = selected ? NativeAppearance.accent : NativeAppearance.chrome
            configuration.baseBackgroundColor = fill
            configuration.background.backgroundColor = fill
            configuration.title = action.title
            configuration.titleAlignment = .center
            configuration.titleLineBreakMode = .byWordWrapping
            let titleFont = UIFont.preferredFont(forTextStyle: .caption2, compatibleWith: traitCollection)
            configuration.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { incoming in
                var attributes = incoming
                attributes.font = titleFont
                return attributes
            }
            let symbol = selected && (action == .map || action == .favourites || action == .home || action == .recommendations) ? "\(action.symbol).fill" : action.symbol
            configuration.image = UIImage(systemName: symbol, withConfiguration: UIImage.SymbolConfiguration(pointSize: 20))
            configuration.imagePlacement = .top
            configuration.imagePadding = 4
            configuration.contentInsets = NSDirectionalEdgeInsets(top: 6, leading: 4, bottom: 6, trailing: 4)
            configuration.baseForegroundColor = selected ? NativeAppearance.onAccent : NativeAppearance.muted
            configuration.background.cornerRadius = NativeAppearance.radius
            configuration.background.strokeColor = NativeAppearance.ink
            configuration.background.strokeWidth = selected ? 2 : 0
            configuration.cornerStyle = .fixed
            button.configuration = configuration
            button.titleLabel?.numberOfLines = 0
            button.titleLabel?.adjustsFontForContentSizeCategory = true
            button.isAccessibilityElement = true
            button.titleLabel?.isAccessibilityElement = false
            button.imageView?.isAccessibilityElement = false
            button.isSelected = selected
            button.isEnabled = true
            var traits: UIAccessibilityTraits = .button
            if selected { traits.insert(.selected) }
            button.accessibilityTraits = traits
        }
        button(for: .recommendations).accessibilityHint = "Mostra i drink consigliati da tutti in questa zona"
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
        guard sender.isEnabled, let action = BottomNavigationAction(rawValue: sender.tag) else { return }
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
