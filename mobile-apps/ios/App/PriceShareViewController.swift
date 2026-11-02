import UIKit

@MainActor enum PricePosterRenderer {
    static func render(_ value: PriceShareSnapshot) -> UIImage {
        let width: CGFloat = 1080
        let textWidth: CGFloat = 952
        let paragraph = NSMutableParagraphStyle(); paragraph.lineBreakMode = .byWordWrapping; paragraph.lineSpacing = 5
        func attributes(_ size: CGFloat, weight: UIFont.Weight = .regular, color: UIColor = NativeAppearance.ink) -> [NSAttributedString.Key: Any] {
            [.font: UIFont.systemFont(ofSize: size, weight: weight), .foregroundColor: color, .paragraphStyle: paragraph]
        }
        func height(_ text: String, _ attributes: [NSAttributedString.Key: Any]) -> CGFloat {
            ceil((text as NSString).boundingRect(with: CGSize(width: textWidth, height: .greatestFiniteMagnitude),
                options: [.usesLineFragmentOrigin, .usesFontLeading], attributes: attributes, context: nil).height)
        }
        let titleStyle = attributes(52, weight: .bold), venueStyle = attributes(38, weight: .semibold)
        let detailStyle = attributes(27, color: NativeAppearance.muted)
        let location = [value.location, value.servingLabel, value.bandLabel].filter { !$0.isEmpty }.joined(separator: " · ")
        let provenanceHeight = height(value.provenance, detailStyle)
        let locationHeight = location.isEmpty ? 0 : height(location, detailStyle) + 12
        let bodyHeight = height(value.drinkName, titleStyle) + height(value.venueName, venueStyle) + provenanceHeight + locationHeight
        let size = CGSize(width: width, height: 1000 + bodyHeight)
        let format = UIGraphicsImageRendererFormat(); format.scale = 1; format.opaque = true
        return UIGraphicsImageRenderer(size: size, format: format).image { context in
            UIColor(red: 255 / 255, green: 250 / 255, blue: 240 / 255, alpha: 1).setFill()
            context.fill(CGRect(origin: .zero, size: size))
            UIImage(named: "BrandMark")?.draw(in: CGRect(x: 58, y: 42, width: 80, height: 80))
            ("Dove Bevo" as NSString).draw(at: CGPoint(x: 154, y: 44), withAttributes: attributes(42, weight: .bold))
            ("Prezzi reali. Persone reali." as NSString).draw(at: CGPoint(x: 154, y: 96), withAttributes: attributes(24))
            let photoBox = CGRect(x: 64, y: 162, width: textWidth, height: 490)
            context.cgContext.saveGState()
            UIBezierPath(roundedRect: photoBox, cornerRadius: 28).addClip()
            if let photo = NativeDrinkArtwork.image(value.drink) {
                let scale = max(photoBox.width / photo.size.width, photoBox.height / photo.size.height)
                let target = CGRect(x: photoBox.midX - photo.size.width * scale / 2, y: photoBox.midY - photo.size.height * scale / 2,
                    width: photo.size.width * scale, height: photo.size.height * scale)
                photo.draw(in: target)
            }
            context.cgContext.restoreGState()
            let pill = CGRect(x: 620, y: 536, width: 368, height: 88)
            UIColor.white.setFill(); UIBezierPath(roundedRect: pill, cornerRadius: 44).fill()
            (value.amount as NSString).draw(in: pill.insetBy(dx: 22, dy: 10), withAttributes: attributes(48, weight: .bold))
            var y: CGFloat = 686
            func draw(_ text: String, style: [NSAttributedString.Key: Any]) {
                let h = height(text, style)
                (text as NSString).draw(in: CGRect(x: 64, y: y, width: textWidth, height: h),
                    withAttributes: style)
                y += h + 12
            }
            draw(value.drinkName, style: titleStyle)
            draw(value.venueName, style: venueStyle)
            if !location.isEmpty { draw(location, style: detailStyle) }
            draw(value.provenance, style: detailStyle)
            draw(value.confirmationLabel, style: detailStyle)
            if let tier = value.tierLabel {
                let color: UIColor = value.tier == "affare" ? UIColor(red: 0.14, green: 0.43, blue: 0.21, alpha: 1)
                    : value.tier == "salato" ? UIColor(red: 0.65, green: 0.17, blue: 0.22, alpha: 1) : NativeAppearance.ink
                draw(tier, style: attributes(30, weight: .semibold, color: color))
            }
            ("Immagine illustrativa del drink" as NSString).draw(at: CGPoint(x: 64, y: size.height - 48), withAttributes: attributes(20, color: NativeAppearance.muted))
        }
    }
}

final class PriceShareViewController: UIViewController {
    private let snapshot: PriceShareSnapshot
    private let publicURL: URL
    private(set) var poster: UIImage?
    private let shareButton = UIButton(type: .system)

    init(snapshot: PriceShareSnapshot, publicURL: URL) {
        self.snapshot = snapshot; self.publicURL = publicURL
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { return nil }

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "Condividi"
        view.backgroundColor = NativeAppearance.ink
        NativeAppearance.configure(navigationController)
        navigationItem.leftBarButtonItem = UIBarButtonItem(barButtonSystemItem: .close, target: self, action: #selector(close))
        let image = PricePosterRenderer.render(snapshot); poster = image
        let preview = UIImageView(image: image); preview.contentMode = .scaleAspectFit
        preview.isAccessibilityElement = true
        preview.accessibilityIdentifier = "share.poster"
        preview.accessibilityLabel = snapshot.accessibilityDescription
        let scroll = UIScrollView(); scroll.translatesAutoresizingMaskIntoConstraints = false
        preview.translatesAutoresizingMaskIntoConstraints = false; scroll.addSubview(preview); view.addSubview(scroll)
        shareButton.configuration = NativeAppearance.button(primary: true)
        shareButton.setTitle("Condividi immagine", for: .normal)
        shareButton.setImage(UIImage(systemName: "square.and.arrow.up"), for: .normal)
        shareButton.titleLabel?.numberOfLines = 0
        shareButton.titleLabel?.adjustsFontForContentSizeCategory = true
        shareButton.accessibilityIdentifier = "share.image"
        shareButton.translatesAutoresizingMaskIntoConstraints = false
        shareButton.addTarget(self, action: #selector(shareImage), for: .touchUpInside); view.addSubview(shareButton)
        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            scroll.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            scroll.bottomAnchor.constraint(equalTo: shareButton.topAnchor, constant: -16),
            preview.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: 20),
            preview.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -20),
            preview.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor, constant: 20),
            preview.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor, constant: -20),
            preview.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor, constant: -40),
            preview.heightAnchor.constraint(equalTo: preview.widthAnchor, multiplier: image.size.height / image.size.width),
            shareButton.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 20),
            shareButton.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -20),
            shareButton.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -16),
            shareButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 48)
        ])
    }

    @objc private func close() { dismiss(animated: true) }
    @objc private func shareImage() {
        guard presentedViewController == nil, let sheet = activityController() else { return }
        present(sheet, animated: true)
    }

    func activityController() -> UIActivityViewController? {
        guard let poster else { return nil }
        let sheet = UIActivityViewController(activityItems: [poster, publicURL], applicationActivities: nil)
        // Image sharing does not request access to the user's photo library.
        // Saving to Files and ordinary share extensions remain system actions.
        sheet.excludedActivityTypes = [.saveToCameraRoll]
        sheet.popoverPresentationController?.sourceView = shareButton
        sheet.popoverPresentationController?.sourceRect = shareButton.bounds
        return sheet
    }
}
