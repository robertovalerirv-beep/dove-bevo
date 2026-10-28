import Foundation

protocol RecommendationVoterProviding {
    func identity() throws -> String
}

/// A random installation identity, never a browser credential or device ID.
/// Excluded from backup so another installation does not inherit this vote key.
final class RecommendationVoterStore: RecommendationVoterProviding {
    private let directory: URL
    private let fileManager: FileManager
    private static let lock = NSLock()
    var fileURL: URL { directory.appendingPathComponent("voter-id") }

    init(directory: URL? = nil, fileManager: FileManager = .default) {
        self.fileManager = fileManager
        let support = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSHomeDirectory(), isDirectory: true).appendingPathComponent("Library/Application Support", isDirectory: true)
        self.directory = directory ?? support.appendingPathComponent("DoveBevoRecommendations", isDirectory: true)
    }

    static func isValid(_ value: String) -> Bool {
        value.range(of: #"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"#, options: .regularExpression) != nil
            && value.utf8.count == 36
    }

    func identity() throws -> String {
        Self.lock.lock()
        defer { Self.lock.unlock() }
        do {
            if fileManager.fileExists(atPath: directory.path) {
                let values = try directory.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
                guard values.isDirectory == true, values.isSymbolicLink != true else { throw RecommendationError.identityUnavailable }
            } else {
                try fileManager.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            }
            try excludeFromBackup(directory)
            if fileManager.fileExists(atPath: fileURL.path) {
                let values = try fileURL.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey])
                guard values.isRegularFile == true, values.isSymbolicLink != true, values.fileSize == 36 else {
                    throw RecommendationError.identityUnavailable
                }
                let handle = try FileHandle(forReadingFrom: fileURL)
                defer { try? handle.close() }
                let data = try handle.read(upToCount: 37) ?? Data()
                guard let value = String(data: data, encoding: .utf8), Self.isValid(value) else {
                    throw RecommendationError.identityUnavailable
                }
                try excludeFromBackup(fileURL)
                return value
            }
            let value = UUID().uuidString.lowercased()
            guard Self.isValid(value) else { throw RecommendationError.identityUnavailable }
            try Data(value.utf8).write(to: fileURL, options: .atomic)
            try fileManager.setAttributes([.posixPermissions: 0o600], ofItemAtPath: fileURL.path)
            try excludeFromBackup(fileURL)
            return value
        } catch { throw RecommendationError.identityUnavailable }
    }

    private func excludeFromBackup(_ url: URL) throws {
        var target = url
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try target.setResourceValues(values)
    }
}
