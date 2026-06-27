#!/usr/bin/env node
// Static QA for priority staging knowledge materialized into the live vault wiki.
//
// This does not start llm-wiki and does not mutate the vault. It validates the
// materialized file set, source traceability, frontmatter, priority markers, and basic
// Markdown hygiene before app usability checks.

const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const DEFAULT_VAULT = "D:\\vault\\llm-wiki-vault";
const DEFAULT_APPLY_DIR = "reports\\p0-vault-materialize-apply-202606241458";
const DEFAULT_TRIAGE_DIR = "reports\\p0-meaningful-triage-20260618153500";
const DEFAULT_PRIORITY = "p0";
const REPORTS_ROOT = "reports";

function parseArgs(argv) {
  const args = {
    vaultRoot: DEFAULT_VAULT,
    applyDir: DEFAULT_APPLY_DIR,
    triageDir: DEFAULT_TRIAGE_DIR,
    priority: DEFAULT_PRIORITY,
    outDir: "",
    maxExamples: 25,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--vaultRoot") args.vaultRoot = argv[++i];
    else if (arg === "--apply-dir") args.applyDir = argv[++i];
    else if (arg === "--triage-dir") args.triageDir = argv[++i];
    else if (arg === "--priority") args.priority = normalizePriority(argv[++i]);
    else if (arg === "--out-dir") args.outDir = argv[++i];
    else if (arg === "--max-examples") args.maxExamples = Number(argv[++i]);
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!args.outDir) args.outDir = path.join(REPORTS_ROOT, `${args.priority}-vault-qa-${timestamp()}`);
  return args;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/qa-p0-vault-publish.js [options]

Options:
  --vaultRoot <path>     Vault root. Default: ${DEFAULT_VAULT}
  --apply-dir <path>     Materialize apply report directory. Default: ${DEFAULT_APPLY_DIR}
  --triage-dir <path>    Priority triage report directory. Default: ${DEFAULT_TRIAGE_DIR}
  --priority <p0|p1>     Priority prefix. Default: ${DEFAULT_PRIORITY}
  --out-dir <path>       QA report output directory. Default: reports/<priority>-vault-qa-<timestamp>
  --max-examples <n>     Max examples stored per issue. Default: 25.
`);
}

function normalizePriority(value) {
  const normalized = String(value || DEFAULT_PRIORITY).trim().toLowerCase();
  if (!/^p\d+$/.test(normalized)) throw new Error(`Invalid --priority: ${value}`);
  return normalized;
}

function priorityLabel(priority) {
  return priority.toUpperCase();
}

function publishMarker(priority) {
  return `${priorityLabel(priority)}-STAGING-PUBLISH:${priority}`;
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/\/+/g, "/");
}

function fullPath(vaultRoot, relPath) {
  return path.join(vaultRoot, ...relPath.split("/"));
}

function addExample(bucket, value, maxExamples) {
  if (bucket.length < maxExamples) bucket.push(value);
}

function countMatches(text, re) {
  return [...text.matchAll(re)].length;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseFrontmatter(content) {
  if (!content.startsWith("---\n")) return null;
  const end = content.indexOf("\n---\n", 4);
  if (end < 0) return null;
  const raw = content.slice(4, end);
  const values = {};
  for (const line of raw.split("\n")) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (match) values[match[1]] = match[2].trim();
  }
  return { raw, values, body: content.slice(end + 5) };
}

function parseInlineArray(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return [];
  try {
    const parsed = JSON.parse(trimmed.replace(/'/g, '"'));
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return trimmed
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map((part) => part.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
}

function lineIssueCount(content, predicate) {
  let count = 0;
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (predicate(lines[i], i)) count += 1;
  }
  return count;
}

function git(vaultRoot, args) {
  try {
    return cp.execFileSync("git", args, {
      cwd: vaultRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (err) {
    return String(err.stderr || err.message || "").trim();
  }
}

function getQueueState(vaultRoot) {
  const queuePath = path.join(vaultRoot, ".llm-wiki", "ingest-queue.json");
  if (!fs.existsSync(queuePath)) return { exists: false, total: 0, counts: {} };
  const queue = readJson(queuePath);
  const items = Array.isArray(queue) ? queue : [queue];
  const counts = {};
  for (const item of items) counts[item.status || "unknown"] = (counts[item.status || "unknown"] || 0) + 1;
  return { exists: true, total: items.length, counts };
}

function getScheduledTaskState(taskName) {
  try {
    return cp.execFileSync("powershell.exe", [
      "-NoProfile",
      "-Command",
      `(Get-ScheduledTask -TaskName '${taskName}' -ErrorAction SilentlyContinue).State`,
    ], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || "Missing";
  } catch {
    return "Unknown";
  }
}

function main() {
  const args = parseArgs(process.argv);
  ensureDir(args.outDir);
  const label = priorityLabel(args.priority);
  const marker = publishMarker(args.priority);

  const files = readJson(path.join(args.applyDir, "materialize-files.json"));
  const summary = readJson(path.join(args.applyDir, "materialize-summary.json"));
  const dispositionRows = readJson(path.join(args.triageDir, `${args.priority}-disposition-full.json`));
  const plannedPaths = [...new Set(files.map((item) => normalizePath(item.relPath)))].sort();
  const sourcePaths = plannedPaths.filter((relPath) => relPath.startsWith("wiki/sources/"));

  const errors = [];
  const warnings = [];
  const issueExamples = {
    missingFiles: [],
    unsafePaths: [],
    missingFrontmatter: [],
    missingFrontmatterKeys: [],
    emptySources: [],
    missingMarker: [],
    mismatchedMarker: [],
    trailingWhitespace: [],
    nulBytes: [],
    replacementChars: [],
    suspiciousTokens: [],
    missingSourceSections: [],
    missingQueueIds: [],
  };

  const stats = {
    plannedFileRecords: files.length,
    uniquePlannedPaths: plannedPaths.length,
    sourcePages: sourcePaths.length,
    existingFiles: 0,
    markdownBytes: 0,
    actionCounts: {},
    contributionCount: 0,
    pagesWithFrontmatter: 0,
    pagesWithSources: 0,
    pagesWithPriorityMarker: 0,
    priorityBeginCount: 0,
    priorityEndCount: 0,
    sourceQueueIdsSeen: 0,
  };

  for (const item of files) {
    stats.actionCounts[item.action || "unknown"] = (stats.actionCounts[item.action || "unknown"] || 0) + 1;
    stats.contributionCount += Number(item.contributionCount || 0);
  }

  if (summary.materialize?.uniqueFiles !== plannedPaths.length) {
    errors.push(`summary uniqueFiles ${summary.materialize?.uniqueFiles} != file list ${plannedPaths.length}`);
  }
  if (summary.materialize?.contributions !== stats.contributionCount) {
    errors.push(`summary contributions ${summary.materialize?.contributions} != file list contribution sum ${stats.contributionCount}`);
  }
  for (const [action, count] of Object.entries(summary.materialize?.actionCounts || {})) {
    if ((stats.actionCounts[action] || 0) !== count) {
      errors.push(`summary action ${action} ${count} != file list ${stats.actionCounts[action] || 0}`);
    }
  }

  const seenQueueIds = new Set();
  for (const relPath of plannedPaths) {
    if (!relPath.startsWith("wiki/") || relPath.includes("../") || path.isAbsolute(relPath)) {
      addExample(issueExamples.unsafePaths, relPath, args.maxExamples);
      continue;
    }

    const file = fullPath(args.vaultRoot, relPath);
    if (!fs.existsSync(file)) {
      addExample(issueExamples.missingFiles, relPath, args.maxExamples);
      continue;
    }

    stats.existingFiles += 1;
    const content = fs.readFileSync(file, "utf8");
    stats.markdownBytes += Buffer.byteLength(content, "utf8");

    const fm = parseFrontmatter(content);
    if (!fm) {
      addExample(issueExamples.missingFrontmatter, relPath, args.maxExamples);
    } else {
      stats.pagesWithFrontmatter += 1;
      for (const key of ["type", "title", "updated", "tags", "sources"]) {
        if (!(key in fm.values) || !fm.values[key]) {
          addExample(issueExamples.missingFrontmatterKeys, `${relPath}: ${key}`, args.maxExamples);
        }
      }
      const sources = parseInlineArray(fm.values.sources);
      if (sources.length) stats.pagesWithSources += 1;
      else addExample(issueExamples.emptySources, relPath, args.maxExamples);
    }

    const beginCount = countMatches(content, new RegExp(`${escapeRegExp(`<!-- ${marker}:BEGIN -->`)}`, "g"));
    const endCount = countMatches(content, new RegExp(`${escapeRegExp(`<!-- ${marker}:END -->`)}`, "g"));
    stats.priorityBeginCount += beginCount;
    stats.priorityEndCount += endCount;
    if (beginCount > 0 || endCount > 0) stats.pagesWithPriorityMarker += 1;
    if (beginCount === 0 && endCount === 0) addExample(issueExamples.missingMarker, relPath, args.maxExamples);
    if (beginCount !== 1 || endCount !== 1) {
      addExample(issueExamples.mismatchedMarker, `${relPath}: begin=${beginCount}, end=${endCount}`, args.maxExamples);
    }

    if (lineIssueCount(content, (line) => /[ \t]+$/.test(line)) > 0) {
      addExample(issueExamples.trailingWhitespace, relPath, args.maxExamples);
    }
    if (content.includes("\u0000")) addExample(issueExamples.nulBytes, relPath, args.maxExamples);
    if (content.includes("\uFFFD")) addExample(issueExamples.replacementChars, relPath, args.maxExamples);
    if (/\[object Object\]/.test(content)) {
      addExample(issueExamples.suspiciousTokens, relPath, args.maxExamples);
    }

    if (relPath.startsWith("wiki/sources/")) {
      const hasKnownSection =
        content.includes(`## ${label} Staging Source Summary`) ||
        content.includes(`## ${label} Canonical Duplicate Disposition`) ||
        content.includes(`## ${label} Empty Text Recovery Stub`) ||
        content.includes(`## ${label} Low Text Review Stub`);
      if (!hasKnownSection) addExample(issueExamples.missingSourceSections, relPath, args.maxExamples);
      for (const match of content.matchAll(/queueId:\s*`([^`]+)`/g)) {
        seenQueueIds.add(match[1]);
      }
    }
  }
  stats.sourceQueueIdsSeen = seenQueueIds.size;

  const expectedQueueIds = new Set(dispositionRows.map((row) => row.queueId).filter(Boolean));
  for (const queueId of expectedQueueIds) {
    if (!seenQueueIds.has(queueId)) addExample(issueExamples.missingQueueIds, queueId, args.maxExamples);
  }

  const issueCounts = Object.fromEntries(Object.entries(issueExamples).map(([key, value]) => [key, value.length]));
  const cappedIssueNames = [];
  for (const [key, examples] of Object.entries(issueExamples)) {
    if (examples.length >= args.maxExamples) cappedIssueNames.push(key);
  }

  if (issueExamples.unsafePaths.length) errors.push(`unsafe planned paths found: ${issueExamples.unsafePaths.length}+`);
  if (issueExamples.missingFiles.length) errors.push(`missing materialized files found: ${issueExamples.missingFiles.length}+`);
  if (issueExamples.missingFrontmatter.length) errors.push(`pages missing frontmatter found: ${issueExamples.missingFrontmatter.length}+`);
  if (issueExamples.missingFrontmatterKeys.length) errors.push(`pages missing required frontmatter keys found: ${issueExamples.missingFrontmatterKeys.length}+`);
  if (issueExamples.emptySources.length) errors.push(`pages with empty frontmatter sources found: ${issueExamples.emptySources.length}+`);
  if (issueExamples.missingMarker.length) errors.push(`pages missing ${label} marker found: ${issueExamples.missingMarker.length}+`);
  if (issueExamples.mismatchedMarker.length) errors.push(`pages with non-idempotent ${label} marker counts found: ${issueExamples.mismatchedMarker.length}+`);
  if (issueExamples.trailingWhitespace.length) errors.push(`pages with trailing whitespace found: ${issueExamples.trailingWhitespace.length}+`);
  if (issueExamples.nulBytes.length) errors.push(`pages with NUL bytes found: ${issueExamples.nulBytes.length}+`);
  if (issueExamples.missingSourceSections.length) errors.push(`source pages missing ${label} section found: ${issueExamples.missingSourceSections.length}+`);
  if (issueExamples.missingQueueIds.length) errors.push(`${label} disposition queueIds missing from source pages found: ${issueExamples.missingQueueIds.length}+`);

  if (issueExamples.replacementChars.length) warnings.push(`pages containing Unicode replacement character: ${issueExamples.replacementChars.length}+`);
  if (issueExamples.suspiciousTokens.length) warnings.push(`pages containing suspicious generated tokens: ${issueExamples.suspiciousTokens.length}+`);
  if (cappedIssueNames.length) warnings.push(`issue examples capped at ${args.maxExamples}: ${cappedIssueNames.join(", ")}`);

  const appRunning = Boolean(cp.execFileSync("powershell.exe", [
    "-NoProfile",
    "-Command",
    "if (Get-Process -Name 'llm-wiki' -ErrorAction SilentlyContinue) { 'true' } else { 'false' }",
  ], { encoding: "utf8" }).trim() === "true");
  const ingestReadyFlag = fs.existsSync(path.join(args.vaultRoot, ".llm-wiki", "ingest-ready.flag"));
  const scheduledTasks = {
    "LLM-Wiki-Watchdog": getScheduledTaskState("LLM-Wiki-Watchdog"),
    "LLM-Wiki-Startup": getScheduledTaskState("LLM-Wiki-Startup"),
    "LLM-Wiki-Auth-Check": getScheduledTaskState("LLM-Wiki-Auth-Check"),
  };
  const queue = getQueueState(args.vaultRoot);
  const gitStatusWiki = git(args.vaultRoot, ["status", "--porcelain", "wiki/"]);
  const gitHead = git(args.vaultRoot, ["log", "-1", "--oneline", "--decorate"]);

  if (appRunning) errors.push("llm-wiki process is running");
  if (ingestReadyFlag) errors.push("ingest-ready.flag exists");
  for (const [task, state] of Object.entries(scheduledTasks)) {
    if (state !== "Disabled" && state !== "Missing") errors.push(`${task} scheduled task is ${state}`);
  }
  if (queue.counts.processing) errors.push(`queue has processing items: ${queue.counts.processing}`);
  if (gitStatusWiki) errors.push("vault wiki has uncommitted changes");

  const result = {
    generatedAt: new Date().toISOString(),
    priority: args.priority,
    vaultRoot: args.vaultRoot,
    applyDir: args.applyDir,
    triageDir: args.triageDir,
    pass: errors.length === 0,
    errors,
    warnings,
    stats,
    expected: {
      dispositionRows: dispositionRows.length,
      expectedQueueIds: expectedQueueIds.size,
      materializeSummary: summary.materialize,
      dispositionSummary: summary.disposition,
    },
    issueCounts,
    issueExamples,
    vaultState: {
      appRunning,
      ingestReadyFlag,
      scheduledTasks,
      queue,
      gitHead,
      wikiDirty: Boolean(gitStatusWiki),
      wikiDirtyLines: gitStatusWiki ? gitStatusWiki.split(/\r?\n/).slice(0, args.maxExamples) : [],
    },
  };

  writeJson(path.join(args.outDir, `${args.priority}-vault-qa-summary.json`), result);
  fs.writeFileSync(path.join(args.outDir, `${args.priority}-vault-qa-report.md`), renderMarkdown(result), "utf8");

  console.log(`QA ${result.pass ? "PASS" : "FAIL"}`);
  console.log(`report=${args.outDir}`);
  console.log(`files=${stats.uniquePlannedPaths}, sourcePages=${stats.sourcePages}, queueIds=${stats.sourceQueueIdsSeen}/${expectedQueueIds.size}`);
  console.log(`errors=${errors.length}, warnings=${warnings.length}`);
  process.exit(result.pass ? 0 : 1);
}

function renderMarkdown(result) {
  const label = priorityLabel(result.priority || DEFAULT_PRIORITY);
  return [
    `# ${label} Vault QA Report`,
    "",
    `Generated: ${result.generatedAt}`,
    `Result: ${result.pass ? "PASS" : "FAIL"}`,
    `Vault: \`${result.vaultRoot}\``,
    `Apply report: \`${result.applyDir}\``,
    "",
    "## Coverage",
    "",
    `- ${label} disposition rows: ${result.expected.dispositionRows}`,
    `- materialized unique files: ${result.stats.uniquePlannedPaths}`,
    `- materialized source pages: ${result.stats.sourcePages}`,
    `- source queueIds seen: ${result.stats.sourceQueueIdsSeen}/${result.expected.expectedQueueIds}`,
    `- contribution sum: ${result.stats.contributionCount}`,
    `- action counts: ${JSON.stringify(result.stats.actionCounts)}`,
    "",
    "## Markdown QA",
    "",
    `- existing materialized files: ${result.stats.existingFiles}/${result.stats.uniquePlannedPaths}`,
    `- pages with frontmatter: ${result.stats.pagesWithFrontmatter}`,
    `- pages with non-empty sources: ${result.stats.pagesWithSources}`,
    `- pages with ${label} marker: ${result.stats.pagesWithPriorityMarker}`,
    `- ${label} marker begin/end counts: ${result.stats.priorityBeginCount}/${result.stats.priorityEndCount}`,
    "",
    "## Vault State",
    "",
    `- app running: ${result.vaultState.appRunning}`,
    `- ingest-ready.flag: ${result.vaultState.ingestReadyFlag}`,
    `- scheduled tasks: ${JSON.stringify(result.vaultState.scheduledTasks)}`,
    `- queue: ${JSON.stringify(result.vaultState.queue.counts)} (${result.vaultState.queue.total} total)`,
    `- wiki dirty: ${result.vaultState.wikiDirty}`,
    `- vault HEAD: \`${result.vaultState.gitHead}\``,
    "",
    "## Errors",
    "",
    ...(result.errors.length ? result.errors.map((item) => `- ${item}`) : ["- none"]),
    "",
    "## Warnings",
    "",
    ...(result.warnings.length ? result.warnings.map((item) => `- ${item}`) : ["- none"]),
    "",
    "## Issue Counts",
    "",
    ...Object.entries(result.issueCounts).map(([key, value]) => `- ${key}: ${value}`),
    "",
  ].join("\n");
}

main();
