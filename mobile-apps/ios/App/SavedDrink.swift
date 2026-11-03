import Foundation

/// A private preference for a category at a real venue, never a cached price or public vote.
struct SavedDrink: Equatable {
    let venue: SavedVenue
    let drink: String
    let band: ComparisonBand
    var identity: String { "\(venue.url.lastPathComponent)|\(drink)|\(band.rawValue)" }
    var category: DrinkCategory { DrinkCategory.all.first { $0.code == drink }! }
    private init(venue: SavedVenue, drink: String, band: ComparisonBand) {
        self.venue = venue; self.drink = drink; self.band = band
    }

    static func validated(url: URL, label: String, drink: String, band: ComparisonBand) throws -> SavedDrink {
        guard DrinkCategory.all.contains(where: { $0.code == drink }), ComparisonJSON.name(label) != nil else {
            throw SavedVenuePolicy.ValidationError.invalidLabel
        }
        return SavedDrink(venue: try SavedVenuePolicy.venue(url: url, label: label), drink: drink, band: band)
    }
}

struct SavedDrinkRow {
    let saved: SavedDrink
    let comparison: FavouriteComparisonRow
    static func rows(_ saved: [SavedDrink], snapshot: FavouriteComparisonSnapshot?) -> [SavedDrinkRow] {
        saved.flatMap { entry in
            FavouriteComparisonRow.sorted(saved: [entry.venue], snapshot: snapshot, drink: entry.drink, band: entry.band)
                .map { SavedDrinkRow(saved: entry, comparison: $0) }
        }.sorted { left, right in
            if left.saved.drink != right.saved.drink { return left.saved.drink < right.saved.drink }
            if left.saved.band != right.saved.band { return left.saved.band.rawValue < right.saved.band.rawValue }
            let a = left.comparison.displayPrice, b = right.comparison.displayPrice
            if (a != nil) != (b != nil) { return a != nil }
            if let a, let b {
                if a.group != b.group { return a.group < b.group }
                if a.amountMinor != b.amountMinor { return a.amountMinor < b.amountMinor }
            }
            let order = left.comparison.name.localizedCaseInsensitiveCompare(right.comparison.name)
            return order == .orderedSame ? left.saved.identity < right.saved.identity : order == .orderedAscending
        }
    }
}
