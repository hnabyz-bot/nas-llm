#!/usr/bin/env node
// Summarize and validate a prepared P0 extraction bundle from files on disk.
//
// This script does not call an LLM, does not touch the app queue, and does not
// modify the vault. It aggregates manifest, run results, JSON outputs, source
// traceability validation, evidence/review-flag counts, and page-marker leakage.

const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = {
    bundleDir: "",
    writeReport: true,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--bundle-dir") args.bundleDir = argv[++i];
    else if (arg === "--no-report") args.writeReport = false;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!args.bundleDir) throw new Error("Missing required --bundle-dir <path>");
  return args;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/summarize-p0-eval.js --bundle-dir reports\\p0-pilot-eval-300-20260618173500

Options:
  --bundle-dir <path>   Evaluation bundle to summarize.
  --no-report           Only print summary; do not write evaluation-summary.json or qa-report.md.
`);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function round1(value) {
  return Number(value.toFixed(1));
}

function outputPathFor(bundleDir, row) {
  return path.join(bundleDir, row.expectedOutputPath || `outputs/${String(row.pilotRank).padStart(3, "0")}-${row.canonicalGroupId}.json`);
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
  if (Array.isArray(obj.evidence)) {
    obj.evidence.forEach((item, index) => {
      if (!item.claim) errors.push(`evidence[${index}].claim missing`);
      if (!item.evidenceText) errors.push(`evidence[${index}].evidenceText missing`);
      if (!item.pageTarget) errors.push(`evidence[${index}].pageTarget missing`);
    });
  }
  return errors;
}

function collectStrings(value, out = []) {
  if (typeof value === "string") {
    out.push(value);
  } else if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, out));
  } else if (value && typeof value === "object") {
    Object.values(value).forEach((item) => collectStrings(item, out));
  }
  return out;
}

function pageMarkerLeakage(obj) {
  const preprocessorPartMarker = /^---\s*preprocessed part:/i;
  const sourceWrapper = /^\[source:[^\]]+\]$/i;
  const barePartMarker = /^--\s*\d+\s+of\s+\d+\s*--$/i;
  return collectStrings(obj)
    .map((text) => text.replace(/\s+/g, " ").trim())
    .filter((text) => preprocessorPartMarker.test(text) || sourceWrapper.test(text) || barePartMarker.test(text))
    .slice(0, 20);
}

function topCounts(values, limit = 20) {
  const counts = new Map();
  values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

function secondsBetween(startedAt, finishedAt) {
  const start = Date.parse(startedAt || "");
  const end = Date.parse(finishedAt || "");
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return (end - start) / 1000;
}

function main() {
  const args = parseArgs(process.argv);
  const manifestPath = path.join(args.bundleDir, "manifest.json");
  const manifest = readJson(manifestPath);
  if (!Array.isArray(manifest)) throw new Error(`Manifest must be an array: ${manifestPath}`);

  const resultsPath = path.join(args.bundleDir, "run-results.json");
  const runResults = fs.existsSync(resultsPath) ? readJson(resultsPath) : [];
  const resultByRank = new Map(runResults.map((row) => [row.pilotRank, row]));

  const validationErrors = [];
  const pageMarkerLeaks = [];
  const missingEvidence = [];
  const documentTypes = [];
  const authorities = [];
  const evidenceCounts = [];
  const reviewFlagCounts = [];
  let jsonOutputs = 0;
  let jsonParsePass = 0;

  for (const row of manifest) {
    const outputPath = outputPathFor(args.bundleDir, row);
    if (!fs.existsSync(outputPath)) continue;
    jsonOutputs += 1;
    let obj = null;
    try {
      obj = readJson(outputPath);
      jsonParsePass += 1;
    } catch (err) {
      validationErrors.push({
        pilotRank: row.pilotRank,
        queueId: row.queueId,
        outputPath: path.relative(args.bundleDir, outputPath).replace(/\\/g, "/"),
        errors: [err instanceof Error ? err.message : String(err)],
      });
      continue;
    }

    const errors = validateExtraction(obj, row);
    if (errors.length) {
      validationErrors.push({
        pilotRank: row.pilotRank,
        queueId: row.queueId,
        outputPath: path.relative(args.bundleDir, outputPath).replace(/\\/g, "/"),
        errors,
      });
    }

    const leaks = pageMarkerLeakage(obj);
    if (leaks.length) {
      pageMarkerLeaks.push({
        pilotRank: row.pilotRank,
        queueId: row.queueId,
        outputPath: path.relative(args.bundleDir, outputPath).replace(/\\/g, "/"),
        markers: leaks,
      });
    }

    const evidenceCount = Array.isArray(obj.evidence) ? obj.evidence.length : 0;
    const reviewFlagCount = Array.isArray(obj.reviewFlags) ? obj.reviewFlags.length : 0;
    evidenceCounts.push(evidenceCount);
    reviewFlagCounts.push(reviewFlagCount);
    if (evidenceCount === 0) {
      missingEvidence.push({
        pilotRank: row.pilotRank,
        queueId: row.queueId,
        outputPath: path.relative(args.bundleDir, outputPath).replace(/\\/g, "/"),
      });
    }
    documentTypes.push(obj.document?.documentType);
    if (Array.isArray(obj.document?.authorityOrJurisdiction)) {
      authorities.push(...obj.document.authorityOrJurisdiction);
    }
  }

  const passResults = runResults.filter((row) => row.status === "pass");
  const failResults = runResults.filter((row) => row.status !== "pass");
  const chunkedPass = runResults.filter((row) => row.status === "pass" && row.mode === "chunked");
  const runtimes = runResults
    .map((row) => secondsBetween(row.startedAt, row.finishedAt))
    .filter((value) => value !== null);

  const totalEvidence = evidenceCounts.reduce((sum, count) => sum + count, 0);
  const totalReviewFlags = reviewFlagCounts.reduce((sum, count) => sum + count, 0);
  const totalRuntime = runtimes.reduce((sum, seconds) => sum + seconds, 0);

  const summary = {
    generatedAt: new Date().toISOString(),
    bundleDir: args.bundleDir.replace(/\\/g, "/"),
    manifestRows: manifest.length,
    manifestRankRange: manifest.length ? {
      start: Math.min(...manifest.map((row) => row.pilotRank)),
      end: Math.max(...manifest.map((row) => row.pilotRank)),
    } : { start: 0, end: 0 },
    jsonOutputs,
    jsonParsePass,
    runResults: runResults.length,
    pass: passResults.length,
    fail: failResults.length,
    chunkedPass: chunkedPass.length,
    validationInvalid: validationErrors.length,
    validationErrors,
    pageMarkerLeakage: {
      count: pageMarkerLeaks.length,
      items: pageMarkerLeaks,
    },
    missingEvidence: {
      count: missingEvidence.length,
      items: missingEvidence,
    },
    evidence: {
      total: totalEvidence,
      average: evidenceCounts.length ? round1(totalEvidence / evidenceCounts.length) : 0,
      min: evidenceCounts.length ? Math.min(...evidenceCounts) : 0,
      max: evidenceCounts.length ? Math.max(...evidenceCounts) : 0,
    },
    reviewFlags: {
      total: totalReviewFlags,
      average: reviewFlagCounts.length ? round1(totalReviewFlags / reviewFlagCounts.length) : 0,
    },
    runtimeSeconds: {
      average: runtimes.length ? round1(totalRuntime / runtimes.length) : 0,
      min: runtimes.length ? round1(Math.min(...runtimes)) : 0,
      max: runtimes.length ? round1(Math.max(...runtimes)) : 0,
      total: round1(totalRuntime),
    },
    topDocumentTypes: topCounts(documentTypes),
    topAuthorities: topCounts(authorities),
    failedRunResults: failResults.map((row) => ({
      pilotRank: row.pilotRank,
      queueId: row.queueId,
      status: row.status,
      timedOut: row.timedOut,
      parseError: row.parseError,
      validationErrors: row.validationErrors || [],
    })),
  };

  if (args.writeReport) {
    writeJson(path.join(args.bundleDir, "evaluation-summary.json"), summary);
    const report = [
      "# P0 Evaluation QA Report",
      "",
      `Generated: ${summary.generatedAt}`,
      `Bundle: \`${summary.bundleDir}\``,
      `Rank range: ${summary.manifestRankRange.start}-${summary.manifestRankRange.end}`,
      "",
      "## Gate Summary",
      "",
      `- Manifest rows: ${summary.manifestRows}`,
      `- JSON outputs: ${summary.jsonOutputs}`,
      `- JSON parse pass: ${summary.jsonParsePass}`,
      `- Run pass/fail: ${summary.pass}/${summary.fail}`,
      `- Chunked fallback pass: ${summary.chunkedPass}`,
      `- Source/required-field validation errors: ${summary.validationInvalid}`,
      `- Page-marker leakage items: ${summary.pageMarkerLeakage.count}`,
      `- Missing evidence outputs: ${summary.missingEvidence.count}`,
      `- Evidence records: ${summary.evidence.total}`,
      `- Review flags: ${summary.reviewFlags.total}`,
      "",
      "## Runtime",
      "",
      `- Total seconds: ${summary.runtimeSeconds.total}`,
      `- Average seconds/source: ${summary.runtimeSeconds.average}`,
      `- Min seconds/source: ${summary.runtimeSeconds.min}`,
      `- Max seconds/source: ${summary.runtimeSeconds.max}`,
      "",
    ].join("\n");
    fs.writeFileSync(path.join(args.bundleDir, "qa-report.md"), report, "utf8");
  }

  console.log(JSON.stringify(summary, null, 2));
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.stack || err.message : String(err));
  process.exit(1);
}
