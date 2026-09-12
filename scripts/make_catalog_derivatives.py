from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter, ImageOps


ROOT = Path(__file__).resolve().parents[1]
PRODUCTS_PATH = ROOT / "data" / "products.json"
PRESENTATION_PATH = ROOT / "data" / "presentation" / "products.json"
MANIFEST_PATH = ROOT / "data" / "presentation" / "catalog-images.json"
OUTPUT_DIR = ROOT / "assets" / "presentation" / "catalog"
CANVAS = (1600, 1200)
SAFE_AREA = (1440, 1020)
FORCE_NEUTRAL_CROP = {
    "canik-frt-forced-reset-trigger",
    "tx22-frt-buy-one-get-one-free",
}


def asset_path(image: object) -> str:
    if isinstance(image, str):
        return image
    if isinstance(image, dict):
        return str(image.get("path") or image.get("duplicate_of") or "")
    return ""


def content_crop(image: Image.Image, force_neutral: bool = False) -> Image.Image:
    """Crop neutral source whitespace without altering the photographed subject."""
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A")
    if alpha.getextrema()[0] < 250:
        box = alpha.point(lambda value: 255 if value > 16 else 0).getbbox()
    else:
        rgb = rgba.convert("RGB")
        inset_x = min(4, rgb.width - 1)
        inset_y = min(4, rgb.height - 1)
        corners = [
            rgb.getpixel((inset_x, inset_y)),
            rgb.getpixel((rgb.width - 1 - inset_x, inset_y)),
            rgb.getpixel((inset_x, rgb.height - 1 - inset_y)),
            rgb.getpixel((rgb.width - 1 - inset_x, rgb.height - 1 - inset_y)),
        ]
        if not force_neutral and any(max(values) - min(values) > 34 for values in zip(*corners)):
            return rgba
        background_color = tuple(round(sum(values) / len(values)) for values in zip(*corners))
        background = Image.new("RGB", rgb.size, background_color)
        difference = ImageChops.difference(rgb, background).convert("L").filter(ImageFilter.GaussianBlur(2.2))
        mask = difference.point(lambda value: 255 if value > 28 else 0)
        box = mask.getbbox()
    if not box:
        return rgba
    left, top, right, bottom = box
    margin = max(12, round(max(right - left, bottom - top) * 0.06))
    expanded = (max(0, left - margin), max(0, top - margin), min(rgba.width, right + margin), min(rgba.height, bottom + margin))
    return rgba.crop(expanded)


def make_derivative(source: Path, target: Path, force_neutral: bool = False) -> None:
    with Image.open(source) as opened:
        cropped = content_crop(ImageOps.exif_transpose(opened), force_neutral)
        scale = min(SAFE_AREA[0] / cropped.width, SAFE_AREA[1] / cropped.height)
        resized = (max(1, round(cropped.width * scale)), max(1, round(cropped.height * scale)))
        cropped = cropped.resize(resized, Image.Resampling.LANCZOS)
        canvas = Image.new("RGB", CANVAS, "#ffffff")
        if cropped.mode == "RGBA":
            offset = ((CANVAS[0] - cropped.width) // 2, (CANVAS[1] - cropped.height) // 2)
            canvas.paste(cropped.convert("RGB"), offset, cropped.getchannel("A"))
        else:
            offset = ((CANVAS[0] - cropped.width) // 2, (CANVAS[1] - cropped.height) // 2)
            canvas.paste(cropped.convert("RGB"), offset)
        target.parent.mkdir(parents=True, exist_ok=True)
        canvas.save(target, "WEBP", quality=90, method=0)


def main() -> None:
    products = json.loads(PRODUCTS_PATH.read_text(encoding="utf-8"))
    presentation = json.loads(PRESENTATION_PATH.read_text(encoding="utf-8"))
    overrides = presentation.get("products", {})
    manifest: dict[str, str] = {}
    failures: list[dict[str, str]] = []
    start = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    end = int(sys.argv[2]) if len(sys.argv) > 2 else len(products)
    for index, product in enumerate(products):
        slug = product["slug"]
        preferred = overrides.get(slug, {}).get("primary_image")
        source_relative = preferred or next((asset_path(item) for item in product.get("images", []) if asset_path(item)), "")
        if not source_relative:
            failures.append({"slug": slug, "reason": "no local image"})
            continue
        target_relative = f"assets/presentation/catalog/{slug}.webp"
        try:
            target = ROOT / target_relative
            if start <= index < end:
                make_derivative(ROOT / source_relative, target, slug in FORCE_NEUTRAL_CROP)
            manifest[slug] = target_relative
        except Exception as error:
            failures.append({"slug": slug, "reason": str(error), "source": source_relative})
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(json.dumps({"products": manifest, "failures": failures}, indent=2), encoding="utf-8")
    print(json.dumps({"generated": len(manifest), "failed": len(failures), "failures": failures}, indent=2))


if __name__ == "__main__":
    main()
