# Dove bevo store graphics

- `google-play-icon-512.png`: 512×512, sRGB 32-bit RGBA PNG. Every alpha value is 255, so there are no transparent pixels. It is a direct Lanczos resize of the existing approved iOS `AppIcon.png`, with no new border, shadow, crop or artwork.
- `google-play-feature-1024x500.png`: 1024×500, sRGB 24-bit RGB PNG with no alpha channel. Only the original logo, the name “Dove bevo” and “Bar e prezzi vicino a te” appear on the existing orange background.
- `google-play-feature.svg`: editable vector layout and text, with the exact original icon and existing unmodified Bricolage Grotesque font embedded. It needs no remote image/font requests. Use an SVG editor or a browser that supports embedded WOFF2 fonts when editing/exporting it.
- `asset-checks.json`: source/output hashes, image modes, dimensions and foreground/text bounds. Important content stays at least 64 px from each feature-graphic edge.

These are listing graphics, not app screenshots. Real app screenshots must come from the verified native apps; these graphics contain no fabricated app UI, maps, venues, ratings or price claims.

The Dove Bevo logo is existing project branding reused under the owner's authorization for the same business and app. This does not grant a separate trademark licence. Source: `mobile-apps/ios/App/Assets.xcassets/AppIcon.appiconset/AppIcon.png` at commit `722c070a169be6a7b070abf410553d98564cc234`. The orange `#FF5A1F`, dark `#1B1611` and Bricolage typography follow the existing website palette/type in `src/app/styles/tokens.css`.

Bricolage Grotesque is copyright 2022 The Bricolage Grotesque Project Authors and licensed under SIL OFL 1.1. The existing font is unmodified; its licence accompanies the embedded font in `OFL-Bricolage-Grotesque.txt`. [Upstream font licence](https://github.com/google/fonts/blob/main/ofl/bricolagegrotesque/OFL.txt).

To reproduce the original composition, run from the repository root with Python and Pillow 12.3.0:

```text
python -B mobile-apps/store-assets/build.py
```

The script is offline and reads only the existing icon and brand font. It writes only this folder. Regeneration restores the source layout in `build.py`; direct SVG edits can instead be exported from an SVG editor.

Google's current requirements: [Play listing preview assets](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en) and [Play icon specification](https://developer.android.com/distribute/google-play/resources/icon-design-specifications). The icon's alpha channel is required by the 32-bit format; it contains no transparency. No rounded mask or store-added shadow is pre-applied.
