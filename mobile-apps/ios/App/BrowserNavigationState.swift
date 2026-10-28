import Foundation

/// Navigation identity prevents a stopped or replaced load's late delegate
/// callback from replacing the recovery controls for the current load.
struct BrowserNavigationState {
    private final class RetiredNavigation {
        weak var value: AnyObject?
        init(_ value: AnyObject) { self.value = value }
    }

    // Weak retirement rejects late starts as well as late finish/error events.
    // Purge released tokens on every transition; do not retain completed
    // navigation objects or store raw identities that can later be reused.
    private var active: AnyObject?
    private var retired: [RetiredNavigation] = []
    private(set) var isStopped = false

    @discardableResult
    mutating func begin(_ navigation: AnyObject?) -> Bool {
        retired.removeAll { $0.value == nil }
        if let navigation, retired.contains(where: { $0.value === navigation }) { return false }
        if let active, active !== navigation { retire(active) }
        active = navigation
        isStopped = false
        return true
    }

    mutating func stop() {
        retired.removeAll { $0.value == nil }
        if let active { retire(active) }
        isStopped = true
    }

    private mutating func retire(_ navigation: AnyObject) {
        guard !retired.contains(where: { $0.value === navigation }) else { return }
        retired.append(RetiredNavigation(navigation))
    }

    func acceptsCallback(_ navigation: AnyObject?) -> Bool {
        guard !isStopped else { return false }
        switch (active, navigation) {
        case (nil, nil): return true
        case (let active?, let navigation?): return active === navigation
        default: return false
        }
    }
}
