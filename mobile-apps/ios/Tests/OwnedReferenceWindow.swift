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

    func attach(to test: XCTestCase, name: String) {
        layout()
        let mounted = XCTNSPredicateExpectation(predicate: NSPredicate { [self] _, _ in
            layout()
            return root.view.window === window && root.view.bounds.size == window.bounds.size && !window.isHidden
        }, object: nil)
        let result = XCTWaiter.wait(for: [mounted], timeout: 5)
        let records = descendants(window).map { view -> String in
            let frame = view.convert(view.bounds, to: window)
            let label = view as? UILabel
            return "\(type(of: view)) id=\(view.accessibilityIdentifier ?? "") frame=\(frame) hidden=\(view.isHidden) text=\(label?.text ?? "") font=\(label?.font.pointSize ?? 0)"
        }
        let details = XCTAttachment(string: ([
            "PRIVATE OWNED UIKIT FIXTURE — no live venue/price claim, no public contribution, no physical-device/store proof.",
            "windowPoints=\(window.bounds) actualCategory=\(root.traitCollection.preferredContentSizeCategory.rawValue) requestedCategory=\(traits.preferredContentSizeCategory.rawValue) mounted=\(result.rawValue)"
        ] + records).joined(separator: "\n"))
        details.name = "DoveBevo-PRIVATE-FIXTURE-\(name)-402x800-geometry"; details.lifetime = .keepAlways
        test.add(details)
        let image = UIGraphicsImageRenderer(bounds: window.bounds).image { context in window.layer.render(in: context.cgContext) }
        let attachment = XCTAttachment(image: image)
        attachment.name = "DoveBevo-PRIVATE-FIXTURE-\(name)-402x800-actual-UIKit-window"
        attachment.lifetime = .keepAlways; test.add(attachment)
        XCTAssertEqual(result, .completed)
        XCTAssertEqual(root.traitCollection.preferredContentSizeCategory, traits.preferredContentSizeCategory)
    }

    func close() {
        window.isHidden = true; window.rootViewController = nil; previousKeyWindow?.makeKey()
    }

    private func descendants(_ view: UIView) -> [UIView] { view.subviews.flatMap { [$0] + descendants($0) } }
}
