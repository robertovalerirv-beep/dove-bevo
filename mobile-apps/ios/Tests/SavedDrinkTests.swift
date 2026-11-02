import Foundation
import XCTest
@testable import DoveBevo

final class SavedDrinkTests: XCTestCase {
    private let venue = URL(string: "https://www.dovebevo.com/bar/n123?c=u0nd9")!
    private func item(_ code: String = "spritz", band: ComparisonBand = .normal, cell: String = "u0nd9", key: Int = 123) throws -> SavedDrink {
        try SavedDrink.validated(url: URL(string: "https://www.dovebevo.com/bar/n\(key)?c=\(cell)")!, label: "Nome automatico \(key)", drink: code, band: band)
    }

    func testSeparateVersionedFileNeverChangesVenueBookmarksOrStoresPrices() throws {
        try withStores { venues, drinks, _ in
            try venues.save(url: venue, label: "Locale precedente")
            let previous = try Data(contentsOf: venues.fileURL)
            try drinks.save(item()); try drinks.save(item(band: .happyHour))
            XCTAssertEqual(try Data(contentsOf: venues.fileURL), previous)
            XCTAssertEqual(try drinks.load().map(\.band), [.happyHour, .normal])
            let root = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: drinks.fileURL)) as? [String: Any])
            XCTAssertEqual(Set(root.keys), ["version", "drinks"])
            let records = try XCTUnwrap(root["drinks"] as? [[String: Any]])
            XCTAssertEqual(Set(try XCTUnwrap(records.first).keys), ["url", "label", "drink", "hh"])
            XCTAssertTrue(try drinks.fileURL.deletingLastPathComponent().resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup == true)
            try drinks.remove(item())
            XCTAssertEqual(try drinks.load().map(\.band), [.happyHour])
            XCTAssertEqual(try Data(contentsOf: venues.fileURL), previous)
        }
    }

    func testTupleIdentityUpsertsAcrossCellsWithoutMergingCategoriesOrBands() throws {
        try withStores { _, drinks, directory in
            try drinks.save(item()); try drinks.save(item("negroni")); try drinks.save(item(band: .happyHour))
            let moved = try item(cell: "u0nd8")
            try drinks.save(moved)
            let reloaded = try SavedDrinkStore(directoryURL: directory.appendingPathComponent("drinks")).load()
            XCTAssertEqual(reloaded.count, 3); XCTAssertEqual(reloaded.first, moved)
            try drinks.remove(item())
            XCTAssertEqual(try drinks.load().map(\.identity), [try item(band: .happyHour).identity, try item("negroni").identity])
        }
    }

    func testCapacityAndUnreadableSavePreserveExactPriorBytes() throws {
        try withStores { _, drinks, _ in
            for key in 1...50 { try drinks.save(item(key: key)) }
            let previous = try Data(contentsOf: drinks.fileURL)
            XCTAssertThrowsError(try drinks.save(item(key: 51)))
            XCTAssertEqual(try Data(contentsOf: drinks.fileURL), previous)
            try drinks.save(item(key: 1)); XCTAssertEqual(try drinks.load().first?.venue.url.lastPathComponent, "n1")
            let corrupt = Data("{broken".utf8); try corrupt.write(to: drinks.fileURL)
            XCTAssertThrowsError(try drinks.save(item()))
            XCTAssertEqual(try Data(contentsOf: drinks.fileURL), corrupt)
        }
    }

    func testActualWriteFailurePreservesPreviousDrinkAndVenueFiles() throws {
        try withStores { venues, drinks, directory in
            try venues.save(url: venue, label: "Existing venue"); try drinks.save(item())
            let beforeDrinks = try Data(contentsOf: drinks.fileURL), beforeVenues = try Data(contentsOf: venues.fileURL)
            let folder = directory.appendingPathComponent("drinks")
            try FileManager.default.setAttributes([.posixPermissions: 0o500], ofItemAtPath: folder.path)
            defer { try? FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: folder.path) }
            XCTAssertThrowsError(try drinks.save(item("negroni")))
            XCTAssertEqual(try Data(contentsOf: drinks.fileURL), beforeDrinks)
            XCTAssertEqual(try Data(contentsOf: venues.fileURL), beforeVenues)
        }
    }

    func testUnknownCategoryMalformedSchemaBooleanBandAndOversizeFailClosed() throws {
        try withStores { _, drinks, _ in
            XCTAssertThrowsError(try item("invented"))
            try drinks.save(item())
            let payloads: [Any] = [
                ["version": true, "drinks": []],
                ["version": 1, "drinks": [["url": venue.absoluteString, "label": "Nome", "drink": "spritz", "hh": true]]],
                ["version": 1, "drinks": [["url": venue.absoluteString, "label": "Nome", "drink": "spritz", "hh": 0, "price": 500]]]
            ]
            for payload in payloads {
                let bytes = try JSONSerialization.data(withJSONObject: payload)
                try bytes.write(to: drinks.fileURL)
                XCTAssertThrowsError(try drinks.load())
                XCTAssertThrowsError(try drinks.save(item()))
                XCTAssertEqual(try Data(contentsOf: drinks.fileURL), bytes)
            }
            let large = Data(repeating: 32, count: SavedDrinkStore.maximumPayloadBytes + 1)
            try large.write(to: drinks.fileURL); XCTAssertThrowsError(try drinks.load())
        }
    }

    func testFocusedURLsRoundTripKnownCategoryAndBandButKeepPrivateCanonicalIdentity() throws {
        for category in DrinkCategory.all {
            for band in ComparisonBand.allCases {
                let url = try XCTUnwrap(MobileEntry.drinkDocument(venue, drink: category.code, band: band))
                XCTAssertEqual(SavedVenuePolicy.canonicalURL(url), venue)
                XCTAssertEqual(MobileEntry.documentURL(url), url)
                XCTAssertTrue(url.absoluteString.hasSuffix("&drink=\(category.code)&hh=\(band.rawValue)"))
            }
        }
        let base = "https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9"
        for suffix in ["&drink=spritz", "&hh=1", "&drink=vodka&hh=0", "&drink=spritz&hh=true", "&drink=spritz&hh=-1", "&drink=spritz&hh=01", "&drink=spritz&hh=2", "&drink=spritz&hh=0&hh=1", "&drink=spritz&drink=negroni&hh=0", "&drink=spritz&hh=0&extra=1", "&drink=spritz&hh=0#x", "&drink=%73pritz&hh=0", "&drink=spritz&hh=%30", "&dr%69nk=spritz&hh=0"] {
            XCTAssertNil(SavedVenuePolicy.canonicalURL(URL(string: base + suffix)), suffix)
        }
        XCTAssertNil(MobileEntry.drinkDocument(venue, drink: "vodka", band: .normal))
    }

    @MainActor func testRetiredIntentCannotSaveAfterReloadBackgroundPaneOrNewerCapture() throws {
        let capture = FavouriteSaveCapture(); let saved = try item().venue
        let document = try XCTUnwrap(MobileEntry.venueDocument(venue))
        for _ in ["same-url reload", "away and back", "background", "native pane"] {
            let request = capture.begin(document: document, venue: saved)
            capture.invalidate()
            XCTAssertFalse(capture.consume(request, currentURL: document, active: true))
        }
        let old = capture.begin(document: document, venue: saved)
        let newer = capture.begin(document: document, venue: saved)
        XCTAssertFalse(capture.consume(old, currentURL: document, active: true))
        XCTAssertFalse(capture.consume(newer, currentURL: document, active: false))
        XCTAssertFalse(capture.consume(newer, currentURL: document, active: true))
        let fresh = capture.begin(document: document, venue: saved)
        XCTAssertTrue(capture.consume(fresh, currentURL: document, active: true))
        XCTAssertFalse(capture.consume(fresh, currentURL: document, active: true))
    }

    func testDrinkRowsKeepAllServingsCurrenciesAndMenuEvidenceWithoutPriceSnapshots() throws {
        let london = EuropeVenue(key: "n1001", name: "Current London", cell: "gcpvj", latitude: 51.5074, longitude: -0.1278,
                                 city: "London", country: "GB", currency: "GBP", prices: [menuPrice("GBP", ml: 175, cents: 900), menuPrice("GBP", ml: 250, cents: 1100)])
        let paris = EuropeVenue(key: "n1002", name: "Current Paris", cell: "u09tv", latitude: 48.8566, longitude: 2.3522,
                                city: "Paris", country: "FR", currency: "EUR", prices: [menuPrice("EUR", ml: 175, cents: 700)])
        let entries = try [london, paris].map { try SavedDrink.validated(url: $0.url, label: "Automatic offline name", drink: "wine_glass", band: .normal) }
        let snapshot = FavouriteComparisonSnapshot(venues: [:], unavailable: [], europe: EuropeSnapshot(venues: [london.key: london, paris.key: paris]))
        let rows = SavedDrinkRow.rows(entries, snapshot: snapshot)
        XCTAssertEqual(rows.count, 3)
        XCTAssertEqual(rows.compactMap { $0.comparison.displayPrice?.group }, ["GBP|glass:175", "GBP|glass:250", "EUR|glass:175"])
        XCTAssertTrue(rows[0].comparison.displayPrice?.details(today: "2026-11-02").contains("Fonte verificata il 2026-11-02") == true)
        XCTAssertEqual(rows[0].comparison.europePrice?.observedOn, nil)
        XCTAssertEqual(rows[0].comparison.name, "Current London")
        let offline = SavedDrinkRow.rows(entries, snapshot: nil)
        XCTAssertTrue(offline.allSatisfy { $0.comparison.unavailable && $0.comparison.displayPrice == nil })
        XCTAssertEqual(offline.first?.comparison.name, "Automatic offline name")
    }

    private func menuPrice(_ currency: String, ml: Int, cents: Int) -> EuropePrice {
        EuropePrice(drink: "wine_glass", band: .normal, currency: currency, amountMinor: cents,
                    serving: EuropeServing(unit: "glass", ml: ml), observedOn: nil, confirmedOn: nil, confirmations: 0,
                    quarantined: false, revision: String(repeating: "a", count: 64), sourceURL: URL(string: "https://official.example/menu"),
                    sourceSHA256: String(repeating: "b", count: 64), sourceCheckedOn: "2026-11-02", menuItem: "Merlot · \(ml) ml")
    }

    private func withStores(_ body: (SavedVenueStore, SavedDrinkStore, URL) throws -> Void) throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        try body(SavedVenueStore(directoryURL: directory.appendingPathComponent("venues")),
                 SavedDrinkStore(directoryURL: directory.appendingPathComponent("drinks")), directory)
    }
}
