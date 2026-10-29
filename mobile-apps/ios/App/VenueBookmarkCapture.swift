import Foundation

/// A single user-initiated bookmark read belongs to one usable venue page.
/// URL equality alone is insufficient: leaving and returning to the same URL,
/// reloading it, stopping it or showing recovery retires the earlier request.
final class VenueBookmarkCapture {
    struct Request: Equatable {
        let id: UUID
        let pageEpoch: UUID
        let url: URL
    }

    enum CaptureError: Error, Equatable {
        case pageChanged
        case unavailableName
    }

    static let maximumNameUTF16Units = 120
    private var pageEpoch = UUID()
    private(set) var pending: Request?

    var isPending: Bool { pending != nil }

    func begin(url: URL) -> Request? {
        guard pending == nil, let canonical = SavedVenuePolicy.canonicalURL(url) else { return nil }
        let request = Request(id: UUID(), pageEpoch: pageEpoch, url: canonical)
        pending = request
        return request
    }

    func contains(_ request: Request) -> Bool {
        pending == request && request.pageEpoch == pageEpoch
    }

    func invalidate() {
        pageEpoch = UUID()
        pending = nil
    }

    func complete(_ request: Request, value: Any?, currentUsableURL: URL?) throws -> SavedVenue {
        // An obsolete completion must neither save nor consume a newer request.
        guard contains(request) else { throw CaptureError.pageChanged }
        pending = nil
        guard let current = SavedVenuePolicy.canonicalURL(currentUsableURL), current == request.url else {
            throw CaptureError.pageChanged
        }
        guard let result = value as? [String: Any], Set(result.keys) == ["href", "name", "selectedKey"],
              let href = result["href"] as? String, href.utf8.count <= 512,
              let returnedURL = URL(string: href),
              SavedVenuePolicy.canonicalURL(returnedURL) == request.url,
              let selectedKey = result["selectedKey"] as? String,
              selectedKey == request.url.lastPathComponent else {
            throw CaptureError.pageChanged
        }
        guard let name = result["name"] as? String,
              name.utf16.count <= Self.maximumNameUTF16Units,
              !name.unicodeScalars.contains(where: {
                  $0.value < 32 || (127...159).contains($0.value) || $0.value == 0xfffd
              }) else { throw CaptureError.unavailableName }
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed.utf16.count <= Self.maximumNameUTF16Units else {
            throw CaptureError.unavailableName
        }
        return try SavedVenuePolicy.venue(url: request.url, label: trimmed)
    }
}
