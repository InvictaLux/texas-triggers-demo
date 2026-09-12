from __future__ import annotations

import json
import re
from html import unescape
from pathlib import Path

from bs4 import BeautifulSoup, NavigableString, Tag


ROOT = Path(__file__).resolve().parents[1]
PRODUCTS_PATH = ROOT / "data" / "products.json"
PRESENTATION_PATH = ROOT / "data" / "presentation" / "products.json"

CATEGORY_LABELS = {
    "frt": "FRTs",
    "magazines": "Magazines",
    "accessories": "Accessories",
    "knives": "Knives",
    "merch": "Merch",
}
CATEGORY_PRIORITY = ("merch", "knives", "frt", "magazines", "accessories")
GROUPS = (
    "overview",
    "compatibility",
    "included",
    "required_parts",
    "installation",
    "shipping",
    "returns",
)


def clean(value: object) -> str:
    text = unescape(str(value or ""))
    return re.sub(r"\s+", " ", text).strip()


def group_for_heading(heading: str) -> str:
    value = clean(heading).lower()
    if re.search(r"shipping|cannot ship|restricted destination", value):
        return "shipping"
    if re.search(r"what.?s included|included in|kit includes|package includes", value):
        return "included"
    if re.search(r"sold separately|required parts?|additional parts?|not included|requires", value):
        return "required_parts"
    if re.search(r"install|gunsmith|support", value):
        return "installation"
    if re.search(r"warranty|returns?|cancellations?|refund|exchange", value):
        return "returns"
    if re.search(r"compatib|fitment|supported models?|calibers?|ammunition|ammo|built for the .+ platform", value):
        return "compatibility"
    return "overview"


def extract_sections(container: Tag, product_name: str = "") -> dict[str, list[dict[str, object]]]:
    grouped: dict[str, list[dict[str, object]]] = {name: [] for name in GROUPS}
    heading = ""
    blocks: list[dict[str, object]] = []
    inline: list[str] = []

    def flush_inline() -> None:
        nonlocal inline
        text = clean(" ".join(inline))
        if text:
            blocks.append({"type": "paragraph", "text": text})
        inline = []

    def flush_section() -> None:
        nonlocal blocks
        flush_inline()
        if not blocks:
            return
        grouped[group_for_heading(heading)].append({"heading": clean(heading), "blocks": blocks})
        blocks = []

    def start_section(value: str) -> None:
        nonlocal heading
        text = clean(value)
        if not text or text.casefold() == clean(product_name).casefold():
            return
        flush_section()
        heading = text.rstrip(":")

    def process_children(parent: Tag) -> None:
        for child in parent.children:
            if isinstance(child, NavigableString):
                if clean(child):
                    inline.append(str(child))
                continue
            if not isinstance(child, Tag):
                continue
            name = child.name.lower()
            if name in {"h1", "h2", "h3", "h4", "h5", "h6"}:
                flush_inline()
                start_section(child.get_text(" ", strip=True))
            elif name in {"strong", "b"}:
                flush_inline()
                start_section(child.get_text(" ", strip=True))
            elif name in {"ul", "ol"}:
                flush_inline()
                is_layout_wrapper = bool(child.find(["h1", "h2", "h3", "h4", "h5", "h6", "p", "ul", "ol"]))
                if is_layout_wrapper:
                    for item in child.find_all("li", recursive=False):
                        process_children(item)
                else:
                    items = [clean(item.get_text(" ", strip=True)) for item in child.find_all("li", recursive=False)]
                    items = [item for item in items if item]
                    if items:
                        blocks.append({"type": "list", "items": items})
            elif name == "p":
                flush_inline()
                first_strong = child.find(["strong", "b"], recursive=False)
                full_text = clean(child.get_text(" ", strip=True))
                if first_strong:
                    strong_text = clean(first_strong.get_text(" ", strip=True))
                    if full_text == strong_text or full_text.startswith(f"{strong_text}:"):
                        start_section(strong_text)
                        remainder = clean(full_text[len(strong_text) :].lstrip(": -–—"))
                        if remainder:
                            blocks.append({"type": "paragraph", "text": remainder})
                        continue
                if full_text:
                    blocks.append({"type": "paragraph", "text": full_text})
            elif name == "br":
                inline.append(" ")
            elif name in {"a", "span", "em", "i", "small"}:
                inline.append(child.get_text(" ", strip=True))
            elif child.find(["h1", "h2", "h3", "h4", "h5", "h6", "p", "ul", "ol"], recursive=False):
                flush_inline()
                process_children(child)
            else:
                flush_inline()
                text = clean(child.get_text(" ", strip=True))
                if text:
                    blocks.append({"type": "paragraph", "text": text})

    process_children(container)

    flush_section()
    return {name: sections for name, sections in grouped.items() if sections}


