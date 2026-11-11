import UIKit
import XCTest
@testable import DoveBevo

final class DiscoveryCitiesTests: XCTestCase {
    func testDirectoryUsesCurrentPublishedPlacesAndCatalogueWithItalianCitiesFirst() throws {
        let transport = DelayedComparisonTransport()
        let directory = DiscoveryCityDirectory(transport: transport)
        var output: DiscoveryCityDirectoryResult?
        let operation = directory.load { output = try? $0.get() }
        defer { operation.cancel() }
        XCTAssertEqual(transport.calls.map(\.endpoint), [.health])
        try transport.complete(0, .success(ComparisonFixtures.health))
        XCTAssertEqual(transport.calls.map(\.endpoint), [.health, .places(version: "20261027")])
        let places: [[Any]] = [[1, "Napoli", 40.83588, 14.24877, 215],
                               [2, "Roma", 41.89332, 12.48293, 546],
                               [3, "Milano", 45.46419, 9.18963, 681],
                               [4, "Bologna", 44.49382, 11.34263, 311]]
        try transport.complete(1, .success(ComparisonFixtures.json(places)))
        XCTAssertEqual(transport.calls[2].endpoint, .mobileCatalog)
        try transport.complete(2, .success(EuropeFixtures.catalogData()))
        XCTAssertEqual(output?.italian.map(\.name), ["Milano", "Roma", "Napoli", "Bologna"])
        XCTAssertEqual(output?.european.map(\.name), ["London", "Paris"])
        XCTAssertEqual(output?.italian.first?.area, DiscoveryArea(latitude: 45.46419, longitude: 9.18963, zoom: 14))
        XCTAssertEqual(output?.european.first?.countryName, "Regno Unito")
        XCTAssertTrue(output?.europeanAvailable == true)
    }

    func testInvalidPlacesFailClosedAndCancelledReadCannotComplete() throws {
        let transport = DelayedComparisonTransport()
        let directory = DiscoveryCityDirectory(transport: transport)
        var completions = 0
        let operation = directory.load { _ in completions += 1 }
        try transport.complete(0, .success(ComparisonFixtures.health))
        try transport.complete(1, .success(ComparisonFixtures.json([[1, "Roma", 99.0, 12.48, 1]])))
        XCTAssertEqual(completions, 1)
        XCTAssertEqual(transport.calls.count, 2, "Untrusted places cannot drive an unverified city choice")
        XCTAssertThrowsError(try ComparisonEndpoint.places(version: "20261027/../x").url())

        let again = directory.load { _ in completions += 1 }
        again.cancel()
        XCTAssertTrue(transport.calls[2].request.cancelled)
        try transport.complete(2, .success(ComparisonFixtures.health))
        XCTAssertEqual(completions, 1)
        operation.cancel()
    }

    @MainActor func testPickerShowsItalianThenEuropeanCitiesSearchesAndSelectsAtLargeText() throws {
        let directory = DelayedDiscoveryCityDirectory()
        var selected: DiscoveryCity?
        // The same source-backed city can have a slightly different averaged
        // centre after catalogue ordering changes; its checkmark must remain.
        let previouslySelected = DiscoveryCity(id: "catalog-FR|paris", name: "Paris", country: "FR",
                                               latitude: 48.8566000001, longitude: 2.3522000001)
        let picker = DiscoveryCityPickerController(directory: directory, selected: previouslySelected) { selected = $0 }
        let mounted = try OwnedReferenceWindow(root: UINavigationController(rootViewController: picker),
                                               category: .accessibilityExtraExtraExtraLarge)
        defer { mounted.close() }
        XCTAssertEqual(directory.requests.count, 1)
        directory.complete(0, .success(cityFixture()))
        XCTAssertEqual(picker.tableView.numberOfRows(inSection: 0), 2)
        XCTAssertEqual(picker.tableView.numberOfRows(inSection: 1), 1)
        XCTAssertEqual(picker.tableView(picker.tableView, titleForHeaderInSection: 0), "Città italiane")
        XCTAssertEqual(picker.tableView(picker.tableView, titleForHeaderInSection: 1), "Città europee")
        let first = picker.tableView(picker.tableView, cellForRowAt: IndexPath(row: 0, section: 0))
        XCTAssertEqual(first.textLabel?.text, "Milano")
        XCTAssertTrue(first.textLabel?.adjustsFontForContentSizeCategory == true)
        XCTAssertEqual(first.accessibilityHint, "Mostra i prezzi dei drink nella zona centrale di Milano")
        picker.navigationItem.searchController?.searchBar.text = "par"
        if let search = picker.navigationItem.searchController { picker.updateSearchResults(for: search) }
        XCTAssertEqual(picker.tableView.numberOfRows(inSection: 0), 0)
        XCTAssertEqual(picker.tableView.numberOfRows(inSection: 1), 1)
        let paris = picker.tableView(picker.tableView, cellForRowAt: IndexPath(row: 0, section: 1))
        XCTAssertEqual(paris.accessoryType, .checkmark)
        picker.tableView(picker.tableView, didSelectRowAt: IndexPath(row: 0, section: 1))
        XCTAssertEqual(selected?.name, "Paris")
        mounted.attach(to: self, name: "Scopri-city-picker-XXXL")
    }

