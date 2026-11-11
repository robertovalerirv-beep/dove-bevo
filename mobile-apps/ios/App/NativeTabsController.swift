import UIKit

/// Map, favourites, Home/Discover and shared recommendations remain retained.
/// The city/bar search lives on the map, beside Locate and Add.
/// Actions never select an empty controller or replace the browser's history.
final class NativeTabsController: UIViewController, UINavigationControllerDelegate {
    private let store: SavedVenueStore
    private let drinkStore: SavedDrinkStore
    private let offerStore: SavedMenuOfferStore
    private let customerStore: SavedCustomerItemStore
    private let europeDrinkStore: SavedEuropeDrinkStore
    private let comparisonClient: FavouriteComparisonServing
    private let menuClient: MenuV2Serving?
    private let recommendationClient: RecommendationServing
    private let areaVotesClient: AreaVotesServing
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
    private var lastMapArea: DiscoveryArea?
    private var returnDestination: Int?
    private var pendingMapReturn: URL?

    var selectedIndex: Int {
        get { destinationIndex }
        set { selectDestination(newValue) }
    }

    private(set) lazy var browser: BrowserViewController = {
        let controller = self.providedBrowser ?? BrowserViewController(savedVenues: self.store, savedDrinks: self.drinkStore, savedMenuOffers: self.offerStore, menuClient: self.menuClient ?? MenuV2Client(), savedCustomerItems: self.customerStore, savedEuropeDrinks: self.europeDrinkStore, comparisonClient: self.comparisonClient, recommendationClient: self.recommendationClient)
        controller.onShowFavourites = { [weak self] in self?.selectedIndex = 1 }
        controller.isMapDestinationSelected = { [weak self] in self?.selectedIndex == 0 }
        controller.onVenueActionsChanged = { [weak self] enabled in
            self?.venueActionsAvailable = enabled
            self?.refreshBottomBar()
        }
        controller.onMoreMenuChanged = { [weak self] _ in
            self?.refreshMoreMenu()
        }
        controller.canReturnToNativeSource = { [weak self] in self?.returnDestination != nil }
        controller.onReturnToNativeSource = { [weak self] in
            guard let self, let source = self.returnDestination else { return false }
            self.returnDestination = nil
            self.selectedIndex = source
            return true
        }
        return controller
    }()
    private(set) lazy var mapNavigation = UINavigationController(rootViewController: browser)
    private(set) lazy var favourites: SavedVenuesViewController = {
        let controller = SavedVenuesViewController(store: self.store, drinkStore: self.drinkStore, offerStore: self.offerStore, customerStore: self.customerStore, europeDrinkStore: self.europeDrinkStore, client: self.comparisonClient, menuClient: self.menuClient) { [weak self] url in
            self?.openVenueFromNative(url, source: 1)
        }
        controller.isDestinationSelected = { [weak self] in self?.selectedIndex == 1 }
        controller.onReloadMenuChanged = { [weak self] in self?.refreshMoreMenu() }
        return controller
    }()
    private(set) lazy var favouritesNavigation = UINavigationController(rootViewController: favourites)
    private(set) lazy var discovery: DiscoveryViewController = {
        let controller = DiscoveryViewController(client: discoveryClient, onOpen: { [weak self] url in
            self?.openVenueFromNative(url, source: 2)
        }, onMap: { [weak self] in self?.selectedIndex = 0 })
        controller.isDestinationSelected = { [weak self] in self?.selectedIndex == 2 }
        controller.onReloadMenuChanged = { [weak self] in self?.refreshMoreMenu() }
        return controller
    }()
    private(set) lazy var discoveryNavigation = UINavigationController(rootViewController: discovery)
    private(set) lazy var areaVotes: AreaVotesViewController = {
        let controller = AreaVotesViewController(client: areaVotesClient, onOpen: { [weak self] url in
            self?.openVenueFromNative(url, source: 3)
        }, onMap: { [weak self] in
            guard let self else { return }
            self.mapNavigation.popToRootViewController(animated: false)
            self.selectedIndex = 0
            self.browser.openMapSearch()
        })
        controller.isDestinationSelected = { [weak self] in self?.selectedIndex == 3 }
        controller.onReloadMenuChanged = { [weak self] in self?.refreshMoreMenu() }
        return controller
    }()
    private(set) lazy var areaVotesNavigation = UINavigationController(rootViewController: areaVotes)

