import Foundation

protocol MenuV2Serving {
    func load(_ saved: [SavedVenue], completion: @escaping (MenuV2Snapshot) -> Void) -> RecommendationRequest
}

/// Bounded, read-only requests; source menus and customer observations remain separate facts.
final class MenuV2Client: MenuV2Serving {
    private let transport: ComparisonReadTransport
    init(transport: ComparisonReadTransport = ComparisonHTTPTransport()) { self.transport = transport }
    func load(_ saved: [SavedVenue], completion: @escaping (MenuV2Snapshot) -> Void) -> RecommendationRequest {
        let operation = MenuV2Load(saved: saved, transport: transport, completion: completion)
        operation.start()
        return operation
    }
}

private final class MenuV2Load: RecommendationRequest {
    private let saved: [SavedVenue]
    private let transport: ComparisonReadTransport
    private var completion: ((MenuV2Snapshot) -> Void)?
    private var queued: [SavedVenue]
    private var active = 0
    private var venues: [URL: MenuV2Venue] = [:]
    private var unavailable = Set<URL>()
    private var pending = Set<UUID>()
    private var handles: [UUID: RecommendationRequest] = [:]
    private var deadline: DispatchWorkItem?

    init(saved: [SavedVenue], transport: ComparisonReadTransport, completion: @escaping (MenuV2Snapshot) -> Void) {
        self.saved = saved; self.transport = transport; self.completion = completion
        var seen = Set<URL>()
        queued = saved.filter { seen.insert($0.url).inserted }
    }
    func start() {
        guard saved.count <= 100, saved.allSatisfy({ ComparisonJSON.cell(from: $0) != nil }) else { finish(); return }
        let deadline = DispatchWorkItem { [weak self] in self?.finish() }
        self.deadline = deadline
        DispatchQueue.main.asyncAfter(deadline: .now() + 60, execute: deadline)
        pump()
    }
    private func pump() {
        guard completion != nil else { return }
        while active < 3 && !queued.isEmpty {
            let venue = queued.removeFirst(); active += 1
            readMenu(venue, after: nil, pages: 0, accumulated: [], expectedCount: nil, expectedName: nil, expectedFees: nil)
        }
        if active == 0 && queued.isEmpty { finish() }
    }
    private func readMenu(_ venue: SavedVenue, after: String?, pages: Int, accumulated: [MenuV2Price],
                          expectedCount: Int?, expectedName: String?, expectedFees: String?) {
        guard let cell = ComparisonJSON.cell(from: venue) else { completed(venue, result: nil); return }
        fetch(.menuV2(key: venue.url.lastPathComponent, cell: cell, after: after)) { [weak self] result in
            guard let self else { return }
            guard let data = try? result.get(),
                  let page = MenuV2JSON.menuPage(data, key: venue.url.lastPathComponent, cell: cell),
                  expectedCount == nil || expectedCount == page.count,
                  expectedName == nil || expectedName == page.name,
                  expectedFees == nil || expectedFees == page.feeNotice,
                  Set(accumulated.map(\.id)).isDisjoint(with: page.offers.map(\.id)),
                  accumulated.count + page.offers.count <= 1000 else { self.completed(venue, result: nil); return }
            let all = accumulated + page.offers
            if let next = page.next {
                guard pages < 9, next != after, !page.offers.isEmpty else { self.completed(venue, result: nil); return }
                self.readMenu(venue, after: next, pages: pages + 1, accumulated: all,
                              expectedCount: page.count, expectedName: page.name, expectedFees: page.feeNotice)
            } else {
                guard all.count == page.count else { self.completed(venue, result: nil); return }
                self.readCustomers(venue, name: page.name, fees: page.feeNotice, offers: all,
                                   after: nil, pages: 0, accumulated: [])
            }
        }
    }
    private func readCustomers(_ venue: SavedVenue, name: String, fees: String, offers: [MenuV2Price],
                               after: String?, pages: Int, accumulated: [MenuV2Customer]) {
        guard let cell = ComparisonJSON.cell(from: venue) else { completed(venue, result: nil); return }
        fetch(.customerV2(key: venue.url.lastPathComponent, cell: cell, after: after)) { [weak self] result in
            guard let self else { return }
            guard let data = try? result.get(),
                  let page = MenuV2JSON.customerPage(data, key: venue.url.lastPathComponent, cell: cell),
                  page.name == name, Set(accumulated.map(\.id)).isDisjoint(with: page.rows.map(\.id)),
                  accumulated.count + page.rows.count <= 500 else {
                self.completed(venue, result: MenuV2Venue(key: venue.url.lastPathComponent, cell: cell, name: name, offers: offers, feeNotice: fees))
                return
            }
            let all = accumulated + page.rows
            if let next = page.next {
                guard pages < 9, next != after, !page.rows.isEmpty else {
                    self.completed(venue, result: MenuV2Venue(key: venue.url.lastPathComponent, cell: cell, name: name, offers: offers, feeNotice: fees)); return
                }
                self.readCustomers(venue, name: name, fees: fees, offers: offers, after: next, pages: pages + 1, accumulated: all)
            } else {
                let byID = Dictionary(uniqueKeysWithValues: offers.map { ($0.id, $0) })
                let reports: [MenuV2Price] = all.compactMap { item in
                    guard let id = item.offerID, let source = byID[id], source.band != nil,
                          source.category == item.category, source.currency == item.currency,
                          source.exponent == item.exponent, source.servingLabel == item.servingLabel,
                          source.servingML == item.servingML else { return nil }
                    return MenuV2Price(id: item.id, venueName: name, itemName: item.name,
                                       category: source.category, band: source.band,
                                       amountMinor: item.amountMinor, currency: item.currency, exponent: item.exponent,
                                       servingLabel: item.servingLabel, servingML: item.servingML,
                                       origin: .customer(item.observedOn), feeNotice: fees)
                }
                self.completed(venue, result: MenuV2Venue(key: venue.url.lastPathComponent, cell: cell,
                                                          name: name, offers: offers + reports, feeNotice: fees))
            }
        }
    }
    private func completed(_ venue: SavedVenue, result: MenuV2Venue?) {
        guard completion != nil else { return }
        if let result { venues[venue.url] = result } else { unavailable.insert(venue.url) }
        active -= 1; pump()
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
        queued.removeAll(); pending.removeAll()
        let requests = Array(handles.values); handles.removeAll(); requests.forEach { $0.cancel() }
    }
    private func finish() {
        guard let callback = completion else { return }
        let missing = Set(saved.map(\.url)).subtracting(venues.keys)
        let value = MenuV2Snapshot(venues: venues, unavailable: unavailable.union(missing))
        cancel(); callback(value)
    }
}
