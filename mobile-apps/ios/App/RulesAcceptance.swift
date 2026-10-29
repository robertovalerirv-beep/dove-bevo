import Foundation

struct RulesAcceptance {
    static let currentVersion = "2026-10-26"
    static let storageKey = "acceptedRulesVersion"
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    var isCurrent: Bool {
        defaults.string(forKey: Self.storageKey) == Self.currentVersion
    }

    func acceptCurrentVersion() {
        defaults.set(Self.currentVersion, forKey: Self.storageKey)
    }

    static func rulesText(from bundle: Bundle = .main) throws -> String {
        guard let url = bundle.url(forResource: "terms", withExtension: "md") else {
            throw PrivacyPolicy.LoadError.missingResource
        }
        let text = try String(contentsOf: url, encoding: .utf8)
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw PrivacyPolicy.LoadError.emptyResource
        }
        return text
    }
}
