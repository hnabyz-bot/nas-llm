#!/usr/bin/env node
// Rebuild ingest queue from successful preprocess manifest outputs.

const fs = require('fs');
const path = require('path');

const PROJECT_ID = '2da34b71-49aa-4919-a66a-90f1683772f9';

function parseArgs(argv) {
  const args = {
    vaultRoot: 'D:\\vault\\llm-wiki-vault',
    dryRun: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--vaultRoot') args.vaultRoot = argv[++i];
    else if (arg === '--apply') args.dryRun = false;
    else if (arg === '--dry-run') args.dryRun = true;
    else {
      process.stderr.write(`Unknown argument: ${arg}\n`);
      process.exit(2);
    }
  }
  return args;
}

function folderContext(sourcePath) {
  const rel = sourcePath.replace(/^raw\/sources\/_preprocessed\//, '');
  const parts = rel.split('/').slice(0, -1);
  return parts.join(' > ');
}

function newId(index) {
  return `ingest-${Date.now()}-${index.toString(36)}`;
}

function priority(pathValue) {
  const rel = pathValue.replace(/^raw\/sources\/_preprocessed\//, '');
  const top = rel.split('/')[0];
  const folderRank = {
    'RA': 10,
    'DHF (인허가)': 20,
    '연구소 문서등록대장': 30,
    'Standard(국제)': 40,
    '타사 메뉴얼': 50,
    'Project': 60,
    'Restricted_Backup': 70,
  }[top] || 99;
  const boostPatterns = [
    /HnVUE/i, /CYAN/i, /HnX/i, /FDA/i, /국내/, /인증/, /보완/, /사이버보안/, /Cybersecurity/i,
    /DHF/i, /DMR/i, /BOM/i, /출하검사/, /성능/, /안전/, /검증/, /validation/i, /verification/i,
    /manual/i, /메뉴얼/, /IFU/i, /Instructions/i,
  ];
  const boost = boostPatterns.some((pattern) => pattern.test(rel)) ? -5 : 0;
  return folderRank + boost;
}

function main() {
  const args = parseArgs(process.argv);
  const queuePath = path.join(args.vaultRoot, '.llm-wiki', 'ingest-queue.json');
  const manifestPath = path.join(args.vaultRoot, 'raw', 'sources', '_preprocessed', '.preprocess-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const outputs = [];

  for (const entry of Object.values(manifest)) {
    if (!entry || entry.status !== 'success' || !Array.isArray(entry.outputs)) continue;
    for (const output of entry.outputs) {
      const full = path.join(args.vaultRoot, output.replace(/\//g, path.sep));
      if (fs.existsSync(full)) outputs.push(output);
    }
  }

  outputs.sort((a, b) => {
    const pa = priority(a);
    const pb = priority(b);
    if (pa !== pb) return pa - pb;
    return a.localeCompare(b);
  });

  const now = Date.now();
  const queue = outputs.map((sourcePath, index) => ({
    id: newId(index),
    projectId: PROJECT_ID,
    sourcePath,
    folderContext: folderContext(sourcePath),
    status: 'pending',
    addedAt: now + index,
    retryCount: 0,
    error: null,
  }));

  const backup = `${queuePath}.bak-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}`;
  if (fs.existsSync(queuePath)) fs.copyFileSync(queuePath, backup);
  fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2), 'utf8');
  process.stdout.write(JSON.stringify({ queuePath, backup, pending: queue.length }, null, 2) + '\n');
}

main();
