from __future__ import annotations

import hashlib
import json
import re
import time
from pathlib import Path
from urllib.parse import urljoin, urlparse, urlunparse

import requests
from bs4 import BeautifulSoup


BASE = "https://texastriggerusa.com"
CATEGORY = f"{BASE}/product-category/all-products/"
ROOT = Path(__file__).resolve().parents[1]
PRODUCT_ROOT = ROOT / "assets" / "products"
DATA_ROOT = ROOT / "data"
AUDIT_PATH = ROOT / "docs" / "PRODUCT_SCRAPE_RESULT.md"
DELAY = 0.8
TIMEOUT = 40
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36 TexasTriggersPrototypeAssetAudit/1.0"
}

session = requests.Session()
session.headers.update(HEADERS)
cache: dict[str, str] = {}
failed: list[dict[str, str]] = []
category_pages: list[str] = []
product_records: list[dict] = []
image_hashes: dict[str, str] = {}
downloaded_images: list[str] = []
duplicate_images: list[dict[str, str]] = []


def sleep_between() -> None:
    time.sleep(DELAY)


def fetch(url: str, binary: bool = False) -> bytes | str | None:
    if not binary and url in cache:
        return cache[url]
    for attempt in range(3):
        try:
            if attempt:
                time.sleep(2 * attempt)
            response = session.get(url, timeout=TIMEOUT)
            response.raise_for_status()
            if binary:
                return response.content
            text = response.text
            cache[url] = text
            return text
        except Exception as exc:
            if attempt == 2:
                failed.append({"url": url, "reason": str(exc)})
    return None


def absolute(url: str | None, base: str) -> str | None:
    if not url:
        return None
    return urljoin(base, url.strip())


def clean_text(fragment: str | None) -> str:
    if not fragment:
        return ""
    soup = BeautifulSoup(fragment, "html.parser")
    return re.sub(r"\s+", " ", soup.get_text(" ", strip=True)).strip()


def html_fragment(node) -> str:
    return node.decode_contents().strip() if node else ""


def normalize_image_url(url: str) -> str:
    parsed = urlparse(url)
    path = re.sub(r"-\d+x\d+(?=\.[a-zA-Z0-9]+$)", "", parsed.path)
    path = re.sub(r"-scaled(?=\.[a-zA-Z0-9]+$)", "", path)
    return urlunparse((parsed.scheme, parsed.netloc, path, "", "", ""))


def slugify(value: str) -> str:
    value = value.lower().replace("&", " and ")
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value or "product"


def first_text(soup: BeautifulSoup, selectors: list[str]) -> str:
    for selector in selectors:
        node = soup.select_one(selector)
        if node:
            text = clean_text(str(node))
            if text:
                return text
    return ""


def category_urls(html: str, page_url: str) -> list[str]:
    soup = BeautifulSoup(html, "html.parser")
    found = {page_url}
    for link in soup.select("a.page-numbers, nav.woocommerce-pagination a, a.next, a[rel='next']"):
        href = absolute(link.get("href"), page_url)
        if href and "/product-category/all-products" in href:
            found.add(href.split("#")[0])
    return sorted(found, key=lambda x: (0 if x.rstrip("/") == CATEGORY.rstrip("/") else 1, x))


def product_urls(html: str, page_url: str) -> list[str]:
    soup = BeautifulSoup(html, "html.parser")
    found: set[str] = set()
    for link in soup.select("li.product a.woocommerce-LoopProduct-link, li.product a[href*='/product/'], a[href*='/product/']"):
        href = absolute(link.get("href"), page_url)
        if href and "/product/" in href and "/product-category/" not in href:
            found.add(href.split("#")[0].rstrip("/") + "/")
    return sorted(found)


def gallery_urls(soup: BeautifulSoup, page_url: str) -> list[str]:
    candidates: list[str] = []
    for node in soup.select(".woocommerce-product-gallery__image a, .woocommerce-product-gallery figure a, .jet-woo-product-gallery__image-link"):
        candidates.extend([node.get("data-large_image"), node.get("href")])
    for node in soup.select(".woocommerce-product-gallery img, .jet-woo-product-gallery__image-link img"):
        candidates.extend([node.get("data-large_image"), node.get("data-src"), node.get("src")])
    result: list[str] = []
    seen: set[str] = set()
    for candidate in candidates:
        url = absolute(candidate, page_url)
        if not url or not re.search(r"\.(?:jpe?g|png|webp|gif)(?:\?.*)?$", url, re.I):
            continue
        normalized = normalize_image_url(url)
        if normalized not in seen:
            seen.add(normalized)
            result.append(normalized)
    return result


