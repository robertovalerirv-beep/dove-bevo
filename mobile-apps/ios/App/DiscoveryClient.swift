import Foundation

protocol DiscoveryServing {
    func load(_ area: DiscoveryArea, completion: @escaping (DiscoverySnapshot) -> Void) -> RecommendationRequest
}

final class DiscoveryClient: DiscoveryServing {
    private let transport: ComparisonReadTransport
    private let includeEurope: Bool
    private let includeMenuV2: Bool
    private let today: () -> String
    private let schedule: (TimeInterval, @escaping () -> Void) -> RecommendationRequest

    init(transport: ComparisonReadTransport = ComparisonHTTPTransport(), includeEurope: Bool = true,
         includeMenuV2: Bool = true, today: @escaping () -> String = { ComparisonJSON.today() },
         schedule: @escaping (TimeInterval, @escaping () -> Void) -> RecommendationRequest = { delay, action in
             let item = DispatchWorkItem(block: action)
             DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: item)
             return ComparisonCancellation { item.cancel() }
         }) {
        self.transport = transport; self.includeEurope = includeEurope
        self.includeMenuV2 = includeEurope && includeMenuV2
        self.today = today; self.schedule = schedule
    }

    func load(_ area: DiscoveryArea, completion: @escaping (DiscoverySnapshot) -> Void) -> RecommendationRequest {
        let operation = DiscoveryLoad(area: area, transport: transport, includeEurope: includeEurope,
                                      includeMenuV2: includeMenuV2, today: today, completion: completion)
        operation.start(schedule: schedule)
        return operation
    }
}

private final class DiscoveryLoad: RecommendationRequest {
    private let area: DiscoveryArea
    private let transport: ComparisonReadTransport
    private let includeEurope: Bool
    private let includeMenuV2: Bool
    private var catalog: EuropeCatalog?
    private var europe = EuropeSnapshot()
    private var menu: [String: MenuV2CellVenue] = [:]
    private var menuOrigins: [String: String] = [:]
    private var menuUnavailableCells = Set<String>()
    private let today: () -> String
    private var completion: ((DiscoverySnapshot) -> Void)?
    private var deadline: RecommendationRequest?
    private var pending = Set<UUID>()
    private var handles: [UUID: RecommendationRequest] = [:]
    private var queued: [String] = []
    private var active = Set<String>()
    private var version = ""
    private var results: [String: DiscoveryVenue] = [:]
    private var origins: [String: Set<String>] = [:]
    private var conflictingKeys = Set<String>()
    private var conflictingCells = Set<String>()
    private var unavailable: Set<String>

    init(area: DiscoveryArea, transport: ComparisonReadTransport, includeEurope: Bool,
         includeMenuV2: Bool, today: @escaping () -> String,
         completion: @escaping (DiscoverySnapshot) -> Void) {
        self.area = area; self.transport = transport; self.includeEurope = includeEurope
        self.includeMenuV2 = includeMenuV2; self.today = today; self.completion = completion
        unavailable = Set(area.cells)
    }

    func start(schedule: (TimeInterval, @escaping () -> Void) -> RecommendationRequest) {
        deadline = schedule(60) { [weak self] in self?.finish() }
        if includeEurope {
            fetch(.mobileCatalog) { [weak self] result in
                guard let self else { return }
                self.catalog = try? EuropeJSON.catalog(result.get())
                self.startHealth()
            }
        } else { startHealth() }
    }

    private func startHealth() {
        fetch(.health) { [weak self] result in
            guard let self else { return }
            do {
                self.version = try ComparisonJSON.version(result.get())
                self.queued = self.area.cells
                self.pump()
            } catch {
                if self.includeEurope { self.queued = self.area.cells; self.pump() }
                else { self.finish() }
            }
        }
    }

    private func pump() {
        guard completion != nil else { return }
        while active.count < 3 && !queued.isEmpty {
            let cell = queued.removeFirst(); active.insert(cell)
            if includeEurope && !EuropeJSON.italianCell(cell) { fetchEurope(cell, parsed: nil); continue }
            fetch(.venues(version: version, cell: cell)) { [weak self] result in
                self?.fetchPrices(cell, staticData: try? result.get())
            }
        }
        if queued.isEmpty && active.isEmpty { finish() }
    }

    private func fetchPrices(_ cell: String, staticData: Data?) {
        fetch(.prices(cell: cell)) { [weak self] result in
            guard let self else { return }
            let parsed = try? DiscoveryJSON.resolve(staticData: staticData, priceData: result.get(), cell: cell, today: self.today())
            self.fetchEurope(cell, parsed: parsed)
        }
    }

    private func fetchEurope(_ cell: String, parsed: DiscoveryJSON.Cell?) {
        if let catalog, catalog.venues.values.contains(where: { $0.cell == cell }) {
            fetch(.mobilePrices(cell: cell)) { [weak self] result in
                guard let self else { return }
                let governed = Set(catalog.venues.keys)
                if let mobile = try? EuropeJSON.resolve(result.get(), catalog: catalog, cell: cell, today: self.today()) {
                    self.europe.venues.merge(mobile.venues.filter { !self.conflictingKeys.contains($0.key) }) { _, latest in latest }
                    let legacy = parsed.map { DiscoveryJSON.Cell(venues: $0.venues.filter { !mobile.hidden.contains($0.key) && (!governed.contains($0.key) || mobile.legacy.contains($0.key)) }, incomplete: $0.incomplete) }
                    self.fetchMenuV2(cell, parsed: legacy, mobileAvailable: !EuropeJSON.italianCell(cell))
                } else {
                    self.europe.unavailableCells.insert(cell)
                    let legacy = parsed.map { DiscoveryJSON.Cell(venues: $0.venues.filter { !governed.contains($0.key) }, incomplete: true) }
                    self.fetchMenuV2(cell, parsed: legacy, mobileAvailable: false)
                }
            }
        } else { fetchMenuV2(cell, parsed: parsed, mobileAvailable: catalog != nil && !EuropeJSON.italianCell(cell)) }
    }

