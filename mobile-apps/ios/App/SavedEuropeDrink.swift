import Foundation

/// A private exact European drink preference. No amount or public vote is stored.
struct SavedEuropeDrink: Equatable {
    let venue: SavedVenue
    let drink: String
    let band: ComparisonBand
    let currency: String
    let serving: EuropeServing

    var identity: String { "\(venue.url.absoluteString)|\(drink)|\(band.rawValue)|\(currency)|\(serving.key)" }
    var category: DrinkCategory { DrinkCategory.all.first { $0.code == drink }! }

    static func serving(from key: String, drink: String) -> EuropeServing? {
        let parts = key.split(separator: ":", omittingEmptySubsequences: false)
        guard parts.count == 2 else { return nil }
        let unit = String(parts[0]), amount = String(parts[1])
        let ml: Int?
        if amount.isEmpty { ml = nil }
        else {
            guard amount.count <= 4, amount.first != "0", amount.allSatisfy(\.isNumber),
                  let value = Int(amount), (1...2000).contains(value) else { return nil }
            ml = value
        }
        switch drink {
        case "beer_draft", "water": guard unit == "ml", ml != nil else { return nil }
        case "wine_glass": guard unit == "glass" else { return nil }
        default:
            guard DrinkCategory.all.contains(where: { $0.code == drink }), unit == "drink", ml == nil else { return nil }
        }
        return EuropeServing(unit: unit, ml: ml)
    }

    static func validated(venue: SavedVenue, drink: String, band: ComparisonBand,
                          currency: String, serving: EuropeServing) -> SavedEuropeDrink? {
        guard let safeVenue = try? SavedVenuePolicy.venue(url: venue.url, label: venue.label),
              ["EUR", "GBP"].contains(currency),
              let validServing = Self.serving(from: serving.key, drink: drink),
              validServing == serving else { return nil }
        return SavedEuropeDrink(venue: safeVenue, drink: drink, band: band,
                                currency: currency, serving: serving)
    }
}

/// Separate additive file; existing venue and drink favourites remain readable unchanged.
final class SavedEuropeDrinkStore {
    static let maximumCount = 50
    let fileURL: URL
    private let directoryURL: URL
    private let fileManager: FileManager

    init(directoryURL: URL? = nil, fileManager: FileManager = .default) {
        let support = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSHomeDirectory(), isDirectory: true)
                .appendingPathComponent("Library/Application Support", isDirectory: true)
        self.directoryURL = directoryURL ?? support.appendingPathComponent("DoveBevoSavedDrinks", isDirectory: true)
        self.fileManager = fileManager
        fileURL = self.directoryURL.appendingPathComponent("europe-drinks-v1.json")
    }

    func load() throws -> [SavedEuropeDrink] {
        guard fileManager.fileExists(atPath: fileURL.path) else { return [] }
        let values = try fileURL.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
        guard values.isRegularFile == true, values.isSymbolicLink != true else {
            throw SavedDrinkStore.StoreError.unreadableRecords
        }
        let handle = try FileHandle(forReadingFrom: fileURL); defer { try? handle.close() }
        var data = Data()
        while data.count <= SavedDrinkStore.maximumPayloadBytes {
            guard let chunk = try handle.read(upToCount: SavedDrinkStore.maximumPayloadBytes + 1 - data.count),
                  !chunk.isEmpty else { break }
            data.append(chunk)
        }
        guard data.count <= SavedDrinkStore.maximumPayloadBytes,
              let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              Set(root.keys) == ["version", "items"],
              ComparisonJSON.integer(root["version"], minimum: 1, maximum: 1) == 1,
              let raw = root["items"] as? [[String: Any]], raw.count <= Self.maximumCount else {
            throw SavedDrinkStore.StoreError.unreadableRecords
        }
        var items: [SavedEuropeDrink] = []; var seen = Set<String>()
        for value in raw {
            guard Set(value.keys) == ["url", "label", "drink", "hh", "currency", "serving"],
                  let text = value["url"] as? String, text.utf8.count <= 512, let url = URL(string: text),
                  let label = value["label"] as? String, let drink = value["drink"] as? String,
                  let hh = ComparisonJSON.integer(value["hh"], minimum: 0, maximum: 1),
                  let band = ComparisonBand(rawValue: hh), let currency = value["currency"] as? String,
                  let servingKey = value["serving"] as? String,
                  let serving = SavedEuropeDrink.serving(from: servingKey, drink: drink),
                  let item = SavedEuropeDrink.validated(venue: SavedVenue(url: url, label: label),
                      drink: drink, band: band, currency: currency, serving: serving),
                  seen.insert(item.identity).inserted else { throw SavedDrinkStore.StoreError.unreadableRecords }
            items.append(item)
        }
        return items
    }

    @discardableResult func save(_ value: SavedEuropeDrink) throws -> SavedEuropeDrink {
        guard let item = SavedEuropeDrink.validated(venue: value.venue, drink: value.drink,
              band: value.band, currency: value.currency, serving: value.serving) else {
            throw SavedDrinkStore.StoreError.unreadableRecords
        }
        var items = try load(); items.removeAll { $0.identity == item.identity }
        guard items.count < Self.maximumCount else { throw SavedDrinkStore.StoreError.capacityReached }
        items.insert(item, at: 0); try write(items); return item
    }

    func remove(_ value: SavedEuropeDrink) throws {
        let previous = try load(), items = previous.filter { $0.identity != value.identity }
        if previous.count != items.count { try write(items) }
    }

    private func write(_ items: [SavedEuropeDrink]) throws {
        let rows: [[String: Any]] = items.map { ["url": $0.venue.url.absoluteString, "label": $0.venue.label,
            "drink": $0.drink, "hh": $0.band.rawValue, "currency": $0.currency,
            "serving": $0.serving.key] }
        let data = try JSONSerialization.data(withJSONObject: ["version": 1, "items": rows], options: [.sortedKeys])
        guard data.count <= SavedDrinkStore.maximumPayloadBytes else {
            throw SavedDrinkStore.StoreError.unreadableRecords
        }
        try fileManager.createDirectory(at: directoryURL, withIntermediateDirectories: true,
            attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
        var directory = directoryURL; var values = URLResourceValues(); values.isExcludedFromBackup = true
        try directory.setResourceValues(values)
        try data.write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
}
