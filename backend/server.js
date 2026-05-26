const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const path = require('path');

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const https = require('https');

require('dotenv').config();

if (!process.env.SUPABASE_JWT_SECRET) {
  console.error('FATAL: SUPABASE_JWT_SECRET is not set');
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gczkqjfiooiazuzjpghx.supabase.co';
let cachedPublicKeys = {};

async function fetchJWKS() {
  return new Promise((resolve, reject) => {
    https.get(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const { keys } = JSON.parse(data);
          for (const key of keys) {
            cachedPublicKeys[key.kid] = crypto.createPublicKey({ key, format: 'jwk' }).export({ type: 'spki', format: 'pem' });
          }
          resolve(cachedPublicKeys);
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// Pre-fetch JWKS at startup (non-fatal if offline)
fetchJWKS().catch(() => {});

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Suppress browser favicon requests
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Health check / root — prevents Express 404 page with CSP from being served to browsers
app.get('/', (req, res) => res.json({ status: 'ok', service: 'boox-reader-backend', version: '2.0.0' }));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost/boox-reader');

// Database Schemas
const bookSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true }, // Supabase user UUID
  title: String,
  originalUrl: String,
  fileType: String, // pdf, docx, mobi
  content: {
    type: {
      type: String, // 'html'
      default: 'html'
    },
    data: String, // HTML string
  },
  metadata: {
    pageCount: Number,
    createdAt: { type: Date, default: Date.now },
    lastReadPage: { type: Number, default: 0 },
    lastReadAt: Date,
    imageCount: { type: Number, default: 0 },
    textRatio: { type: Number, default: 100 }, // Text percentage
    classification: { type: String, default: 'text-heavy' }, // text-heavy or image-only
  },
  storageSize: Number, // in bytes
});

const Book = mongoose.model('Book', bookSchema);

// Middleware: Verify Supabase JWT — supports ES256 (JWKS) and HS256 (legacy/tests)
const verifyToken = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const headerB64 = token.split('.')[0];
    const { alg, kid } = JSON.parse(Buffer.from(headerB64, 'base64url').toString());

    let decoded;
    if (alg === 'ES256') {
      let publicKey = cachedPublicKeys[kid];
      if (!publicKey) {
        await fetchJWKS();
        publicKey = cachedPublicKeys[kid];
      }
      if (!publicKey) return res.status(401).json({ error: 'Unknown signing key' });
      decoded = jwt.verify(token, publicKey, { algorithms: ['ES256'] });
    } else {
      // HS256 — legacy Supabase or test suite
      decoded = jwt.verify(token, process.env.SUPABASE_JWT_SECRET, { algorithms: ['HS256'] });
    }

    if (!decoded.sub) return res.status(401).json({ error: 'Invalid token: missing sub' });
    req.userId = decoded.sub;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ============ PDF CONVERSION VIA PYMUPDF ============

/**
 * Call pdf-converter.py (PyMuPDF) as a subprocess.
 * Writes buffer to a temp file, spawns python3, returns parsed JSON.
 * JSON shape: { isSupported, textRatio, imageCount, pageCount, pages[] }
 * Each page.elements[] is sorted by y-position: { type, y, content|data, width?, height? }
 */
async function callPdfConverter(buffer) {
  const tmpFile = path.join(os.tmpdir(), `pdf-${crypto.randomUUID()}.pdf`);
  const scriptPath = path.join(__dirname, 'pdf-converter.py');

  try {
    fs.writeFileSync(tmpFile, buffer);

    return await new Promise((resolve, reject) => {
      const python = spawn('python3', [scriptPath, tmpFile]);
      let stdout = '';
      let stderr = '';

      python.stdout.on('data', (data) => { stdout += data; });
      python.stderr.on('data', (data) => { stderr += data; });

      const timer = setTimeout(() => {
        python.kill();
        reject(new Error('PDF conversion timed out after 60s'));
      }, 60000);

      python.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          reject(new Error(`PDF converter failed: ${stderr}`));
          return;
        }
        try {
          resolve(JSON.parse(stdout));
        } catch {
          reject(new Error(`PDF converter returned invalid JSON`));
        }
      });
    });
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}

// ============ FILE CONVERSION FUNCTIONS ============

/**
 * Convert PDF to HTML with images at their original page positions (PyMuPDF).
 */
