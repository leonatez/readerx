#!/usr/bin/env python3
"""
Document converter using markitdown.
Converts DOCX, MOBI, and other formats to Markdown preserving tables, headings, bold.

Usage: python3 markitdown-converter.py <path> <file_extension>
  e.g. python3 markitdown-converter.py /tmp/file.docx docx

Output JSON:
{
  "markdown": str,
  "pageCount": int
}
"""

import sys
import json
from markitdown import MarkItDown


def estimate_page_count(markdown: str) -> int:
    """Estimate reader page count from heading/word count."""
    # ~500 words per page
    words = len(markdown.split())
    return max(1, min(round(words / 500), 500))


def convert(file_path: str, file_extension: str) -> dict:
    md = MarkItDown()
    result = md.convert_local(file_path, file_extension=f".{file_extension}")
    markdown = result.text_content or ""
    return {
        "markdown": markdown,
        "pageCount": estimate_page_count(markdown),
    }


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: markitdown-converter.py <path> <extension>"}))
        sys.exit(1)

    file_path, file_ext = sys.argv[1], sys.argv[2].lstrip(".")

    try:
        output = convert(file_path, file_ext)
        print(json.dumps(output))
    except Exception as exc:
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)
