import Foundation

/// A local share card is a snapshot of the displayed public row, never a price
/// contribution, a cached menu or a claim that the user paid this amount.
struct PriceShareSnapshot: Equatable {
    let venueKey: String
    let venueName: String
    let drink: String
    let drinkName: String
    let happyHour: Bool
    let amountMinor: Int
    let currency: String
    let serving: String
    let provenance: String
    let confirmations: Int
    let tier: String
    let location: String

    var amount: String { String(format: "%d,%02d %@", amountMinor / 100, amountMinor % 100, currency == "GBP" ? "£" : "€") }
    var servingLabel: String {
        if serving.isEmpty { return "Formato non dichiarato (dati precedenti)" }
        if ["drink", "drink singolo"].contains(serving.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()) { return "" }
        return serving
    }
    var bandLabel: String { happyHour ? "Happy hour" : "Prezzo normale" }
    var confirmationLabel: String { confirmations == 1 ? "1 conferma" : "\(confirmations) conferme" }
    var tierLabel: String? { ["affare": "Affare", "giusto": "Giusto", "salato": "Salato"][tier] }
    var accessibilityDescription: String {
        [drinkName, amount, venueName, servingLabel, bandLabel, location, provenance,
         confirmationLabel, tierLabel ?? "", "Immagine illustrativa del drink, non foto del locale"]
            .filter { !$0.isEmpty }.joined(separator: ". ")
    }

    static func parse(_ value: Any?, currentURL: URL) -> PriceShareSnapshot? {
        guard MobileEntry.isDocument(currentURL), let canonical = SavedVenuePolicy.canonicalURL(currentURL),
              let fields = value as? [String: Any], Set(fields.keys) == ["href", "version", "venue", "venueName", "drink", "drinkName", "hh", "amountMinor", "currency", "serving", "provenance", "confirmations", "tier", "location"],
              fields["href"] as? String == currentURL.absoluteString, fields["version"] as? String == "1",
              let key = fields["venue"] as? String, key == canonical.lastPathComponent,
              let name = text(fields["venueName"], maximum: 120),
              let drink = fields["drink"] as? String, let category = DrinkCategory.all.first(where: { $0.code == drink }),
              let drinkName = text(fields["drinkName"], maximum: 80),
              let hh = fields["hh"] as? String, ["0", "1"].contains(hh),
              let amount = integer(fields["amountMinor"], minimum: 1, maximum: 100_000),
              let currency = fields["currency"] as? String, ["EUR", "GBP"].contains(currency),
              let bounds = category.allowedCents(currency: currency), bounds.contains(amount),
              let serving = text(fields["serving"], maximum: 160, allowEmpty: true),
              let provenance = text(fields["provenance"], maximum: 1024),
              let confirmations = integer(fields["confirmations"], minimum: 0, maximum: 1_000_000),
              let tier = fields["tier"] as? String, ["affare", "giusto", "salato", "neutro"].contains(tier),
              let location = text(fields["location"], maximum: 160, allowEmpty: true) else { return nil }
        if let focus = MobileEntry.drinkFocus(currentURL), focus.drink != drink || (focus.band == .happyHour) != (hh == "1") { return nil }
        return PriceShareSnapshot(venueKey: key, venueName: name, drink: drink, drinkName: drinkName, happyHour: hh == "1",
            amountMinor: amount, currency: currency, serving: serving, provenance: provenance,
            confirmations: confirmations, tier: tier, location: location)
    }

    private static func text(_ value: Any?, maximum: Int, allowEmpty: Bool = false) -> String? {
        guard let value = value as? String, value.utf16.count <= maximum,
              (allowEmpty || !value.isEmpty), value == value.trimmingCharacters(in: .whitespacesAndNewlines),
              !value.unicodeScalars.contains(where: { $0.value < 32 || (127...159).contains($0.value) || $0.value == 0xfffd || CharacterSet.newlines.contains($0) }) else { return nil }
        return value
    }

    private static func integer(_ value: Any?, minimum: Int, maximum: Int) -> Int? {
        guard let raw = value as? String, raw.range(of: #"\A(?:0|[1-9][0-9]{0,6})\z"#, options: .regularExpression) != nil,
              let number = Int(raw), (minimum...maximum).contains(number) else { return nil }
        return number
    }
}

enum PriceShareReader {
    // Reuse the exact existing visible venue/route identity reader, then read
    // only the single visible, versioned price marker in that same modal.
    static let script = #"""
    (() => {
        "use strict";
        if (window.top !== window || document.querySelectorAll("dialog[open]").length !== 1) return null;
        const context = (\#(VenueNameReader.script));
        if (!context || !/^\/mobile\/(?:index\.html)?$/.test(new URL(context.href).pathname) ||
            document.documentElement.getAttribute("data-dovebevo-mobile-shell") !== "1") return null;
        const dialog = document.querySelector("dialog.sheet.sheet--bare[open]");
        const markers = dialog.querySelectorAll("[data-dovebevo-share='1']");
        if (markers.length !== 1) return null;
        const marker = markers[0];
        if (!marker.isConnected || marker.closest("[hidden], [inert], [aria-hidden='true']")) return null;
        for (let node = marker; node; node = node.parentElement) {
            const style = getComputedStyle(node);
            if (style.display === "none" || style.visibility !== "visible" || Number(style.opacity) === 0) return null;
        }
        const box = marker.getBoundingClientRect();
        if (!marker.getClientRects().length || ![box.x,box.y,box.width,box.height].every(Number.isFinite) ||
            box.width <= 0 || box.height <= 0 || box.right <= 0 || box.bottom <= 0 ||
            box.left >= window.innerWidth || box.top >= window.innerHeight) return null;
        if (marker.getAttribute("data-venue") !== context.selectedKey || marker.getAttribute("data-venue-name") !== context.name) return null;
        const names = ["version","venue","venueName","drink","drinkName","hh","amountMinor","currency","serving","provenance","confirmations","tier","location"];
        const result = { href: context.href };
        for (const name of names) {
            const attribute = "data-" + name.replace(/[A-Z]/g, (letter) => "-" + letter.toLowerCase());
            const value = marker.getAttribute(attribute);
            if (typeof value !== "string" || value.length > 1024) return null;
            result[name] = value;
        }
        return result;
    })()
    """#
}

/// Generation and exact document identity fence the asynchronous read and its
/// timeout. A retired, hidden or navigated page cannot present stale content.
@MainActor final class PriceShareCapture {
    struct Context: Equatable { let token: UUID; let documentURL: URL }
    private var pending: Context?
    func begin(documentURL: URL) -> Context {
        let value = Context(token: UUID(), documentURL: documentURL); pending = value; return value
    }
    func invalidate() { pending = nil }
    func finish(_ context: Context, currentURL: URL?, active: Bool) -> Bool {
        guard pending == context else { return false }
        pending = nil
        return active && currentURL == context.documentURL
    }
}
