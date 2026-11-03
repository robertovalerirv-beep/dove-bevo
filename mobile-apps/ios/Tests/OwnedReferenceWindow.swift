import UIKit
import XCTest

/// Actual UIKit fixture rendering, not a composited mock or a store screenshot.
@MainActor final class OwnedReferenceWindow {
    let window: UIWindow
    private let root: UIViewController
    private let previousKeyWindow: UIWindow?
    private let host = UIViewController()
    private let traits: UITraitCollection

    init(root: UIViewController, category: UIContentSizeCategory = .large) throws {
        self.root = root; traits = UITraitCollection(preferredContentSizeCategory: category)
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first {
            $0.activationState == .foregroundActive
        })
        previousKeyWindow = scene.windows.first { $0.isKeyWindow }
        window = UIWindow(windowScene: scene)
        window.frame = CGRect(x: 0, y: 0, width: 402, height: 800)
        window.overrideUserInterfaceStyle = .light
        window.rootViewController = host
        host.addChild(root)
        host.setOverrideTraitCollection(traits, forChild: root)
        root.view.translatesAutoresizingMaskIntoConstraints = false
        host.view.addSubview(root.view)
        NSLayoutConstraint.activate([
            root.view.leadingAnchor.constraint(equalTo: host.view.leadingAnchor),
            root.view.trailingAnchor.constraint(equalTo: host.view.trailingAnchor),
            root.view.topAnchor.constraint(equalTo: host.view.topAnchor),
            root.view.bottomAnchor.constraint(equalTo: host.view.bottomAnchor)
        ])
        root.didMove(toParent: host)
        window.makeKeyAndVisible()
        layout()
    }

    func layout() { window.layoutIfNeeded(); host.view.layoutIfNeeded(); root.view.layoutIfNeeded() }

    private func mountState() -> String {
        "rootInOwnedWindow=\(root.view.window === window) rootBounds=\(root.view.bounds) windowBounds=\(window.bounds) windowHidden=\(window.isHidden) windowKey=\(window.isKeyWindow) sceneState=\(String(describing: window.windowScene?.activationState))"
    }

    func attach(to test: XCTestCase, name: String) {
        layout()
        let firstState = mountState()
        // A hosted simulator can transfer key status after presentation. Restore
        // this test-owned window before checking its real mounted geometry.
        if window.windowScene?.activationState == .foregroundActive &&
            (window.isHidden || !window.isKeyWindow) {
            window.makeKeyAndVisible(); layout()
        }
        let isMounted: () -> Bool = { [self] in
            layout()
            return root.view.window === window && root.view.bounds.size == window.bounds.size && !window.isHidden
        }
        let result: XCTWaiter.Result
        if isMounted() {
            result = .completed
        } else {
            let mounted = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in isMounted() }, object: nil)
            result = XCTWaiter.wait(for: [mounted], timeout: 15)
        }
        let finalMounted = isMounted()
        let finalState = mountState()
        let records = descendants(window).map { view -> String in
            let frame = view.convert(view.bounds, to: window)
            let label = view as? UILabel
            return "\(type(of: view)) id=\(view.accessibilityIdentifier ?? "") frame=\(frame) hidden=\(view.isHidden) text=\(label?.text ?? "") font=\(label?.font.pointSize ?? 0)"
        }
        let details = XCTAttachment(string: ([
            "PRIVATE OWNED UIKIT FIXTURE — no live venue/price claim, no public contribution, no physical-device/store proof.",
            "windowPoints=\(window.bounds) actualCategory=\(root.traitCollection.preferredContentSizeCategory.rawValue) requestedCategory=\(traits.preferredContentSizeCategory.rawValue) mounted=\(result.rawValue)",
            "initialMountState=\(firstState)",
            "finalMountState=\(finalState)"
        ] + records).joined(separator: "\n"))
        details.name = "DoveBevo-PRIVATE-FIXTURE-\(name)-402x800-geometry"; details.lifetime = .keepAlways
        test.add(details)
        let image = UIGraphicsImageRenderer(bounds: window.bounds).image { context in window.layer.render(in: context.cgContext) }
        let attachment = XCTAttachment(image: image)
        attachment.name = "DoveBevo-PRIVATE-FIXTURE-\(name)-402x800-actual-UIKit-window"
        attachment.lifetime = .keepAlways; test.add(attachment)
        XCTAssertTrue(finalMounted, "The actual owned UIKit window must remain mounted at capture")
        XCTAssertEqual(root.traitCollection.preferredContentSizeCategory, traits.preferredContentSizeCategory)
    }

    func close() {
        window.isHidden = true; window.rootViewController = nil; previousKeyWindow?.makeKey()
    }

    private func descendants(_ view: UIView) -> [UIView] { view.subviews.flatMap { [$0] + descendants($0) } }
}