async function convertPDFToHtml(buffer) {
  try {
    const result = await callPdfConverter(buffer);

    if (result.error) {
      throw new Error(result.error);
    }

    if (!result.isSupported) {
      throw new Error(
        `This PDF appears to be image-only (possibly comic/manga). ` +
        `Text ratio: ${result.textRatio}%. ` +
        `We support text-based PDFs with embedded images only. ` +
        `For comics, try KoReader or Kindle.`
      );
    }

    // Build HTML — elements within each page are already sorted by y-position
    let htmlContent = '<div class="book-content">';

    for (const page of result.pages) {
      htmlContent += `<div class="page" data-page="${page.pageNum - 1}">`;

      for (const el of page.elements) {
        if (el.type === 'image') {
          htmlContent += `<figure style="margin: 16px 0; text-align: center;">
            <img src="${el.data}"
                 alt="Page image"
                 style="max-width: 100%; height: auto; border: 1px solid #ddd;" />
            <figcaption style="font-size: 12px; color: #999; margin-top: 8px;">
              Image on page ${page.pageNum}
            </figcaption>
          </figure>`;
        } else if (el.type === 'html') {
          // Content is already tagged HTML (h1/h2/h3/p with bold/italic preserved)
          htmlContent += el.content;
        } else {
          // Fallback for legacy plain-text elements
          htmlContent += `<p>${el.content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`;
        }
      }

      htmlContent += '</div>';
    }

    htmlContent += '</div>';

    return {
      htmlContent,
      pageCount: result.pageCount,
      analysis: {
        textRatio: result.textRatio,
        isSupported: result.isSupported,
        classification: 'text-heavy',
        imageCount: result.imageCount,
      },
      imageCount: result.imageCount,
    };
  } catch (err) {
    throw new Error(`PDF conversion failed: ${err.message}`);
  }
}

/**
 * Call markitdown-converter.py as a subprocess.
 * Returns { markdown, pageCount } for DOCX and MOBI files.
 */
async function callMarkitdownConverter(buffer, fileType) {
  const ext = fileType === 'docx' ? 'docx' : 'mobi';
  const tmpFile = path.join(os.tmpdir(), `${ext}-${crypto.randomUUID()}.${ext}`);
  const scriptPath = path.join(__dirname, 'markitdown-converter.py');

  try {
    fs.writeFileSync(tmpFile, buffer);

    return await new Promise((resolve, reject) => {
      const python = spawn('python3', [scriptPath, tmpFile, ext]);
      let stdout = '';
      let stderr = '';

      python.stdout.on('data', (data) => { stdout += data; });
      python.stderr.on('data', (data) => { stderr += data; });

      const timer = setTimeout(() => {
        python.kill();
        reject(new Error(`${ext.toUpperCase()} conversion timed out after 60s`));
      }, 60000);

      python.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          reject(new Error(`markitdown converter failed: ${stderr}`));
          return;
        }
        try {
          const result = JSON.parse(stdout);
          if (result.error) throw new Error(result.error);
          resolve(result);
        } catch (e) {
          reject(new Error(`markitdown converter returned invalid JSON: ${e.message}`));
        }
      });
    });
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}

/**
 * Convert DOCX to Markdown using markitdown (preserves tables, headings, bold, images).
 */
async function convertDOCX(buffer) {
  try {
    const result = await callMarkitdownConverter(buffer, 'docx');
    return {
      markdownContent: result.markdown,
      pageCount: result.pageCount,
      analysis: { textRatio: 100, isSupported: true, classification: 'text-heavy' },
      imageCount: 0,
    };
  } catch (err) {
    throw new Error(`DOCX conversion failed: ${err.message}`);
  }
}

/**
 * Convert MOBI to Markdown using markitdown.
 */
async function convertMOBI(buffer) {
  try {
    const result = await callMarkitdownConverter(buffer, 'mobi');
    return {
      markdownContent: result.markdown,
      pageCount: result.pageCount,
      analysis: { textRatio: 100, isSupported: true, classification: 'text-heavy' },
      imageCount: 0,
    };
  } catch (err) {
    throw new Error(`MOBI conversion failed: ${err.message}`);
  }
}

/**
 * Main conversion function - routes to appropriate handler.
 * Returns { htmlContent?, markdownContent?, contentType, pageCount, analysis, imageCount }
 */
async function convertFile(buffer, fileType) {
  if (fileType === 'pdf') {
    const result = await convertPDFToHtml(buffer);
    return { ...result, contentType: 'html' };
  } else if (fileType === 'docx') {
    const result = await convertDOCX(buffer);
    return { ...result, contentType: 'markdown' };
  } else if (fileType === 'mobi') {
    const result = await convertMOBI(buffer);
    return { ...result, contentType: 'markdown' };
  } else {
    throw new Error(`Unsupported file type: ${fileType}`);
  }
}

