import UIKit
import XCTest
@testable import DoveBevo

final class NativeAppearanceTests: XCTestCase {
    @MainActor
    func testSelectedDestinationAndNativeTextHaveLegibleContrastOnWhiteAndAmber() throws {
        let bar = NativeBottomBar()
        bar.update(destination: 0, venueActionsEnabled: false)
        let map = bar.button(for: .map)
        XCTAssertTrue(map.isSelected)
        XCTAssertEqual(map.configuration?.baseBackgroundColor, NativeAppearance.ink)
        XCTAssertEqual(map.configuration?.baseForegroundColor, NativeAppearance.surface)
        XCTAssertGreaterThanOrEqual(try contrast(try XCTUnwrap(map.configuration?.baseForegroundColor), try XCTUnwrap(map.configuration?.baseBackgroundColor)), 4.5)
        XCTAssertFalse(bar.button(for: .save).isEnabled)
        XCTAssertTrue(bar.button(for: .save).accessibilityTraits.contains(.notEnabled))
        bar.update(destination: 1, venueActionsEnabled: true)
        XCTAssertFalse(map.isSelected)
        XCTAssertTrue(bar.button(for: .favourites).isSelected)
        XCTAssertTrue(bar.button(for: .save).isEnabled)
        XCTAssertGreaterThanOrEqual(try contrast(NativeAppearance.muted, NativeAppearance.surface), 4.5)
        XCTAssertGreaterThanOrEqual(try contrast(NativeAppearance.ink, NativeAppearance.accent), 4.5)
        let navigation = UINavigationController(rootViewController: UIViewController())
        NativeAppearance.configure(navigation)
        XCTAssertEqual(navigation.navigationBar.standardAppearance.backgroundColor, NativeAppearance.surface)
        XCTAssertEqual(navigation.navigationBar.scrollEdgeAppearance?.backgroundColor, NativeAppearance.surface)
    }

    private func contrast(_ first: UIColor, _ second: UIColor) throws -> CGFloat {
        func luminance(_ color: UIColor) throws -> CGFloat {
            var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
            guard color.getRed(&red, green: &green, blue: &blue, alpha: &alpha), alpha == 1 else {
                XCTFail("Contrast requires actual opaque RGB colours")
                throw NSError(domain: "NativeAppearanceTests", code: 1)
            }
            func linear(_ value: CGFloat) -> CGFloat { value <= 0.04045 ? value / 12.92 : pow((value + 0.055) / 1.055, 2.4) }
            return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue)
        }
        let left = try luminance(first), right = try luminance(second)
        return (max(left, right) + 0.05) / (min(left, right) + 0.05)
    }
}
