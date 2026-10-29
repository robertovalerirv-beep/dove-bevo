import CoreFoundation
import Foundation

struct DrinkCategory: Equatable {
    let code: String
    let name: String

    // Kept in the public shared catalog's order; local parity guards check it.
    static let all = [
        DrinkCategory(code: "beer_draft", name: "Birra media"),
        DrinkCategory(code: "spritz", name: "Spritz"),
        DrinkCategory(code: "negroni", name: "Negroni"),
        DrinkCategory(code: "sbagliato", name: "Sbagliato"),
        DrinkCategory(code: "gin_tonic", name: "Gin tonic"),
        DrinkCategory(code: "gin_lemon", name: "Gin lemon"),
        DrinkCategory(code: "wine_glass", name: "Calice di vino"),
        DrinkCategory(code: "alcohol_free", name: "Analcolico"),
        DrinkCategory(code: "water", name: "Acqua")
    ]
}

struct DrinkRecommendation: Equatable {
    let drink: String
    let count: Int
    let recommended: Bool
}

enum RecommendationError: Error, Equatable {
    case invalidContext, identityUnavailable, invalidResponse, unavailable, rateLimited, network

    var message: String {
        switch self {
        case .unavailable: return "Questo locale non è disponibile per i consigli. Torna alla mappa e riaprilo."
        case .rateLimited: return "Troppi tentativi. Attendi e tocca Riprova."
        case .identityUnavailable: return "Non riesco a caricare i tuoi consigli su questo dispositivo. Riprova."
        default: return "Consigli non disponibili. Controlla la connessione e tocca Riprova."
        }
    }
}

struct RecommendationSnapshot: Equatable {
    static let maximumResponseBytes = 32 * 1024
    let venueKey: String
    let drinks: [DrinkRecommendation]

    static func parse(_ data: Data, venueKey: String) throws -> RecommendationSnapshot {
        guard data.count <= maximumResponseBytes,
              let object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              Set(object.keys) == ["venue_key", "drinks"], object["venue_key"] as? String == venueKey,
              let rows = object["drinks"] as? [[String: Any]], rows.count == DrinkCategory.all.count else {
            throw RecommendationError.invalidResponse
        }
        let codes = Set(DrinkCategory.all.map(\.code))
        var seen = Set<String>()
        var parsed: [DrinkRecommendation] = []
        for row in rows {
            guard Set(row.keys) == ["drink", "count", "recommended"],
                  let code = row["drink"] as? String, codes.contains(code), seen.insert(code).inserted,
                  let count = row["count"] as? NSNumber, CFGetTypeID(count) != CFBooleanGetTypeID(),
                  // The service emits integer counts. Reject floating/decimal
                  // representations before a fraction or underflow can round.
                  ["c", "C", "s", "S", "i", "I", "l", "L", "q", "Q"].contains(String(cString: count.objCType)),
                  count.int64Value >= 0, count.int64Value <= 9_007_199_254_740_991,
                  let selected = row["recommended"] as? NSNumber, CFGetTypeID(selected) == CFBooleanGetTypeID() else {
                throw RecommendationError.invalidResponse
            }
            parsed.append(DrinkRecommendation(drink: code, count: Int(count.int64Value), recommended: selected.boolValue))
        }
        guard seen == codes else { throw RecommendationError.invalidResponse }
        return RecommendationSnapshot(venueKey: venueKey, drinks: parsed)
    }

    var sortedCategories: [DrinkCategory] {
        let counts = Dictionary(uniqueKeysWithValues: drinks.map { ($0.drink, $0.count) })
        return DrinkCategory.all.enumerated().sorted {
            let first = counts[$0.element.code] ?? 0
            let second = counts[$1.element.code] ?? 0
            return first == second ? $0.offset < $1.offset : first > second
        }.map(\.element)
    }

    func value(for code: String) -> DrinkRecommendation? { drinks.first { $0.drink == code } }
}
