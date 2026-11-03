import Foundation

/// Read-only, app-only menu facts. Amounts are individual drink prices, never all-in totals.
struct MenuV2Price: Equatable {
    enum Origin: Equatable { case ownerMenu(URL, String), customer(String) }
    let id: String
    let venueName: String
    let itemName: String
    let category: String
    let band: ComparisonBand?
    let amountMinor: Int
    let currency: String
    let exponent: Int
    let servingLabel: String?
    let servingML: Int?
    let origin: Origin
    let feeNotice: String
    var linkedOfferID: String? = nil
    var condition: String? = nil

    var group: String { "\(currency)|\(exponent)|\(servingLabel?.lowercased() ?? "")|\(servingML ?? 0)" }
    var amount: String {
        let factor = [1, 10, 100, 1000][exponent]
        let major = amountMinor / factor, minor = amountMinor % factor
        let decimal = exponent == 0 ? "" : "," + String(repeating: "0", count: max(0, exponent - String(minor).count)) + String(minor)
        return "\(major)\(decimal) \(currency == "EUR" ? "€" : currency == "GBP" ? "£" : currency)"
    }
    var serving: String {
        let label = servingLabel ?? "Formato non dichiarato"
        return servingML.map { "\(label) · \($0) ml" } ?? label
    }
    var evidence: String {
        switch origin {
        case .ownerMenu(_, let day): return "Da menu online · Fonte verificata il \(day) · Prezzo del drink. \(feeNotice)"
        case .customer(let day): return "Segnalato da un cliente il \(day) · Prezzo del drink. \(feeNotice)"
        }
    }
}

struct MenuV2Venue: Equatable {
    let key: String
    let cell: String
    let name: String
    let offers: [MenuV2Price]
    let feeNotice: String
    let linkedReports: [MenuV2Price]
    init(key: String, cell: String, name: String, offers: [MenuV2Price], feeNotice: String,
         linkedReports: [MenuV2Price] = []) {
        self.key = key; self.cell = cell; self.name = name; self.offers = offers
        self.feeNotice = feeNotice; self.linkedReports = linkedReports
    }
}
struct MenuV2Snapshot {
    let venues: [URL: MenuV2Venue]
    let unavailable: Set<URL>
}
struct MenuV2Page {
    let name: String
    let count: Int
    let offers: [MenuV2Price]
    let next: String?
    let feeNotice: String
}
struct MenuV2CustomerPage {
    let name: String
    let rows: [MenuV2Customer]
    let next: String?
}
struct MenuV2Customer {
    let id: String
    let offerID: String?
    let name: String
    let category: String?
    let servingLabel: String?
    let servingML: Int?
    let amountMinor: Int
    let currency: String
    let exponent: Int
    let observedOn: String
}

