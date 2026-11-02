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

    init(rows: [DiscoveryPresentedRow], loading: Bool) {
        if loading { headline = "Caricamento…"; detail = "Prezzi nella zona"; return }
        guard let first = rows.first else { headline = "Nessun prezzo"; detail = "Prova nella mappa"; return }
        let count = rows.count == 1 ? "1 prezzo" : "\(rows.count) prezzi"
        if Set(rows.map { $0.price.group }).count == 1,
           let lowest = rows.min(by: { $0.price.amountMinor < $1.price.amountMinor }) {
            headline = "Da \(lowest.price.amount)"; detail = "\(count) · \(first.price.groupLabel)"
        } else {
            headline = count; detail = "Valute o formati diversi"
        }
    }
}

@MainActor final class DiscoveryCategoryButton: UIButton {
    private let photo = UIImageView()
    private let name = UILabel()
    private let summary = UILabel()
    private let detail = UILabel()

    init(category: DrinkCategory) {
        super.init(frame: .zero)
        backgroundColor = NativeAppearance.surface
        layer.cornerRadius = 14; layer.masksToBounds = true
        photo.image = NativeDrinkArtwork.image(category.code)
        photo.contentMode = .scaleAspectFill; photo.clipsToBounds = true
        photo.backgroundColor = NativeAppearance.canvas
        photo.isAccessibilityElement = false
        name.text = category.name
        name.font = .preferredFont(forTextStyle: .subheadline)
        summary.font = .preferredFont(forTextStyle: .headline)
        detail.font = .preferredFont(forTextStyle: .caption2); detail.textColor = NativeAppearance.muted
        for label in [name, summary, detail] {
            label.numberOfLines = 0; label.adjustsFontForContentSizeCategory = true
            label.textColor = label === detail ? NativeAppearance.muted : NativeAppearance.ink
        }
        let text = UIStackView(arrangedSubviews: [name, summary, detail])
        text.axis = .vertical; text.spacing = 3
        text.isLayoutMarginsRelativeArrangement = true
        text.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 8, leading: 10, bottom: 10, trailing: 10)
        let stack = UIStackView(arrangedSubviews: [photo, text])
        stack.axis = .vertical; stack.translatesAutoresizingMaskIntoConstraints = false
        stack.isUserInteractionEnabled = false; addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: leadingAnchor), stack.trailingAnchor.constraint(equalTo: trailingAnchor),
            stack.topAnchor.constraint(equalTo: topAnchor), stack.bottomAnchor.constraint(equalTo: bottomAnchor),
            photo.heightAnchor.constraint(equalToConstant: 78), widthAnchor.constraint(equalToConstant: 132),
            heightAnchor.constraint(greaterThanOrEqualToConstant: 48)
        ])
        accessibilityLabel = category.name
    }

    required init?(coder: NSCoder) { return nil }

    func update(summary value: DiscoveryCategorySummary, selected: Bool) {
        summary.text = value.headline; detail.text = value.detail
        isSelected = selected
        layer.borderWidth = selected ? 2 : 1
        layer.borderColor = (selected ? NativeAppearance.accent : NativeAppearance.line).cgColor
        backgroundColor = selected ? NativeAppearance.accent.withAlphaComponent(0.07) : NativeAppearance.surface
        accessibilityValue = "\(value.headline). \(value.detail). Immagine illustrativa del drink"
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
        let text = UIStackView(arrangedSubviews: [title, evidence]); text.axis = .vertical; text.spacing = 5
        let row = UIStackView(arrangedSubviews: [rank, photo, text]); row.spacing = 8; row.alignment = .top
        row.translatesAutoresizingMaskIntoConstraints = false; contentView.addSubview(row)
        NSLayoutConstraint.activate([
            row.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 12),
            row.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -12),
            row.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 14),
            row.bottomAnchor.constraint(equalTo: contentView.bottomAnchor, constant: -14),
            rank.widthAnchor.constraint(equalToConstant: 18), photo.widthAnchor.constraint(equalToConstant: 36),
            photo.heightAnchor.constraint(equalToConstant: 48), contentView.heightAnchor.constraint(greaterThanOrEqualToConstant: 48)
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
        evidence.text = "\(category.name) · \(band.name)\n\(row.price.details(today: today))"
        accessibilityLabel = row.name
        accessibilityValue = "\(number) nel formato \(row.price.groupLabel). \(category.name) · \(band.name)\n\(row.price.amount)\n\(location.text ?? "")\n\(row.price.details(today: today))"
        accessibilityHint = "Apre questo locale nella mappa"
        // Narrow or large-type layouts put the exact amount above the evidence,
        // rather than compressing the venue name into an unreadable column.
        if let title = amount.superview as? UIStackView {
            title.axis = traits.preferredContentSizeCategory.isAccessibilityCategory ? .vertical : .horizontal
        }
    }
}
