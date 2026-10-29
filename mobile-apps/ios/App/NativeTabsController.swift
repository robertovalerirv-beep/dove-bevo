import UIKit

/// Created only after rules acceptance. Both destinations keep their controllers
/// alive; selecting a tab never recreates the website or its browser history.
final class NativeTabsController: UITabBarController {
    private let store: SavedVenueStore
    private let comparisonClient: FavouriteComparisonServing
    private let recommendationClient: RecommendationServing
    private let providedBrowser: BrowserViewController?

    private(set) lazy var browser: BrowserViewController = {
        let controller = self.providedBrowser ?? BrowserViewController(savedVenues: self.store, recommendationClient: self.recommendationClient)
        controller.onShowFavourites = { [weak self] in self?.selectedIndex = 1 }
        return controller
    }()
    private(set) lazy var mapNavigation = UINavigationController(rootViewController: browser)
    private(set) lazy var favourites: SavedVenuesViewController = {
        SavedVenuesViewController(store: self.store, client: self.comparisonClient) { [weak self] url in
            guard let self else { return }
            self.mapNavigation.popToRootViewController(animated: false)
            self.selectedIndex = 0
            self.browser.openSavedVenue(url)
        }
    }()
    private(set) lazy var favouritesNavigation = UINavigationController(rootViewController: favourites)

    init(store: SavedVenueStore = SavedVenueStore(), comparisonClient: FavouriteComparisonServing = FavouriteComparisonClient(),
         recommendationClient: RecommendationServing = RecommendationClient(), browser: BrowserViewController? = nil) {
        self.store = store; self.comparisonClient = comparisonClient; self.recommendationClient = recommendationClient
        self.providedBrowser = browser
        super.init(nibName: nil, bundle: nil)
        mapNavigation.tabBarItem = UITabBarItem(title: "Mappa", image: UIImage(systemName: "map"), selectedImage: UIImage(systemName: "map.fill"))
        mapNavigation.tabBarItem.accessibilityIdentifier = "tab.map"
        mapNavigation.tabBarItem.accessibilityLabel = "Mappa"
        favouritesNavigation.tabBarItem = UITabBarItem(title: "Preferiti", image: UIImage(systemName: "bookmark"), selectedImage: UIImage(systemName: "bookmark.fill"))
        favouritesNavigation.tabBarItem.accessibilityIdentifier = "tab.favorites"
        favouritesNavigation.tabBarItem.accessibilityLabel = "Preferiti"
        viewControllers = [mapNavigation, favouritesNavigation]
        selectedIndex = 0
    }

    required init?(coder: NSCoder) { return nil }
}