def embedded_product_data(soup: BeautifulSoup) -> dict:
    for script in soup.find_all("script"):
        text = script.string or script.get_text()
        marker = "omnisend_product ="
        if marker not in text:
            continue
        payload = text.split(marker, 1)[1].strip()
        if payload.endswith(";"):
            payload = payload[:-1]
        try:
            value = json.loads(payload)
            if isinstance(value, dict):
                return value
        except json.JSONDecodeError:
            continue
    return {}


def parse_product(url: str, html: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")
    embedded = embedded_product_data(soup)
    title = first_text(soup, ["h1.product_title", "h1.entry-title", "h1"]) or embedded.get("title", "")
    short_node = soup.select_one(".woocommerce-product-details__short-description")
    desc_node = soup.select_one(".woocommerce-Tabs-panel--description, #tab-description, .product-description")
    if not desc_node:
        desc_node = soup.select_one(".woocommerce-product-details__short-description")
    embedded_description = embedded.get("description", "")
    regular_price = first_text(soup, [".price del .amount", ".price del", ".price .amount"])
    sale_price = first_text(soup, [".price ins .amount", ".price ins"])
    if sale_price and not regular_price:
        regular_price = sale_price
        sale_price = ""
    if not sale_price:
        amount_nodes = soup.select(".price .amount")
        if len(amount_nodes) > 1:
            regular_price = clean_text(str(amount_nodes[0]))
            sale_price = clean_text(str(amount_nodes[-1]))
    categories = [clean_text(str(x)) for x in soup.select(".posted_in a, .product_meta a[href*='/product-category/'], nav.woocommerce-breadcrumb a[href*='/product-category/']") if clean_text(str(x))]
    if not categories:
        product_root = soup.select_one("[id^='product-']")
        category_slugs = [c.removeprefix("product_cat-") for c in (product_root.get("class", []) if product_root else []) if c.startswith("product_cat-")]
        categories = category_slugs
    sku = first_text(soup, [".sku"])
    attributes: dict[str, str] = {}
    for row in soup.select(".woocommerce-product-attributes-item"):
        key = first_text(row, [".woocommerce-product-attributes-item__label"])
        value = first_text(row, [".woocommerce-product-attributes-item__value"])
        if key:
            attributes[key] = value
    variations: dict[str, list[str]] = {}
    for select in soup.select("form.variations select, .variations select"):
        name = select.get("name") or select.get("id") or "option"
        values = [clean_text(str(o)) for o in select.select("option") if o.get("value") and clean_text(str(o))]
        if values:
            variations[name] = values
    description_html = html_fragment(desc_node) or embedded_description
    full_text = clean_text(description_html)
    compatibility_text = ""
    compatibility_nodes = soup.select(".compatibility, [class*='compatib'], [id*='compatib']")
    if compatibility_nodes:
        compatibility_text = "\n\n".join(clean_text(str(n)) for n in compatibility_nodes if clean_text(str(n)))
    if not compatibility_text:
        lines = [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n+", full_text) if s.strip()]
        matching = [s for s in lines if re.search(r"compatib|fits? |fitment|model|platform|generation", s, re.I)]
        compatibility_text = " ".join(matching)
    return {
        "name": title,
        "slug": slugify(title or urlparse(url).path.strip("/").split("/")[-1]),
        "source_url": url,
        "canonical_url": (soup.select_one("link[rel='canonical']") or {}).get("href", url),
        "regular_price": regular_price,
        "sale_price": sale_price,
        "short_description_text": clean_text(html_fragment(short_node)),
        "short_description_html": html_fragment(short_node),
        "description_text": full_text,
        "description_html": description_html,
        "categories": list(dict.fromkeys(categories)),
        "sku": sku,
        "attributes": attributes,
        "compatibility_information": compatibility_text,
        "variations": variations,
        "gallery_source_urls": list(dict.fromkeys(gallery_urls(soup, url) + [normalize_image_url(str(v.get("imageUrl"))) for v in embedded.get("variants", {}).values() if isinstance(v, dict) and v.get("imageUrl")])),
        "images": [],
    }


def extension_for(url: str, data: bytes) -> str:
    ext = Path(urlparse(url).path).suffix.lower()
    if ext in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
        return ext
    if data.startswith(b"\x89PNG"):
        return ".png"
    if data.startswith(b"\xff\xd8"):
        return ".jpg"
    return ".bin"


def download_images(record: dict, source_html: str) -> None:
    product_dir = PRODUCT_ROOT / record["slug"]
    product_dir.mkdir(parents=True, exist_ok=True)
    (product_dir / "source.html").write_text(source_html, encoding="utf-8")
    for index, url in enumerate(record["gallery_source_urls"], start=1):
        data = fetch(url, binary=True)
        sleep_between()
        if not data:
            continue
        digest = hashlib.sha256(data).hexdigest()
        if digest in image_hashes:
            duplicate_images.append({"url": url, "duplicate_of": image_hashes[digest], "product": record["slug"]})
            record["images"].append({"source_url": url, "duplicate_of": image_hashes[digest], "sha256": digest})
            continue
        filename = f"{index:02d}{extension_for(url, data)}"
        target = product_dir / filename
        target.write_bytes(data)
        image_hashes[digest] = str(target.relative_to(ROOT)).replace("\\", "/")
        downloaded_images.append(str(target.relative_to(ROOT)).replace("\\", "/"))
        record["images"].append({"source_url": url, "path": str(target.relative_to(ROOT)).replace("\\", "/"), "sha256": digest})


def main() -> None:
    PRODUCT_ROOT.mkdir(parents=True, exist_ok=True)
    DATA_ROOT.mkdir(parents=True, exist_ok=True)
    AUDIT_PATH.parent.mkdir(parents=True, exist_ok=True)
    first = fetch(CATEGORY)
    if not first:
        raise SystemExit("Could not fetch the All Products category")
    pages = category_urls(first, CATEGORY)
    category_pages.extend(pages)
    # Follow discovered pagination links and repeat discovery once per page.
    cursor = 0
    while cursor < len(category_pages):
        page = category_pages[cursor]
        if page != CATEGORY:
            html = fetch(page)
            if html:
                for discovered in category_urls(html, page):
                    if discovered not in category_pages:
                        category_pages.append(discovered)
        cursor += 1
    urls: list[str] = []
    for page in category_pages:
        html = fetch(page)
        sleep_between()
        if not html:
            continue
        for url in product_urls(html, page):
            if url not in urls:
                urls.append(url)
    for url in urls:
        html = fetch(url)
        sleep_between()
        if not html:
            continue
        record = parse_product(url, html)
        download_images(record, html)
        (PRODUCT_ROOT / record["slug"] / "product.json").write_text(json.dumps(record, indent=2, ensure_ascii=False), encoding="utf-8")
        product_records.append(record)
    (DATA_ROOT / "products.json").write_text(json.dumps(product_records, indent=2, ensure_ascii=False), encoding="utf-8")
    missing_desc = [p["name"] for p in product_records if not p["description_text"] and not p["short_description_text"]]
    missing_images = [p["name"] for p in product_records if not p["gallery_source_urls"]]
    audit = [
        "# Product scrape result",
        "",
        f"Source: {CATEGORY}",
        "",
        f"- Category pages crawled: {len(category_pages)}",
        f"- Unique products discovered: {len(urls)}",
        f"- Products successfully scraped: {len(product_records)}",
        f"- Gallery images downloaded: {len(downloaded_images)}",
        f"- Duplicate image assets skipped: {len(duplicate_images)}",
        f"- Failed URLs: {len(failed)}",
        "",
        "## Category pages crawled",
        "",
        *[f"- {url}" for url in category_pages],
        "",
        "## Products discovered",
        "",
        *[f"- [{p['name']}]({p['source_url']})" for p in product_records],
        "",
        "## Products missing descriptions",
        "",
        *( [f"- {name}" for name in missing_desc] or ["- None recorded."] ),
        "",
        "## Products missing gallery images",
        "",
        *( [f"- {name}" for name in missing_images] or ["- None recorded."] ),
        "",
        "## Duplicate assets skipped",
        "",
        *( [f"- {item['url']} → {item['duplicate_of']} ({item['product']})" for item in duplicate_images] or ["- None recorded."] ),
        "",
        "## Failed URLs",
        "",
        *( [f"- {item['url']} — {item['reason']}" for item in failed] or ["- None recorded."] ),
        "",
        "## Notes",
        "",
        "- Requests used a normal browser User-Agent, sequential product/page fetches, a delay between requests, and up to three attempts for transient failures.",
        "- Gallery extraction was limited to WooCommerce product-gallery elements; recommended products, site chrome, logos, and category thumbnails were not intentionally collected.",
        "- WordPress resized suffixes were removed when deriving original media URLs; downloaded bytes were stored without recompression.",
    ]
    AUDIT_PATH.write_text("\n".join(audit) + "\n", encoding="utf-8")
    print(json.dumps({"category_pages": len(category_pages), "discovered": len(urls), "scraped": len(product_records), "images": len(downloaded_images), "failed": len(failed), "duplicates": len(duplicate_images)}, indent=2))


if __name__ == "__main__":
    main()
