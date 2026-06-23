#!/usr/bin/env node
// Triage P0 RA ingest candidates by meaningful content disposition.
//
// Dry-run/reporting only. This script does not modify the live ingest queue or
// wiki vault. It reads the RA priority report and preprocessed combined TXT
// files, then writes a disposition manifest and pilot candidate set.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DEFAULT_VAULT = "D:\\vault\\llm-wiki-vault";
const DEFAULT_REPORTS = "reports";
const DEFAULT_PILOT_SIZE = 300;

function parseArgs(argv) {
  const args = {
    vaultRoot: DEFAULT_VAULT,
    priorityReport: "",
    outDir: "",
    pilotSize: DEFAULT_PILOT_SIZE,
    minFullChars: 500,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--vaultRoot") args.vaultRoot = argv[++i];
    else if (arg === "--priority-report") args.priorityReport = argv[++i];
    else if (arg === "--out-dir") args.outDir = argv[++i];
    else if (arg === "--pilot-size") args.pilotSize = Number(argv[++i]);
    else if (arg === "--min-full-chars") args.minFullChars = Number(argv[++i]);
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(args.pilotSize) || args.pilotSize < 1) {
    throw new Error(`Invalid --pilot-size: ${args.pilotSize}`);
  }
  if (!Number.isFinite(args.minFullChars) || args.minFullChars < 1) {
    throw new Error(`Invalid --min-full-chars: ${args.minFullChars}`);
  }
  return args;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/triage-p0-meaningful-content.js [options]

Options:
  --vaultRoot <path>          Vault root. Default: ${DEFAULT_VAULT}
  --priority-report <path>    priority-full.json from classify-ra-ingest-priority.js.
                              Default: latest reports/ra-ingest-priority-*/priority-full.json
  --out-dir <path>            Output directory. Default: reports/p0-meaningful-triage-<timestamp>
  --pilot-size <n>            Number of full_wiki representative candidates in pilot. Default: ${DEFAULT_PILOT_SIZE}
  --min-full-chars <n>        Minimum normalized body chars for full_wiki_candidate. Default: 500
`);
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return [
    d.getFullYear(),
    pad(d.getMonth() + 1),
    pad(d.getDate()),
    pad(d.getHours()),
    pad(d.getMinutes()),
    pad(d.getSeconds()),
  ].join("");
}

function latestPriorityReport() {
  if (!fs.existsSync(DEFAULT_REPORTS)) {
    throw new Error(`Reports directory not found: ${DEFAULT_REPORTS}`);
  }
  const dirs = fs
    .readdirSync(DEFAULT_REPORTS, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^ra-ingest-priority-/.test(d.name) && !/smoke/i.test(d.name))
    .map((d) => {
      const full = path.join(DEFAULT_REPORTS, d.name);
      return { full, mtimeMs: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  for (const dir of dirs) {
    const file = path.join(dir.full, "priority-full.json");
    if (fs.existsSync(file)) return file;
  }
  throw new Error("No priority-full.json found under reports/ra-ingest-priority-*");
}

function posixRelToFull(root, rel) {
  return path.join(root, ...String(rel).split("/"));
}

function normalizePathText(value) {
  return String(value || "").replace(/\\/g, "/");
}

function stripPreprocessMetadata(content) {
  return String(content || "")
    .replace(/^\[Source:[^\n]*\]\s*/gm, "")
    .replace(/^--- PREPROCESSED PART:[^\n]*---\s*/gim, "")
    .replace(/\[Source:[^\]]+\]/g, "")
    .replace(/^\s*--\s*\d+\s+of\s+\d+\s*--\s*$/gim, "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizedBody(content) {
  return stripPreprocessMetadata(content).replace(/\s+/g, " ").trim();
}

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function csvEscape(value) {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeCsv(file, rows, columns) {
  const lines = [columns.join(",")];
  for (const row of rows) {
    lines.push(columns.map((col) => csvEscape(row[col])).join(","));
  }
  fs.writeFileSync(file, `${lines.join("\n")}\n`, "utf8");
}

function productSignal(text) {
  const t = String(text || "");
  if (/HnX|HnXR1|HnX-P/i.test(t)) return "HnX";
  if (/HnVUE/i.test(t)) return "HnVUE";
  if (/CYAN|GT1717/i.test(t)) return "CYAN";
  if (/HAD1717|HAD1417|A1417|A1717|F1417/i.test(t)) return "HAD/A/F 1417-1717";
  if (/\bADD\b|AspenView/i.test(t)) return "ADD/AspenView";
  return "Unclassified";
}

function authoritySignal(text) {
  const t = String(text || "");
  if (/MFDS|KFDA|국내|기술문서|제조인증/i.test(t)) return "MFDS/domestic";
  if (/FDA|510\s*\(?k\)?|510k|GUDID|UDI/i.test(t)) return "FDA";
  if (/CE\s*MDR|MDR|EUDAMED|technical documentation|technical file/i.test(t)) return "CE/MDR";
  if (/Vietnam|베트남|Thailand|태국|Philippines|필리핀|NMPA/i.test(t)) return "overseas";
  return "general";
}

function chooseRepresentative(items) {
  return [...items].sort((a, b) => {
    if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
    if ((b.sizeBytes || 0) !== (a.sizeBytes || 0)) return (b.sizeBytes || 0) - (a.sizeBytes || 0);
    return String(a.sourcePath).localeCompare(String(b.sourcePath));
  })[0];
}

function countBy(rows, keyFn) {
  const out = {};
  for (const row of rows) {
    const key = keyFn(row) || "unknown";
    out[key] = (out[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function main() {
  const args = parseArgs(process.argv);
  const priorityReport = args.priorityReport || latestPriorityReport();
  const outDir = args.outDir || path.join(DEFAULT_REPORTS, `p0-meaningful-triage-${timestamp()}`);

  const priorityItems = JSON.parse(fs.readFileSync(priorityReport, "utf8"));
  if (!Array.isArray(priorityItems)) {
    throw new Error(`Priority report must be an array: ${priorityReport}`);
  }

  const p0 = priorityItems.filter((item) => String(item.priority || "").startsWith("P0"));
  const groups = new Map();
  const baseRows = [];

  for (const item of p0) {
    const combinedRel = normalizePathText(item.combinedPath || "");
    const combinedFull = posixRelToFull(args.vaultRoot, combinedRel);
    let content = "";
    let readError = "";
    try {
      content = fs.readFileSync(combinedFull, "utf8");
    } catch (err) {
      readError = err instanceof Error ? err.message : String(err);
    }

    const body = normalizedBody(content);
    const contentHash = sha256(body);
    const row = {
      ...item,
      sourcePath: normalizePathText(item.sourcePath),
      combinedPath: combinedRel,
      combinedFull,
      readError,
      normalizedChars: body.length,
      contentHash,
      canonicalGroupId: contentHash.slice(0, 12),
      productSignal: productSignal(`${item.sourcePath}\n${item.combinedPath}\n${body.slice(0, 4000)}`),
      authoritySignal: authoritySignal(`${item.sourcePath}\n${item.combinedPath}\n${body.slice(0, 4000)}`),
    };
    baseRows.push(row);

    const group = groups.get(contentHash) || {
      contentHash,
      canonicalGroupId: contentHash.slice(0, 12),
      normalizedChars: body.length,
      items: [],
    };
    group.items.push(row);
    groups.set(contentHash, group);
  }

  const dispositionRows = [];
  const canonicalGroups = [];
  for (const group of groups.values()) {
    const representative = chooseRepresentative(group.items);
    const isEmpty = group.normalizedChars < 50;
    const isLowText = group.normalizedChars >= 50 && group.normalizedChars < args.minFullChars;
    let groupDisposition = "full_wiki_candidate";
    let groupReason = "meaningful representative body";
    if (isEmpty) {
      groupDisposition = "needs_recovery_empty_text";
      groupReason = "normalized preprocessed body has fewer than 50 characters";
    } else if (isLowText) {
      groupDisposition = "needs_review_low_text";
      groupReason = `normalized preprocessed body has fewer than ${args.minFullChars} characters`;
    }

    for (const item of group.items) {
      let disposition = groupDisposition;
      let reason = groupReason;
      if (groupDisposition === "full_wiki_candidate" && item.queueId !== representative.queueId) {
        disposition = "canonical_duplicate";
        reason = "same normalized body as representative source";
      }
      dispositionRows.push({
        queueId: item.queueId,
        sourcePath: item.sourcePath,
        combinedPath: item.combinedPath,
        priority: item.priority,
        score: item.score,
        workstream: item.workstream,
        productSignal: item.productSignal,
        authoritySignal: item.authoritySignal,
        sizeBytes: item.sizeBytes,
        normalizedChars: item.normalizedChars,
        contentHash: item.contentHash,
        canonicalGroupId: item.canonicalGroupId,
        representativeQueueId: representative.queueId,
        representativeSourcePath: representative.sourcePath,
        groupSize: group.items.length,
        disposition,
        dispositionReason: reason,
        readError: item.readError,
      });
    }

    canonicalGroups.push({
      canonicalGroupId: group.canonicalGroupId,
      contentHash: group.contentHash,
      normalizedChars: group.normalizedChars,
      groupSize: group.items.length,
      representativeQueueId: representative.queueId,
      representativeSourcePath: representative.sourcePath,
      representativeCombinedPath: representative.combinedPath,
      representativeScore: representative.score,
      representativeWorkstream: representative.workstream,
      productSignal: representative.productSignal,
      authoritySignal: representative.authoritySignal,
      disposition: groupDisposition,
      dispositionReason: groupReason,
      sourcePaths: group.items.map((item) => item.sourcePath),
    });
  }

  const fullCandidates = dispositionRows
    .filter((row) => row.disposition === "full_wiki_candidate")
    .sort((a, b) => {
      if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
      if ((b.groupSize || 0) !== (a.groupSize || 0)) return (b.groupSize || 0) - (a.groupSize || 0);
      if ((b.normalizedChars || 0) !== (a.normalizedChars || 0)) return (b.normalizedChars || 0) - (a.normalizedChars || 0);
      return String(a.sourcePath).localeCompare(String(b.sourcePath));
    });
  const pilot = fullCandidates.slice(0, args.pilotSize).map((row, index) => ({
    pilotRank: index + 1,
    ...row,
  }));

  const dispositionCounts = countBy(dispositionRows, (row) => row.disposition);
  const productCounts = countBy(dispositionRows, (row) => row.productSignal);
  const workstreamCounts = countBy(dispositionRows, (row) => row.workstream);
  const pilotProductCounts = countBy(pilot, (row) => row.productSignal);
  const pilotWorkstreamCounts = countBy(pilot, (row) => row.workstream);

  const representativeInputChars = fullCandidates.reduce((sum, row) => sum + (row.normalizedChars || 0), 0);
  const p0Bytes = dispositionRows.reduce((sum, row) => sum + (row.sizeBytes || 0), 0);
  const duplicateRows = dispositionRows.filter((row) => row.disposition === "canonical_duplicate");
  const lowRows = dispositionRows.filter((row) => row.disposition === "needs_review_low_text");
  const emptyRows = dispositionRows.filter((row) => row.disposition === "needs_recovery_empty_text");

  const summary = {
    generatedAt: new Date().toISOString(),
    priorityReport,
    vaultRoot: args.vaultRoot,
    minFullChars: args.minFullChars,
    pilotSize: args.pilotSize,
    p0Sources: p0.length,
    p0Bytes,
    p0BytesMB: Number((p0Bytes / 1048576).toFixed(1)),
    canonicalGroups: groups.size,
    fullWikiRepresentativeCandidates: fullCandidates.length,
    canonicalDuplicateSources: duplicateRows.length,
    needsReviewLowTextSources: lowRows.length,
    needsRecoveryEmptyTextSources: emptyRows.length,
    representativeInputChars,
    representativeInputMB: Number((representativeInputChars / 1048576).toFixed(1)),
    estimatedRepresentativeTokensCharsPer4: Math.ceil(representativeInputChars / 4),
    avoidedFullLlmCalls: duplicateRows.length + lowRows.length + emptyRows.length,
    avoidedFullLlmCallPct: Number((((duplicateRows.length + lowRows.length + emptyRows.length) / Math.max(1, p0.length)) * 100).toFixed(1)),
    dispositionCounts,
    productCounts,
    workstreamCounts,
    pilot: {
      selected: pilot.length,
      productCounts: pilotProductCounts,
      workstreamCounts: pilotWorkstreamCounts,
    },
  };

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "p0-disposition-summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(outDir, "p0-disposition-full.json"), `${JSON.stringify(dispositionRows, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(outDir, "p0-canonical-groups.json"), `${JSON.stringify(canonicalGroups, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(outDir, "p0-pilot-full-wiki.json"), `${JSON.stringify(pilot, null, 2)}\n`, "utf8");

  writeCsv(path.join(outDir, "p0-disposition-full.csv"), dispositionRows, [
    "disposition",
    "dispositionReason",
    "queueId",
    "priority",
    "score",
    "workstream",
    "productSignal",
    "authoritySignal",
    "sizeBytes",
    "normalizedChars",
    "canonicalGroupId",
    "groupSize",
    "representativeQueueId",
    "sourcePath",
    "combinedPath",
  ]);
  writeCsv(path.join(outDir, "p0-pilot-full-wiki.csv"), pilot, [
    "pilotRank",
    "queueId",
    "priority",
    "score",
    "workstream",
    "productSignal",
    "authoritySignal",
    "normalizedChars",
    "canonicalGroupId",
    "groupSize",
    "sourcePath",
    "combinedPath",
  ]);

  const report = [
    "# P0 Meaningful Content Triage",
    "",
    `Generated: ${summary.generatedAt}`,
    `Priority report: \`${priorityReport}\``,
    "",
    "## Summary",
    "",
    `- P0 sources: ${summary.p0Sources.toLocaleString()}`,
    `- P0 bytes: ${summary.p0BytesMB.toLocaleString()} MB`,
    `- Canonical normalized body groups: ${summary.canonicalGroups.toLocaleString()}`,
    `- Full-wiki representative candidates: ${summary.fullWikiRepresentativeCandidates.toLocaleString()}`,
    `- Canonical duplicate sources: ${summary.canonicalDuplicateSources.toLocaleString()}`,
    `- Needs review for low text: ${summary.needsReviewLowTextSources.toLocaleString()}`,
    `- Needs recovery for empty text: ${summary.needsRecoveryEmptyTextSources.toLocaleString()}`,
    `- Representative input: ${summary.representativeInputMB.toLocaleString()} MB, about ${summary.estimatedRepresentativeTokensCharsPer4.toLocaleString()} chars/4 tokens`,
    `- Avoided full LLM calls before pilot: ${summary.avoidedFullLlmCalls.toLocaleString()} (${summary.avoidedFullLlmCallPct}%)`,
    "",
    "## Pilot",
    "",
    `- Selected full-wiki representatives: ${pilot.length.toLocaleString()}`,
    "",
    "### Pilot By Product",
    "",
    ...Object.entries(pilotProductCounts).map(([name, count]) => `- ${name}: ${count}`),
    "",
    "### Pilot By Workstream",
    "",
    ...Object.entries(pilotWorkstreamCounts).map(([name, count]) => `- ${name}: ${count}`),
    "",
    "## Output Files",
    "",
    "- `p0-disposition-summary.json`",
    "- `p0-disposition-full.json`",
    "- `p0-disposition-full.csv`",
    "- `p0-canonical-groups.json`",
    "- `p0-pilot-full-wiki.json`",
    "- `p0-pilot-full-wiki.csv`",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(outDir, "p0-meaningful-triage-report.md"), report, "utf8");

  console.log(JSON.stringify({ outDir, ...summary }, null, 2));
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.stack || err.message : String(err));
  process.exit(1);
}
