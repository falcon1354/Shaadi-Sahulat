/**
 * OCR pipeline for CNIC extraction.
 *
 * Pipeline (per BNPL&Delivery.md §3.3):
 *   1. PDF → image  : pdfjs-dist v4 (ESM) renders PDF pages to PNG via @napi-rs/canvas
 *   2. OCR          : tesseract.js (pure JS, no system deps) recognises text
 *   3. CNIC regex   : \b\d{5}-\d{7}-\d\b  + several tolerant variants
 *
 * The pipeline is lazy-loaded: the first call imports tesseract.js + pdfjs-dist.
 * If native modules fail to load (e.g. on a fresh machine without build tools),
 * the function returns `cnic_number: null` with `ocr_error` set — the bank
 * officer can still review the document manually.
 *
 * Returns:
 *   {
 *     raw_text,
 *     extracted_cnic,        // canonical 35202-1234567-1, or null
 *     confidence,            // 0..1
 *     extracted_name,        // heuristic, or null
 *     extracted_dob,         // heuristic, or null
 *     source_file,           // for traceability
 *     ocr_error              // null on success, message on failure
 *   }
 */
const fs = require("fs");
const path = require("path");

// Lazy-loaded modules
let _tesseract = null;
let _pdfjs = null;
let _canvas = null;
let _loadError = null;

async function _loadModules() {
  if (_loadError) throw _loadError;
  if (_tesseract && _pdfjs && _canvas) return { _tesseract, _pdfjs, _canvas };
  try {
    _tesseract = require("tesseract.js");
    _canvas = require("@napi-rs/canvas");
    _pdfjs = await import("pdfjs-dist/build/pdf.mjs");
    try {
      const workerUrl = require.resolve("pdfjs-dist/build/pdf.worker.mjs");
      _pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    } catch (_) {
      // fall back to fake worker (main thread)
    }
    return { _tesseract, _pdfjs, _canvas };
  } catch (err) {
    _loadError = err;
    throw err;
  }
}

// ---------- CNIC regexes (most specific first) ----------
const CNIC_PATTERNS = [
  /\b\d{5}-\d{7}-\d\b/,                    // canonical 35202-1234567-1
  /\b\d{5}\s?\d{7}\s?\d\b/,                // 35202 1234567 1
  /\b\d{13}\b/,                            // 3520212345671
  /\b\d{5}[-\s]?\d{7}[-\s]?\d{1}\b/,       // loose
];

// OCR commonly drops the trailing check digit, giving 35202-1234567 (12 digits).
const CNIC_PARTIAL_RE = /\b(\d{5})[-\s]?(\d{7})\b(?!\s*[-\s]?\d\b)/;

function extractCnic(text) {
  if (!text) return null;
  for (const re of CNIC_PATTERNS) {
    const m = text.match(re);
    if (m) {
      const digits = m[0].replace(/\D/g, "");
      if (digits.length === 13) {
        return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
      }
      return m[0];
    }
  }
  const pm = text.match(CNIC_PARTIAL_RE);
  if (pm) {
    return `${pm[1]}-${pm[2]}-?`;
  }
  return null;
}

function extractName(text) {
  if (!text) return null;
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  for (const ln of lines) {
    const m = ln.match(/^(?:name)\s*[:\-]?\s*(.+)$/i);
    if (m && m[1]) return m[1].replace(/[^A-Za-z .'-]/g, "").trim();
  }
  return null;
}

function extractDob(text) {
  if (!text) return null;
  const m = text.match(/\b(\d{2}[.\-/]\d{2}[.\-/]\d{4})\b/);
  return m ? m[1] : null;
}

function extractIban(text) {
  if (!text) return null;
  const m = text.match(/\bPK\d{2}[A-Z]{4}\d{16}\b/);
  return m ? m[0] : null;
}

// ---------- PDF → PNG buffers ----------
async function pdfToPngBuffers(pdfPath) {
  const { _pdfjs, _canvas } = await _loadModules();
  const { createCanvas } = _canvas;

  class NodeCanvasFactory {
    create(width, height) {
      const canvas = createCanvas(width, height);
      const context = canvas.getContext("2d");
      return { canvas, context };
    }
    reset(context, width, height) {
      context.canvas.width = width;
      context.canvas.height = height;
    }
    destroy() {}
  }

  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await _pdfjs.getDocument({ data, canvasFactory: new NodeCanvasFactory() }).promise;
  const pages = [];
  const factory = new NodeCanvasFactory();
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 });
    const { canvas, context } = factory.create(viewport.width, viewport.height);
    await page.render({ canvasContext: context, viewport, canvasFactory: factory }).promise;
    pages.push(canvas.toBuffer("image/png"));
  }
  return pages;
}

async function runOcr(imageBuffer, lang = "eng") {
  const { _tesseract } = await _loadModules();
  const worker = await _tesseract.createWorker(lang);
  try {
    const { data } = await worker.recognize(imageBuffer);
    return {
      text: data.text || "",
      confidence: typeof data.confidence === "number" ? data.confidence / 100 : 0,
    };
  } finally {
    await worker.terminate();
  }
}

/**
 * Run the full pipeline on one uploaded file path.
 * @param {string} absPath
 * @param {string} mimeType
 */
async function runOcrPipeline(absPath, mimeType) {
  let imageBuffers = [];
  try {
    if (mimeType === "application/pdf" || absPath.toLowerCase().endsWith(".pdf")) {
      imageBuffers = await pdfToPngBuffers(absPath);
    } else {
      imageBuffers = [fs.readFileSync(absPath)];
    }
  } catch (err) {
    return {
      raw_text: "",
      extracted_cnic: null,
      confidence: 0,
      extracted_name: null,
      extracted_dob: null,
      source_file: path.basename(absPath),
      ocr_error: "PDF/image load failed: " + err.message,
    };
  }

  let fullText = "";
  let maxConf = 0;
  try {
    for (const buf of imageBuffers) {
      const { text, confidence } = await runOcr(buf, "eng");
      fullText += "\n" + text;
      if (confidence > maxConf) maxConf = confidence;
    }
  } catch (err) {
    return {
      raw_text: fullText,
      extracted_cnic: null,
      confidence: maxConf,
      extracted_name: null,
      extracted_dob: null,
      source_file: path.basename(absPath),
      ocr_error: "OCR engine failed: " + err.message,
    };
  }

  return {
    raw_text: fullText.trim(),
    extracted_cnic: extractCnic(fullText),
    confidence: maxConf,
    extracted_name: extractName(fullText),
    extracted_dob: extractDob(fullText),
    source_file: path.basename(absPath),
    ocr_error: null,
  };
}

/**
 * Convenience: run OCR on a Buffer (without first persisting to disk).
 * Used by the BNPL submit handler so we get the CNIC back synchronously
 * for the response. Saves a temp file under uploads/.ocr-tmp/.
 */
async function runOcrOnBuffer(buffer, mimeType = "image/jpeg") {
  const tmpDir = path.join(__dirname, "..", "Uploads", ".ocr-tmp");
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const ext = mimeType === "application/pdf" ? ".pdf" : ".jpg";
  const tmpFile = path.join(tmpDir, `ocr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  fs.writeFileSync(tmpFile, buffer);
  try {
    return await runOcrPipeline(tmpFile, mimeType);
  } finally {
    try { fs.unlinkSync(tmpFile); } catch (_) {}
  }
}

module.exports = {
  runOcrPipeline,
  runOcrOnBuffer,
  extractCnic,
  extractName,
  extractDob,
  extractIban,
};