    private func fetchMenuV2(_ cell: String, parsed: DiscoveryJSON.Cell?, mobileAvailable: Bool) {
        guard includeMenuV2, EuropeJSON.italianCell(cell) else {
            completed(cell, parsed: parsed, mobileAvailable: mobileAvailable); return
        }
        readMenuPage(cell, after: nil, pagesLeft: 10, collected: [:], partial: false,
                     parsed: parsed, mobileAvailable: mobileAvailable)
    }

    private func readMenuPage(_ cell: String, after: String?, pagesLeft: Int,
                              collected: [String: MenuV2CellVenue], partial: Bool,
                              parsed: DiscoveryJSON.Cell?, mobileAvailable: Bool) {
        let categories = DrinkCategory.all.map(\.code)
        fetch(.menuV2Cell(cell: cell, categories: categories, after: after)) { [weak self] result in
            guard let self else { return }
            guard let page = try? MenuV2JSON.cellPage(result.get(), cell: cell,
                                                      categories: categories, after: after) else {
                self.finishMenu(cell, collected: collected, partial: true,
                                parsed: parsed, mobileAvailable: mobileAvailable); return
            }
            var next = collected
            for venue in page.venues {
                guard next[venue.key] == nil else {
                    self.finishMenu(cell, collected: next, partial: true,
                                    parsed: parsed, mobileAvailable: mobileAvailable); return
                }
                next[venue.key] = venue
            }
            if let cursor = page.next, pagesLeft > 1 {
                self.readMenuPage(cell, after: cursor, pagesLeft: pagesLeft - 1,
                                  collected: next, partial: partial || page.incomplete,
                                  parsed: parsed, mobileAvailable: mobileAvailable)
            } else {
                self.finishMenu(cell, collected: next,
                                partial: partial || page.incomplete || page.next != nil,
                                parsed: parsed, mobileAvailable: mobileAvailable)
            }
        }
    }

    private func finishMenu(_ cell: String, collected: [String: MenuV2CellVenue], partial: Bool,
                            parsed: DiscoveryJSON.Cell?, mobileAvailable: Bool) {
        if partial { menuUnavailableCells.insert(cell) }
        for venue in collected.values {
            if let previous = menuOrigins[venue.key], previous != cell {
                menu.removeValue(forKey: venue.key)
                menuUnavailableCells.formUnion([previous, cell])
            } else if !conflictingKeys.contains(venue.key) {
                menuOrigins[venue.key] = cell
                menu[venue.key] = venue
            }
        }
        completed(cell, parsed: parsed, mobileAvailable: mobileAvailable)
    }

    private func completed(_ cell: String, parsed: DiscoveryJSON.Cell?, mobileAvailable: Bool) {
        if let parsed {
            for venue in parsed.venues {
                if let known = catalog?.venues[venue.key], known.cell != cell {
                    conflictingKeys.insert(venue.key)
                    conflictingCells.formUnion([known.cell, cell]); unavailable.formUnion([known.cell, cell])
                    results.removeValue(forKey: venue.key); europe.venues.removeValue(forKey: venue.key)
                    menu.removeValue(forKey: venue.key)
                    continue
                }
                var cells = self.origins[venue.key, default: []]
                cells.insert(cell)
                self.origins[venue.key] = cells
                if cells.count > 1 {
                    self.conflictingKeys.insert(venue.key)
                    self.conflictingCells.formUnion(cells)
                    self.unavailable.formUnion(cells)
                    self.results.removeValue(forKey: venue.key); self.menu.removeValue(forKey: venue.key)
                } else if !self.conflictingKeys.contains(venue.key) {
                    self.results[venue.key] = venue
                }
            }
            if !parsed.incomplete && !self.conflictingCells.contains(cell) { self.unavailable.remove(cell) }
        }
        if mobileAvailable && !conflictingCells.contains(cell) { unavailable.remove(cell) }
        active.remove(cell); pump()
    }

    private func fetch(_ endpoint: ComparisonEndpoint, completion callback: @escaping (Result<Data, ComparisonReadError>) -> Void) {
        guard completion != nil else { return }
        let token = UUID(); pending.insert(token)
        let handle = transport.get(endpoint) { [weak self] result in
            guard let self, self.completion != nil, self.pending.remove(token) != nil else { return }
            self.handles.removeValue(forKey: token); callback(result)
        }
        if pending.contains(token) { handles[token] = handle } else { handle.cancel() }
    }

    func cancel() {
        completion = nil; deadline?.cancel(); deadline = nil
        pending.removeAll(); queued.removeAll(); active.removeAll()
        let requests = Array(handles.values); handles.removeAll(); requests.forEach { $0.cancel() }
    }

    private func finish() {
        guard let callback = completion else { return }
        let value = DiscoverySnapshot(area: area, venues: Array(results.values), unavailableCells: unavailable,
                                      europe: includeEurope ? europe : nil,
                                      menu: menu, menuUnavailableCells: menuUnavailableCells)
        cancel(); callback(value)
    }
}
