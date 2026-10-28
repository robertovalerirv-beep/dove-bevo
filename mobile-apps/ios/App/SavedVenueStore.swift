import Foundation

/// Small app-private file storage. Changes become visible only after an atomic
/// write succeeds; a failed save/removal never changes the previous records.
final class SavedVenueStore {
    static let maximumCount = 50
    static let maximumPayloadBytes = 65_536

    enum StoreError: Error, Equatable {
        case capacityReached
        case unreadableRecords
    }

    private let directoryURL: URL
    private let fileManager: FileManager
    let fileURL: URL

    init(directoryURL: URL? = nil, fileManager: FileManager = .default) {
        let support = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSHomeDirectory(), isDirectory: true).appendingPathComponent("Library/Application Support", isDirectory: true)
        self.directoryURL = directoryURL ?? support.appendingPathComponent("DoveBevoSavedVenues", isDirectory: true)
        self.fileURL = self.directoryURL.appendingPathComponent("venues.json", isDirectory: false)
        self.fileManager = fileManager
    }

    func load() throws -> [SavedVenue] {
        guard fileManager.fileExists(atPath: fileURL.path) else { return [] }
        let values = try fileURL.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
        guard values.isRegularFile == true, values.isSymbolicLink != true else { throw StoreError.unreadableRecords }
        let handle = try FileHandle(forReadingFrom: fileURL)
        defer { try? handle.close() }
        var data = Data()
        // Never decode or allocate an unbounded stored payload, even if corrupt.
        while data.count <= Self.maximumPayloadBytes {
            let remaining = Self.maximumPayloadBytes + 1 - data.count
            guard let chunk = try handle.read(upToCount: remaining), !chunk.isEmpty else { break }
            data.append(chunk)
        }
        guard data.count <= Self.maximumPayloadBytes,
              let raw = try JSONSerialization.jsonObject(with: data) as? [Any] else { throw StoreError.unreadableRecords }
        var entries: [SavedVenue] = []
        var seen: Set<URL> = []
        for item in raw {
            guard let record = item as? [String: Any],
                  let rawURL = record["url"] as? String, rawURL.utf8.count <= 512,
                  let url = URL(string: rawURL), let label = record["label"] as? String,
                  let venue = try? SavedVenuePolicy.venue(url: url, label: label),
                  seen.insert(venue.url).inserted else { continue }
            guard entries.count < Self.maximumCount else { throw StoreError.unreadableRecords }
            entries.append(venue)
        }
        return entries
    }

    @discardableResult
    func save(url: URL, label: String) throws -> SavedVenue {
        let venue = try SavedVenuePolicy.venue(url: url, label: label)
        var entries = try load()
        entries.removeAll { $0.url == venue.url }
        guard entries.count < Self.maximumCount else { throw StoreError.capacityReached }
        entries.insert(venue, at: 0)
        try write(entries)
        return venue
    }

    func remove(url: URL) throws {
        guard let canonical = SavedVenuePolicy.canonicalURL(url) else { throw SavedVenuePolicy.ValidationError.invalidURL }
        let entries = try load()
        let remaining = entries.filter { $0.url != canonical }
        guard remaining.count != entries.count else { return }
        try write(remaining)
    }

    private func write(_ entries: [SavedVenue]) throws {
        let records = entries.map { ["url": $0.url.absoluteString, "label": $0.label] }
        let data = try JSONSerialization.data(withJSONObject: records, options: [.sortedKeys])
        guard data.count <= Self.maximumPayloadBytes else { throw StoreError.unreadableRecords }
        try fileManager.createDirectory(
            at: directoryURL, withIntermediateDirectories: true,
            attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication]
        )
        // Exclude the dedicated parent before replacing the data. Atomic file
        // replacement remains inside this excluded directory on every save.
        var directory = directoryURL
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try directory.setResourceValues(values)
        try data.write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
}
