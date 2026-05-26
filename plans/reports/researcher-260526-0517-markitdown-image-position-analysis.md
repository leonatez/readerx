# MarkItDown PDF Conversion & Image Position Analysis

**Date:** 2026-05-26  
**Query Focus:** Microsoft markitdown PDF handling, image position preservation, Node.js integration  
**Status:** Complete

---

## Executive Summary

**Do NOT use markitdown for image-position-aware PDF conversion.** It's fundamentally text-extraction-first; images are secondary/placeholder. Current pdfjs-dist + pdf-parse approach is better aligned with your image-position requirement than markitdown would be.

| Aspect | MarkItDown | Your Current Stack (pdfjs-dist + pdf-parse) |
|--------|-----------|-----|
| **PDF lib** | pdfminer.six (text-only) | pdfjs-dist (renders pages) |
| **Image extraction** | No built-in; requires LLM | Inherent from page rendering |
| **Position preservation** | Not designed for it | Available via page dimensions |
| **Markdown output** | Plain text (no structure) | You control structure via HTML |
| **File size** | Small (~500 lines code) | ~1MB (full PDF.js) |

---

## What MarkItDown Actually Does

### 1. Core Capability
Microsoft's MarkItDown is a **lightweight text-extraction utility** optimized for LLM readiness, not document layout preservation. It converts PDFs, Office files, HTML, images, and audio to markdown.

**Official purpose:** Clean text → markdown, stripped of formatting. Designed for RAG pipelines and LLM ingestion, not faithful document reconstruction.

### 2. PDF Processing Architecture
- **Underlying library:** `pdfminer.six` — extracts text from digital PDFs only
- **Text grouping:** Uses character bounding boxes + margins (`char_margin`, `line_overlap` params) to cluster text into lines
- **No formatting:** All text loses hierarchy; no heading levels; all caps = plain text
- **No OCR built-in:** Can't process scanned/image-based PDFs
- **No image content:** Images → placeholder text or external LLM description

### 3. Image Handling (Critical Weakness)
MarkItDown's image story:
- **Default behavior:** Returns nothing for standalone images
- **Images in PDFs:** Extracted as metadata placeholders, not positioned content
- **To get captions:** Requires LLM integration (OpenAI GPT-4o or equivalent)
  ```python
  md = MarkItDown(llm_client=client, llm_model="gpt-4o")
  # Generates: "Write a detailed caption for this image."
  ```
- **Position preservation:** NOT a design goal; images appended at end or scattered

### 4. Known Limitations (From Production Analysis)
- **25% success rate on PDFs** (per 2025 benchmarks)
- Text extraction only; complex graphics/diagrams lost
- No distinction between text layers/images on same page
- OCR plugin exists (markitdown-ocr) but requires Vision LLM (cost/latency)

---

## How MarkItDown Fails Your Use Case

**Your requirement:** Images at original page positions in output markdown.

**MarkItDown does:**
1. Extract text via pdfminer.six
2. Detect images (minimal metadata)
3. Generate caption text via LLM (optional)
4. Append captions somewhere in markdown

**MarkItDown does NOT do:**
- Track (x, y) coordinates of images on page
- Preserve spatial layout of mixed text + images
- Generate markdown that reflects page position
- Output `![]()` with position metadata

Result: **Cannot use markitdown as-is for your requirement.**

---

## Alternative: PyMuPDF (fitz) — Image Position Support

**PyMuPDF DOES support position preservation:**

### Extraction Methods
```python
page.get_images()           # List of image objects
page.get_image_bbox()       # Returns (x0, y0, x1, y1) + transformation matrix
page.get_image_rects()      # "Improved" version, detailed position data
page.get_image_info()       # Metadata for all images on page
```

### Coordinate System
- Origin: (0, 0) at top-left
- Y-axis points downward (like image coordinates)
- All coords relative to unrotated page
- Rotation: multiply by `page.rotation_matrix` if needed
- Supports transformation matrices (scale, rotation)

### Practical Advantage Over MarkItDown
You can:
1. Extract text + positions (pdfminer.six-style or native PyMuPDF)
2. Extract images + exact bounding boxes
3. Reconstruct markdown with `![alt](path) <!-- positioned at x,y -->`
4. Preserve page layout contextually

**Maturity:** PyMuPDF is production-grade (10+ years), widely used in enterprise PDF tooling.

---

## PDFPlumber: Position Data, Content Via External Tool

**PDFPlumber excels at coordinate extraction:**
- Returns precise position info: `(x0, y0, x1, y1)` for every image
- **Critical caveat:** No bitmap extraction built-in (just coordinates)
- For actual image content, combine with PIL/Pillow or PyMuPDF

**Use case:** If you only need positions and can extract bitmap separately.

---

## Node.js + Python Integration (How to Call from Express)

### Best Practice: Use `child_process.spawn()`

