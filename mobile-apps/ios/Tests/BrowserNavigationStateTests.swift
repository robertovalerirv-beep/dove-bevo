import Foundation
import XCTest
@testable import DoveBevo

final class BrowserNavigationStateTests: XCTestCase {
    func testStopRejectsLateCompletionAndFailureUntilAnotherNavigation() {
        let first = NSObject()
        var state = BrowserNavigationState()
        XCTAssertTrue(state.begin(first))
        XCTAssertTrue(state.acceptsCallback(first))
        state.stop()
        XCTAssertTrue(state.isStopped)
        XCTAssertFalse(state.acceptsCallback(first))
        XCTAssertFalse(state.begin(first), "A delayed start for a stopped navigation must not resurrect loading")
        let retry = NSObject()
        XCTAssertTrue(state.begin(retry))
        XCTAssertFalse(state.isStopped)
        XCTAssertTrue(state.acceptsCallback(retry))
        XCTAssertFalse(state.acceptsCallback(first), "A stopped load cannot hide a newer retry with its late error")
    }

    func testOldNonCancelledFailureDoesNotReplaceNewerPageState() {
        let old = NSObject()
        let current = NSObject()
        var state = BrowserNavigationState()
        XCTAssertTrue(state.begin(old))
        XCTAssertTrue(state.begin(current))
        XCTAssertFalse(state.acceptsCallback(old))
        XCTAssertTrue(state.acceptsCallback(current))
        XCTAssertFalse(state.acceptsCallback(nil), "An unidentifiable callback cannot replace an active navigation")
    }
}
