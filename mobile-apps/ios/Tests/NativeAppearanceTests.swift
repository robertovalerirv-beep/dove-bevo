import UIKit
import XCTest
@testable import DoveBevo

final class NativeAppearanceTests: XCTestCase {
    @MainActor
    func testBottomBarUsesOneRowOnCommonPhonesAndTwoForNarrowOrLargeText() {
        // The bar reserves four points on each side of its safe area.
        XCTAssertEqual(NativeBottomBar.columns(for: 320, fontScale: 1), 3)
        XCTAssertEqual(NativeBottomBar.columns(for: 360, fontScale: 1), 5)
        XCTAssertEqual(NativeBottomBar.columns(for: 375, fontScale: 1), 5)
        XCTAssertEqual(NativeBottomBar.columns(for: 390, fontScale: 1), 5)
        XCTAssertEqual(NativeBottomBar.columns(for: 360, fontScale: 1.5), 3)
        XCTAssertEqual(NativeBottomBar.columns(for: 390, fontScale: 1.5), 3)
        XCTAssertEqual(NativeBottomBar.columns(for: 640, fontScale: 1.5), 5)
    }

    @MainActor
    func testSelectedDestinationAndNativeTextHaveLegibleContrastOnWebsiteCreamAndOrange() throws {
        let bar = NativeBottomBar()
        bar.update(destination: 0, venueActionsEnabled: false)
        let map = bar.button(for: .map)
        XCTAssertTrue(map.isSelected)
        XCTAssertEqual(NativeAppearance.chrome, NativeAppearance.canvas)
        XCTAssertNotEqual(NativeAppearance.secondary, NativeAppearance.canvas)
        XCTAssertEqual(map.configuration?.baseBackgroundColor, NativeAppearance.accent)
        XCTAssertEqual(map.configuration?.background.backgroundColor, NativeAppearance.accent)
        XCTAssertEqual(map.configuration?.baseForegroundColor, NativeAppearance.onAccent)
        XCTAssertEqual(map.configuration?.background.strokeColor, NativeAppearance.ink)
        XCTAssertEqual(map.configuration?.background.strokeWidth, 2)
        XCTAssertTrue(map.accessibilityTraits.contains(.selected))
        XCTAssertGreaterThanOrEqual(try contrast(try XCTUnwrap(map.configuration?.baseForegroundColor), try XCTUnwrap(map.configuration?.baseBackgroundColor)), 4.5)
        XCTAssertEqual(bar.buttons.count, 5)
        XCTAssertTrue(bar.button(for: .recommendations).isEnabled)
        XCTAssertFalse(bar.button(for: .recommendations).accessibilityTraits.contains(.notEnabled))
        bar.update(destination: 1, venueActionsEnabled: true)
        XCTAssertFalse(map.isSelected)
        XCTAssertTrue(bar.button(for: .favourites).isSelected)
        XCTAssertTrue(bar.button(for: .recommendations).isEnabled)
        XCTAssertFalse(map.accessibilityTraits.contains(.selected))
        XCTAssertTrue(bar.button(for: .favourites).accessibilityTraits.contains(.selected))
        for button in bar.buttons where button.isEnabled {
            let configuration = try XCTUnwrap(button.configuration)
            let background = try XCTUnwrap(configuration.background.backgroundColor)
            let foreground = try XCTUnwrap(configuration.baseForegroundColor)
            let expectedBackground = button.isSelected ? NativeAppearance.accent : NativeAppearance.chrome
            XCTAssertEqual(background, expectedBackground)
            XCTAssertEqual(configuration.baseBackgroundColor, expectedBackground)
            XCTAssertEqual(foreground, button.isSelected ? NativeAppearance.onAccent : NativeAppearance.muted)
            XCTAssertGreaterThanOrEqual(try contrast(foreground, background), 4.5)
        }
        XCTAssertGreaterThanOrEqual(try contrast(NativeAppearance.muted, NativeAppearance.surface), 4.5)
        XCTAssertGreaterThanOrEqual(try contrast(NativeAppearance.muted, NativeAppearance.chrome), 4.5)
        XCTAssertGreaterThanOrEqual(try contrast(NativeAppearance.onAccent, NativeAppearance.accent), 4.5)
        let navigation = UINavigationController(rootViewController: UIViewController())
        NativeAppearance.configure(navigation)
        XCTAssertEqual(navigation.navigationBar.standardAppearance.backgroundColor, NativeAppearance.chrome)
        XCTAssertEqual(navigation.navigationBar.scrollEdgeAppearance?.backgroundColor, NativeAppearance.chrome)
        XCTAssertEqual(navigation.navigationBar.tintColor, NativeAppearance.accentText)
    }

    @MainActor
    func testActualPrimaryAndSelectedConfigurationsUseOrangeWithAccessibleDarkInk() throws {
        let originalOrange = UIColor(red: 1, green: 90 / 255, blue: 31 / 255, alpha: 1)
        for configuration in [NativeAppearance.button(primary: true), NativeAppearance.button(selected: true)] {
            let foreground = try XCTUnwrap(configuration.baseForegroundColor)
            let background = try XCTUnwrap(configuration.baseBackgroundColor)
            XCTAssertEqual(background, originalOrange)
            XCTAssertEqual(foreground, NativeAppearance.onAccent)
            XCTAssertGreaterThanOrEqual(try contrast(foreground, background), 4.5)
            XCTAssertLessThan(try contrast(.white, background), 4.5)
        }
        XCTAssertGreaterThanOrEqual(try contrast(NativeAppearance.accentText, NativeAppearance.canvas), 4.5)
        XCTAssertGreaterThanOrEqual(try contrast(NativeAppearance.accentText, NativeAppearance.surface), 4.5)
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
