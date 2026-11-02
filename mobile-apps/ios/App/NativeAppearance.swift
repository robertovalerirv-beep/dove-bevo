import UIKit

/// App-local presentation only. Public prices, venue identity and voting state
/// stay in their existing models; colour never invents a price or rating tier.
@MainActor enum NativeAppearance {
    static let surface = UIColor.white
    static let canvas = UIColor(red: 247 / 255, green: 248 / 255, blue: 250 / 255, alpha: 1)
    static let ink = UIColor(red: 16 / 255, green: 24 / 255, blue: 32 / 255, alpha: 1)
    static let muted = UIColor(red: 93 / 255, green: 102 / 255, blue: 112 / 255, alpha: 1)
    static let line = UIColor(red: 231 / 255, green: 234 / 255, blue: 238 / 255, alpha: 1)
    static let accent = UIColor(red: 245 / 255, green: 181 / 255, blue: 33 / 255, alpha: 1)
    static let disabled = UIColor(red: 148 / 255, green: 155 / 255, blue: 163 / 255, alpha: 1)
    static let radius: CGFloat = 16

    static func configure(_ navigation: UINavigationController?) {
        guard let navigation else { return }
        let appearance = UINavigationBarAppearance()
        appearance.configureWithOpaqueBackground()
        appearance.backgroundColor = surface
        appearance.shadowColor = line
        appearance.titleTextAttributes = [.foregroundColor: ink, .font: UIFont.preferredFont(forTextStyle: .headline)]
        appearance.largeTitleTextAttributes = [.foregroundColor: ink]
        navigation.navigationBar.standardAppearance = appearance
        navigation.navigationBar.scrollEdgeAppearance = appearance
        navigation.navigationBar.compactAppearance = appearance
        navigation.navigationBar.tintColor = ink
        navigation.view.backgroundColor = surface
    }

    static func button(primary: Bool = false, selected: Bool = false, traits: UITraitCollection? = nil) -> UIButton.Configuration {
        var configuration = UIButton.Configuration.filled()
        configuration.baseBackgroundColor = selected ? accent : (primary ? ink : canvas)
        configuration.baseForegroundColor = primary && !selected ? surface : ink
        configuration.background.cornerRadius = radius
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
        background.strokeColor = line
        background.strokeWidth = 1
        background.cornerRadius = radius
        background.backgroundInsets = NSDirectionalEdgeInsets(top: 6, leading: 0, bottom: 6, trailing: 0)
        return background
    }

    static func configure(_ table: UITableView) {
        table.backgroundColor = canvas
        table.separatorStyle = .none
        table.tintColor = ink
    }
}