    init(store: SavedVenueStore = SavedVenueStore(), comparisonClient: FavouriteComparisonServing = FavouriteComparisonClient(),
         menuClient: MenuV2Serving? = MenuV2Client(), drinkStore: SavedDrinkStore = SavedDrinkStore(), offerStore: SavedMenuOfferStore = SavedMenuOfferStore(),
         customerStore: SavedCustomerItemStore = SavedCustomerItemStore(), europeDrinkStore: SavedEuropeDrinkStore = SavedEuropeDrinkStore(),
         recommendationClient: RecommendationServing = RecommendationClient(), browser: BrowserViewController? = nil,
         discoveryClient: DiscoveryServing = DiscoveryClient(), areaVotesClient: AreaVotesServing = AreaVotesClient()) {
        self.store = store; self.drinkStore = drinkStore; self.offerStore = offerStore; self.customerStore = customerStore; self.europeDrinkStore = europeDrinkStore; self.comparisonClient = comparisonClient; self.menuClient = menuClient; self.recommendationClient = recommendationClient
        self.providedBrowser = browser
        self.discoveryClient = discoveryClient
        self.areaVotesClient = areaVotesClient
        super.init(nibName: nil, bundle: nil)
        mapNavigation.delegate = self
        favouritesNavigation.delegate = self
        discoveryNavigation.delegate = self
        areaVotesNavigation.delegate = self
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
        NativeAppearance.configure(areaVotesNavigation)
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
        for child in [mapNavigation, favouritesNavigation, discoveryNavigation, areaVotesNavigation] {
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
        areaVotesNavigation.view.isHidden = destinationIndex != 3
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
        switch destinationIndex { case 1: return favouritesNavigation; case 2: return discoveryNavigation; case 3: return areaVotesNavigation; default: return mapNavigation }
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
        guard (0...3).contains(index) else { return }
        returnDestination = nil
        homeIntent = UUID()
        guard index != destinationIndex else {
            if index == 0 { restorePendingMapIfNeeded() }
            browser.refreshNavigationControls(); refreshBottomBar(); return
        }
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
        if index == 0 { restorePendingMapIfNeeded() }
        browser.refreshNavigationControls()
        if index == 0 { browser.refreshSavedDrinkKeys() }
        refreshBottomBar()
    }

    func openVenueFromNative(_ url: URL, source: Int) {
        guard (1...3).contains(source), SavedVenuePolicy.canonicalURL(url) != nil else { return }
        let priorMap = pendingMapReturn ?? browser.lastMapRoute
        pendingMapReturn = nil
        browser.retireVenueActions()
        mapNavigation.popToRootViewController(animated: false)
        selectedIndex = 0
        pendingMapReturn = priorMap
        returnDestination = source
        browser.openSavedVenue(url)
        browser.refreshNavigationControls()
    }

    private func restorePendingMapIfNeeded() {
        guard let route = pendingMapReturn else { return }
        pendingMapReturn = nil
        browser.restoreMapRoute(route)
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
        } else if destinationIndex == 3 && areaVotesNavigation.topViewController === areaVotes {
            reloadTitle = "Ricarica"
            let reload = UIAction(title: "Ricarica", image: UIImage(systemName: "arrow.clockwise"),
                                  identifier: UIAction.Identifier("native.reload")) { [weak self] _ in
                self?.areaVotes.reloadFromMore()
            }
            if !areaVotes.canReloadFromMore { reload.attributes = [.disabled] }
            actions.append(reload)
        } else if destinationIndex == 0,
                  let recommendations = mapNavigation.topViewController as? RecommendationsViewController {
            let title = recommendations.reloadMenuTitle
            reloadTitle = title
            let reload = UIAction(title: title, image: UIImage(systemName: "arrow.clockwise"),
                                  identifier: UIAction.Identifier("native.reload")) { [weak self] _ in
                (self?.mapNavigation.topViewController as? RecommendationsViewController)?.reloadFromMore()
            }
            if !recommendations.canReloadFromMore { reload.attributes = [.disabled] }
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
                self.lastMapArea = area
                self.discovery.setArea(area)
                self.selectedIndex = 2
            }
        } else { selectedIndex = 2 }
    }

    private func openAreaVotes() {
        browser.retireVenueActions()
        if selectedIndex == 0 && mapNavigation.topViewController === browser {
            let intent = UUID(); homeIntent = intent
            browser.captureDiscoveryArea { [weak self] area in
                guard let self, self.homeIntent == intent, self.selectedIndex == 0 else { return }
                self.lastMapArea = area
                self.areaVotes.setArea(area)
                self.selectedIndex = 3
            }
        } else {
            areaVotes.setArea(lastMapArea)
            selectedIndex = 3
        }
    }

    private func performBottomAction(_ action: BottomNavigationAction) {
        switch action {
        case .home:
            openDiscovery()
        case .map: selectedIndex = 0
        case .favourites: selectedIndex = 1
        case .recommendations: openAreaVotes()
        }
        refreshBottomBar()
    }

    func navigationController(_ navigationController: UINavigationController, willShow viewController: UIViewController, animated: Bool) {
        if navigationController === mapNavigation {
            navigationController.setNavigationBarHidden(viewController === browser, animated: animated)
            if let recommendations = viewController as? RecommendationsViewController {
                recommendations.onReloadMenuChanged = { [weak self] in self?.refreshMoreMenu() }
            }
        }
    }

    func navigationController(_ navigationController: UINavigationController, didShow viewController: UIViewController, animated: Bool) {
        browser.refreshNavigationControls()
        refreshBottomBar()
    }

}