```javascript
const { spawn } = require('child_process');
const fs = require('fs');

async function convertPdfWithImages(pdfPath) {
  return new Promise((resolve, reject) => {
    const python = spawn('python3', ['./pdf_converter.py', pdfPath]);
    let output = '';
    let errorOutput = '';

    python.stdout.on('data', (data) => {
      output += data.toString();
    });

    python.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    python.on('close', (code) => {
      if (code === 0) {
        resolve(JSON.parse(output)); // Python returns JSON
      } else {
        reject(new Error(`Python exited with code ${code}: ${errorOutput}`));
      }
    });
  });
}
```

### Python Script Structure
```python
#!/usr/bin/env python3
import sys
import json
import fitz  # PyMuPDF

def extract_pdf(pdf_path):
    doc = fitz.open(pdf_path)
    result = {
        'pages': []
    }
    
    for page_num, page in enumerate(doc):
        page_data = {
            'page_num': page_num,
            'text_blocks': [],
            'images': []
        }
        
        # Extract images with positions
        for img in page.get_images():
            bbox = page.get_image_bbox(img)
            page_data['images'].append({
                'xref': img[0],
                'bbox': list(bbox),  # (x0, y0, x1, y1)
                'position': {'x': bbox[0], 'y': bbox[1]}
            })
        
        result['pages'].append(page_data)
    
    print(json.dumps(result))

if __name__ == '__main__':
    extract_pdf(sys.argv[1])
```

### Child Process Best Practices
- **Use `spawn()` for large data** (images, JSON streaming)
- **Use `exec()` only for small output** (<200KB)
- **Use `execFile()` for pre-compiled binaries** (faster, safer)
- **Stream stdout** rather than buffering if output >5MB
- **Handle stderr** separately (errors vs progress)
- **Set timeout** to prevent hanging processes
- **Cleanup:** Ensure subprocess terminates even on error

---

## Recommendation Ranking

### Option 1: PyMuPDF (fitz) + Custom Markdown Generation (RECOMMENDED)
**Pros:**
- Native position extraction (`get_image_bbox()`)
- Transformation matrix support (rotation/scale)
- Production-grade, mature (10+ yrs)
- Can combine with text extraction
- Full control over markdown output structure

**Cons:**
- Custom integration work needed
- No "off-the-shelf" markdown output
- Dependency on C library (PyMuPDF wraps MuPDF)

**Adoption Risk:** Low. PyMuPDF is standard in Python PDF tools.

**Cost:** OSS (free), minimal performance overhead.

---

### Option 2: Replace pdfjs-dist with PyMuPDF Backend
**Pros:**
- Position preservation out-of-box
- Simpler than current pdfjs-dist
- Consistent Python stack

**Cons:**
- Removes client-side rendering (pdfjs)
- All PDF processing server-side
- Latency for large PDFs

**Adoption Risk:** Medium. Architectural shift.

---

### Option 3: Keep pdfjs-dist, Add PyMuPDF Side-Channel
**Pros:**
- Minimal refactor (add Python layer)
- Leverages existing rendering
- Fallback if needed

**Cons:**
- Dual PDF processing (inefficient)
- Maintains pdfjs-dist complexity

**Adoption Risk:** Medium. Code duplication risk.

---

### Option 4: MarkItDown (NOT RECOMMENDED)
**Why not:**
- No position preservation
- Text-extraction-first design
- Requires LLM for image descriptions (cost/latency)
- 25% success rate on PDFs
- Trade current image handling for worse image handling

**If forced to use:** Add markitdown-ocr plugin + Vision LLM, then manually reconstruct positions via coordinate analysis. Overkill.

---

## Unresolved Questions

1. **Image extraction format:** Do you need actual bitmap files extracted to disk, or just references in markdown (e.g., `<img src="...">`)?
2. **Page layout complexity:** Do PDFs have overlapping text/images, or is positioning mostly text-above/below-images?
3. **Scale requirements:** How many PDFs/month? Current bottleneck—rendering or extraction?
4. **Markdown structure:** Must output be valid CommonMark, or custom YAML front-matter OK?

---

## Sources

- [GitHub - microsoft/markitdown](https://github.com/microsoft/markitdown)
- [Real Python - MarkItDown](https://realpython.com/python-markitdown/)
- [Leapcell - Deep Dive into MarkItDown](https://leapcell.io/blog/deep-dive-into-microsoft-markitdown)
- [PyMuPDF Documentation - Page Methods](https://pymupdf.readthedocs.io/en/latest/page.html)
- [PDFPlumber - Image Extraction](https://www.pdfplumber.com/can-pdfplumber-extract-images-from-pdfs/)
- [FreecodeCode Camp - Python + Node.js Integration](https://www.freecodecamp.org/news/how-to-integrate-a-python-ruby-php-shell-script-with-node-js-using-child-process-spawn-e26ca3268a11/)
- [DEV Community - Mastering Child Processes](https://dev.to/satyam_gupta_0d1ff2152dcc/mastering-child-processes-in-nodejs-a-complete-guide-32g3)
