#!/usr/bin/env node
// Preprocess every supported document under the approved NAS folders into TXT.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const XLSX = require('xlsx');
const mammoth = require('mammoth');
const { PDFParse } = require('pdf-parse');
const AdmZip = require('adm-zip');

const DEFAULT_FOLDERS = [
  'DHF (인허가)',
  'RA',
  'Standard(국제)',
  '연구소 문서등록대장',
  '타사 메뉴얼',
  'Project',
  'Restricted_Backup',
];

const SUPPORTED_EXTS = new Set(['.pdf', '.md', '.txt', '.docx', '.xlsx', '.xls', '.pptx']);
const TEXT_CHARS_PER_CHUNK = 18000;
const XLSX_ROWS_PER_CHUNK = 300;

function parseArgs(argv) {
  const args = {
    vaultRoot: 'D:\\vault\\llm-wiki-vault',
    folders: DEFAULT_FOLDERS,
    force: false,
    limit: 0,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--vaultRoot') args.vaultRoot = argv[++i];
    else if (arg === '--folders') args.folders = argv[++i].split('|').filter(Boolean);
    else if (arg === '--force') args.force = true;
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
  return safe.slice(0, limit) || 'document';
}

function sourceId(sourcePath) {
  return crypto.createHash('sha1').update(sourcePath).digest('hex').slice(0, 12);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function walk(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '_preprocessed') continue;
      walk(full, out);
    } else if (entry.isFile()) {
      if (entry.name.startsWith('~$')) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (SUPPORTED_EXTS.has(ext)) out.push(full);
    }
  }
}

function chunkText(text, maxChars = TEXT_CHARS_PER_CHUNK) {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized) return [];
  if (normalized.length <= maxChars) return [normalized];

  const chunks = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(start + maxChars, normalized.length);
    if (end < normalized.length) {
      const boundary = normalized.lastIndexOf('\n', end);
      if (boundary > start + Math.floor(maxChars * 0.6)) end = boundary;
    }
    chunks.push(normalized.slice(start, end).trim());
    start = end;
  }
  return chunks.filter(Boolean);
}

function stripXml(value) {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function extractText(file, ext) {
  if (ext === '.txt' || ext === '.md') {
    return fs.readFileSync(file, 'utf8');
  }
  if (ext === '.docx') {
    const result = await mammoth.extractRawText({ path: file });
    return result.value || '';
  }
  if (ext === '.pdf') {
    const parser = new PDFParse({ data: fs.readFileSync(file) });
    try {
      const data = await parser.getText();
      return data.text || '';
    } finally {
      await parser.destroy();
    }
  }
  if (ext === '.pptx') {
    const zip = new AdmZip(file);
    const slideEntries = zip.getEntries()
      .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/.test(entry.entryName))
      .sort((a, b) => a.entryName.localeCompare(b.entryName, undefined, { numeric: true }));
    const slides = [];
    for (const entry of slideEntries) {
      const xml = entry.getData().toString('utf8');
      const text = stripXml(xml);
      if (text) slides.push(`## ${entry.entryName}\n${text}`);
    }
    return slides.join('\n\n');
  }
  throw new Error(`unsupported text extractor for ${ext}`);
}

function extractWorkbook(file, outDir, baseOutName, sourceLabel) {
  const wb = XLSX.readFile(file, { sheetStubs: false, cellFormula: false, cellHTML: false });
  const outputs = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws || !ws['!ref']) continue;
    const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false, RS: '\n' });
    const rows = csv.split('\n').filter((row) => row.replace(/,/g, '').trim().length > 0);
    if (rows.length === 0) continue;
    const header = rows[0];
    const safeSheet = safeName(sheetName, 40);
    if (rows.length <= XLSX_ROWS_PER_CHUNK) {
      const outName = `${baseOutName}_${safeSheet}.txt`;
      const content = `[Source: ${sourceLabel} / Sheet: ${sheetName}]\n\n${rows.join('\n')}\n`;
      fs.writeFileSync(path.join(outDir, outName), content, 'utf8');
      outputs.push(outName);
    } else {
      let part = 0;
      for (let i = 1; i < rows.length; i += XLSX_ROWS_PER_CHUNK - 1) {
        part++;
        const chunk = [header, ...rows.slice(i, i + XLSX_ROWS_PER_CHUNK - 1)];
        const outName = `${baseOutName}_${safeSheet}_part${part}.txt`;
        const content = `[Source: ${sourceLabel} / Sheet: ${sheetName} / Part ${part}]\n\n${chunk.join('\n')}\n`;
        fs.writeFileSync(path.join(outDir, outName), content, 'utf8');
        outputs.push(outName);
      }
    }
  }
  return outputs;
}