    @MainActor func testCityButtonOpensNativePickerAndCancelKeepsCurrentArea() throws {
        let directory = DelayedDiscoveryCityDirectory()
        let controller = DiscoveryViewController(client: CityDiscoveryService(), cityDirectory: directory,
                                                 activityCheck: { true }, onOpen: { _ in }, onMap: {})
        let mounted = try OwnedReferenceWindow(root: UINavigationController(rootViewController: controller))
        defer { mounted.close() }
        let button = try XCTUnwrap(descendants(controller.view).compactMap { $0 as? UIButton }
            .first { $0.accessibilityIdentifier == "discovery.citySelector" })
        XCTAssertGreaterThanOrEqual(button.bounds.height, 48)
        button.sendActions(for: .touchUpInside)
        let opened = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            controller.presentedViewController is UINavigationController
        }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [opened], timeout: 5), .completed)
        let navigation = try XCTUnwrap(controller.presentedViewController as? UINavigationController)
        let picker = try XCTUnwrap(navigation.topViewController as? DiscoveryCityPickerController)
        XCTAssertEqual(picker.navigationItem.leftBarButtonItem?.title, "Annulla")
        XCTAssertEqual(directory.requests.count, 1)
        directory.complete(0, .success(cityFixture()))
        XCTAssertEqual(picker.tableView.numberOfRows(inSection: 0), 2)
        navigation.dismiss(animated: false)
        XCTAssertNil(controller.area)
    }

    @MainActor func testPickerShowsRetryOnReadErrorAndCitySelectionLoadsAreaWithoutMap() throws {
        let directory = DelayedDiscoveryCityDirectory()
        let picker = DiscoveryCityPickerController(directory: directory, selected: nil) { _ in }
        picker.loadViewIfNeeded()
        directory.complete(0, .failure(.unavailable))
        XCTAssertEqual(picker.tableView.backgroundView?.accessibilityIdentifier, "discovery.cityError")
        XCTAssertEqual(picker.navigationItem.rightBarButtonItem?.title, "Riprova")
        picker.loadCities()
        directory.complete(1, .success(cityFixture()))
        XCTAssertNil(picker.tableView.backgroundView)

        let client = CityDiscoveryService()
        let discovery = DiscoveryViewController(client: client, cityDirectory: directory,
                                                activityCheck: { true }, onOpen: { _ in }, onMap: {})
        discovery.loadViewIfNeeded()
        discovery.beginAppearanceTransition(true, animated: false); discovery.endAppearanceTransition()
        XCTAssertTrue(client.areas.isEmpty)
        let milano = cityFixture().italian[0]
        discovery.selectCity(milano)
        XCTAssertEqual(discovery.selectedCity, milano)
        XCTAssertEqual(discovery.area, milano.area)
        XCTAssertEqual(client.areas, [milano.area!])
        let selector = try XCTUnwrap(descendants(discovery.view).compactMap { $0 as? UIButton }
            .first { $0.accessibilityIdentifier == "discovery.citySelector" })
        XCTAssertEqual(selector.accessibilityValue, "Milano, Italia")
        discovery.setArea(DiscoveryArea(latitude: 41.89332, longitude: 12.48293, zoom: 14))
        XCTAssertNil(discovery.selectedCity, "An explicit map area must replace the city focus")
        XCTAssertEqual(client.areas.count, 2)
        discovery.beginAppearanceTransition(false, animated: false); discovery.endAppearanceTransition()
    }

    private func cityFixture() -> DiscoveryCityDirectoryResult {
        DiscoveryCityDirectoryResult(italian: [
            DiscoveryCity(id: "it-place-1", name: "Milano", country: "IT", latitude: 45.46419, longitude: 9.18963),
            DiscoveryCity(id: "it-place-2", name: "Roma", country: "IT", latitude: 41.89332, longitude: 12.48293)],
            european: [DiscoveryCity(id: "catalog-FR|paris", name: "Paris", country: "FR", latitude: 48.8566, longitude: 2.3522)],
            europeanAvailable: true)
    }

    @MainActor private func descendants(_ view: UIView) -> [UIView] {
        view.subviews.flatMap { [$0] + descendants($0) }
    }
}

private final class DelayedDiscoveryCityDirectory: DiscoveryCityDirectoryServing {
    struct Request { let handle: TestRecommendationRequest; let completion: (Result<DiscoveryCityDirectoryResult, ComparisonReadError>) -> Void }
    var requests: [Request] = []
    func load(_ completion: @escaping (Result<DiscoveryCityDirectoryResult, ComparisonReadError>) -> Void) -> RecommendationRequest {
        let handle = TestRecommendationRequest()
        requests.append(Request(handle: handle, completion: completion))
        return handle
    }
    func complete(_ index: Int, _ result: Result<DiscoveryCityDirectoryResult, ComparisonReadError>) {
        requests[index].completion(result)
    }
}

private final class CityDiscoveryService: DiscoveryServing {
    var areas: [DiscoveryArea] = []
    func load(_ area: DiscoveryArea, completion: @escaping (DiscoverySnapshot) -> Void) -> RecommendationRequest {
        areas.append(area)
        return TestRecommendationRequest()
    }
}
