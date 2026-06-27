#!/usr/bin/env node
// Materialize QA-passed priority staging extraction outputs into the live vault wiki.
//
// Default mode is dry-run. Use --apply to write D:\vault\llm-wiki-vault\wiki.
// The script does not start llm-wiki and does not modify raw sources. It stages
// app-compatible Markdown pages with frontmatter source traceability and an
// idempotent priority staging section.

const fs = require("fs");
const path = require("path");

const DEFAULT_VAULT = "D:\\vault\\llm-wiki-vault";
const DEFAULT_TRIAGE_DIR = "reports\\p0-meaningful-triage-20260618153500";
const DEFAULT_PRIORITY = "p0";
const REPORTS_ROOT = "reports";
const MAX_SOURCE_SUMMARY_SLUG_LENGTH = 120;
let CURRENT_PRIORITY = DEFAULT_PRIORITY;

function parseArgs(argv) {
  const args = {
    vaultRoot: DEFAULT_VAULT,
    triageDir: DEFAULT_TRIAGE_DIR,
    priority: DEFAULT_PRIORITY,
    outDir: "",
    apply: false,
    maxItems: 0,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--vaultRoot") args.vaultRoot = argv[++i];
    else if (arg === "--triage-dir") args.triageDir = argv[++i];
    else if (arg === "--priority") args.priority = normalizePriority(argv[++i]);
    else if (arg === "--out-dir") args.outDir = argv[++i];
    else if (arg === "--apply") args.apply = true;
    else if (arg === "--max-items") args.maxItems = Number(argv[++i]);
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!args.outDir) {
    args.outDir = path.join(REPORTS_ROOT, `${args.priority}-vault-materialize-${timestamp()}`);
  }
  return args;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/materialize-p0-vault-publish.js [options]

Options:
  --vaultRoot <path>     Vault root. Default: ${DEFAULT_VAULT}
  --triage-dir <path>    Priority triage report directory. Default: ${DEFAULT_TRIAGE_DIR}
  --priority <p0|p1>     Priority prefix. Default: ${DEFAULT_PRIORITY}
  --out-dir <path>       Report output directory. Default: reports/<priority>-vault-materialize-<timestamp>
  --apply                Write wiki files. Omit for dry-run.
  --max-items <n>        Diagnostic cap for planned contributions. Default: no cap.
`);
}

function normalizePriority(value) {
  const normalized = String(value || DEFAULT_PRIORITY).trim().toLowerCase();
  if (!/^p\d+$/.test(normalized)) throw new Error(`Invalid --priority: ${value}`);
  return normalized;
}

function priorityLabel() {
  return CURRENT_PRIORITY.toUpperCase();
}

function publishMarker() {
  return `${priorityLabel()}-STAGING-PUBLISH`;
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

function fullPath(vaultRoot, relPath) {
  return path.join(vaultRoot, ...relPath.split("/"));
}

function ensureDirFor(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
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

function sourceSummarySlugFromIdentity(sourceIdentity) {
  const withoutExt = sourceIdentity.replace(/\.[^/.]+$/, "");
  const parts = withoutExt.split("/").map((part) => part.trim()).filter(Boolean);
  if (parts.length <= 1) return sanitizePathPart(parts[0] || "source");

  const hash = stableSlugHash(sourceIdentity);
  const slug = parts.map((part) => {
    const encoded = encodeURIComponent(part).replace(/[!'()*]/g, (char) =>
      `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    return `${encoded.length}-${encoded}`;
  }).join("--");
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

function sanitizePathPart(value, fallback = "item") {
  const slug = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\uAC00-\uD7A3]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
  return slug || `${fallback}-${stableSlugHash(String(value || fallback))}`;
}

