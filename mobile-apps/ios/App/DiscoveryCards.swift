import UIKit

/// Generic drink illustrations describe a category, never the photographed venue.
@MainActor enum NativeDrinkArtwork {
    static func image(_ code: String) -> UIImage? {
        let names = ["beer_draft": "DrinkBeer", "spritz": "DrinkSpritz", "negroni": "DrinkNegroni",
                     "sbagliato": "DrinkSbagliato", "gin_tonic": "DrinkGinTonic", "gin_lemon": "DrinkGinTonic",
                     "wine_glass": "DrinkWine", "alcohol_free": "DrinkAlcoholFree", "water": "DrinkWater"]
        if let name = names[code], let image = UIImage(named: name) { return image }
        return UIImage(systemName: code == "water" ? "drop" : "wineglass")
    }
}

struct DiscoveryCategorySummary: Equatable {
    let headline: String
    let detail: String
    let countText: String?

    init(rows: [DiscoveryPresentedRow], loading: Bool, available: Bool = true,
         partial: Bool = false, today: String = ComparisonJSON.today()) {
        if loading { headline = "Caricamento…"; detail = "Prezzi nella zona"; countText = nil; return }
        if !available { headline = "Prezzi non caricati"; detail = "Apri la mappa o ricarica"; countText = nil; return }
        guard let first = rows.first else {
            headline = partial ? "Nessun prezzo nei dati caricati" : "Nessun prezzo"
            detail = partial ? "Zona parziale · Ricarica" : "Prova nella mappa"
            countText = nil
            return
        }
        let count = rows.count == 1 ? "1 prezzo" : "\(rows.count) prezzi"
        countText = count
        if Set(rows.map { $0.price.discoveryGroup }).count == 1,
           let lowest = rows.min(by: { $0.price.amountMinor < $1.price.amountMinor }) {
            let source: String
            let old: Bool
            switch lowest.price {
            case .legacy(let price):
                source = "Segnalato il \(price.observedOn)"
                old = price.isOld(today: today)
            case .europe(let price):
                source = price.sourceCheckedOn.map { "Menu verificato il \($0)" }
                    ?? "Segnalato il \(price.observedOn ?? "data non disponibile")"
                old = (price.observedOn ?? price.sourceCheckedOn).flatMap(ComparisonJSON.day).map { day in
                    (ComparisonJSON.day(today)?.timeIntervalSince(day) ?? .infinity) > 90 * 86400
                } ?? true
            case .menuV2(let price):
                if case .ownerMenu(_, let day) = price.origin {
                    source = "Menu verificato il \(day)"
                    old = ComparisonJSON.day(day).map { checked in
                        (ComparisonJSON.day(today)?.timeIntervalSince(checked) ?? .infinity) > 90 * 86400
                    } ?? true
                } else { source = "Origine non disponibile"; old = true }
            }
            headline = "Da \(lowest.price.amount)"
            detail = "\(first.price.groupLabel) · \(source)" + (old ? " · Da ricontrollare" : "")
                + (partial ? " · Zona parziale" : "")
        } else {
            headline = count; detail = "Valute o formati diversi" + (partial ? " · Zona parziale" : "")
        }
    }
}

/// A small visual sample of the already loaded results, never a second ranking
/// or an independent source of venue/price data.
enum DiscoveryFeaturedSelection {
    static func rows(from rankedRows: [DiscoveryPresentedRow]) -> [DiscoveryPresentedRow] {
        var seenVenues = Set<String>()
        return rankedRows.filter { seenVenues.insert($0.key).inserted }.prefix(3).map { $0 }
    }
}

