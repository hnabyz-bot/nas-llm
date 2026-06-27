#!/usr/bin/env node
// Build a dry-run priority staging-to-vault publish plan.
//
// This script does not modify the vault. It consumes the QA-passed priority
// extraction bundles plus the priority disposition manifest, derives app-compatible
// source identities and source-summary slugs, and reports what would be created
// or updated in D:\vault\llm-wiki-vault\wiki.

const fs = require("fs");
const path = require("path");

const DEFAULT_VAULT = "D:\\vault\\llm-wiki-vault";
const DEFAULT_TRIAGE_DIR = "reports\\p0-meaningful-triage-20260618153500";
const DEFAULT_PRIORITY = "p0";
const REPORTS_ROOT = "reports";
const MAX_SOURCE_SUMMARY_SLUG_LENGTH = 120;

function parseArgs(argv) {
  const args = {
    vaultRoot: DEFAULT_VAULT,
    triageDir: DEFAULT_TRIAGE_DIR,
    priority: DEFAULT_PRIORITY,
    outDir: "",
    bundles: [],
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--vaultRoot") args.vaultRoot = argv[++i];
    else if (arg === "--triage-dir") args.triageDir = argv[++i];
    else if (arg === "--priority") args.priority = normalizePriority(argv[++i]);
    else if (arg === "--out-dir") args.outDir = argv[++i];
    else if (arg === "--bundle") args.bundles.push(argv[++i]);
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!args.outDir) {
    args.outDir = path.join(REPORTS_ROOT, `${args.priority}-vault-publish-plan-${timestamp()}`);
  }
  return args;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/plan-p0-vault-publish.js [options]

Options:
  --vaultRoot <path>     Vault root. Default: ${DEFAULT_VAULT}
  --triage-dir <path>    Priority triage report directory. Default: ${DEFAULT_TRIAGE_DIR}
  --priority <p0|p1>     Priority prefix. Default: ${DEFAULT_PRIORITY}
  --bundle <path>        Explicit extraction bundle. May be repeated.
                         Omit to auto-discover matching priority bundles.
  --out-dir <path>       Report output directory. Default: reports/<priority>-vault-publish-plan-<timestamp>
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

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/\/+/g, "/");
}

function sourceIdentityForPath(sourcePath) {
  const sp = normalizePath(sourcePath);
  const prefix = "raw/sources/";
  const key = sp.toLowerCase();
  if (key.startsWith(prefix)) return sp.slice(prefix.length);
  const marker = "/raw/sources/";
  const markerIndex = key.indexOf(marker);
  if (markerIndex >= 0) return sp.slice(markerIndex + marker.length);
  return sp.split("/").pop() || "source";
}

function sourceReferenceIdentity(sourceReference) {
  const ref = normalizePath(sourceReference);
  const prefix = "raw/sources/";
  const key = ref.toLowerCase();
  if (key.startsWith(prefix)) return ref.slice(prefix.length);
  const marker = "/raw/sources/";
  const markerIndex = key.indexOf(marker);
  if (markerIndex >= 0) return ref.slice(markerIndex + marker.length);
  return ref;
}

