import UIKit

/// App-local presentation only. Public prices, venue identity and voting state
/// stay in their existing models; colour never invents a price or rating tier.
@MainActor enum NativeAppearance {
    // Match the current website's Bancone light tokens (docs/brand/tokens.json).
    static let canvas = UIColor(red: 255 / 255, green: 244 / 255, blue: 228 / 255, alpha: 1)
    static let surface = UIColor(red: 255 / 255, green: 251 / 255, blue: 244 / 255, alpha: 1)
    static let chrome = canvas
    static let secondary = UIColor(red: 246 / 255, green: 233 / 255, blue: 214 / 255, alpha: 1)
    static let ink = UIColor(red: 27 / 255, green: 22 / 255, blue: 17 / 255, alpha: 1)
    static let muted = UIColor(red: 94 / 255, green: 85 / 255, blue: 75 / 255, alpha: 1)
    static let line = UIColor(red: 226 / 255, green: 211 / 255, blue: 190 / 255, alpha: 1)
    static let accent = UIColor(red: 255 / 255, green: 90 / 255, blue: 31 / 255, alpha: 1)
    static let onAccent = UIColor(red: 27 / 255, green: 22 / 255, blue: 17 / 255, alpha: 1)
    static let accentText = UIColor(red: 185 / 255, green: 58 / 255, blue: 11 / 255, alpha: 1)
    static let disabled = muted
    static let radius: CGFloat = 16

    static func configure(_ navigation: UINavigationController?) {
        guard let navigation else { return }
        let appearance = UINavigationBarAppearance()
        appearance.configureWithOpaqueBackground()
        appearance.backgroundColor = chrome
        appearance.shadowColor = line
        appearance.titleTextAttributes = [.foregroundColor: ink, .font: UIFont.preferredFont(forTextStyle: .headline)]
        appearance.largeTitleTextAttributes = [.foregroundColor: ink]
        navigation.navigationBar.standardAppearance = appearance
        navigation.navigationBar.scrollEdgeAppearance = appearance
        navigation.navigationBar.compactAppearance = appearance
        navigation.navigationBar.tintColor = accentText
        navigation.view.backgroundColor = canvas
    }

    static func button(primary: Bool = false, selected: Bool = false, traits: UITraitCollection? = nil) -> UIButton.Configuration {
        var configuration = UIButton.Configuration.filled()
        configuration.baseBackgroundColor = primary || selected ? accent : secondary
        configuration.baseForegroundColor = primary || selected ? onAccent : ink
        configuration.background.cornerRadius = radius
        configuration.background.strokeColor = ink
        configuration.background.strokeWidth = 2
        configuration.cornerStyle = .fixed
        configuration.titleLineBreakMode = .byWordWrapping
        configuration.contentInsets = NSDirectionalEdgeInsets(top: 12, leading: 16, bottom: 12, trailing: 16)
        configuration.imagePadding = 8
        configuration.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { incoming in
            var attributes = incoming
            attributes.font = UIFont.preferredFont(forTextStyle: .headline, compatibleWith: traits)
            return attributes
        }
        return configuration
    }

    static func card() -> UIBackgroundConfiguration {
        var background = UIBackgroundConfiguration.listGroupedCell()
        background.backgroundColor = surface
        background.strokeColor = ink
        background.strokeWidth = 2
        background.cornerRadius = radius
        background.backgroundInsets = NSDirectionalEdgeInsets(top: 6, leading: 0, bottom: 6, trailing: 0)
        return background
    }

    static func configure(_ table: UITableView) {
        table.backgroundColor = canvas
        table.separatorStyle = .none
        table.tintColor = accentText
    }
}