enum MenuV2JSON {
    private static func object(_ value: Any?) -> [String: Any]? { value as? [String: Any] }
    private static func text(_ value: Any?, maximum: Int = 512) -> String? {
        guard let value = value as? String, !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              value.utf16.count <= maximum else { return nil }
        return value
    }
    private static func optionalText(_ value: Any?, maximum: Int = 512) -> String? {
        if value is NSNull { return nil }
        return text(value, maximum: maximum)
    }
    private static func source(_ value: Any?) -> (URL, String)? {
        guard let object = object(value), let value = text(object["url"], maximum: 2048),
              let url = URL(string: value), url.scheme == "https", url.host != nil,
              url.user == nil, url.password == nil, url.port == nil, url.fragment == nil,
              let hash = object["text_sha256"] as? String, ComparisonJSON.matches(hash, "^[0-9a-f]{64}$"),
              let day = object["checked_on"] as? String, ComparisonJSON.day(day) != nil else { return nil }
        return (url, day)
    }
    private static func money(_ value: [String: Any]) -> (Int, String, Int)? {
        guard let amount = ComparisonJSON.integer(value["amount_minor"], minimum: 1, maximum: 100_000_000),
              let currency = value["currency"] as? String, ComparisonJSON.matches(currency, "^[A-Z]{3}$"),
              let exponent = ComparisonJSON.integer(value["currency_exponent"], minimum: 0, maximum: 3) else { return nil }
        return (amount, currency, exponent)
    }
    private static func serving(_ value: Any?) -> (String?, Int?)? {
        guard let object = object(value), let label = object["label"], let ml = object["ml"] else { return nil }
        let parsedLabel = optionalText(label, maximum: 256)
        if !(label is NSNull) && parsedLabel == nil { return nil }
        let parsedML = ml is NSNull ? nil : ComparisonJSON.integer(ml, minimum: 1, maximum: 100_000)
        if !(ml is NSNull) && parsedML == nil { return nil }
        return (parsedLabel, parsedML)
    }
    private static func venue(_ value: Any?, key: String, cell: String) -> String? {
        guard let venue = object(value), venue["key"] as? String == key, venue["cell"] as? String == cell,
              let name = text(venue["name"]) else { return nil }
        return name
    }
    private static func cursor(_ value: Any?, pattern: String) -> String?? {
        if value is NSNull { return .some(nil) }
        guard let value = value as? String, ComparisonJSON.matches(value, pattern) else { return nil }
        return .some(value)
    }
    private static func feeNotice(_ root: [String: Any]) -> String? {
        guard let fees = root["fees"] as? [Any], fees.count <= 100,
              let coverage = object(root["fee_coverage"]), let status = coverage["status"] as? String,
              ["unknown", "documented_partial", "explicit_no_fee"].contains(status) else { return nil }
        if status == "explicit_no_fee" && !fees.isEmpty { return nil }
        var descriptions: [String] = []
        for item in fees {
            guard let fee = object(item), let label = text(fee["label"]),
                  let kind = fee["kind"] as? String, let basis = fee["basis"] as? String,
                  ["person", "table", "bill", "unspecified"].contains(basis),
                  let applicability = fee["applicability"] as? String,
                  ["all_orders", "conditional", "unknown"].contains(applicability),
                  source(fee["source"]) != nil else { return nil }
            let condition = fee["condition"] is NSNull ? nil : text(fee["condition"], maximum: 500)
            guard (applicability == "conditional") == (condition != nil) else { return nil }
            let scope = applicability == "all_orders" ? "tutti gli ordini" : applicability == "unknown" ? "applicabilita non verificata" : "solo se \(condition!)"
            let value: String
            if kind == "fixed" {
                guard let amount = money(fee) else { return nil }
                let sample = MenuV2Price(id: "", venueName: "", itemName: "", category: "", band: nil,
                                         amountMinor: amount.0, currency: amount.1, exponent: amount.2,
                                         servingLabel: nil, servingML: nil, origin: .customer(""), feeNotice: "")
                value = sample.amount
            } else if kind == "percent" {
                guard let rate = ComparisonJSON.integer(fee["rate_bps"], minimum: 1, maximum: 10_000) else { return nil }
                value = "\(Double(rate) / 100)%"
            } else { return nil }
            if descriptions.count < 3 { descriptions.append("\(label) \(value) / \(basis) (\(scope))") }
        }
        if status == "explicit_no_fee" { return "Nessuna spesa obbligatoria dichiarata dalla fonte." }
        let known = descriptions.isEmpty ? "" : "Spese separate: " + descriptions.joined(separator: "; ") + (fees.count > 3 ? "; altre spese nel dettaglio" : "") + ". "
        return known + (status == "unknown" ? "Altre spese non verificate." : "Copertura delle spese parziale.")
    }

