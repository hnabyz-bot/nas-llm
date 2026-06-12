#!/usr/bin/env node
// OCR excluded image-only documents into preprocessed TXT outputs.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const sharp = require('sharp');
const { createWorker } = require('tesseract.js');
const { createCanvas } = require('@napi-rs/canvas');

const TEXT_CHARS_PER_CHUNK = 18000;

function parseArgs(argv) {
  const args = {
    vaultRoot: 'D:\\vault\\llm-wiki-vault',
    limit: 0,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--vaultRoot') args.vaultRoot = argv[++i];
    else if (arg === '--limit') args.limit = Number(argv[++i] || 0);
    else {
      process.stderr.write(`Unknown argument: ${arg}\n`);
      process.exit(2);
    }
  }
  return args;
}

function toSlash(value) {
  return value.replace(/\\/g, '/');
}

function safeName(value, limit = 80) {
  const safe = value.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
  return (safe || 'document').slice(0, limit);
}

function sourceId(sourcePath) {
  return crypto.createHash('sha1').update(sourcePath).digest('hex').slice(0, 12);
}

function chunkText(text) {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized) return [];
  if (normalized.length <= TEXT_CHARS_PER_CHUNK) return [normalized];
  const chunks = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(start + TEXT_CHARS_PER_CHUNK, normalized.length);
    if (end < normalized.length) {
      const boundary = normalized.lastIndexOf('\n', end);
      if (boundary > start + Math.floor(TEXT_CHARS_PER_CHUNK * 0.6)) end = boundary;
    }
    chunks.push(normalized.slice(start, end).trim());
    start = end;
  }
  return chunks.filter(Boolean);
}

async function imageToPngBuffer(buffer) {
  return sharp(buffer)
    .rotate()
    .resize({ width: 2200, withoutEnlargement: true })
    .grayscale()
    .normalize()
    .png()
    .toBuffer();
}

function extractOfficeImages(file) {
  const zip = new AdmZip(file);
  return zip.getEntries()
    .filter((entry) => /^word\/media\/|^ppt\/media\//.test(entry.entryName))
    .filter((entry) => /\.(png|jpe?g|tiff?|bmp)$/i.test(entry.entryName))
    .map((entry) => ({ name: entry.entryName, buffer: entry.getData() }));
}

async function renderPdfPages(file) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(fs.readFileSync(file));
  const loadingTask = pdfjs.getDocument({ data, disableWorker: true });
  const pdf = await loadingTask.promise;
  const pages = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext('2d');
    await page.render({ canvasContext: context, viewport }).promise;
    pages.push({ name: `page-${pageNum}`, buffer: canvas.toBuffer('image/png') });
  }
  return pages;
}

async function ocrImages(worker, images) {
  const sections = [];
  for (const image of images) {
    const png = await imageToPngBuffer(image.buffer);
    const result = await worker.recognize(png);
    const text = (result.data && result.data.text ? result.data.text : '').trim();
    if (text) sections.push(`## ${image.name}\n${text}`);
  }
  return sections.join('\n\n').trim();
}

function writeOutputs(args, entry, text) {
  const sourcePath = entry.sourcePath;
  const relFromRaw = sourcePath.replace(/^raw\/sources\//, '');
  const parts = relFromRaw.split('/');
  const folder = parts[0];
  const ext = path.extname(sourcePath);
  const base = path.basename(sourcePath, ext);
  const id = sourceId(sourcePath);
  const outDir = path.join(args.vaultRoot, 'raw', 'sources', '_preprocessed', folder, '_by_source', id);
  fs.mkdirSync(outDir, { recursive: true });

  const outputs = [];
  const chunks = chunkText(text);
  chunks.forEach((chunk, index) => {
    const suffix = chunks.length === 1 ? '' : `_part${index + 1}`;
    const outName = `${safeName(base)}__${id}_ocr${suffix}.txt`;
    const outFull = path.join(outDir, outName);
    const content = `[Source: ${relFromRaw} / OCR Part ${index + 1}]\n\n${chunk}\n`;
    fs.writeFileSync(outFull, content, 'utf8');
    outputs.push(toSlash(path.relative(args.vaultRoot, outFull)));
  });
  return outputs;
}

async function main() {
  const args = parseArgs(process.argv);
  const manifestPath = path.join(args.vaultRoot, 'raw', 'sources', '_preprocessed', '.preprocess-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const candidates = Object.values(manifest)
    .filter((entry) => entry && entry.status === 'excluded')
    .filter((entry) => ['image_only_office_file', 'image_only_pdf'].includes(entry.exclusionClass));
  const targets = args.limit > 0 ? candidates.slice(0, args.limit) : candidates;

  const worker = await createWorker('eng+kor');
  const counts = { total: targets.length, recovered: 0, empty: 0, error: 0 };
  const errors = [];

  try {
    for (let i = 0; i < targets.length; i++) {
      const entry = targets[i];
      const full = path.join(args.vaultRoot, entry.sourcePath.replace(/\//g, path.sep));
      try {
        const ext = path.extname(full).toLowerCase();
        let images = [];
        if (ext === '.docx' || ext === '.pptx') images = extractOfficeImages(full);
        else if (ext === '.pdf') images = await renderPdfPages(full);
        else throw new Error(`OCR not supported for ${ext}`);

        if (images.length === 0) {
          entry.exclusionClass = 'no_images_for_ocr';
          entry.exclusionAction = 'No embedded images were found for OCR.';
          counts.empty++;
        } else {
          const text = await ocrImages(worker, images);
          if (!text) {
            entry.exclusionClass = 'ocr_no_text'
            entry.exclusionAction = 'OCR ran but produced no usable text.';
            counts.empty++;
          } else {
            const stat = fs.statSync(full);
            entry.status = 'success';
            entry.outputs = writeOutputs(args, entry, text);
            entry.error = null;
            entry.size = stat.size;
            entry.mtimeMs = stat.mtimeMs;
            entry.processedAt = new Date().toISOString();
            delete entry.exclusionClass;
            delete entry.exclusionAction;
            delete entry.excludedAt;
            counts.recovered++;
          }
        }
      } catch (error) {
        entry.exclusionClass = 'ocr_failed';
        entry.exclusionAction = error.message || String(error);
        errors.push({ sourcePath: entry.sourcePath, error: entry.exclusionAction });
        counts.error++;
      }

      if ((i + 1) % 10 === 0 || i + 1 === targets.length) {
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
        process.stdout.write(`OCR ${i + 1}/${targets.length} recovered=${counts.recovered} empty=${counts.empty} error=${counts.error}\n`);
      }
    }
  } finally {
    await worker.terminate();
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  process.stdout.write(JSON.stringify({ counts, errors: errors.slice(0, 50) }, null, 2) + '\n');
  if (counts.error > 0) process.exit(1);
}

main().catch((error) => {
  process.stderr.write((error && error.stack) ? error.stack : String(error));
  process.stderr.write('\n');
  process.exit(1);
});
