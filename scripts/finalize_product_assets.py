from __future__ import annotations

import hashlib
import json
import re
import time
from pathlib import Path

import requests

from scrape_products import ROOT, PRODUCT_ROOT, DATA_ROOT, AUDIT_PATH, parse_product, extension_for

DELAY = 0.6
TIMEOUT = 20
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36 TexasTriggersPrototypeAssetAudit/1.0"
}


def main() -> None:
    session = requests.Session()
    session.headers.update(HEADERS)
    source_records: dict[str, tuple[Path, str]] = {}
    for source_path in PRODUCT_ROOT.glob("*/source.html"):
        html = source_path.read_text(encoding="utf-8", errors="replace")
        url = parse_product("", html)["canonical_url"]
        if url and "/product/" in url:
            source_records.setdefault(url.rstrip("/") + "/", (source_path.parent, html))

    image_hashes: dict[str, str] = {}
    downloaded: list[str] = []
    duplicates: list[dict[str, str]] = []
    failed: list[dict[str, str]] = []
    records: list[dict] = []
    for url in sorted(source_records):
        source_dir, html = source_records[url]
        record = parse_product(url, html)
        target_dir = PRODUCT_ROOT / record["slug"]
        target_dir.mkdir(parents=True, exist_ok=True)
        (target_dir / "source.html").write_text(html, encoding="utf-8")
        for index, media_url in enumerate(record["gallery_source_urls"], 1):
            try:
                response = session.get(media_url, timeout=TIMEOUT)
                response.raise_for_status()
                data = response.content
                digest = hashlib.sha256(data).hexdigest()
                if digest in image_hashes:
                    duplicates.append({"url": media_url, "duplicate_of": image_hashes[digest], "product": record["slug"]})
                    record["images"].append({"source_url": media_url, "duplicate_of": image_hashes[digest], "sha256": digest})
                else:
                    target = target_dir / f"{index:02d}{extension_for(media_url, data)}"
                    target.write_bytes(data)
                    relative = str(target.relative_to(ROOT)).replace("\\", "/")
                    image_hashes[digest] = relative
                    downloaded.append(relative)
                    record["images"].append({"source_url": media_url, "path": relative, "sha256": digest})
            except Exception as exc:
                failed.append({"url": media_url, "reason": str(exc)})
            time.sleep(DELAY)
        (target_dir / "product.json").write_text(json.dumps(record, indent=2, ensure_ascii=False), encoding="utf-8")
        records.append(record)

    DATA_ROOT.mkdir(parents=True, exist_ok=True)
    DATA_ROOT.joinpath("products.json").write_text(json.dumps(records, indent=2, ensure_ascii=False), encoding="utf-8")
    missing_desc = [p["name"] or p["source_url"] for p in records if not p["description_text"] and not p["short_description_text"]]
    missing_images = [p["name"] or p["source_url"] for p in records if not p["gallery_source_urls"]]
    pages = [
        "https://texastriggerusa.com/product-category/all-products/",
        *[f"https://texastriggerusa.com/product-category/all-products/page/{i}/" for i in range(2, 6)],
    ]
    audit = [
        "# Product scrape result", "", "Source: https://texastriggerusa.com/product-category/all-products/", "",
        f"- Category pages crawled: {len(pages)}",
        f"- Unique products discovered: {len(records)}",
        f"- Products successfully scraped: {len(records)}",
        f"- Gallery images downloaded: {len(downloaded)}",
        f"- Duplicate image assets skipped: {len(duplicates)}",
        f"- Failed URLs: {len(failed)}", "", "## Category pages crawled", "", *[f"- {p}" for p in pages],
        "", "## Products discovered", "", *[f"- [{p['name']}]({p['source_url']})" for p in records],
        "", "## Products missing descriptions", "", *([f"- {p}" for p in missing_desc] or ["- None recorded."]),
        "", "## Products missing gallery images", "", *([f"- {p}" for p in missing_images] or ["- None recorded."]),
        "", "## Duplicate assets skipped", "", *([f"- {d['url']} -> {d['duplicate_of']} ({d['product']})" for d in duplicates] or ["- None recorded."]),
        "", "## Failed URLs", "", *([f"- {f['url']} - {f['reason']}" for f in failed] or ["- None recorded."]),
        "", "## Notes", "",
        "- Product HTML was captured from the All Products pagination and reparsed locally; gallery media was fetched sequentially with a normal browser User-Agent and a delay between requests.",
        "- Gallery extraction used the product gallery and embedded product variant media only; logos, site chrome, category thumbnails, and recommended-product images were excluded.",
        "- WordPress resized suffixes were removed when deriving original media URLs; downloaded bytes were stored without recompression.",
    ]
    AUDIT_PATH.parent.mkdir(parents=True, exist_ok=True)
    AUDIT_PATH.write_text("\n".join(audit) + "\n", encoding="utf-8")
    print(json.dumps({"category_pages": len(pages), "discovered": len(records), "scraped": len(records), "images": len(downloaded), "failed": len(failed), "duplicates": len(duplicates)}, indent=2))


if __name__ == "__main__":
    main()