// ============ FILE PROCESSING ROUTES ============

/**
 * Upload and convert file from URL
 */
app.post('/api/books/upload-url', verifyToken, async (req, res) => {
  try {
    const { url, title } = req.body;

    // Determine file type from URL
    const urlPath = new URL(url).pathname;
    const fileExt = path.extname(urlPath).toLowerCase();
    let fileType = 'pdf'; // default

    if (fileExt === '.docx' || fileExt === '.doc') fileType = 'docx';
    if (fileExt === '.mobi') fileType = 'mobi';

    // Handle Google links
    let downloadUrl = url;
    if (url.includes('docs.google.com/document')) {
      // Google Docs → export as DOCX
      const fileId = url.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1];
      if (fileId) {
        downloadUrl = `https://docs.google.com/document/d/${fileId}/export?format=docx`;
        fileType = 'docx';
      }
    } else if (url.includes('drive.google.com')) {
      const fileId = url.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1];
      if (fileId) {
        downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
      }
    }

    // Download file
    let response;
    try {
      response = await axios.get(downloadUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
        maxContentLength: 100 * 1024 * 1024,
        maxRedirects: 5,
      });
    } catch (dlErr) {
      const status = dlErr.response?.status;
      if (status === 401 || status === 403) {
        return res.status(400).json({ error: 'File requires authentication. Make the document publicly accessible (e.g. Google Docs: Share → Anyone with the link → Viewer).' });
      }
      throw dlErr;
    }

    const buffer = Buffer.from(response.data);

    // Convert file (PDF → HTML, DOCX/MOBI → Markdown)
    const conversion = await convertFile(buffer, fileType);
    const contentData = conversion.markdownContent ?? conversion.htmlContent ?? '';

    // Save to database
    const book = new Book({
      userId: req.userId,
      title: title || 'Untitled',
      originalUrl: url,
      fileType,
      content: {
        type: conversion.contentType,
        data: contentData,
      },
      metadata: {
        pageCount: conversion.pageCount,
        createdAt: new Date(),
        lastReadPage: 0,
        imageCount: conversion.imageCount,
        textRatio: conversion.analysis.textRatio,
        classification: conversion.analysis.classification,
      },
      storageSize: Buffer.byteLength(contentData, 'utf8'),
    });

    await book.save();

    res.json({
      bookId: book._id,
      title: book.title,
      pageCount: conversion.pageCount,
      storageSize: book.storageSize,
      imageCount: conversion.imageCount,
      analysis: conversion.analysis,
    });
  } catch (err) {
    const errorMessage = err.message || 'Upload failed';
    
    // Check if it's an image-only PDF error
    if (errorMessage.includes('image-only')) {
      return res.status(400).json({ 
        error: errorMessage,
        code: 'IMAGE_ONLY_PDF'
      });
    }

    res.status(400).json({ error: errorMessage });
  }
});

/**
 * Get book content for reading
 */
app.get('/api/books/:bookId', verifyToken, async (req, res) => {
  try {
    const book = await Book.findOne({
      _id: req.params.bookId,
      userId: req.userId,
    });

    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }

    res.json({
      id: book._id,
      title: book.title,
      content: book.content.data,
      contentType: book.content.type || 'html',
      pageCount: book.metadata.pageCount,
      lastReadPage: book.metadata.lastReadPage,
      imageCount: book.metadata.imageCount,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Update reading progress
 */
app.patch('/api/books/:bookId/progress', verifyToken, async (req, res) => {
  try {
    const { page } = req.body;

    const book = await Book.findOneAndUpdate(
      { _id: req.params.bookId, userId: req.userId },
      {
        'metadata.lastReadPage': page,
        'metadata.lastReadAt': new Date(),
      },
      { new: true }
    );

    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }

    res.json({ success: true, lastReadPage: book.metadata.lastReadPage });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Get user's book library
 */
app.get('/api/books', verifyToken, async (req, res) => {
  try {
    const books = await Book.find({ userId: req.userId }).select(
      '_id title fileType metadata.pageCount metadata.lastReadPage metadata.createdAt metadata.imageCount metadata.textRatio storageSize'
    );

    res.json(books);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Delete book
 */
app.delete('/api/books/:bookId', verifyToken, async (req, res) => {
  try {
    const book = await Book.findOneAndDelete({
      _id: req.params.bookId,
      userId: req.userId,
    });

    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }

    res.json({ success: true, storageFreed: book.storageSize });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start server only when run directly (not during tests)
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
