import Foundation

/// One exact customer-reported drink. Its price is always read again from the public source.
struct SavedCustomerItem: Equatable {
    let venue: SavedVenue
    let itemKey: String
    let name: String
    let category: String?
    let servingLabel: String?
    let servingML: Int?
    var identity: String { "\(venue.url.absoluteString)|\(itemKey)" }

    static func verified(venue: SavedVenue, price: MenuV2Price) -> SavedCustomerItem? {
        guard case .customer = price.origin else { return nil }
        return validated(venue: venue, key: price.id, name: price.itemName,
                         category: price.category.isEmpty ? nil : price.category,
                         servingLabel: price.servingLabel, servingML: price.servingML)
    }

    static func validated(venue: SavedVenue, key: String, name: String, category: String?,
                          servingLabel: String?, servingML: Int?) -> SavedCustomerItem? {
        guard let safeVenue = try? SavedVenuePolicy.venue(url: venue.url, label: venue.label),
              ComparisonJSON.matches(key, "^[oc][0-9a-f]{64}$"),
              safeText(name, maximum: 512),
              category == nil || DrinkCategory.all.contains(where: { $0.code == category }),
              servingLabel == nil || safeText(servingLabel!, maximum: 256),
              servingML == nil || (1...100_000).contains(servingML!) else { return nil }
        return SavedCustomerItem(venue: safeVenue, itemKey: key, name: name, category: category,
                                 servingLabel: servingLabel, servingML: servingML)
    }

    private static func safeText(_ value: String, maximum: Int) -> Bool {
        !value.isEmpty && value == value.trimmingCharacters(in: .whitespacesAndNewlines)
            && value.utf16.count <= maximum && !value.unicodeScalars.contains(where: {
                $0.value < 32 || (127...159).contains($0.value) || $0.value == 0xfffd
            })
    }
}

final class SavedCustomerItemStore {
    static let maximumCount = 50
    private let directoryURL: URL
    private let fileManager: FileManager
    let fileURL: URL

    init(directoryURL: URL? = nil, fileManager: FileManager = .default) {
        let support = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSHomeDirectory(), isDirectory: true).appendingPathComponent("Library/Application Support", isDirectory: true)
        self.directoryURL = directoryURL ?? support.appendingPathComponent("DoveBevoSavedDrinks", isDirectory: true)
        self.fileManager = fileManager
        fileURL = self.directoryURL.appendingPathComponent("customer-items-v1.json")
    }

    func load() throws -> [SavedCustomerItem] {
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
              Set(root.keys) == ["version", "items"],
              ComparisonJSON.integer(root["version"], minimum: 1, maximum: 1) == 1,
              let raw = root["items"] as? [[String: Any]], raw.count <= Self.maximumCount else { throw SavedDrinkStore.StoreError.unreadableRecords }
        var items: [SavedCustomerItem] = []; var seen = Set<String>()
        for value in raw {
            guard Set(value.keys) == ["url", "label", "key", "name", "category", "serving", "ml"],
                  let text = value["url"] as? String, text.utf8.count <= 512, let url = URL(string: text),
                  let label = value["label"] as? String, let key = value["key"] as? String,
                  let name = value["name"] as? String,
                  value["category"] is NSNull || value["category"] is String,
                  value["serving"] is NSNull || value["serving"] is String,
                  value["ml"] is NSNull || ComparisonJSON.integer(value["ml"], minimum: 1, maximum: 100_000) != nil,
                  let item = SavedCustomerItem.validated(venue: SavedVenue(url: url, label: label), key: key, name: name,
                      category: value["category"] as? String, servingLabel: value["serving"] as? String,
                      servingML: ComparisonJSON.integer(value["ml"], minimum: 1, maximum: 100_000)),
                  seen.insert(item.identity).inserted else { throw SavedDrinkStore.StoreError.unreadableRecords }
            items.append(item)
        }
        return items
    }

    @discardableResult func save(_ value: SavedCustomerItem) throws -> SavedCustomerItem {
        guard let item = SavedCustomerItem.validated(venue: value.venue, key: value.itemKey, name: value.name,
               category: value.category, servingLabel: value.servingLabel, servingML: value.servingML) else {
            throw SavedDrinkStore.StoreError.unreadableRecords
        }
        var items = try load(); items.removeAll { $0.identity == item.identity }
        guard items.count < Self.maximumCount else { throw SavedDrinkStore.StoreError.capacityReached }
        items.insert(item, at: 0); try write(items); return item
    }

    func remove(_ value: SavedCustomerItem) throws {
        let old = try load(), next = old.filter { $0.identity != value.identity }
        if old.count != next.count { try write(next) }
    }

    private func write(_ items: [SavedCustomerItem]) throws {
        let rows: [[String: Any]] = items.map { ["url": $0.venue.url.absoluteString, "label": $0.venue.label,
            "key": $0.itemKey, "name": $0.name, "category": $0.category as Any? ?? NSNull(),
            "serving": $0.servingLabel as Any? ?? NSNull(), "ml": $0.servingML as Any? ?? NSNull()] }
        let data = try JSONSerialization.data(withJSONObject: ["version": 1, "items": rows], options: [.sortedKeys])
        guard data.count <= SavedDrinkStore.maximumPayloadBytes else { throw SavedDrinkStore.StoreError.unreadableRecords }
        try fileManager.createDirectory(at: directoryURL, withIntermediateDirectories: true,
            attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
        var directory = directoryURL; var values = URLResourceValues(); values.isExcludedFromBackup = true
        try directory.setResourceValues(values)
        try data.write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
}