enum DiscoveryFeaturedEvidence {
    static func text(for value: NativeComparablePrice, today: String) -> String {
        let source: String
        let day: String?
        let staleLabel: String
        switch value {
        case .legacy(let price):
            day = price.observedOn
            source = "Segnalato il \(price.observedOn)"
            staleLabel = "Da riconfermare: oltre 90 giorni"
        case .europe(let price):
            if let checked = price.sourceCheckedOn {
                day = checked
                source = "Menu online · Fonte verificata il \(checked)"
                staleLabel = "Menu da riverificare: oltre 90 giorni"
            } else {
                day = price.observedOn
                source = price.observedOn.map { "Segnalato il \($0)" } ?? "Data non disponibile"
                staleLabel = "Da riconfermare: oltre 90 giorni"
            }
        case .menuV2(let price):
            switch price.origin {
            case .ownerMenu(_, let checked):
                day = checked
                source = "Menu online · Fonte verificata il \(checked)"
                staleLabel = "Menu da riverificare: oltre 90 giorni"
            case .customer(let observed):
                day = observed
                source = observed.isEmpty ? "Data non disponibile" : "Segnalato da un cliente il \(observed)"
                staleLabel = "Da riconfermare: oltre 90 giorni"
            }
        }
        let old = day.flatMap(ComparisonJSON.day).map { date in
            (ComparisonJSON.day(today)?.timeIntervalSince(date) ?? .infinity) > 90 * 86400
        } ?? true
        return old ? "\(source) · \(staleLabel)" : source
    }
}

@MainActor final class DiscoveryFeaturedCard: UIControl {
    private let artwork = UIImageView()
    private let copy = UIStackView()
    private let drinkLabel = UILabel()
    private let venueLabel = UILabel()
    private let priceLabel = UILabel()
    private let servingLabel = UILabel()
    private let evidenceLabel = UILabel()
    private let artworkHeight: CGFloat

    init(row: DiscoveryPresentedRow, category: DrinkCategory, today: String = ComparisonJSON.today(),
         artworkHeight: CGFloat = 64, traits: UITraitCollection = .current) {
        self.artworkHeight = artworkHeight
        super.init(frame: .zero)
        accessibilityIdentifier = "discovery.featured.\(row.key)"
        isAccessibilityElement = true
        accessibilityTraits = .button
        accessibilityHint = "Apre questo locale nella mappa"
        backgroundColor = NativeAppearance.surface
        layer.cornerRadius = 16
        layer.borderWidth = 1
        layer.borderColor = NativeAppearance.muted.withAlphaComponent(0.25).cgColor
        clipsToBounds = true

        artwork.image = NativeDrinkArtwork.image(category.code)
        artwork.contentMode = .scaleAspectFit
        artwork.backgroundColor = NativeAppearance.secondary
        artwork.isAccessibilityElement = false
        artwork.heightAnchor.constraint(equalToConstant: artworkHeight).isActive = true
        let item: String
        switch row.price {
        case .legacy: item = category.name
        case .europe(let price): item = price.menuItem.flatMap { $0.isEmpty ? nil : $0 } ?? category.name
        case .menuV2(let price): item = price.itemName
        }
        drinkLabel.text = item
        venueLabel.text = row.name
        priceLabel.text = row.price.amount
        servingLabel.text = row.price.groupLabel
        evidenceLabel.text = DiscoveryFeaturedEvidence.text(for: row.price, today: today)
        drinkLabel.font = .preferredFont(forTextStyle: .subheadline, compatibleWith: traits)
        drinkLabel.textColor = NativeAppearance.ink
        venueLabel.font = .preferredFont(forTextStyle: .caption1, compatibleWith: traits)
        venueLabel.textColor = NativeAppearance.muted
        priceLabel.font = .preferredFont(forTextStyle: .headline, compatibleWith: traits)
        priceLabel.textColor = NativeAppearance.ink
        servingLabel.font = .preferredFont(forTextStyle: .caption2, compatibleWith: traits)
        servingLabel.textColor = NativeAppearance.muted
        evidenceLabel.font = .preferredFont(forTextStyle: .caption2, compatibleWith: traits)
        evidenceLabel.textColor = NativeAppearance.muted
        for label in [drinkLabel, venueLabel, priceLabel, servingLabel, evidenceLabel] {
            label.numberOfLines = 0
            label.lineBreakMode = .byWordWrapping
            label.adjustsFontForContentSizeCategory = true
            label.isAccessibilityElement = false
            label.setContentCompressionResistancePriority(.required, for: .vertical)
        }
        for label in [drinkLabel, venueLabel, priceLabel, servingLabel, evidenceLabel] {
            copy.addArrangedSubview(label)
        }
        copy.axis = .vertical
        copy.spacing = 2
        copy.isLayoutMarginsRelativeArrangement = true
        copy.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 8, leading: 10, bottom: 10, trailing: 10)
        let stack = UIStackView(arrangedSubviews: [artwork, copy])
        stack.axis = .vertical
        stack.translatesAutoresizingMaskIntoConstraints = false
        stack.isUserInteractionEnabled = false
        addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: topAnchor), stack.bottomAnchor.constraint(equalTo: bottomAnchor),
            stack.leadingAnchor.constraint(equalTo: leadingAnchor), stack.trailingAnchor.constraint(equalTo: trailingAnchor)
        ])
        accessibilityLabel = "\(item), \(row.name)"
        accessibilityValue = "\(row.price.amount). \(row.price.groupLabel). \(evidenceLabel.text ?? ""). Immagine illustrativa del drink."
    }

    /// Size the shared strip for the longest real item instead of cropping its
    /// name, serving or source inside a fixed-height scroll view.
    func requiredHeight(for width: CGFloat) -> CGFloat {
        let margins = copy.directionalLayoutMargins
        let labelWidth = max(1, width - margins.leading - margins.trailing)
        let textHeight = [drinkLabel, venueLabel, priceLabel, servingLabel, evidenceLabel]
            .reduce(CGFloat.zero) { total, label in
                total + ceil(label.sizeThatFits(CGSize(width: labelWidth,
                                                       height: .greatestFiniteMagnitude)).height) + 1
            }
        return ceil(artworkHeight + margins.top + margins.bottom + textHeight
                    + copy.spacing * CGFloat(copy.arrangedSubviews.count - 1) + 4)
    }

    required init?(coder: NSCoder) { return nil }
}

