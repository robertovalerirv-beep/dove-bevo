import Foundation

enum PrivacyPolicy {
    static let supportEmail = "dovebevo@gmail.com"
    static let supportURL = URL(string: "mailto:dovebevo@gmail.com")!

    enum LoadError: Error {
        case missingResource
        case emptyResource
    }

    static func load(from bundle: Bundle = .main) throws -> String {
        guard let url = bundle.url(forResource: "privacy", withExtension: "md") else {
            throw LoadError.missingResource
        }
        let text = try String(contentsOf: url, encoding: .utf8)
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw LoadError.emptyResource
        }
        return text
    }
}
