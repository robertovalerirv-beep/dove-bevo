import Foundation

/// Navigation identity prevents a stopped or replaced load's late delegate
/// callback from replacing the recovery controls for the current load.
struct BrowserNavigationState {
    // Retain these two bounded tokens: an ObjectIdentifier alone can be reused
    // after deallocation, incorrectly treating a new navigation as a stopped one.
    private var active: AnyObject?
    private var stopped: AnyObject?
    private(set) var isStopped = false

    @discardableResult
    mutating func begin(_ navigation: AnyObject?) -> Bool {
        if let navigation, let stopped, navigation === stopped { return false }
        active = navigation
        isStopped = false
        return true
    }

    mutating func stop() {
        stopped = active
        isStopped = true
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