@MainActor final class DiscoveryFeaturedStrip: UIScrollView {
    private let cards = UIStackView()
    private var height: NSLayoutConstraint!
    private var cardWidths: [NSLayoutConstraint] = []

    override init(frame: CGRect) {
        super.init(frame: frame)
        accessibilityIdentifier = "discovery.featuredStrip"
        showsHorizontalScrollIndicator = false
        alwaysBounceHorizontal = true
        cards.axis = .horizontal
        cards.spacing = 12
        cards.alignment = .fill
        cards.translatesAutoresizingMaskIntoConstraints = false
        addSubview(cards)
        height = heightAnchor.constraint(equalToConstant: 232)
        height.priority = .defaultHigh
        NSLayoutConstraint.activate([
            cards.topAnchor.constraint(equalTo: contentLayoutGuide.topAnchor),
            cards.bottomAnchor.constraint(equalTo: contentLayoutGuide.bottomAnchor),
            cards.leadingAnchor.constraint(equalTo: contentLayoutGuide.leadingAnchor),
            cards.trailingAnchor.constraint(equalTo: contentLayoutGuide.trailingAnchor),
            cards.heightAnchor.constraint(equalTo: frameLayoutGuide.heightAnchor),
            height
        ])
    }

    required init?(coder: NSCoder) { return nil }

    func configure(rows: [DiscoveryPresentedRow], category: DrinkCategory, availableWidth: CGFloat,
                   traits: UITraitCollection, target: Any?, action: Selector) {
        cards.arrangedSubviews.forEach { cards.removeArrangedSubview($0); $0.removeFromSuperview() }
        cardWidths.removeAll()
        // Two cards fit at standard iPhone widths; narrower screens retain a
        // scroll cue. Larger text gets wider, taller cards without truncation.
        let largeText = traits.preferredContentSizeCategory.isAccessibilityCategory
        let cardWidth = largeText ? max(180, min(280, availableWidth - 24))
                                  : max(156, min(172, (availableWidth - cards.spacing) / 2))
        let scaledHeight = UIFontMetrics(forTextStyle: .body).scaledValue(for: 232, compatibleWith: traits)
        height.constant = largeText ? max(440, scaledHeight) : scaledHeight
        let artworkHeight = min(82, UIFontMetrics(forTextStyle: .caption1)
            .scaledValue(for: 64, compatibleWith: traits))
        for (index, row) in rows.enumerated() {
            let card = DiscoveryFeaturedCard(row: row, category: category,
                                             artworkHeight: artworkHeight, traits: traits)
            card.tag = index
            card.addTarget(target, action: action, for: .touchUpInside)
            cards.addArrangedSubview(card)
            let width = card.widthAnchor.constraint(equalToConstant: cardWidth)
            width.isActive = true
            cardWidths.append(width)
            height.constant = max(height.constant, card.requiredHeight(for: cardWidth))
        }
        isHidden = rows.isEmpty
    }
}

