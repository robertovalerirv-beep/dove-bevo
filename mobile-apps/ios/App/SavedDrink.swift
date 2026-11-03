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
    let menuPrice: MenuV2Price?
    static func rows(_ saved: [SavedDrink], snapshot: FavouriteComparisonSnapshot?, menuSnapshot: MenuV2Snapshot? = nil) -> [SavedDrinkRow] {
        saved.flatMap { entry -> [SavedDrinkRow] in
            let base = FavouriteComparisonRow.sorted(saved: [entry.venue], snapshot: snapshot, drink: entry.drink, band: entry.band)
            let menu = menuSnapshot?.venues[entry.venue.url]?.offers.filter { $0.category == entry.drink && $0.band == entry.band } ?? []
            let baseToShow = menu.isEmpty ? base : base.filter { $0.displayPrice != nil }
            let fallback = base.first!
            return menu.map { SavedDrinkRow(saved: entry, comparison: fallback, menuPrice: $0) }
                + baseToShow.map { SavedDrinkRow(saved: entry, comparison: $0, menuPrice: nil) }
        }.sorted { left, right in
            if left.saved.drink != right.saved.drink { return left.saved.drink < right.saved.drink }
            if left.saved.band != right.saved.band { return left.saved.band.rawValue < right.saved.band.rawValue }
            let leftGroup = left.menuPrice?.group ?? left.comparison.displayPrice?.group
            let rightGroup = right.menuPrice?.group ?? right.comparison.displayPrice?.group
            if (leftGroup != nil) != (rightGroup != nil) { return leftGroup != nil }
            if let leftGroup, let rightGroup {
                if leftGroup != rightGroup { return leftGroup < rightGroup }
                let a = left.menuPrice?.amountMinor ?? left.comparison.displayPrice?.amountMinor ?? 0
                let b = right.menuPrice?.amountMinor ?? right.comparison.displayPrice?.amountMinor ?? 0
                if a != b { return a < b }
            }
            let leftName = left.menuPrice?.venueName ?? left.comparison.name
            let rightName = right.menuPrice?.venueName ?? right.comparison.name
            let order = leftName.localizedCaseInsensitiveCompare(rightName)
            return order == .orderedSame ? left.saved.identity < right.saved.identity : order == .orderedAscending
        }
    }
}