function removeOldOutputs(entry, vaultRoot) {
  if (!entry || !Array.isArray(entry.outputs)) return;
  for (const rel of entry.outputs) {
    const full = path.join(vaultRoot, rel.replace(/\//g, path.sep));
    try {
      if (fs.existsSync(full)) fs.unlinkSync(full);
    } catch {
      // Keep going; a stale output should not block reprocessing.
    }
  }
}

async function preprocessOne(file, args, manifest) {
  const stat = fs.statSync(file);
  const relSource = toSlash(path.relative(args.vaultRoot, file));
  const prev = manifest[relSource];
  if (!args.force && prev && prev.size === stat.size && prev.mtimeMs === stat.mtimeMs &&
      prev.status === 'success' && Array.isArray(prev.outputs) &&
      prev.outputs.every((rel) => fs.existsSync(path.join(args.vaultRoot, rel.replace(/\//g, path.sep))))) {
    return { status: 'skipped', sourcePath: relSource };
  }

  removeOldOutputs(prev, args.vaultRoot);

  const relFromRaw = toSlash(path.relative(path.join(args.vaultRoot, 'raw', 'sources'), file));
  const parts = relFromRaw.split('/');
  const folder = parts.shift();
  const ext = path.extname(file).toLowerCase();
  const base = path.basename(file, ext);
  const id = sourceId(relSource);
  const outDir = path.join(args.vaultRoot, 'raw', 'sources', '_preprocessed', folder, '_by_source', id);
  ensureDir(outDir);

  const baseOutName = `${safeName(base)}__${id}`;
  const sourceLabel = relSource.replace(/^raw\/sources\//, '');
  const entry = {
    sourcePath: relSource,
    status: 'error',
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    processedAt: new Date().toISOString(),
    outputs: [],
    error: null,
  };

  try {
    let outputs = [];
    if (ext === '.xlsx' || ext === '.xls') {
      outputs = extractWorkbook(file, outDir, baseOutName, sourceLabel);
    } else {
      const text = await extractText(file, ext);
      const chunks = chunkText(text);
      chunks.forEach((chunk, index) => {
        const suffix = chunks.length === 1 ? '' : `_part${index + 1}`;
        const outName = `${baseOutName}${suffix}.txt`;
        const content = `[Source: ${sourceLabel} / Part ${index + 1}]\n\n${chunk}\n`;
        fs.writeFileSync(path.join(outDir, outName), content, 'utf8');
        outputs.push(outName);
      });
    }

    if (outputs.length === 0) {
      entry.status = 'empty';
      entry.error = 'No extractable text produced';
    } else {
      entry.status = 'success';
      entry.outputs = outputs.map((name) => toSlash(path.relative(args.vaultRoot, path.join(outDir, name))));
    }
  } catch (error) {
    entry.status = 'error';
    entry.error = error && error.message ? error.message : String(error);
  }

  manifest[relSource] = entry;
  return { status: entry.status, sourcePath: relSource, outputs: entry.outputs.length, error: entry.error };
}

async function main() {
  const args = parseArgs(process.argv);
  const rawRoot = path.join(args.vaultRoot, 'raw', 'sources');
  const preRoot = path.join(rawRoot, '_preprocessed');
  ensureDir(preRoot);

  const manifestPath = path.join(preRoot, '.preprocess-manifest.json');
  let manifest = {};
  if (fs.existsSync(manifestPath)) {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  }

  const files = [];
  for (const folder of args.folders) {
    walk(path.join(rawRoot, folder), files);
  }
  files.sort((a, b) => a.localeCompare(b));
  const targets = args.limit > 0 ? files.slice(0, args.limit) : files;

  const counts = { total: targets.length, success: 0, empty: 0, error: 0, skipped: 0 };
  const errors = [];
  for (let i = 0; i < targets.length; i++) {
    const result = await preprocessOne(targets[i], args, manifest);
    counts[result.status] = (counts[result.status] || 0) + 1;
    if (result.status === 'error' || result.status === 'empty') {
      errors.push(result);
    }
    if ((i + 1) % 100 === 0 || i + 1 === targets.length) {
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
      process.stdout.write(`Progress ${i + 1}/${targets.length} success=${counts.success} skipped=${counts.skipped} empty=${counts.empty} error=${counts.error}\n`);
    }
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  const summaryPath = path.join(preRoot, '.preprocess-summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify({ counts, errors: errors.slice(0, 200) }, null, 2), 'utf8');
  process.stdout.write(JSON.stringify({ counts, manifestPath, summaryPath }, null, 2) + '\n');
  if (counts.error > 0 || counts.empty > 0) process.exit(1);
}

main().catch((error) => {
  process.stderr.write((error && error.stack) ? error.stack : String(error));
  process.stderr.write('\n');
  process.exit(1);
});
