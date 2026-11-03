import Foundation

/// One exact, owner-menu drink at one venue. Only display metadata is retained locally, never a price.
struct SavedMenuOffer: Equatable {
    let venue: SavedVenue
    let offerID: String
    let name: String
    let category: String?
    let servingLabel: String?
    let servingML: Int?
    var identity: String { "\(venue.url.absoluteString)|\(offerID)" }

    static func verified(venue: SavedVenue, price: MenuV2Price) -> SavedMenuOffer? {
        guard case .ownerMenu = price.origin else { return nil }
        return validated(venue: venue, id: price.id, name: price.itemName,
                         category: price.category.isEmpty ? nil : price.category,
                         servingLabel: price.servingLabel, servingML: price.servingML)
    }

    static func validated(venue: SavedVenue, id: String, name: String, category: String?,
                          servingLabel: String?, servingML: Int?) -> SavedMenuOffer? {
        guard let safeVenue = try? SavedVenuePolicy.venue(url: venue.url, label: venue.label),
              id.range(of: #"\A[A-Za-z0-9._:-]{1,128}\z"#, options: .regularExpression) != nil,
              ComparisonJSON.name(name) != nil,
              category == nil || DrinkCategory.all.contains(where: { $0.code == category }),
              servingLabel == nil || ComparisonJSON.name(servingLabel) != nil,
              servingML == nil || (servingML! > 0 && servingML! <= 10000) else { return nil }
        return SavedMenuOffer(venue: safeVenue, offerID: id, name: name,
                              category: category, servingLabel: servingLabel, servingML: servingML)
    }

    func focusedURL() -> URL? { MobileEntry.offerDocument(venue.url, offerID: offerID) }
}

final class SavedMenuOfferStore {
    static let maximumCount = 50
    private let directoryURL: URL
    private let fileManager: FileManager
    let fileURL: URL
    init(directoryURL: URL? = nil, fileManager: FileManager = .default) {
        let support = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSHomeDirectory(), isDirectory: true).appendingPathComponent("Library/Application Support", isDirectory: true)
        self.directoryURL = directoryURL ?? support.appendingPathComponent("DoveBevoSavedDrinks", isDirectory: true)
        self.fileManager = fileManager
        fileURL = self.directoryURL.appendingPathComponent("owner-offers-v1.json")
    }
    func load() throws -> [SavedMenuOffer] {
        guard fileManager.fileExists(atPath: fileURL.path) else { return [] }
        let values = try fileURL.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
        guard values.isRegularFile == true, values.isSymbolicLink != true else { throw SavedDrinkStore.StoreError.unreadableRecords }
        let handle = try FileHandle(forReadingFrom: fileURL); defer { try? handle.close() }
        var data = Data()
        while data.count <= SavedDrinkStore.maximumPayloadBytes {
            guard let chunk = try handle.read(upToCount: SavedDrinkStore.maximumPayloadBytes + 1 - data.count), !chunk.isEmpty else { break }
            data.append(chunk)
        }
        guard data.count <= SavedDrinkStore.maximumPayloadBytes,
              let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              Set(root.keys) == ["version", "offers"], ComparisonJSON.integer(root["version"], minimum: 1, maximum: 1) == 1,
              let raw = root["offers"] as? [[String: Any]], raw.count <= Self.maximumCount else { throw SavedDrinkStore.StoreError.unreadableRecords }
        var items: [SavedMenuOffer] = []; var seen = Set<String>()
        for value in raw {
            guard Set(value.keys) == ["url", "label", "id", "name", "category", "serving", "ml"],
                  let urlText = value["url"] as? String, urlText.utf8.count <= 512, let url = URL(string: urlText),
                  let label = value["label"] as? String, let id = value["id"] as? String,
                  let name = value["name"] as? String,
                  value["category"] is NSNull || value["category"] is String,
                  value["serving"] is NSNull || value["serving"] is String,
                  value["ml"] is NSNull || ComparisonJSON.integer(value["ml"], minimum: 1, maximum: 10000) != nil,
                  let item = SavedMenuOffer.validated(venue: SavedVenue(url: url, label: label), id: id, name: name,
                     category: value["category"] as? String, servingLabel: value["serving"] as? String,
                     servingML: ComparisonJSON.integer(value["ml"], minimum: 1, maximum: 10000)),
                  seen.insert(item.identity).inserted else { throw SavedDrinkStore.StoreError.unreadableRecords }
            items.append(item)
        }
        return items
    }
    @discardableResult func save(_ item: SavedMenuOffer) throws -> SavedMenuOffer {
        guard let safe = SavedMenuOffer.validated(venue: item.venue, id: item.offerID, name: item.name,
               category: item.category, servingLabel: item.servingLabel, servingML: item.servingML) else { throw SavedDrinkStore.StoreError.unreadableRecords }
        var items = try load(); items.removeAll { $0.identity == safe.identity }
        guard items.count < Self.maximumCount else { throw SavedDrinkStore.StoreError.capacityReached }
        items.insert(safe, at: 0); try write(items); return safe
    }
    func remove(_ item: SavedMenuOffer) throws {
        let old = try load(), next = old.filter { $0.identity != item.identity }
        if next.count != old.count { try write(next) }
    }
    private func write(_ items: [SavedMenuOffer]) throws {
        let rows: [[String: Any]] = items.map { ["url": $0.venue.url.absoluteString, "label": $0.venue.label,
            "id": $0.offerID, "name": $0.name, "category": $0.category as Any? ?? NSNull(),
            "serving": $0.servingLabel as Any? ?? NSNull(), "ml": $0.servingML as Any? ?? NSNull()] }
        let data = try JSONSerialization.data(withJSONObject: ["version": 1, "offers": rows], options: [.sortedKeys])
        guard data.count <= SavedDrinkStore.maximumPayloadBytes else { throw SavedDrinkStore.StoreError.unreadableRecords }
        try fileManager.createDirectory(at: directoryURL, withIntermediateDirectories: true,
            attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
        var directory = directoryURL; var values = URLResourceValues(); values.isExcludedFromBackup = true
        try directory.setResourceValues(values)
        try data.write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
}