function sourceSummarySlugFromIdentity(sourceIdentity) {
  const withoutExt = sourceIdentity.replace(/\.[^/.]+$/, "");
  const parts = withoutExt
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length <= 1) return parts[0] || "source";

  const hash = stableSlugHash(sourceIdentity);
  const slug = parts
    .map((part) => {
      const encoded = encodeURIComponent(part).replace(/[!'()*]/g, (char) =>
        `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
      );
      return `${encoded.length}-${encoded}`;
    })
    .join("--");
  const fullSlug = `${slug}--${hash}`;
  if (fullSlug.length <= MAX_SOURCE_SUMMARY_SLUG_LENGTH) return fullSlug;

  const readableLimit = MAX_SOURCE_SUMMARY_SLUG_LENGTH - hash.length - 2;
  const readablePrefix = trimIncompletePercentEncoding(slug.slice(0, readableLimit))
    .replace(/-+$/, "")
    .replace(/%$/, "");
  return `${readablePrefix || "source"}--${hash}`;
}

function trimIncompletePercentEncoding(value) {
  return value.replace(/%(?:[0-9A-F])?$/i, "");
}

function stableSlugHash(value) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function simpleSlug(value, fallback = "item") {
  const ascii = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\uAC00-\uD7A3]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
  if (ascii) return ascii;
  return `${fallback}-${stableSlugHash(String(value || fallback))}`;
}

function discoverBundles(priority = DEFAULT_PRIORITY) {
  if (!fs.existsSync(REPORTS_ROOT)) return [];
  return fs.readdirSync(REPORTS_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(REPORTS_ROOT, entry.name))
    .filter((dir) => {
      const name = path.basename(dir);
      if (priority === "p0") return /^p0-pilot-eval-300-/.test(name) || /^p0-pilot-eval-p0-r\d+-r\d+-/.test(name);
      const re = new RegExp(`^${priority}-pilot-eval-${priority}-r\\d+-r\\d+-`);
      return re.test(name);
    })
    .filter((dir) => fs.existsSync(path.join(dir, "manifest.json")))
    .sort((a, b) => bundleStartRank(a, priority) - bundleStartRank(b, priority));
}

function bundleStartRank(bundleDir, priority = DEFAULT_PRIORITY) {
  const name = path.basename(bundleDir);
  if (priority === "p0" && /^p0-pilot-eval-300-/.test(name)) return 1;
  const match = new RegExp(`^${priority}-pilot-eval-${priority}-r(\\d+)-r`).exec(name);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function outputPathFor(bundleDir, row) {
  return path.join(bundleDir, row.expectedOutputPath || `outputs/${row.pilotRank}-${row.canonicalGroupId}.json`);
}

function validateExtraction(obj, row) {
  const errors = [];
  const requiredTop = ["source", "document", "sourceSummary", "entities", "concepts", "evidence", "reviewFlags"];
  for (const key of requiredTop) if (!(key in obj)) errors.push(`missing top-level key: ${key}`);
  if (obj.source?.queueId !== row.queueId) errors.push("source.queueId mismatch");
  if (obj.source?.sourcePath !== row.sourcePath) errors.push("source.sourcePath mismatch");
  if (obj.source?.canonicalGroupId !== row.canonicalGroupId) errors.push("source.canonicalGroupId mismatch");
  if (!obj.sourceSummary?.oneLine) errors.push("sourceSummary.oneLine missing");
  for (const key of ["entities", "concepts", "evidence", "reviewFlags"]) {
    if (!Array.isArray(obj[key])) errors.push(`${key} must be an array`);
  }
  if (!Array.isArray(obj.evidence) || obj.evidence.length === 0) errors.push("evidence missing");
  return errors;
}

function existingWikiPath(vaultRoot, relPath) {
  return fs.existsSync(path.join(vaultRoot, ...relPath.split("/")));
}

function addPlan(planned, relPath, type, sourceQueueId, sourcePath, detail = {}) {
  if (!relPath.startsWith("wiki/")) throw new Error(`Unsafe non-wiki path planned: ${relPath}`);
  const key = `${type}\t${relPath}\t${sourceQueueId || ""}`;
  if (planned.seen.has(key)) return;
  planned.seen.add(key);
  planned.items.push({
    relPath,
    type,
    sourceQueueId,
    sourcePath,
    ...detail,
  });
}

function loadExtractions(bundleDirs) {
  const byQueueId = new Map();
  const byCanonicalGroupId = new Map();
  const validationErrors = [];
  const bundleSummaries = [];

  for (const bundleDir of bundleDirs) {
    const manifest = readJson(path.join(bundleDir, "manifest.json"));
    const rows = Array.isArray(manifest) ? manifest : [];
    let loaded = 0;
    let invalid = 0;
    for (const row of rows) {
      const outputPath = outputPathFor(bundleDir, row);
      if (!fs.existsSync(outputPath)) {
        invalid += 1;
        validationErrors.push({ bundleDir, pilotRank: row.pilotRank, queueId: row.queueId, errors: ["missing output"] });
        continue;
      }
      let obj;
      try {
        obj = readJson(outputPath);
      } catch (err) {
        invalid += 1;
        validationErrors.push({ bundleDir, pilotRank: row.pilotRank, queueId: row.queueId, errors: [err.message] });
        continue;
      }
      const errors = validateExtraction(obj, row);
      if (errors.length) {
        invalid += 1;
        validationErrors.push({ bundleDir, pilotRank: row.pilotRank, queueId: row.queueId, errors });
        continue;
      }
      const record = {
        bundleDir: normalizePath(bundleDir),
        outputPath: normalizePath(outputPath),
        pilotRank: row.pilotRank,
        queueId: row.queueId,
        sourcePath: row.sourcePath,
        canonicalGroupId: row.canonicalGroupId,
        row,
        extraction: obj,
      };
      byQueueId.set(row.queueId, record);
      byCanonicalGroupId.set(row.canonicalGroupId, record);
      loaded += 1;
    }
    bundleSummaries.push({
      bundleDir: normalizePath(bundleDir),
      rows: rows.length,
      loaded,
      invalid,
      startRank: rows.length ? Math.min(...rows.map((row) => row.pilotRank)) : 0,
      endRank: rows.length ? Math.max(...rows.map((row) => row.pilotRank)) : 0,
    });
  }

  return { byQueueId, byCanonicalGroupId, validationErrors, bundleSummaries };
}

function summarizeQueue(vaultRoot) {
  const queuePath = path.join(vaultRoot, ".llm-wiki", "ingest-queue.json");
  if (!fs.existsSync(queuePath)) return { exists: false };
  const queue = readJson(queuePath);
  const counts = {};
  for (const item of Array.isArray(queue) ? queue : []) {
    counts[item.status || "unknown"] = (counts[item.status || "unknown"] || 0) + 1;
  }
  return { exists: true, total: Array.isArray(queue) ? queue.length : 0, counts };
}

function taskState(name) {
  return new Promise((resolve) => {
    const { spawn } = require("child_process");
    const ps = spawn("powershell.exe", [
      "-NoProfile",
      "-Command",
      `$t=Get-ScheduledTask -TaskName '${name}' -ErrorAction SilentlyContinue; if($t){[string]$t.State}else{'Missing'}`,
    ], { windowsHide: true });
    let stdout = "";
    ps.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    ps.on("close", () => resolve(stdout.trim() || "Unknown"));
    ps.on("error", () => resolve("Unknown"));
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const vaultRoot = args.vaultRoot;
  const label = priorityLabel(args.priority);
  const triageFile = path.join(args.triageDir, `${args.priority}-disposition-full.json`);
  const dispositionRows = readJson(triageFile);
  if (!Array.isArray(dispositionRows)) throw new Error(`Disposition must be an array: ${triageFile}`);

  const bundleDirs = args.bundles.length ? args.bundles : discoverBundles(args.priority);
  const extractionState = loadExtractions(bundleDirs);
  const planned = { items: [], seen: new Set() };
  const dispositionCounts = {};
  const missingRepresentativeOutputs = [];
  const representativeQueueIds = new Set();

  for (const row of dispositionRows) {
    dispositionCounts[row.disposition] = (dispositionCounts[row.disposition] || 0) + 1;
    if (row.disposition === "full_wiki_candidate") representativeQueueIds.add(row.queueId);
  }

  for (const row of dispositionRows) {
    const sourcePath = row.sourcePath;
    const sourceIdentity = sourceIdentityForPath(sourcePath);
    const sourceSlug = sourceSummarySlugFromIdentity(sourceIdentity);
    const sourcePage = `wiki/sources/${sourceSlug}.md`;
    const representative =
      extractionState.byQueueId.get(row.representativeQueueId || row.queueId) ||
      extractionState.byCanonicalGroupId.get(row.canonicalGroupId);

    if (row.disposition === "full_wiki_candidate") {
      if (!representative) {
        missingRepresentativeOutputs.push({
          queueId: row.queueId,
          sourcePath: row.sourcePath,
          canonicalGroupId: row.canonicalGroupId,
        });
        continue;
      }
      const obj = representative.extraction;
      addPlan(planned, sourcePage, "representative-source-summary", row.queueId, sourcePath, {
        canonicalGroupId: row.canonicalGroupId,
        title: obj.document?.title || obj.sourceSummary?.oneLine || sourceIdentity,
        evidenceCount: Array.isArray(obj.evidence) ? obj.evidence.length : 0,
        reviewFlagCount: Array.isArray(obj.reviewFlags) ? obj.reviewFlags.length : 0,
      });
      for (const entity of obj.entities || []) {
        const entityPath = `wiki/entities/${simpleSlug(entity.name, "entity")}.md`;
        addPlan(planned, entityPath, "entity", row.queueId, sourcePath, {
          name: entity.name,
          canonicalGroupId: row.canonicalGroupId,
        });
      }
      for (const concept of obj.concepts || []) {
        const conceptName = concept.pageTarget || concept.name;
        const conceptPath = `wiki/concepts/${simpleSlug(conceptName, "concept")}.md`;
        addPlan(planned, conceptPath, "concept", row.queueId, sourcePath, {
          name: conceptName,
          canonicalGroupId: row.canonicalGroupId,
        });
      }
      for (const evidence of obj.evidence || []) {
        const findingPath = `wiki/findings/${simpleSlug(evidence.claim, "finding")}.md`;
        addPlan(planned, findingPath, "finding", row.queueId, sourcePath, {
          claim: evidence.claim,
          confidence: evidence.confidence || "",
          canonicalGroupId: row.canonicalGroupId,
        });
      }
    } else if (row.disposition === "canonical_duplicate") {
      if (!representative) {
        missingRepresentativeOutputs.push({
          queueId: row.queueId,
          sourcePath: row.sourcePath,
          representativeQueueId: row.representativeQueueId,
          canonicalGroupId: row.canonicalGroupId,
        });
      }
      const repIdentity = sourceIdentityForPath(row.representativeSourcePath || representative?.sourcePath || "");
      addPlan(planned, sourcePage, "canonical-duplicate-source-stub", row.queueId, sourcePath, {
        canonicalGroupId: row.canonicalGroupId,
        representativeQueueId: row.representativeQueueId,
        representativeSourceIdentity: repIdentity,
        representativeSourcePage: repIdentity ? `wiki/sources/${sourceSummarySlugFromIdentity(repIdentity)}.md` : "",
      });
    } else if (row.disposition === "needs_review_low_text") {
      addPlan(planned, sourcePage, "low-text-review-stub", row.queueId, sourcePath, {
        canonicalGroupId: row.canonicalGroupId,
        reason: row.dispositionReason || "low text",
      });
    } else if (row.disposition === "needs_recovery_empty_text") {
      addPlan(planned, sourcePage, "empty-text-recovery-stub", row.queueId, sourcePath, {
        canonicalGroupId: row.canonicalGroupId,
        reason: row.dispositionReason || "empty text",
      });
    }
  }

  const relPathCounts = new Map();
  for (const item of planned.items) {
    relPathCounts.set(item.relPath, (relPathCounts.get(item.relPath) || 0) + 1);
  }
  const pathCollisions = [...relPathCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([relPath, count]) => ({ relPath, count }));

  const plannedWithStatus = planned.items.map((item) => ({
    ...item,
    action: existingWikiPath(vaultRoot, item.relPath) ? "update-or-merge" : "create",
  }));

  const contributionActionCounts = {};
  const contributionTypeCounts = {};
  for (const item of plannedWithStatus) {
    contributionActionCounts[item.action] = (contributionActionCounts[item.action] || 0) + 1;
    contributionTypeCounts[item.type] = (contributionTypeCounts[item.type] || 0) + 1;
  }

  const uniqueByPath = new Map();
  for (const item of plannedWithStatus) {
    if (!uniqueByPath.has(item.relPath)) {
      uniqueByPath.set(item.relPath, {
        relPath: item.relPath,
        action: item.action,
        contributionCount: 0,
        types: {},
      });
    }
    const entry = uniqueByPath.get(item.relPath);
    entry.contributionCount += 1;
    entry.types[item.type] = (entry.types[item.type] || 0) + 1;
  }
  const uniqueActionCounts = {};
  for (const item of uniqueByPath.values()) {
    uniqueActionCounts[item.action] = (uniqueActionCounts[item.action] || 0) + 1;
  }

  const queue = summarizeQueue(vaultRoot);
  const readyFlag = fs.existsSync(path.join(vaultRoot, ".llm-wiki", "ingest-ready.flag"));
  const appRunning = require("child_process")
    .spawnSync("powershell.exe", ["-NoProfile", "-Command", "[bool](Get-Process -Name 'llm-wiki' -ErrorAction SilentlyContinue)"], { encoding: "utf8", windowsHide: true })
    .stdout.trim() === "True";
  const scheduledTasks = {
    "LLM-Wiki-Watchdog": await taskState("LLM-Wiki-Watchdog"),
    "LLM-Wiki-Startup": await taskState("LLM-Wiki-Startup"),
    "LLM-Wiki-Auth-Check": await taskState("LLM-Wiki-Auth-Check"),
  };

  const gateFailures = [];
  const gateWarnings = [];
  if (extractionState.validationErrors.length) gateFailures.push(`invalid extraction outputs: ${extractionState.validationErrors.length}`);
  if (extractionState.byQueueId.size !== representativeQueueIds.size) {
    gateFailures.push(`representative extraction count mismatch: loaded ${extractionState.byQueueId.size}, expected ${representativeQueueIds.size}`);
  }
  if (missingRepresentativeOutputs.length) gateFailures.push(`missing representative outputs: ${missingRepresentativeOutputs.length}`);
  if (pathCollisions.length) gateWarnings.push(`planned path collisions requiring merge: ${pathCollisions.length}`);
  if (readyFlag) gateFailures.push("ingest-ready.flag exists");
  if (appRunning) gateFailures.push("llm-wiki is running");
  if (queue.exists && (queue.counts.processing || 0) > 0) {
    gateWarnings.push(`live queue has processing items: ${queue.counts.processing}`);
  }
  for (const [name, state] of Object.entries(scheduledTasks)) {
    if (state !== "Disabled") gateWarnings.push(`${name} is ${state}`);
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    mode: "dry-run",
    priority: args.priority,
    vaultRoot,
    triageDir: normalizePath(args.triageDir),
    bundles: extractionState.bundleSummaries,
    disposition: {
      total: dispositionRows.length,
      counts: dispositionCounts,
    },
    representatives: {
      expected: representativeQueueIds.size,
      loaded: extractionState.byQueueId.size,
      missing: missingRepresentativeOutputs.length,
    },
    planned: {
      totalContributions: plannedWithStatus.length,
      uniqueFiles: uniqueByPath.size,
      contributionActionCounts,
      uniqueActionCounts,
      contributionTypeCounts,
      pathCollisions: pathCollisions.slice(0, 100),
    },
    vaultState: {
      appRunning,
      ingestReadyFlag: readyFlag,
      scheduledTasks,
      queue,
    },
    gate: {
      dryRunPass: gateFailures.length === 0,
      failures: gateFailures,
      warnings: gateWarnings,
    },
  };

  fs.mkdirSync(args.outDir, { recursive: true });
  writeJson(path.join(args.outDir, "publish-plan-summary.json"), summary);
  writeJson(path.join(args.outDir, "publish-plan-items.json"), plannedWithStatus);
  writeJson(path.join(args.outDir, "missing-representative-outputs.json"), missingRepresentativeOutputs);
  writeReport(path.join(args.outDir, "publish-plan-report.md"), summary);
  console.log(JSON.stringify(summary, null, 2));
}

function writeReport(file, summary) {
  const lines = [
    `# ${priorityLabel(summary.priority || DEFAULT_PRIORITY)} Vault Publish Dry-Run Plan`,
    "",
    `Generated: ${summary.generatedAt}`,
    `Mode: ${summary.mode}`,
    `Vault: \`${summary.vaultRoot}\``,
    "",
    "## Gate",
    "",
    `- dry-run pass: ${summary.gate.dryRunPass}`,
    `- failures: ${summary.gate.failures.length}`,
    `- warnings: ${summary.gate.warnings.length}`,
    ...summary.gate.failures.map((item) => `  - FAILURE: ${item}`),
    ...summary.gate.warnings.map((item) => `  - WARNING: ${item}`),
    "",
    "## Disposition",
    "",
    `- total ${priorityLabel(summary.priority || DEFAULT_PRIORITY)} sources: ${summary.disposition.total}`,
    ...Object.entries(summary.disposition.counts).map(([name, count]) => `- ${name}: ${count}`),
    "",
    "## Representative Outputs",
    "",
    `- expected: ${summary.representatives.expected}`,
    `- loaded: ${summary.representatives.loaded}`,
    `- missing: ${summary.representatives.missing}`,
    "",
    "## Planned Wiki Work",
    "",
    `- total planned contributions: ${summary.planned.totalContributions}`,
    `- unique wiki file paths: ${summary.planned.uniqueFiles}`,
    "",
    "### Unique File Actions",
    "",
    ...Object.entries(summary.planned.uniqueActionCounts).map(([name, count]) => `- ${name}: ${count}`),
    "",
    "### Contribution Actions",
    "",
    ...Object.entries(summary.planned.contributionActionCounts).map(([name, count]) => `- ${name}: ${count}`),
    "",
    "### By Type",
    "",
    ...Object.entries(summary.planned.contributionTypeCounts).map(([name, count]) => `- ${name}: ${count}`),
    "",
    "## Vault State",
    "",
    `- llm-wiki running: ${summary.vaultState.appRunning}`,
    `- ingest-ready.flag: ${summary.vaultState.ingestReadyFlag}`,
    `- queue total: ${summary.vaultState.queue.total ?? "missing"}`,
    `- queue counts: ${JSON.stringify(summary.vaultState.queue.counts || {})}`,
    ...Object.entries(summary.vaultState.scheduledTasks).map(([name, state]) => `- ${name}: ${state}`),
    "",
    "## Bundles",
    "",
    ...summary.bundles.map((bundle) => `- ${bundle.bundleDir}: ${bundle.loaded}/${bundle.rows} loaded, invalid ${bundle.invalid}`),
    "",
  ];
  fs.writeFileSync(file, `${lines.join("\n")}\n`, "utf8");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack || err.message : err);
  process.exit(1);
});
