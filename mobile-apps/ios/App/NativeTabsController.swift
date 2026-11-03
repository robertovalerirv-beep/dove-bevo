import UIKit

/// Map, favourites and Home/Discover remain retained; Cerca opens the map search.
/// Actions never select an empty controller or replace the browser's history.
final class NativeTabsController: UIViewController, UINavigationControllerDelegate {
    private let store: SavedVenueStore
    private let drinkStore: SavedDrinkStore
    private let offerStore: SavedMenuOfferStore
    private let comparisonClient: FavouriteComparisonServing
    private let menuClient: MenuV2Serving?
    private let recommendationClient: RecommendationServing
    private let discoveryClient: DiscoveryServing
    private let providedBrowser: BrowserViewController?
    private let content = UIView()
    private let topChrome = UIView()
    private(set) var topMoreButton = UIButton(type: .system)
    private let bottomBackground = UIView()
    private(set) var bottomBar = NativeBottomBar()
    private var destinationIndex = 0
    private var visible = false
    private var parentAppearance: (navigation: UINavigationController, appearing: Bool)?
    private var venueActionsAvailable = false
    private var homeIntent = UUID()

    var selectedIndex: Int {
        get { destinationIndex }
        set { selectDestination(newValue) }
    }

    private(set) lazy var browser: BrowserViewController = {
        let controller = self.providedBrowser ?? BrowserViewController(savedVenues: self.store, savedDrinks: self.drinkStore, savedMenuOffers: self.offerStore, menuClient: self.menuClient ?? MenuV2Client(), recommendationClient: self.recommendationClient)
        controller.onShowFavourites = { [weak self] in self?.selectedIndex = 1 }
        controller.isMapDestinationSelected = { [weak self] in self?.selectedIndex == 0 }
        controller.onVenueActionsChanged = { [weak self] enabled in
            self?.venueActionsAvailable = enabled
            self?.refreshBottomBar()
        }
        controller.onMoreMenuChanged = { [weak self] _ in
            self?.refreshMoreMenu()
        }
        return controller
    }()
    private(set) lazy var mapNavigation = UINavigationController(rootViewController: browser)
    private(set) lazy var favourites: SavedVenuesViewController = {
        let controller = SavedVenuesViewController(store: self.store, drinkStore: self.drinkStore, offerStore: self.offerStore, client: self.comparisonClient, menuClient: self.menuClient) { [weak self] url in
            guard let self else { return }
            self.browser.retireVenueActions()
            self.mapNavigation.popToRootViewController(animated: false)
            self.selectedIndex = 0
            self.browser.openSavedVenue(url)
        }
        controller.isDestinationSelected = { [weak self] in self?.selectedIndex == 1 }
        controller.onReloadMenuChanged = { [weak self] in self?.refreshMoreMenu() }
        return controller
    }()
    private(set) lazy var favouritesNavigation = UINavigationController(rootViewController: favourites)
    private(set) lazy var discovery: DiscoveryViewController = {
        let controller = DiscoveryViewController(client: discoveryClient, onOpen: { [weak self] url in
            guard let self else { return }
            self.browser.retireVenueActions()
            self.mapNavigation.popToRootViewController(animated: false)
            self.selectedIndex = 0
            self.browser.openSavedVenue(url)
        }, onMap: { [weak self] in self?.selectedIndex = 0 })
        controller.isDestinationSelected = { [weak self] in self?.selectedIndex == 2 }
        controller.onReloadMenuChanged = { [weak self] in self?.refreshMoreMenu() }
        return controller
    }()
    private(set) lazy var discoveryNavigation = UINavigationController(rootViewController: discovery)

    init(store: SavedVenueStore = SavedVenueStore(), comparisonClient: FavouriteComparisonServing = FavouriteComparisonClient(),
         menuClient: MenuV2Serving? = MenuV2Client(), drinkStore: SavedDrinkStore = SavedDrinkStore(), offerStore: SavedMenuOfferStore = SavedMenuOfferStore(),
         recommendationClient: RecommendationServing = RecommendationClient(), browser: BrowserViewController? = nil,
         discoveryClient: DiscoveryServing = DiscoveryClient()) {
        self.store = store; self.drinkStore = drinkStore; self.offerStore = offerStore; self.comparisonClient = comparisonClient; self.menuClient = menuClient; self.recommendationClient = recommendationClient
        self.providedBrowser = browser
        self.discoveryClient = discoveryClient
        super.init(nibName: nil, bundle: nil)
        mapNavigation.delegate = self
        favouritesNavigation.delegate = self
        discoveryNavigation.delegate = self
    }

