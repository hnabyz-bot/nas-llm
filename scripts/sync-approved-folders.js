#!/usr/bin/env node
// Robust NAS -> local sync for approved folders, with long-path fallback.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FOLDERS = [
  'DHF (인허가)',
  'RA',
  'Standard(국제)',
  '연구소 문서등록대장',
  '타사 메뉴얼',
  'Project',
  'Restricted_Backup',
];
const EXTS = new Set(['.pdf', '.md', '.txt', '.docx', '.xlsx', '.xls', '.pptx']);

function parseArgs(argv) {
  const args = { nasDrive: 'Z:\\', vaultRoot: 'D:\\vault\\llm-wiki-vault', dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--nasDrive') args.nasDrive = argv[++i];
    else if (arg === '--vaultRoot') args.vaultRoot = argv[++i];
    else if (arg === '--dry-run') args.dryRun = true;
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

function hash(value) {
  return crypto.createHash('sha1').update(value).digest('hex').slice(0, 12);
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
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && !entry.name.startsWith('~$') && EXTS.has(path.extname(entry.name).toLowerCase())) out.push(full);
  }
}

function sameFile(src, dst) {
  try {
    const a = fs.statSync(src);
    const b = fs.statSync(dst);
    return a.size === b.size && Math.abs(a.mtimeMs - b.mtimeMs) < 2000;
  } catch {
    return false;
  }
}

function copyWithTime(src, dst, dryRun) {
  if (sameFile(src, dst)) return 'skip';
  if (dryRun) return 'new';
  ensureDir(path.dirname(dst));
  fs.copyFileSync(src, dst);
  const stat = fs.statSync(src);
  fs.utimesSync(dst, stat.atime, stat.mtime);
  return 'copied';
}

function main() {
  const args = parseArgs(process.argv);
  const rawRoot = path.join(args.vaultRoot, 'raw', 'sources');
  const manifestPath = path.join(rawRoot, '.sync-manifest.json');
  let manifest = {};
  if (fs.existsSync(manifestPath)) {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  }

  const stats = {};
  for (const folder of FOLDERS) {
    const srcRoot = path.join(args.nasDrive, folder);
    const files = [];
    walk(srcRoot, files);
    stats[folder] = { scanned: files.length, copied: 0, skipped: 0, fallback: 0, errors: 0 };

    for (const src of files) {
      const relNas = toSlash(path.relative(args.nasDrive, src));
      const normalDst = path.join(rawRoot, relNas.replace(/\//g, path.sep));
      const ext = path.extname(src);
      const fallbackRel = toSlash(path.join(folder, '_longpath_sources', `${hash(relNas)}_${safeName(path.basename(src, ext), 70)}${ext}`));
      const fallbackDst = path.join(rawRoot, fallbackRel.replace(/\//g, path.sep));
      let target = normalDst;
      let usedFallback = false;

      try {
        copyWithTime(src, target, args.dryRun);
      } catch {
        target = fallbackDst;
        usedFallback = true;
      }

      try {
        const result = copyWithTime(src, target, args.dryRun);
        if (result === 'skip') stats[folder].skipped++;
        else stats[folder].copied++;
        if (usedFallback) stats[folder].fallback++;
        manifest[relNas] = {
          originalRelativePath: relNas,
          localSourcePath: toSlash(path.relative(args.vaultRoot, target)),
          fallback: usedFallback,
          size: fs.statSync(src).size,
          mtimeMs: fs.statSync(src).mtimeMs,
          syncedAt: new Date().toISOString(),
        };
      } catch (error) {
        stats[folder].errors++;
        manifest[relNas] = {
          originalRelativePath: relNas,
          localSourcePath: null,
          fallback: usedFallback,
          error: error.message,
          syncedAt: new Date().toISOString(),
        };
      }
    }
    process.stdout.write(`${folder}: scanned=${stats[folder].scanned} copied=${stats[folder].copied} skipped=${stats[folder].skipped} fallback=${stats[folder].fallback} errors=${stats[folder].errors}\n`);
    if (!args.dryRun) fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  }

  if (!args.dryRun) fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  process.stdout.write(JSON.stringify({ manifestPath, stats }, null, 2) + '\n');
  const errors = Object.values(stats).reduce((sum, row) => sum + row.errors, 0);
  if (errors > 0) process.exit(1);
}

main();
