#!/usr/bin/env python3
"""
PDF converter using PyMuPDF (fitz) + pdfplumber.
- pdfplumber: table detection with row-grouping for border-less tables
- fitz: formatted text (h1/h2/h3/p, bold, italic) + image extraction
Tables take priority: text spans inside detected table regions are suppressed.

Usage: python3 pdf-converter.py <path-to-pdf>

Output JSON shape:
{
  "isSupported": bool,
  "textRatio": int,
  "imageCount": int,
  "pageCount": int,
  "pages": [
    {
      "pageNum": int,
      "elements": [
        { "type": "html",  "y": float, "content": "<h2>...</h2>" },
        { "type": "image", "y": float, "data": "data:image/...;base64,...", "width": int, "height": int }
      ]
    }
  ]
}
"""

import sys
import json
import base64
import shutil
import fitz          # PyMuPDF
import pdfplumber
from collections import Counter

MAX_IMAGES = 50

# PyMuPDF span flag bits
FLAG_ITALIC = 1 << 1
FLAG_BOLD   = 1 << 4

# Maximum vertical gap (in PDF points) between consecutive 1-row tables
# with the same column count to be merged into one logical table.
TABLE_ROW_GAP = 55


def escape_html(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def apply_inline_formatting(text: str, flags: int) -> str:
    is_bold   = bool(flags & FLAG_BOLD)
    is_italic = bool(flags & FLAG_ITALIC)
    if is_bold and is_italic:
        return f"<strong><em>{text}</em></strong>"
    if is_bold:
        return f"<strong>{text}</strong>"
    if is_italic:
        return f"<em>{text}</em>"
    return text


def body_font_size(blocks: list) -> float:
    sizes = []
    for block in blocks:
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                if span.get("text", "").strip():
                    sizes.append(round(span.get("size", 12), 1))
    return Counter(sizes).most_common(1)[0][0] if sizes else 12.0


def heading_tag(max_size: float, base_size: float) -> str:
    if base_size <= 0:
        return "p"
    ratio = max_size / base_size
    if ratio >= 1.7:
        return "h1"
    if ratio >= 1.35:
        return "h2"
    if ratio >= 1.15:
        return "h3"
    return "p"


def block_to_html(block: dict, base_size: float) -> str | None:
    lines_html = []
    max_span_size = 0.0

    for line in block.get("lines", []):
        parts = []
        for span in line.get("spans", []):
            raw = span.get("text", "")
            if not raw:
                continue
            size  = span.get("size", base_size)
            flags = span.get("flags", 0)
            max_span_size = max(max_span_size, size)
            text = escape_html(raw)
            text = apply_inline_formatting(text, flags)
            parts.append(text)
        line_html = "".join(parts).strip()
        if line_html:
            lines_html.append(line_html)

    if not lines_html:
        return None

    content = " ".join(lines_html)
    tag = heading_tag(max_span_size, base_size)
    return f"<{tag}>{content}</{tag}>"


# ── Table helpers ────────────────────────────────────────────────────────────

def group_table_rows(page_plumber) -> list[dict]:
    """
    pdfplumber often returns border-less table rows as separate 1-row Table
    objects.  This groups consecutive objects with the same column count and
    a vertical gap smaller than TABLE_ROW_GAP into logical multi-row tables.

    Returns list of { "y": float, "bbox": [x0,y0,x1,y1], "rows": [[str,...]] }
    """
    try:
        tbl_objs = page_plumber.find_tables()
    except Exception:
        return []

    groups: list[dict] = []
    current: dict | None = None

    for tbl in tbl_objs:
        data = tbl.extract()
        if not data:
            continue
        num_cols = len(data[0])
        x0, y0, x1, y1 = tbl.bbox

        if current is None:
            current = {"y": y0, "bbox": [x0, y0, x1, y1], "rows": list(data), "cols": num_cols}
        else:
            gap = y0 - current["bbox"][3]
            if current["cols"] == num_cols and gap < TABLE_ROW_GAP:
                current["rows"].extend(data)
                current["bbox"][3] = y1        # extend bottom of group
                current["bbox"][0] = min(current["bbox"][0], x0)
                current["bbox"][2] = max(current["bbox"][2], x1)
            else:
                groups.append(current)
                current = {"y": y0, "bbox": [x0, y0, x1, y1], "rows": list(data), "cols": num_cols}

    if current:
        groups.append(current)

    return groups


def table_to_html(rows: list[list]) -> str:
    """Render grouped rows as an HTML table, treating row 0 as the header."""
    parts = ["<table>"]

    if rows:
        parts.append("<thead><tr>")
        for cell in rows[0]:
            parts.append(f"<th>{escape_html(cell or '')}</th>")
        parts.append("</tr></thead>")

    if len(rows) > 1:
        parts.append("<tbody>")
        for row in rows[1:]:
            parts.append("<tr>")
            for cell in row:
                parts.append(f"<td>{escape_html(cell or '')}</td>")
            parts.append("</tr>")
        parts.append("</tbody>")

    parts.append("</table>")
    return "".join(parts)


def in_table_region(y: float, table_bboxes: list) -> bool:
    """True if y falls within any table's vertical bounding box (with tolerance)."""
    TOLERANCE = 5
    return any(tb[1] - TOLERANCE <= y <= tb[3] + TOLERANCE for tb in table_bboxes)


# ── OCR fallback (image-only PDFs) ──────────────────────────────────────────

def _tesseract_available() -> bool:
    return shutil.which("tesseract") is not None


def _ocr_extract(doc_fitz) -> tuple[list, int]:
    """Run Tesseract OCR on every page via PyMuPDF. Returns (pages_result, total_text_len)."""
    pages_result = []
    total_text_len = 0

    for page_idx in range(len(doc_fitz)):
        page = doc_fitz[page_idx]
        elements = []

        try:
            # Try with Vietnamese first, fall back to English-only if lang pack missing
            try:
                tp = page.get_textpage_ocr(language="eng+vie", dpi=150, full=True)
            except Exception:
                tp = page.get_textpage_ocr(language="eng", dpi=150, full=True)

            for block in tp.extractDICT().get("blocks", []):
                if block.get("type") != 0:
                    continue
                parts = [
                    escape_html(span.get("text", "").strip())
                    for line in block.get("lines", [])
                    for span in line.get("spans", [])
                    if span.get("text", "").strip()
                ]
                if parts:
                    content = " ".join(parts)
                    total_text_len += len(content)
                    elements.append({"type": "html", "y": block["bbox"][1], "content": f"<p>{content}</p>"})
        except Exception:
            pass

        elements.sort(key=lambda e: e["y"])
        pages_result.append({"pageNum": page_idx + 1, "elements": elements})

    return pages_result, total_text_len


# ── Main extraction ──────────────────────────────────────────────────────────

def extract_pdf(pdf_path: str) -> dict:
    doc_fitz = fitz.open(pdf_path)
    pages_result = []
    total_text_len = 0
    total_images = 0

    with pdfplumber.open(pdf_path) as doc_plumber:
        for page_idx in range(len(doc_fitz)):
            page_fitz    = doc_fitz[page_idx]
            page_plumber = doc_plumber.pages[page_idx]
            page_num     = page_idx + 1
            elements: list[dict] = []

            # ── Tables ────────────────────────────────────────────
            tables = group_table_rows(page_plumber)
            table_bboxes = [t["bbox"] for t in tables]

            for tbl in tables:
                elements.append({"type": "html", "y": tbl["y"], "content": table_to_html(tbl["rows"])})
                for row in tbl["rows"]:
                    for cell in row:
                        if cell:
                            total_text_len += len(cell.strip())

            # ── Text blocks (fitz), skip spans inside table regions ─
            blocks_raw = page_fitz.get_text("dict", sort=True)
            blocks = blocks_raw.get("blocks", []) if isinstance(blocks_raw, dict) else []
            base_size = body_font_size(blocks)

            for block in blocks:
                if block.get("type") != 0:
                    continue
                y = block["bbox"][1]
                if in_table_region(y, table_bboxes):
                    continue
                html = block_to_html(block, base_size)
                if html:
                    for line in block.get("lines", []):
                        for span in line.get("spans", []):
                            total_text_len += len(span.get("text", "").strip())
                    elements.append({"type": "html", "y": y, "content": html})

            # ── Images (fitz) ──────────────────────────────────────
            if total_images < MAX_IMAGES:
                for img_info in page_fitz.get_images(full=True):
                    if total_images >= MAX_IMAGES:
                        break
                    xref = img_info[0]
                    try:
                        rects = page_fitz.get_image_rects(xref)
                        rect  = rects[0] if rects else fitz.Rect(0, 0, 0, 0)
                        base_image = doc_fitz.extract_image(xref)
                        if not base_image or not base_image.get("image"):
                            continue
                        img_b64 = base64.b64encode(base_image["image"]).decode()
                        ext = base_image.get("ext", "png")
                        elements.append({
                            "type": "image",
                            "y": rect.y0,
                            "data": f"data:image/{ext};base64,{img_b64}",
                            "width":  max(1, int(rect.width)),
                            "height": max(1, int(rect.height)),
                        })
                        total_images += 1
                    except Exception:
                        pass

            elements.sort(key=lambda e: e["y"])
            pages_result.append({"pageNum": page_num, "elements": elements})

    estimated_img_chars = total_images * 500
    denom = total_text_len + estimated_img_chars
    text_ratio = (total_text_len / denom) if denom > 0 else 0
    is_supported = total_text_len >= 50 and text_ratio > 0.2

    # OCR failover: entire file has no extractable text → try Tesseract before rejecting
    if not is_supported and total_text_len == 0 and _tesseract_available():
        ocr_pages, ocr_text_len = _ocr_extract(doc_fitz)
        if ocr_text_len >= 50:
            return {
                "isSupported": True,
                "textRatio": 100,
                "imageCount": 0,
                "pageCount": len(doc_fitz),
                "pages": ocr_pages,
                "ocr": True,
            }

    return {
        "isSupported": is_supported,
        "textRatio": round(text_ratio * 100),
        "imageCount": total_images,
        "pageCount": len(doc_fitz),
        "pages": pages_result,
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No PDF path provided"}))
        sys.exit(1)

    try:
        result = extract_pdf(sys.argv[1])
        print(json.dumps(result))
    except Exception as exc:
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)