@MainActor final class DiscoveryCategoryButton: UIButton {
    private let photo = UIImageView()
    private let name = UILabel()
    private let summary = UILabel()
    private let detail = UILabel()
    private let count = UILabel()
    private var photoHeight: NSLayoutConstraint?

    init(category: DrinkCategory) {
        super.init(frame: .zero)
        backgroundColor = NativeAppearance.surface
        layer.cornerRadius = 14; layer.masksToBounds = true
        photo.image = NativeDrinkArtwork.image(category.code)
        photo.contentMode = .scaleAspectFill; photo.clipsToBounds = true
        photo.backgroundColor = NativeAppearance.canvas
        photo.isAccessibilityElement = false
        name.text = category.name
        name.font = .preferredFont(forTextStyle: .caption1)
        summary.font = UIFontMetrics(forTextStyle: .subheadline).scaledFont(for: UIFont.systemFont(ofSize: 15, weight: .semibold))
        detail.font = .preferredFont(forTextStyle: .caption2); detail.textColor = NativeAppearance.muted
        for label in [name, summary, detail] {
            label.numberOfLines = 0; label.adjustsFontForContentSizeCategory = true
            label.textColor = label === detail ? NativeAppearance.muted : NativeAppearance.ink
        }
        let text = UIStackView(arrangedSubviews: [name, summary, detail])
        text.axis = .vertical; text.spacing = 2
        text.isLayoutMarginsRelativeArrangement = true
        text.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 6, leading: 8, bottom: 6, trailing: 8)
        count.font = .preferredFont(forTextStyle: .caption2); count.adjustsFontForContentSizeCategory = true
        count.numberOfLines = 0; count.textAlignment = .center; count.textColor = NativeAppearance.ink
        let badge = UIView(); badge.backgroundColor = NativeAppearance.surface; badge.layer.cornerRadius = 6
        badge.translatesAutoresizingMaskIntoConstraints = false; count.translatesAutoresizingMaskIntoConstraints = false
        badge.addSubview(count); photo.addSubview(badge)
        NSLayoutConstraint.activate([
            badge.topAnchor.constraint(equalTo: photo.topAnchor, constant: 4),
            badge.trailingAnchor.constraint(equalTo: photo.trailingAnchor, constant: -4),
            badge.leadingAnchor.constraint(greaterThanOrEqualTo: photo.leadingAnchor, constant: 4),
            count.topAnchor.constraint(equalTo: badge.topAnchor, constant: 2), count.bottomAnchor.constraint(equalTo: badge.bottomAnchor, constant: -2),
            count.leadingAnchor.constraint(equalTo: badge.leadingAnchor, constant: 5), count.trailingAnchor.constraint(equalTo: badge.trailingAnchor, constant: -5)
        ])
        let stack = UIStackView(arrangedSubviews: [photo, text])
        stack.axis = .vertical; stack.translatesAutoresizingMaskIntoConstraints = false
        stack.isUserInteractionEnabled = false; addSubview(stack)
        let photoHeight = photo.heightAnchor.constraint(equalToConstant: 60); self.photoHeight = photoHeight
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: leadingAnchor), stack.trailingAnchor.constraint(equalTo: trailingAnchor),
            stack.topAnchor.constraint(equalTo: topAnchor), stack.bottomAnchor.constraint(equalTo: bottomAnchor),
            photoHeight, widthAnchor.constraint(equalToConstant: 132),
            heightAnchor.constraint(greaterThanOrEqualToConstant: 48)
        ])
        accessibilityLabel = category.name
    }

    required init?(coder: NSCoder) { return nil }

    func update(summary value: DiscoveryCategorySummary, selected: Bool) {
        summary.text = value.headline; detail.text = value.detail
        count.text = value.countText
        count.superview?.isHidden = value.countText == nil || value.countText == value.headline
        photoHeight?.constant = UIFontMetrics(forTextStyle: .caption1).scaledValue(for: 60, compatibleWith: traitCollection)
        isSelected = selected
        layer.borderWidth = selected ? 2 : 1
        layer.borderColor = NativeAppearance.ink.cgColor
        backgroundColor = selected ? NativeAppearance.secondary : NativeAppearance.surface
        accessibilityValue = "\(value.headline). \(value.detail). \(value.countText ?? ""). Immagine illustrativa del drink"
        accessibilityTraits = selected ? [.button, .selected] : [.button]
    }
}