function discoverBundles(priority = CURRENT_PRIORITY) {
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

function bundleStartRank(bundleDir, priority = CURRENT_PRIORITY) {
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

function loadExtractions(bundleDirs) {
  const byQueueId = new Map();
  const byCanonicalGroupId = new Map();
  const validationErrors = [];
  const bundles = [];
  for (const bundleDir of bundleDirs) {
    const manifest = readJson(path.join(bundleDir, "manifest.json"));
    let loaded = 0;
    let invalid = 0;
    for (const row of manifest) {
      const outputPath = outputPathFor(bundleDir, row);
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
        extraction: obj,
      };
      byQueueId.set(row.queueId, record);
      byCanonicalGroupId.set(row.canonicalGroupId, record);
      loaded += 1;
    }
    bundles.push({ bundleDir: normalizePath(bundleDir), rows: manifest.length, loaded, invalid });
  }
  return { byQueueId, byCanonicalGroupId, validationErrors, bundles };
}

function yamlString(value) {
  return JSON.stringify(String(value ?? ""));
}

function yamlArray(values) {
  const uniq = [...new Set((values || []).map((v) => String(v || "").trim()).filter(Boolean))].sort();
  return `[${uniq.map(yamlString).join(", ")}]`;
}

function frontmatter(type, title, sources, tags = []) {
  const today = new Date().toISOString().slice(0, 10);
  return [
    "---",
    `type: ${yamlString(type)}`,
    `title: ${yamlString(title || "Untitled")}`,
    `created: ${yamlString(today)}`,
    `updated: ${yamlString(today)}`,
    `tags: ${yamlArray([`${CURRENT_PRIORITY}-staging-publish`, ...tags])}`,
    `sources: ${yamlArray(sources)}`,
    "related: []",
    "---",
    "",
  ].join("\n");
}

function extractFrontmatter(content) {
  if (!content.startsWith("---\n")) return null;
  const end = content.indexOf("\n---\n", 4);
  if (end < 0) return null;
  return {
    raw: content.slice(0, end + 5),
    body: content.slice(end + 5).replace(/^\n+/, ""),
  };
}

function parseArrayLine(fm, key) {
  const lineMatch = new RegExp(`^${key}:\\s*(.*)$`, "m").exec(fm);
  if (!lineMatch) return [];
  const value = lineMatch[1].trim();
  if (!value.startsWith("[")) return [];
  try {
    const parsed = JSON.parse(value.replace(/'/g, '"'));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return value.replace(/^\[|\]$/g, "").split(",").map((part) => part.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  }
}

function mergeExistingFrontmatter(existingContent, fallbackType, fallbackTitle, sources, tags) {
  const parsed = extractFrontmatter(existingContent);
  if (!parsed) return frontmatter(fallbackType, fallbackTitle, sources, tags) + existingContent.replace(/^\n+/, "");
  let fm = parsed.raw.slice(0, -5);
  const mergedSources = [...parseArrayLine(fm, "sources"), ...sources];
  const mergedTags = [...parseArrayLine(fm, "tags"), `${CURRENT_PRIORITY}-staging-publish`, ...tags];
  const today = new Date().toISOString().slice(0, 10);

  if (/^sources:\s*/m.test(fm)) fm = fm.replace(/^sources:\s*.*$/m, `sources: ${yamlArray(mergedSources)}`);
  else fm += `\nsources: ${yamlArray(mergedSources)}`;
  if (/^tags:\s*/m.test(fm)) fm = fm.replace(/^tags:\s*.*$/m, `tags: ${yamlArray(mergedTags)}`);
  else fm += `\ntags: ${yamlArray(mergedTags)}`;
  if (/^updated:\s*/m.test(fm)) fm = fm.replace(/^updated:\s*.*$/m, `updated: ${yamlString(today)}`);
  else fm += `\nupdated: ${yamlString(today)}`;
  return `${fm}\n---\n\n${parsed.body}`;
}

function sectionMarkers(sectionId) {
  const safe = sectionId.replace(/[^a-zA-Z0-9_.:-]/g, "-");
  return {
    begin: `<!-- ${publishMarker()}:${safe}:BEGIN -->`,
    end: `<!-- ${publishMarker()}:${safe}:END -->`,
  };
}

function upsertSection(content, sectionId, section) {
  const { begin, end } = sectionMarkers(sectionId);
  const block = `${begin}\n${section.trimEnd()}\n${end}`;
  const pattern = new RegExp(`${escapeRegExp(begin)}[\\s\\S]*?${escapeRegExp(end)}`);
  if (pattern.test(content)) return content.replace(pattern, block);
  return `${content.trimEnd()}\n\n${block}\n`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mdEscape(value) {
  return String(value ?? "").replace(/\r/g, "").trim();
}

function quoteInline(value) {
  return mdEscape(value).replace(/\n+/g, " ").slice(0, 800);
}

function buildRepresentativeSourceSection(contribs) {
  const c = contribs[0];
  const obj = c.extraction;
  const doc = obj.document || {};
  const summary = obj.sourceSummary || {};
  const lines = [
    `## ${priorityLabel()} Staging Source Summary`,
    "",
    `- queueId: \`${c.queueId}\``,
    `- canonicalGroupId: \`${c.canonicalGroupId}\``,
    `- source identity: \`${c.sourceIdentity}\``,
    `- document title: ${quoteInline(doc.title) || "(not extracted)"}`,
    `- document type: ${quoteInline(doc.documentType) || "(not extracted)"}`,
    `- revision/version: ${quoteInline(doc.revisionOrVersion) || "(not extracted)"}`,
    `- document date: ${quoteInline(doc.documentDate) || "(not extracted)"}`,
    `- product models: ${Array.isArray(doc.productModels) && doc.productModels.length ? doc.productModels.map(quoteInline).join(", ") : "(not extracted)"}`,
    `- authority/jurisdiction: ${Array.isArray(doc.authorityOrJurisdiction) && doc.authorityOrJurisdiction.length ? doc.authorityOrJurisdiction.map(quoteInline).join(", ") : "(not extracted)"}`,
    `- standards: ${Array.isArray(doc.standards) && doc.standards.length ? doc.standards.map(quoteInline).join(", ") : "(not extracted)"}`,
    "",
    "### One Line",
    "",
    mdEscape(summary.oneLine || ""),
    "",
    "### Official Use",
    "",
    mdEscape(summary.officialUse || ""),
    "",
    "### Key Points",
    "",
    ...(summary.keyPoints || []).map((item) => `- ${quoteInline(item)}`),
    "",
    "### Evidence",
    "",
    ...(obj.evidence || []).map((item) => `- **${quoteInline(item.pageTarget)}** (${quoteInline(item.confidence)}): ${quoteInline(item.claim)} - ${quoteInline(item.evidenceText)}`),
  ];
  if (obj.reviewFlags?.length) {
    lines.push("", "### Review Flags", "");
    for (const flag of obj.reviewFlags) lines.push(`- **${quoteInline(flag.severity)}**: ${quoteInline(flag.reason)}`);
  }
  return lines.join("\n");
}

function buildDuplicateSection(contribs) {
  return [
    `## ${priorityLabel()} Canonical Duplicate Disposition`,
    "",
    ...contribs.map((c) => [
      `- source identity: \`${c.sourceIdentity}\``,
      `  - queueId: \`${c.queueId}\``,
      `  - canonicalGroupId: \`${c.canonicalGroupId}\``,
      `  - representative queueId: \`${c.representativeQueueId || ""}\``,
      `  - representative source: \`${c.representativeSourceIdentity || ""}\``,
      `  - representative page: \`${c.representativeSourcePage || ""}\``,
    ].join("\n")),
  ].join("\n");
}

function buildReviewStubSection(title, contribs) {
  return [
    `## ${priorityLabel()} ${title}`,
    "",
    ...contribs.map((c) => [
      `- source identity: \`${c.sourceIdentity}\``,
      `  - queueId: \`${c.queueId}\``,
      `  - canonicalGroupId: \`${c.canonicalGroupId}\``,
      `  - reason: ${quoteInline(c.reason)}`,
    ].join("\n")),
  ].join("\n");
}

function buildEvidenceListSection(heading, contribs, itemFormatter) {
  const sorted = [...contribs].sort((a, b) => a.sourceIdentity.localeCompare(b.sourceIdentity));
  return [
    `## ${heading}`,
    "",
    ...sorted.map(itemFormatter),
  ].join("\n");
}

function pageTypeFor(relPath, firstType) {
  if (relPath.startsWith("wiki/sources/")) return "source";
  if (relPath.startsWith("wiki/entities/")) return "entity";
  if (relPath.startsWith("wiki/concepts/")) return "concept";
  if (relPath.startsWith("wiki/findings/")) return "finding";
  return firstType || "note";
}

function titleForPage(relPath, contribs) {
  const first = contribs[0] || {};
  return first.title || first.name || first.claim || relPath.split("/").pop().replace(/\.md$/, "");
}

function sectionForPage(relPath, contribs) {
  const type = contribs[0]?.type || "";
  if (type === "representative-source-summary") return buildRepresentativeSourceSection(contribs);
  if (type === "canonical-duplicate-source-stub") return buildDuplicateSection(contribs);
  if (type === "empty-text-recovery-stub") return buildReviewStubSection("Empty Text Recovery Stub", contribs);
  if (type === "low-text-review-stub") return buildReviewStubSection("Low Text Review Stub", contribs);
  if (relPath.startsWith("wiki/entities/")) {
    return buildEvidenceListSection(`${priorityLabel()} Entity Evidence`, contribs, (c) =>
      `- **${quoteInline(c.name)}** from \`${c.sourceIdentity}\`: ${quoteInline(c.evidence || c.title || "")}`,
    );
  }
  if (relPath.startsWith("wiki/concepts/")) {
    return buildEvidenceListSection(`${priorityLabel()} Concept Evidence`, contribs, (c) =>
      `- **${quoteInline(c.name)}** from \`${c.sourceIdentity}\`: ${quoteInline(c.evidence || "")}`,
    );
  }
  if (relPath.startsWith("wiki/findings/")) {
    return buildEvidenceListSection(`${priorityLabel()} Findings`, contribs, (c) =>
      `- From \`${c.sourceIdentity}\` (${quoteInline(c.confidence)}): ${quoteInline(c.claim)} - ${quoteInline(c.evidenceText || "")}`,
    );
  }
  return buildEvidenceListSection(`${priorityLabel()} Staging Evidence`, contribs, (c) => `- \`${c.sourceIdentity}\``);
}

function buildPlan(dispositionRows, extractions, maxItems) {
  const groups = new Map();
  const missingRepresentativeOutputs = [];
  let contributionCount = 0;
  const dispositionCounts = {};
  const representativeQueueIds = new Set();

  function add(relPath, contrib) {
    if (maxItems && contributionCount >= maxItems) return;
    if (!relPath.startsWith("wiki/")) throw new Error(`Unsafe non-wiki path planned: ${relPath}`);
    if (!groups.has(relPath)) groups.set(relPath, []);
    groups.get(relPath).push(contrib);
    contributionCount += 1;
  }

  for (const row of dispositionRows) {
    dispositionCounts[row.disposition] = (dispositionCounts[row.disposition] || 0) + 1;
    if (row.disposition === "full_wiki_candidate") representativeQueueIds.add(row.queueId);
  }

  for (const row of dispositionRows) {
    if (maxItems && contributionCount >= maxItems) break;
    const sourceIdentity = sourceIdentityForPath(row.sourcePath);
    const sourcePage = `wiki/sources/${sourceSummarySlugFromIdentity(sourceIdentity)}.md`;
    const representative =
      extractions.byQueueId.get(row.representativeQueueId || row.queueId) ||
      extractions.byCanonicalGroupId.get(row.canonicalGroupId);

    if (row.disposition === "full_wiki_candidate") {
      if (!representative) {
        missingRepresentativeOutputs.push({ queueId: row.queueId, sourcePath: row.sourcePath, canonicalGroupId: row.canonicalGroupId });
        continue;
      }
      const obj = representative.extraction;
      add(sourcePage, {
        type: "representative-source-summary",
        queueId: row.queueId,
        sourcePath: row.sourcePath,
        sourceIdentity,
        canonicalGroupId: row.canonicalGroupId,
        title: obj.document?.title || obj.sourceSummary?.oneLine || sourceIdentity,
        extraction: obj,
      });
      for (const entity of obj.entities || []) {
        add(`wiki/entities/${sanitizePathPart(entity.name, "entity")}.md`, {
          type: "entity",
          queueId: row.queueId,
          sourceIdentity,
          name: entity.name,
          evidence: entity.evidence,
        });
      }
      for (const concept of obj.concepts || []) {
        const name = concept.pageTarget || concept.name;
        add(`wiki/concepts/${sanitizePathPart(name, "concept")}.md`, {
          type: "concept",
          queueId: row.queueId,
          sourceIdentity,
          name,
          evidence: concept.evidence,
        });
      }
      for (const evidence of obj.evidence || []) {
        add(`wiki/findings/${sanitizePathPart(evidence.claim, "finding")}.md`, {
          type: "finding",
          queueId: row.queueId,
          sourceIdentity,
          claim: evidence.claim,
          evidenceText: evidence.evidenceText,
          confidence: evidence.confidence,
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
      add(sourcePage, {
        type: "canonical-duplicate-source-stub",
        queueId: row.queueId,
        sourcePath: row.sourcePath,
        sourceIdentity,
        canonicalGroupId: row.canonicalGroupId,
        representativeQueueId: row.representativeQueueId,
        representativeSourceIdentity: repIdentity,
        representativeSourcePage: repIdentity ? `wiki/sources/${sourceSummarySlugFromIdentity(repIdentity)}.md` : "",
      });
    } else if (row.disposition === "needs_review_low_text") {
      add(sourcePage, {
        type: "low-text-review-stub",
        queueId: row.queueId,
        sourcePath: row.sourcePath,
        sourceIdentity,
        canonicalGroupId: row.canonicalGroupId,
        reason: row.dispositionReason || "low text",
      });
    } else if (row.disposition === "needs_recovery_empty_text") {
      add(sourcePage, {
        type: "empty-text-recovery-stub",
        queueId: row.queueId,
        sourcePath: row.sourcePath,
        sourceIdentity,
        canonicalGroupId: row.canonicalGroupId,
        reason: row.dispositionReason || "empty text",
      });
    }
  }

  return {
    groups,
    contributionCount,
    dispositionCounts,
    representativeQueueIds,
    missingRepresentativeOutputs,
  };
}

function materializePage(vaultRoot, relPath, contribs, apply) {
  const target = fullPath(vaultRoot, relPath);
  const existed = fs.existsSync(target);
  const sources = contribs.map((c) => c.sourceIdentity).filter(Boolean);
  const type = pageTypeFor(relPath, contribs[0]?.type);
  const title = titleForPage(relPath, contribs);
  const tags = [`${CURRENT_PRIORITY}-${type}`];
  const section = sectionForPage(relPath, contribs);
  let content;

  if (existed) {
    const existing = fs.readFileSync(target, "utf8");
    content = mergeExistingFrontmatter(existing, type, title, sources, tags);
  } else {
    content = frontmatter(type, title, sources, tags) + `# ${title}\n`;
  }

  content = upsertSection(content, CURRENT_PRIORITY, section);
  if (apply) {
    ensureDirFor(target);
    fs.writeFileSync(target, content.endsWith("\n") ? content : `${content}\n`, "utf8");
  }
  return { relPath, action: existed ? "update-or-merge" : "create", contributionCount: contribs.length };
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

function validateWritten(vaultRoot, plannedFiles) {
  const missing = [];
  const missingMarker = [];
  const missingSources = [];
  for (const item of plannedFiles) {
    const target = fullPath(vaultRoot, item.relPath);
    if (!fs.existsSync(target)) {
      missing.push(item.relPath);
      continue;
    }
    const content = fs.readFileSync(target, "utf8");
    if (!content.includes(`${publishMarker()}:${CURRENT_PRIORITY}:BEGIN`)) missingMarker.push(item.relPath);
    const fm = extractFrontmatter(content);
    if (!fm || !/^sources:\s*\[/m.test(fm.raw)) missingSources.push(item.relPath);
  }
  return {
    missingCount: missing.length,
    missingMarkerCount: missingMarker.length,
    missingSourcesCount: missingSources.length,
    missing: missing.slice(0, 100),
    missingMarker: missingMarker.slice(0, 100),
    missingSources: missingSources.slice(0, 100),
  };
}

function writeReport(file, summary) {
  const lines = [
    `# ${priorityLabel()} Vault Materialize Report`,
    "",
    `Generated: ${summary.generatedAt}`,
    `Mode: ${summary.mode}`,
    `Vault: \`${summary.vaultRoot}\``,
    "",
    "## Inputs",
    "",
    `- disposition rows: ${summary.disposition.total}`,
    `- representative outputs loaded: ${summary.representatives.loaded}/${summary.representatives.expected}`,
    `- missing representative outputs: ${summary.representatives.missing}`,
    "",
    "## Planned/Written Wiki Work",
    "",
    `- planned contributions: ${summary.materialize.contributions}`,
    `- unique wiki files: ${summary.materialize.uniqueFiles}`,
    `- create: ${summary.materialize.actionCounts.create || 0}`,
    `- update-or-merge: ${summary.materialize.actionCounts["update-or-merge"] || 0}`,
    "",
    "## Validation",
    "",
    `- missing files: ${summary.validation.missingCount}`,
    `- missing ${priorityLabel()} marker: ${summary.validation.missingMarkerCount}`,
    `- missing frontmatter sources: ${summary.validation.missingSourcesCount}`,
    "",
    "## Vault Queue State",
    "",
    `- queue total: ${summary.vaultState.queue.total ?? "missing"}`,
    `- queue counts: ${JSON.stringify(summary.vaultState.queue.counts || {})}`,
    "",
  ];
  fs.writeFileSync(file, `${lines.join("\n")}\n`, "utf8");
}

async function main() {
  const args = parseArgs(process.argv);
  CURRENT_PRIORITY = args.priority;
  const vaultRoot = args.vaultRoot;
  const dispositionRows = readJson(path.join(args.triageDir, `${args.priority}-disposition-full.json`));
  const bundleDirs = discoverBundles(args.priority);
  const extractions = loadExtractions(bundleDirs);
  const plan = buildPlan(dispositionRows, extractions, args.maxItems);

  if (extractions.validationErrors.length) {
    throw new Error(`Invalid extraction outputs: ${extractions.validationErrors.length}`);
  }
  if (plan.missingRepresentativeOutputs.length) {
    throw new Error(`Missing representative outputs: ${plan.missingRepresentativeOutputs.length}`);
  }

  const materialized = [];
  for (const [relPath, contribs] of plan.groups.entries()) {
    materialized.push(materializePage(vaultRoot, relPath, contribs, args.apply));
  }

  const actionCounts = {};
  for (const item of materialized) actionCounts[item.action] = (actionCounts[item.action] || 0) + 1;

  const validation = args.apply
    ? validateWritten(vaultRoot, materialized)
    : {
        missingCount: 0,
        missingMarkerCount: 0,
        missingSourcesCount: 0,
        missing: [],
        missingMarker: [],
        missingSources: [],
      };

  const summary = {
    generatedAt: new Date().toISOString(),
    mode: args.apply ? "apply" : "dry-run",
    priority: args.priority,
    vaultRoot,
    triageDir: normalizePath(args.triageDir),
    bundles: extractions.bundles,
    disposition: {
      total: dispositionRows.length,
      counts: plan.dispositionCounts,
    },
    representatives: {
      expected: plan.representativeQueueIds.size,
      loaded: extractions.byQueueId.size,
      missing: plan.missingRepresentativeOutputs.length,
    },
    materialize: {
      contributions: plan.contributionCount,
      uniqueFiles: materialized.length,
      actionCounts,
    },
    validation,
    vaultState: {
      queue: summarizeQueue(vaultRoot),
    },
  };

  fs.mkdirSync(args.outDir, { recursive: true });
  writeJson(path.join(args.outDir, "materialize-summary.json"), summary);
  writeJson(path.join(args.outDir, "materialize-files.json"), materialized);
  writeReport(path.join(args.outDir, "materialize-report.md"), summary);
  console.log(JSON.stringify(summary, null, 2));

  if (args.apply && (validation.missingCount || validation.missingMarkerCount || validation.missingSourcesCount)) {
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack || err.message : err);
  process.exit(1);
});