    static func menuPage(_ data: Data, key: String, cell: String) -> MenuV2Page? {
        guard data.count <= 1_048_576, let root = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              ComparisonJSON.integer(root["schema_version"], minimum: 2, maximum: 2) == 2,
              root["price_scope"] as? String == "menu_item_only",
              let coverage = object(root["coverage"]), coverage["complete"] as? Bool == false,
              coverage["basis"] as? String == "verified_source_items_only",
              let name = venue(root["venue"], key: key, cell: cell),
              let count = ComparisonJSON.integer(root["stored_offer_count"], minimum: 0, maximum: 100_000),
              let raw = root["offers"] as? [Any], raw.count <= 100,
              let next = cursor(root["next_after"], pattern: "^[A-Za-z0-9._:-]{1,128}$"),
              let fee = feeNotice(root) else { return nil }
        var offers: [MenuV2Price] = [], seen = Set<String>()
        for value in raw {
            guard let item = object(value), let id = text(item["id"], maximum: 128),
                  ComparisonJSON.matches(id, "^[A-Za-z0-9._:-]{1,128}$"), seen.insert(id).inserted,
                  let itemName = text(item["name"]), let amount = money(item),
                  let serving = serving(item["serving"]), let context = object(item["context"]),
                  let kind = context["kind"] as? String, ["regular", "happy_hour", "conditional"].contains(kind),
                  let evidence = source(item["source"]) else { return nil }
            let category = item["category"] as? String ?? ""
            if !(item["category"] is NSNull) && !DrinkCategory.all.contains(where: { $0.code == category }) { return nil }
            let condition = context["condition"] is NSNull ? nil : text(context["condition"], maximum: 500)
            if !(context["condition"] is NSNull) && condition == nil { return nil }
            let band: ComparisonBand? = kind == "regular" ? .normal : kind == "happy_hour" ? .happyHour : nil
            var offer = MenuV2Price(id: id, venueName: name, itemName: itemName, category: category,
                                    band: band, amountMinor: amount.0, currency: amount.1, exponent: amount.2,
                                    servingLabel: serving.0, servingML: serving.1,
                                    origin: .ownerMenu(evidence.0, evidence.1), feeNotice: fee)
            offer.condition = kind == "conditional" ? condition : nil
            offers.append(offer)
        }
        if let after = next, after != offers.last?.id { return nil }
        return MenuV2Page(name: name, count: count, offers: offers, next: next, feeNotice: fee)
    }

    static func customerPage(_ data: Data, key: String, cell: String) -> MenuV2CustomerPage? {
        guard data.count <= 1_048_576, let root = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              ComparisonJSON.integer(root["schema_version"], minimum: 1, maximum: 1) == 1,
              root["price_scope"] as? String == "customer_reported_drink_item",
              let name = venue(root["venue"], key: key, cell: cell),
              let raw = root["rows"] as? [Any], raw.count <= 50,
              let next = cursor(root["next_after"], pattern: "^[oc][0-9a-f]{64}$") else { return nil }
        var rows: [MenuV2Customer] = [], seen = Set<String>()
        for value in raw {
            guard let item = object(value), let id = item["item_key"] as? String,
                  ComparisonJSON.matches(id, "^[oc][0-9a-f]{64}$"), seen.insert(id).inserted,
                  let kind = item["kind"] as? String, ["menu_offer", "new_drink"].contains(kind),
                  item["source_kind"] as? String == "customer",
                  item["observation_kind"] as? String == "customer_reported_price",
                  item["price_scope"] as? String == "drink_item",
                  let itemName = text(item["name"]), let amount = money(item),
                  let serving = serving(item["serving"]),
                  let day = item["observed_on"] as? String, ComparisonJSON.day(day) != nil else { return nil }
            let category = item["category"] as? String
            if !(item["category"] is NSNull) && (category == nil || !DrinkCategory.all.contains(where: { $0.code == category })) { return nil }
            let offerID = item["offer_id"] as? String
            if kind == "menu_offer" && (offerID == nil || !ComparisonJSON.matches(offerID!, "^[A-Za-z0-9._:-]{1,128}$")) { return nil }
            if kind == "new_drink" && !(item["offer_id"] is NSNull) { return nil }
            rows.append(MenuV2Customer(id: id, offerID: offerID, name: itemName, category: category,
                                       servingLabel: serving.0, servingML: serving.1,
                                       amountMinor: amount.0, currency: amount.1, exponent: amount.2, observedOn: day))
        }
        if let after = next, after != rows.last?.id { return nil }
        return MenuV2CustomerPage(name: name, rows: rows, next: next)
    }
}