@MainActor final class DiscoveryVenueCell: UITableViewCell {
    private let rank = UILabel()
    private let photo = UIImageView()
    private let name = UILabel()
    private let location = UILabel()
    private let amount = UILabel()
    private let evidence = UILabel()

    override init(style: UITableViewCell.CellStyle, reuseIdentifier: String?) {
        super.init(style: style, reuseIdentifier: reuseIdentifier)
        rank.font = .preferredFont(forTextStyle: .caption1); rank.textAlignment = .center
        rank.textColor = NativeAppearance.accentText
        photo.contentMode = .scaleAspectFill; photo.clipsToBounds = true; photo.layer.cornerRadius = 8
        photo.isAccessibilityElement = false
        name.font = .preferredFont(forTextStyle: .headline)
        location.font = .preferredFont(forTextStyle: .caption1); location.textColor = NativeAppearance.muted
        amount.font = .preferredFont(forTextStyle: .headline); amount.textColor = NativeAppearance.ink
        amount.setContentCompressionResistancePriority(.required, for: .horizontal)
        evidence.font = .preferredFont(forTextStyle: .caption1); evidence.textColor = NativeAppearance.muted
        for label in [rank, name, location, amount, evidence] {
            label.numberOfLines = 0; label.adjustsFontForContentSizeCategory = true
        }
        let identity = UIStackView(arrangedSubviews: [name, location]); identity.axis = .vertical; identity.spacing = 3
        let title = UIStackView(arrangedSubviews: [identity, amount]); title.axis = .horizontal; title.spacing = 8; title.alignment = .top
        let row = UIStackView(arrangedSubviews: [rank, photo, title]); row.spacing = 8; row.alignment = .top
        let card = UIStackView(arrangedSubviews: [row, evidence]); card.axis = .vertical; card.spacing = 4
        card.translatesAutoresizingMaskIntoConstraints = false; contentView.addSubview(card)
        NSLayoutConstraint.activate([
            card.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 12),
            card.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -12),
            card.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 10),
            card.bottomAnchor.constraint(equalTo: contentView.bottomAnchor, constant: -10),
            rank.widthAnchor.constraint(equalToConstant: 18), photo.widthAnchor.constraint(equalToConstant: 30),
            photo.heightAnchor.constraint(equalToConstant: 40), contentView.heightAnchor.constraint(greaterThanOrEqualToConstant: 48)
        ])
        backgroundConfiguration = NativeAppearance.card()
        isAccessibilityElement = true
    }

    required init?(coder: NSCoder) { return nil }

    func configure(row: DiscoveryPresentedRow, category: DrinkCategory, band: ComparisonBand, rank number: Int,
                   distance: String, today: String, traits: UITraitCollection) {
        rank.text = String(number); photo.image = NativeDrinkArtwork.image(category.code)
        name.text = row.name; amount.text = row.price.amount
        location.text = [row.location, "\(distance) dal centro mappa"].filter { !$0.isEmpty }.joined(separator: " · ")
        evidence.text = row.price.details(today: today)
        accessibilityLabel = row.name
        accessibilityValue = "\(number) nel formato \(row.price.groupLabel). \(category.name) · \(band.name)\n\(row.price.amount)\n\(location.text ?? "")\n\(row.price.details(today: today)). Immagine illustrativa del drink."
        accessibilityHint = "Apre questo locale nella mappa"
        // Narrow or large-type layouts put the exact amount above the evidence,
        // rather than compressing the venue name into an unreadable column.
        if let title = amount.superview as? UIStackView {
            let large = traits.preferredContentSizeCategory.isAccessibilityCategory
            title.axis = large ? .vertical : .horizontal
            title.alignment = large ? .fill : .top
        }
    }
}
