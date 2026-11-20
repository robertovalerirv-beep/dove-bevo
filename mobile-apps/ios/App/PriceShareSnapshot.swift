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
    var menuDetails: MenuShareDetails? = nil

    var amount: String { menuDetails?.amount ?? String(format: "%d,%02d %@", amountMinor / 100, amountMinor % 100, currency == "GBP" ? "£" : "€") }
    var servingLabel: String {
        if let menuDetails { return menuDetails.serving }
        if serving.isEmpty { return "Formato non dichiarato (dati precedenti)" }
        if ["drink", "drink singolo"].contains(serving.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()) { return "" }
        return serving
    }
    var bandLabel: String { menuDetails == nil ? (happyHour ? "Happy hour" : "Prezzo normale") : "Prezzo da menu" }
    var confirmationLabel: String { confirmations == 1 ? "1 conferma" : "\(confirmations) conferme" }
    var tierLabel: String? { menuDetails == nil ? ["affare": "Affare", "giusto": "Giusto", "salato": "Salato"][tier] : nil }
    var accessibilityDescription: String {
        [drinkName, amount, venueName, servingLabel, bandLabel, location, provenance,
         menuDetails == nil ? confirmationLabel : "", tierLabel ?? "", "Immagine illustrativa del drink, non foto del locale"]
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

    static func text(_ value: Any?, maximum: Int, allowEmpty: Bool = false) -> String? {
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

struct MenuShareDetails: Equatable { let amount: String; let serving: String }

/// The row is captured from the selected modal, then checked against a fresh public API read.
struct MenuShareOffer: Equatable {
    let venueKey: String
    let venueName: String
    let offerID: String
    let drinkName: String
    let amount: String
    let serving: String
    let sourceDay: String
    let location: String

    static func parse(_ value: Any?, currentURL: URL) -> Self? {
        guard let canonical = MobileEntry.publicVenue(currentURL),
              let parts = URLComponents(url: currentURL, resolvingAgainstBaseURL: false)?.queryItems,
              parts.count == 3, let focused = parts.first(where: { $0.name == "offer" })?.value,
              focused.range(of: #"\A[A-Za-z0-9._:-]{1,128}\z"#, options: .regularExpression) != nil,
              let fields = value as? [String: Any],
              Set(fields.keys) == ["kind", "href", "venue", "venueName", "offer", "drinkName", "amountLabel", "serving", "provenance", "location"],
              fields["kind"] as? String == "offer", fields["href"] as? String == currentURL.absoluteString,
              fields["venue"] as? String == canonical.lastPathComponent,
              fields["offer"] as? String == focused,
              let venueName = PriceShareSnapshot.text(fields["venueName"], maximum: 512),
              let drinkName = PriceShareSnapshot.text(fields["drinkName"], maximum: 512),
              let amount = PriceShareSnapshot.text(fields["amountLabel"], maximum: 32),
              let serving = PriceShareSnapshot.text(fields["serving"], maximum: 600, allowEmpty: true),
              let provenance = PriceShareSnapshot.text(fields["provenance"], maximum: 240),
              let location = PriceShareSnapshot.text(fields["location"], maximum: 200, allowEmpty: true),
              provenance.range(of: #"\APrezzo del drink da menu, non totale pagato\. Supplementi separati\. Menu verificato il [0-9]{4}-[0-9]{2}-[0-9]{2}\z"#, options: .regularExpression) != nil,
              normalized(amount).range(of: #"\A(?:0|[1-9][0-9]{0,6})(?:,[0-9]{1,3})? [€£]\z"#, options: .regularExpression) != nil else { return nil }
        return Self(venueKey: canonical.lastPathComponent, venueName: venueName, offerID: focused,
                    drinkName: drinkName, amount: amount, serving: serving,
                    sourceDay: String(provenance.suffix(10)), location: location)
    }

    func verified(in venue: MenuV2Venue) -> PriceShareSnapshot? {
        guard venue.key == venueKey, venue.name == venueName,
              let price = venue.offers.first(where: { $0.id == offerID && $0.itemName == drinkName }),
              case .ownerMenu(_, let checkedOn) = price.origin, checkedOn == sourceDay,
              ["EUR", "GBP"].contains(price.currency), price.amountMinor > 0,
              Self.normalized(price.amount) == Self.normalized(amount),
              Self.displayServing(price) == serving else { return nil }
        let evidence = "Prezzo del drink da menu, non totale pagato. Supplementi separati. Menu verificato il \(checkedOn). \(price.minimumSpendNotice) \(price.feeNotice)"
        var result = PriceShareSnapshot(venueKey: venueKey, venueName: venueName, drink: price.category,
            drinkName: price.itemName, happyHour: price.band == .happyHour, amountMinor: price.amountMinor,
            currency: price.currency, serving: serving, provenance: evidence.trimmingCharacters(in: .whitespaces),
            confirmations: 0, tier: "neutro", location: location)
        result.menuDetails = MenuShareDetails(amount: price.amount, serving: serving)
        return result
    }

    private static func normalized(_ value: String) -> String {
        value.replacingOccurrences(of: "\u{00A0}", with: " ").replacingOccurrences(of: "\u{202F}", with: " ")
    }
    private static func displayServing(_ price: MenuV2Price) -> String {
        let base = price.servingLabel ?? price.servingML.map { "\($0) ml" } ?? ""
        let context: String
        if price.band == .happyHour { context = ["Happy hour", price.condition].compactMap { $0 }.joined(separator: " · ") }
        else if price.band == nil { context = price.condition.map { "Solo con: \($0)" } ?? "Prezzo condizionato" }
        else { context = price.condition ?? "" }
        return [base, context].filter { !$0.isEmpty }.joined(separator: " · ")
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

enum MenuShareReader {
    static let script = #"""
    (() => {
      "use strict";
      if (window.top !== window || document.visibilityState !== "visible" ||
          document.documentElement.getAttribute("data-dovebevo-mobile-shell") !== "1") return null;
      const url = new URL(location.href);
      if (url.protocol !== "https:" || !["www.dovebevo.com", "dovebevo.com"].includes(url.hostname) ||
          url.username || url.password || url.port || url.hash ||
          !["/mobile/", "/mobile/index.html"].includes(url.pathname) ||
          !/^\?path=%2Fbar%2F(?:[nwru][1-9][0-9]{0,14}|m[0-9a-f]{24})&c=[0-9b-hjkmnp-z]{5}&offer=[A-Za-z0-9._:-]{1,128}$/.test(url.search)) return null;
      const key = url.searchParams.get("path").slice(5);
      const maps = document.querySelectorAll("section.map[data-selected]");
      if (maps.length !== 1 || maps[0].getAttribute("data-selected") !== key ||
          document.querySelectorAll("dialog[open]").length !== 1 ||
          document.querySelectorAll("[data-dovebevo-share='1']").length !== 0) return null;
      const sheet = document.querySelector("dialog.sheet.sheet--bare[open]");
      if (!sheet || !sheet.matches(":modal")) return null;
      const visible = node => {
        if (!node || !node.isConnected || !node.getClientRects().length) return false;
        for (let p = node; p; p = p.parentElement) {
          const style = getComputedStyle(p);
          if (p.hidden || p.inert || p.getAttribute("aria-hidden") === "true" ||
              style.display === "none" || style.visibility !== "visible" || Number(style.opacity) <= 0) return false;
        }
        return true;
      };
      const headings = [...sheet.querySelectorAll(":scope > .sheet__body > .scontrino > .scontrino__paper h2.scontrino__name")].filter(visible);
      const rows = [...sheet.querySelectorAll('li.mobile-menu-v2__offer--focused[data-testid="featured-menu-price"]')].filter(visible);
      if (!visible(sheet) || headings.length !== 1 || rows.length !== 1 ||
          headings[0].textContent.trim() !== sheet.getAttribute("aria-label")) return null;
      const row = rows[0];
      const one = selector => { const found = [...row.querySelectorAll(selector)].filter(visible); return found.length === 1 ? found[0] : null; };
      const name = one(":scope > .mobile-menu-v2__name"), amount = one(":scope > .mobile-menu-v2__amount"),
            source = one(":scope > .mobile-menu-v2__source");
      const notes = [...row.querySelectorAll(":scope > .mobile-menu-v2__meta")].filter(visible);
      if (!name || !amount || !source || notes.length !== 2 ||
          notes[1].textContent.trim() !== "Prezzo del drink da menu, non totale pagato. Supplementi separati." ||
          !/^Menu verificato il [0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(source.textContent.trim())) return null;
      const drinkName = [...name.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(" ").trim();
      const place = sheet.querySelector(".scontrino__paper .bar__kind");
      return {kind:"offer",href:url.href,venue:key,venueName:headings[0].textContent.trim(),
        offer:url.searchParams.get("offer"),drinkName,amountLabel:amount.textContent.trim(),
        serving:notes[0].textContent.trim(),provenance:notes[1].textContent.trim()+" "+source.textContent.trim(),
        location:visible(place)?place.textContent.trim():""};
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
    func isCurrent(_ context: Context, currentURL: URL?, active: Bool) -> Bool {
        pending == context && active && currentURL == context.documentURL
    }
    func finish(_ context: Context, currentURL: URL?, active: Bool) -> Bool {
        guard pending == context else { return false }
        pending = nil
        return active && currentURL == context.documentURL
    }
}
