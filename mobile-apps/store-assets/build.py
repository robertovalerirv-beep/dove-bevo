"""Reproduce the Play listing assets from existing Dove Bevo artwork. No network calls."""
from base64 import b64encode
import hashlib
import io
import json
from pathlib import Path
import xml.etree.ElementTree as ET

import PIL
from PIL import Image, ImageChops, ImageDraw, ImageFont, PngImagePlugin


ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
ICON = ROOT / "mobile-apps/ios/App/Assets.xcassets/AppIcon.appiconset/AppIcon.png"
FONT = ROOT / "public/fonts/bricolage-grotesque-latin-wght-normal.woff2"
ORANGE = "#FF5A1F"
INK = "#1B1611"
TITLE = "Dove bevo"
TAGLINE = "Bar e prezzi vicino a te"
BASE = "722c070a169be6a7b070abf410553d98564cc234"
ICON_SHA256 = "207de06f188d2f29c09bf7fde414207a10baebc0c585de08bb77cb29c6389e9d"
FONT_SHA256 = "a97804dc9fbe5fc972a08018c5eda4dab7ef2346f64c57e61419d05e6de4ea1c"
SCALE = 2


def sha(data):
    return hashlib.sha256(data).hexdigest()


def font(size, weight):
    face = ImageFont.truetype(str(FONT), size * SCALE)
    face.set_variation_by_axes([weight])
    return face


def save_png(image, path):
    meta = PngImagePlugin.PngInfo()
    meta.add(b"sRGB", b"\x00")
    image.save(path, format="PNG", pnginfo=meta, optimize=False, compress_level=9)


def main():
    source_bytes = ICON.read_bytes()
    font_bytes = FONT.read_bytes()
    assert sha(source_bytes) == ICON_SHA256, "Approved source icon changed; review the brand binding before regenerating."
    assert sha(font_bytes) == FONT_SHA256, "Existing brand font changed; review its source and licence before regenerating."
    with Image.open(io.BytesIO(source_bytes)) as image:
        assert image.size == (1024, 1024) and image.mode == "RGB"
        source = image.copy()
    assert source.getpixel((0, 0)) == (255, 90, 31)

    # Google Play requires a 32-bit icon. Alpha is 255 for every pixel: no transparency.
    play_icon = source.resize((512, 512), Image.Resampling.LANCZOS).convert("RGBA")
    save_png(play_icon, OUT / "google-play-icon-512.png")

    canvas = Image.new("RGB", (1024 * SCALE, 500 * SCALE), ORANGE)
    logo = source.resize((312 * SCALE, 312 * SCALE), Image.Resampling.LANCZOS)
    canvas.paste(logo, (64 * SCALE, 94 * SCALE))
    draw = ImageDraw.Draw(canvas)
    placements = [(TITLE, 392, 228, 84, 800), (TAGLINE, 396, 291, 32, 500)]
    text_bounds = []
    for text, x, baseline, size, weight in placements:
        face = font(size, weight)
        position = (x * SCALE, baseline * SCALE)
        text_bounds.append(tuple(value / SCALE for value in draw.textbbox(position, text, font=face, anchor="ls")))
        draw.text(position, text, font=face, fill=INK, anchor="ls", stroke_width=0)
    feature = canvas.resize((1024, 500), Image.Resampling.LANCZOS)
    save_png(feature, OUT / "google-play-feature-1024x500.png")

    # Both the exact original image and existing unmodified brand font are embedded.
    # Text remains editable; the SVG has no scripts, external fonts or remote images.
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500" role="img" aria-labelledby="title description">
  <title id="title">Dove bevo</title>
  <desc id="description">Bar e prezzi vicino a te. Grafica promozionale con il logo originale Dove bevo.</desc>
  <metadata>Existing Dove Bevo artwork reused for its own mobile app. Bricolage Grotesque copyright 2022 The Bricolage Grotesque Project Authors; SIL Open Font License 1.1, see OFL-Bricolage-Grotesque.txt. Source artwork SHA-256: {sha(source_bytes)}. Source font SHA-256: {sha(font_bytes)}.</metadata>
  <defs><style>
    @font-face {{ font-family: "Bricolage Grotesque"; font-style: normal; font-weight: 200 800; src: url("data:font/woff2;base64,{b64encode(font_bytes).decode('ascii')}") format("woff2"); }}
    text {{ font-family: "Bricolage Grotesque", sans-serif; fill: {INK}; }}
  </style></defs>
  <rect width="1024" height="500" fill="{ORANGE}"/>
  <image x="64" y="94" width="312" height="312" href="data:image/png;base64,{b64encode(source_bytes).decode('ascii')}"/>
  <text x="392" y="228" font-size="84" font-weight="800">Dove bevo</text>
  <text x="396" y="291" font-size="32" font-weight="500">Bar e prezzi vicino a te</text>
</svg>
'''
    (OUT / "google-play-feature.svg").write_text(svg, encoding="utf-8", newline="\n")
    ET.fromstring(svg)

    background = Image.new("RGB", feature.size, ORANGE)
    foreground = ImageChops.difference(feature, background).getbbox()
    assert foreground and foreground[0] >= 64 and foreground[1] >= 64
    assert foreground[2] <= 960 and foreground[3] <= 436
    assert all(box[0] >= 64 and box[1] >= 64 and box[2] <= 960 and box[3] <= 436 for box in text_bounds)
    assert play_icon.getchannel("A").getextrema() == (255, 255)
    assert feature.mode == "RGB" and play_icon.size == (512, 512) and feature.size == (1024, 500)
    assert (OUT / "google-play-icon-512.png").stat().st_size <= 1024 * 1024
    evidence = {
        "source_commit": BASE,
        "source_icon": str(ICON.relative_to(ROOT)).replace("\\", "/"),
        "source_icon_sha256": sha(source_bytes),
        "source_font": str(FONT.relative_to(ROOT)).replace("\\", "/"),
        "source_font_sha256": sha(font_bytes),
        "pillow_version": PIL.__version__,
        "feature_important_content_bounds": foreground,
        "minimum_safe_margin_px": 64,
        "text_bounds": text_bounds,
        "files": {},
    }
    for name in ("google-play-icon-512.png", "google-play-feature-1024x500.png", "google-play-feature.svg"):
        path = OUT / name
        entry = {"bytes": path.stat().st_size, "sha256": sha(path.read_bytes())}
        if path.suffix == ".png":
            with Image.open(path) as exported:
                entry.update({"size": exported.size, "mode": exported.mode})
        evidence["files"][name] = entry
    (OUT / "asset-checks.json").write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8", newline="\n")
    print("PASS: required dimensions, opaque pixels, PNG modes, 64px safe margins, existing logo/font binding.")


if __name__ == "__main__":
    main()