    required init?(coder: NSCoder) { return nil }
    override var shouldAutomaticallyForwardAppearanceMethods: Bool { false }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = NativeAppearance.canvas
        view.tintColor = NativeAppearance.ink
        // The overflow floats over the reserved right edge of the visitor
        // header. A full-width native rail would waste a row of map space.
        topChrome.backgroundColor = .clear
        bottomBackground.backgroundColor = NativeAppearance.chrome
        NativeAppearance.configure(mapNavigation)
        NativeAppearance.configure(favouritesNavigation)
        NativeAppearance.configure(discoveryNavigation)
        mapNavigation.setNavigationBarHidden(true, animated: false)
        [content, topChrome, bottomBackground, bottomBar].forEach {
            $0.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview($0)
        }
        bottomBar.onSelect = { [weak self] action in self?.performBottomAction(action) }
        var moreConfiguration = UIButton.Configuration.plain()
        moreConfiguration.image = UIImage(systemName: "ellipsis")
        moreConfiguration.baseForegroundColor = NativeAppearance.ink
        moreConfiguration.background.backgroundColor = NativeAppearance.surface
        moreConfiguration.background.cornerRadius = NativeAppearance.radius
        topMoreButton.configuration = moreConfiguration
        topMoreButton.accessibilityIdentifier = "browser.more"
        topMoreButton.accessibilityLabel = "Altre opzioni"
        topMoreButton.showsMenuAsPrimaryAction = true
        topMoreButton.translatesAutoresizingMaskIntoConstraints = false
        topChrome.addSubview(topMoreButton)
        refreshMoreMenu()
        NSLayoutConstraint.activate([
            topChrome.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            topChrome.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -8),
            topChrome.widthAnchor.constraint(equalToConstant: 48),
            topChrome.heightAnchor.constraint(equalToConstant: 48),
            topMoreButton.topAnchor.constraint(equalTo: topChrome.topAnchor),
            topMoreButton.bottomAnchor.constraint(equalTo: topChrome.bottomAnchor),
            topMoreButton.leadingAnchor.constraint(equalTo: topChrome.leadingAnchor),
            topMoreButton.trailingAnchor.constraint(equalTo: topChrome.trailingAnchor),
            content.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
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
        for child in [mapNavigation, favouritesNavigation, discoveryNavigation] {
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
        discoveryNavigation.view.isHidden = destinationIndex != 2
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

    private var activeNavigation: UINavigationController {
        switch destinationIndex { case 1: return favouritesNavigation; case 2: return discoveryNavigation; default: return mapNavigation }
    }

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
        guard (0...2).contains(index) else { return }
        homeIntent = UUID()
        guard index != destinationIndex else { refreshBottomBar(); return }
        let previous = activeNavigation
        destinationIndex = index
        if index != 0 { browser.cancelPendingSearch() }
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
        refreshMoreMenu()
    }

    private func refreshMoreMenu() {
        guard isViewLoaded else { return }
        if destinationIndex == 0 && mapNavigation.topViewController === browser {
            topMoreButton.accessibilityHint = "Condividi, ricarica e informazioni"
            topMoreButton.menu = browser.moreMenu()
            return
        }
        var actions: [UIMenuElement] = []
        var reloadTitle: String?
        if destinationIndex == 1 && favouritesNavigation.topViewController === favourites {
            let title = favourites.reloadMenuTitle
            reloadTitle = title
            let reload = UIAction(title: title, image: UIImage(systemName: "arrow.clockwise"),
                                  identifier: UIAction.Identifier("native.reload")) { [weak self] _ in
                self?.favourites.reloadFromMore()
            }
            if !favourites.canReloadFromMore { reload.attributes = [.disabled] }
            actions.append(reload)
        } else if destinationIndex == 2 && discoveryNavigation.topViewController === discovery {
            reloadTitle = "Ricarica"
            let reload = UIAction(title: "Ricarica", image: UIImage(systemName: "arrow.clockwise"),
                                  identifier: UIAction.Identifier("native.reload")) { [weak self] _ in
                self?.discovery.reloadFromMore()
            }
            if !discovery.canReloadFromMore { reload.attributes = [.disabled] }
            actions.append(reload)
        }
        topMoreButton.accessibilityHint = reloadTitle.map { "\($0), privacy e informazioni" } ?? "Privacy e informazioni"
        actions += [
            UIAction(title: "Privacy", image: UIImage(systemName: "hand.raised"), identifier: UIAction.Identifier("native.privacy")) { [weak self] _ in
                self?.showPrivacyFromMore()
            },
            UIAction(title: "Informazioni", image: UIImage(systemName: "info.circle"), identifier: UIAction.Identifier("native.information")) { [weak self] _ in
                self?.showInformationFromMore()
            }
        ]
        topMoreButton.menu = UIMenu(children: actions)
    }

    func showPrivacyFromMore() {
        activeNavigation.pushViewController(PrivacyViewController(), animated: true)
    }

    func showInformationFromMore() {
        let information = AppInformationViewController(onMap: { [weak self] in self?.selectedIndex = 0 }, onBrowser: { [weak self] in self?.browser.openCurrentPageInBrowser() })
        activeNavigation.pushViewController(information, animated: true)
    }

    private func openDiscovery() {
        browser.retireVenueActions()
        if selectedIndex == 0 && mapNavigation.topViewController === browser {
            let intent = UUID(); homeIntent = intent
            browser.captureDiscoveryArea { [weak self] area in
                guard let self, self.homeIntent == intent, self.selectedIndex == 0 else { return }
                self.discovery.setArea(area)
                self.selectedIndex = 2
            }
        } else { selectedIndex = 2 }
    }

    private func performBottomAction(_ action: BottomNavigationAction) {
        switch action {
        case .home:
            openDiscovery()
        case .search:
            mapNavigation.popToRootViewController(animated: false)
            selectedIndex = 0
            browser.openMapSearch()
        case .map: selectedIndex = 0
        case .favourites: selectedIndex = 1
        case .save, .recommendations:
            guard selectedIndex == 0, mapNavigation.topViewController === browser, venueActionsAvailable else { return }
            if action == .save { browser.saveCurrentVenue() }
            else { browser.showRecommendations() }
        }
        refreshBottomBar()
    }

    func navigationController(_ navigationController: UINavigationController, willShow viewController: UIViewController, animated: Bool) {
        if navigationController === mapNavigation {
            navigationController.setNavigationBarHidden(viewController === browser, animated: animated)
        }
    }

    func navigationController(_ navigationController: UINavigationController, didShow viewController: UIViewController, animated: Bool) {
        browser.refreshNavigationControls()
        refreshBottomBar()
    }

}
