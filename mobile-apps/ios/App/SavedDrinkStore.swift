import Foundation

/// Additive storage: the existing venue file is neither migrated nor rewritten.
final class SavedDrinkStore {
    static let maximumCount = 50
    static let maximumPayloadBytes = 65_536
    enum StoreError: Error { case capacityReached, unreadableRecords }
    private let directoryURL: URL
    private let fileManager: FileManager
    let fileURL: URL

    init(directoryURL: URL? = nil, fileManager: FileManager = .default) {
        let support = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSHomeDirectory(), isDirectory: true).appendingPathComponent("Library/Application Support", isDirectory: true)
        self.directoryURL = directoryURL ?? support.appendingPathComponent("DoveBevoSavedDrinks", isDirectory: true)
        fileURL = self.directoryURL.appendingPathComponent("drinks-v1.json")
        self.fileManager = fileManager
    }

    func load() throws -> [SavedDrink] {
        guard fileManager.fileExists(atPath: fileURL.path) else { return [] }
        let values = try fileURL.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
        guard values.isRegularFile == true, values.isSymbolicLink != true else { throw StoreError.unreadableRecords }
        let handle = try FileHandle(forReadingFrom: fileURL)
        defer { try? handle.close() }
        var data = Data()
        while data.count <= Self.maximumPayloadBytes {
            guard let chunk = try handle.read(upToCount: Self.maximumPayloadBytes + 1 - data.count), !chunk.isEmpty else { break }
            data.append(chunk)
        }
        guard data.count <= Self.maximumPayloadBytes,
              let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              Set(root.keys) == ["version", "drinks"], ComparisonJSON.integer(root["version"], minimum: 1, maximum: 1) == 1,
              let raw = root["drinks"] as? [[String: Any]], raw.count <= Self.maximumCount else { throw StoreError.unreadableRecords }
        var entries: [SavedDrink] = []; var seen = Set<String>()
        for item in raw {
            guard Set(item.keys) == ["url", "label", "drink", "hh"],
                  let text = item["url"] as? String, text.utf8.count <= 512, let url = URL(string: text),
                  let label = item["label"] as? String, let drink = item["drink"] as? String,
                  let hh = ComparisonJSON.integer(item["hh"], minimum: 0, maximum: 1), let band = ComparisonBand(rawValue: hh),
                  let entry = try? SavedDrink.validated(url: url, label: label, drink: drink, band: band),
                  seen.insert(entry.identity).inserted else { throw StoreError.unreadableRecords }
            entries.append(entry)
        }
        return entries
    }

    @discardableResult func save(_ value: SavedDrink) throws -> SavedDrink {
        let entry = try SavedDrink.validated(url: value.venue.url, label: value.venue.label, drink: value.drink, band: value.band)
        var entries = try load(); entries.removeAll { $0.identity == entry.identity }
        guard entries.count < Self.maximumCount else { throw StoreError.capacityReached }
        entries.insert(entry, at: 0); try write(entries); return entry
    }

    func remove(_ value: SavedDrink) throws {
        let entry = try SavedDrink.validated(url: value.venue.url, label: value.venue.label, drink: value.drink, band: value.band)
        let previous = try load(); let entries = previous.filter { $0.identity != entry.identity }
        guard entries.count != previous.count else { return }
        try write(entries)
    }

    private func write(_ entries: [SavedDrink]) throws {
        let rows: [[String: Any]] = entries.map { ["url": $0.venue.url.absoluteString, "label": $0.venue.label, "drink": $0.drink, "hh": $0.band.rawValue] }
        let data = try JSONSerialization.data(withJSONObject: ["version": 1, "drinks": rows], options: [.sortedKeys])
        guard data.count <= Self.maximumPayloadBytes else { throw StoreError.unreadableRecords }
        try fileManager.createDirectory(at: directoryURL, withIntermediateDirectories: true,
            attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
        var directory = directoryURL; var values = URLResourceValues(); values.isExcludedFromBackup = true
        try directory.setResourceValues(values)
        try data.write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
}
