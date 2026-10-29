import UIKit

/// Two retained destinations and three actions share one native bottom bar.
/// Actions never select an empty controller or replace the browser's history.
final class NativeTabsController: UIViewController, UINavigationControllerDelegate {
    private let store: SavedVenueStore
    private let comparisonClient: FavouriteComparisonServing
    private let recommendationClient: RecommendationServing
    private let providedBrowser: BrowserViewController?
    private let content = UIView()
    private let bottomBackground = UIView()
    private(set) var bottomBar = NativeBottomBar()
    private var destinationIndex = 0
    private var visible = false
    private var parentAppearance: (navigation: UINavigationController, appearing: Bool)?
    private var venueActionsAvailable = false

    var selectedIndex: Int {
        get { destinationIndex }
        set { selectDestination(newValue) }
    }

    private(set) lazy var browser: BrowserViewController = {
        let controller = self.providedBrowser ?? BrowserViewController(savedVenues: self.store, recommendationClient: self.recommendationClient)
        controller.onShowFavourites = { [weak self] in self?.selectedIndex = 1 }
        controller.isMapDestinationSelected = { [weak self] in self?.selectedIndex == 0 }
        controller.onVenueActionsChanged = { [weak self] enabled in
            self?.venueActionsAvailable = enabled
            self?.refreshBottomBar()
        }
        return controller
    }()
    private(set) lazy var mapNavigation = UINavigationController(rootViewController: browser)
    private(set) lazy var favourites: SavedVenuesViewController = {
        let controller = SavedVenuesViewController(store: self.store, client: self.comparisonClient) { [weak self] url in
            guard let self else { return }
            self.browser.retireVenueActions()
            self.mapNavigation.popToRootViewController(animated: false)
            self.selectedIndex = 0
            self.browser.openSavedVenue(url)
        }
        controller.isDestinationSelected = { [weak self] in self?.selectedIndex == 1 }
        return controller
    }()
    private(set) lazy var favouritesNavigation = UINavigationController(rootViewController: favourites)

    init(store: SavedVenueStore = SavedVenueStore(), comparisonClient: FavouriteComparisonServing = FavouriteComparisonClient(),
         recommendationClient: RecommendationServing = RecommendationClient(), browser: BrowserViewController? = nil) {
        self.store = store; self.comparisonClient = comparisonClient; self.recommendationClient = recommendationClient
        self.providedBrowser = browser
        super.init(nibName: nil, bundle: nil)
        mapNavigation.delegate = self
        favouritesNavigation.delegate = self
    }

    required init?(coder: NSCoder) { return nil }
    override var shouldAutomaticallyForwardAppearanceMethods: Bool { false }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        bottomBackground.backgroundColor = .systemBackground
        [content, bottomBackground, bottomBar].forEach {
            $0.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview($0)
        }
        bottomBar.onSelect = { [weak self] action in self?.performBottomAction(action) }
        NSLayoutConstraint.activate([
            content.topAnchor.constraint(equalTo: view.topAnchor),
            content.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            content.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            content.bottomAnchor.constraint(equalTo: bottomBar.topAnchor),
            bottomBar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            bottomBar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            bottomBar.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            bottomBackground.topAnchor.constraint(equalTo: bottomBar.topAnchor),
            bottomBackground.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            bottomBackground.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            bottomBackground.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
        for child in [mapNavigation, favouritesNavigation] {
            addChild(child)
            child.view.translatesAutoresizingMaskIntoConstraints = false
            content.addSubview(child.view)
            NSLayoutConstraint.activate([
                child.view.topAnchor.constraint(equalTo: content.topAnchor),
                child.view.leadingAnchor.constraint(equalTo: content.leadingAnchor),
                child.view.trailingAnchor.constraint(equalTo: content.trailingAnchor),
                child.view.bottomAnchor.constraint(equalTo: content.bottomAnchor)
            ])
            child.didMove(toParent: self)
        }
        mapNavigation.view.isHidden = destinationIndex != 0
        favouritesNavigation.view.isHidden = destinationIndex != 1
        refreshBottomBar()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        beginParentAppearance(true, animated: animated)
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        endParentAppearance()
        visible = true
        browser.refreshNavigationControls()
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        visible = false
        browser.retireVenueActions()
        beginParentAppearance(false, animated: animated)
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        endParentAppearance()
    }

    private var activeNavigation: UINavigationController { destinationIndex == 0 ? mapNavigation : favouritesNavigation }

    private func beginParentAppearance(_ appearing: Bool, animated: Bool) {
        endParentAppearance()
        let navigation = activeNavigation
        navigation.beginAppearanceTransition(appearing, animated: animated)
        parentAppearance = (navigation, appearing)
    }

    private func endParentAppearance() {
        let transition = parentAppearance
        parentAppearance = nil
        transition?.navigation.endAppearanceTransition()
    }

    private func selectDestination(_ index: Int) {
        guard (0...1).contains(index) else { return }
        guard index != destinationIndex else { refreshBottomBar(); return }
        let previous = activeNavigation
        destinationIndex = index
        browser.retireVenueActions()
        guard isViewLoaded else { return }
        let next = activeNavigation
        if let transition = parentAppearance {
            endParentAppearance()
            if transition.appearing {
                previous.beginAppearanceTransition(false, animated: false)
                previous.endAppearanceTransition()
                next.beginAppearanceTransition(true, animated: false)
                parentAppearance = (next, true)
            }
        } else if visible {
            previous.beginAppearanceTransition(false, animated: false)
            next.beginAppearanceTransition(true, animated: false)
        }
        previous.view.isHidden = true
        next.view.isHidden = false
        if visible && parentAppearance == nil {
            previous.endAppearanceTransition()
            next.endAppearanceTransition()
        }
        browser.refreshNavigationControls()
        refreshBottomBar()
    }

    private func refreshBottomBar() {
        guard isViewLoaded else { return }
        let enabled = destinationIndex == 0 && mapNavigation.topViewController === browser && venueActionsAvailable
        bottomBar.update(destination: destinationIndex, venueActionsEnabled: enabled)
    }

    private func performBottomAction(_ action: BottomNavigationAction) {
        switch action {
        case .home:
            browser.retireVenueActions()
            mapNavigation.popToRootViewController(animated: false)
            selectedIndex = 0
            browser.goHome()
        case .map: selectedIndex = 0
        case .favourites: selectedIndex = 1
        case .save, .recommendations:
            guard selectedIndex == 0, mapNavigation.topViewController === browser, venueActionsAvailable else { return }
            if action == .save { browser.saveCurrentVenue() }
            else { browser.showRecommendations() }
        }
        refreshBottomBar()
    }

    func navigationController(_ navigationController: UINavigationController, didShow viewController: UIViewController, animated: Bool) {
        browser.refreshNavigationControls()
        refreshBottomBar()
    }

}