def text_length(sections: dict[str, list[dict[str, object]]]) -> int:
    total = 0
    for group in sections.values():
        for section in group:
            total += len(str(section.get("heading", "")))
            for block in section.get("blocks", []):
                total += len(str(block.get("text", "")))
                total += sum(len(str(item)) for item in block.get("items", []))
    return total


def product_category(product_root: Tag, fallback: list[str]) -> str:
    classes = product_root.get("class", [])
    source_categories = {value.removeprefix("product_cat-") for value in classes if value.startswith("product_cat-")}
    for key in CATEGORY_PRIORITY:
        if key in source_categories:
            return CATEGORY_LABELS[key]
    return clean((fallback or ["All Products"])[0])


def main() -> None:
    products = json.loads(PRODUCTS_PATH.read_text(encoding="utf-8"))
    previous = json.loads(PRESENTATION_PATH.read_text(encoding="utf-8")) if PRESENTATION_PATH.exists() else {}
    previous_products = previous.get("products", {})
    output_products: dict[str, dict[str, object]] = {}
    missing_sources: list[str] = []
    policy_sections: dict[str, list[dict[str, object]]] = {}

    for product in products:
        slug = product["slug"]
        source_relative = f"assets/products/{slug}/source.html"
        source_path = ROOT / source_relative
        if not source_path.exists():
            missing_sources.append(slug)
            continue

        soup = BeautifulSoup(source_path.read_text(encoding="utf-8", errors="replace"), "html.parser")
        product_root = soup.select_one("div.product")
        if not product_root:
            missing_sources.append(slug)
            continue

        widgets = product_root.select(".elementor-widget-text-editor .elementor-widget-container")
        product_widget = next(
            (
                widget
                for widget in widgets
                if len(clean(widget.get_text(" ", strip=True))) > 100
                and "Return, Exchange & Cancellation Policy" not in clean(widget.get_text(" ", strip=True))
            ),
            None,
        )
        sections = extract_sections(product_widget, product["name"]) if product_widget else {}
        if not sections and clean(product.get("description_text")):
            sections = {
                "overview": [
                    {
                        "heading": "",
                        "blocks": [{"type": "paragraph", "text": clean(product["description_text"])}],
                    }
                ]
            }

        if not policy_sections:
            policy_widget = next(
                (
                    widget
                    for widget in widgets
                    if "Return, Exchange & Cancellation Policy" in clean(widget.get_text(" ", strip=True))
                ),
                None,
            )
            if policy_widget:
                policy_sections = extract_sections(policy_widget)

        prior = previous_products.get(slug, {})
        stock = product_root.select_one("p.stock")
        item: dict[str, object] = {
            "category": product_category(product_root, product.get("categories", [])),
            "availability": clean(stock.get_text(" ", strip=True)) if stock else "",
            "source_sections": sections,
            "source": source_relative,
            "source_audit": {
                "source_html_found": True,
                "raw_description_characters": len(clean(product.get("description_text"))),
                "presented_source_characters": text_length(sections),
                "presented_section_count": sum(len(group) for group in sections.values()),
            },
        }
        for key in ("primary_image", "fitment", "requirements", "installation_platform"):
            if prior.get(key):
                item[key] = prior[key]
        output_products[slug] = item

    result = {
        "provenance": {
            "raw_catalog": "data/products.json",
            "source_html_pattern": "assets/products/{slug}/source.html",
            "product_count": len(products),
            "products_with_source_html": len(output_products),
            "missing_source_html": missing_sources,
            "note": "Source-backed presentation structure. Product text is extracted from each saved product page; raw catalog data remains unchanged.",
        },
        "policies": {"return_policy": policy_sections},
        "products": output_products,
    }
    PRESENTATION_PATH.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    print(
        json.dumps(
            {
                "products": len(products),
                "presented": len(output_products),
                "missing_sources": missing_sources,
                "with_shipping_restrictions": sum(
                    "shipping" in item.get("source_sections", {}) for item in output_products.values()
                ),
                "with_knives_category": sum(item.get("category") == "Knives" for item in output_products.values()),
                "with_merch_category": sum(item.get("category") == "Merch" for item in output_products.values()),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
