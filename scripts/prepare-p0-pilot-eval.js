#!/usr/bin/env node
// Prepare a small P0 representative-source evaluation bundle.
//
// Dry-run/reporting only. This does not call an LLM and does not modify the
// vault. It materializes selected pilot source texts, a JSON schema, prompt
// template, and QA rubric for a direct CLI extraction pilot.

const fs = require("fs");
const path = require("path");

const DEFAULT_VAULT = "D:\\vault\\llm-wiki-vault";
const DEFAULT_TRIAGE_DIR = "reports\\p0-meaningful-triage-20260618153500";
const DEFAULT_COUNT = 30;
const DEFAULT_START_RANK = 1;

function parseArgs(argv) {
  const args = {
    vaultRoot: DEFAULT_VAULT,
    triageDir: DEFAULT_TRIAGE_DIR,
    count: DEFAULT_COUNT,
    startRank: DEFAULT_START_RANK,
    source: "pilot",
    outDir: "",
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--vaultRoot") args.vaultRoot = argv[++i];
    else if (arg === "--triage-dir") args.triageDir = argv[++i];
    else if (arg === "--count") args.count = Number(argv[++i]);
    else if (arg === "--start-rank") args.startRank = Number(argv[++i]);
    else if (arg === "--source") args.source = argv[++i];
    else if (arg === "--out-dir") args.outDir = argv[++i];
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!Number.isFinite(args.count) || args.count < 1) {
    throw new Error(`Invalid --count: ${args.count}`);
  }
  if (!Number.isFinite(args.startRank) || args.startRank < 1) {
    throw new Error(`Invalid --start-rank: ${args.startRank}`);
  }
  if (!["pilot", "full"].includes(args.source)) {
    throw new Error(`Invalid --source: ${args.source}`);
  }
  return args;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/prepare-p0-pilot-eval.js [options]

Options:
  --vaultRoot <path>       Vault root. Default: ${DEFAULT_VAULT}
  --triage-dir <path>      P0 triage report directory. Default: ${DEFAULT_TRIAGE_DIR}
  --count <n>              Number of pilot representatives to prepare. Default: ${DEFAULT_COUNT}
  --start-rank <n>         1-based representative rank to start from. Default: ${DEFAULT_START_RANK}
  --source <pilot|full>    Use p0-pilot-full-wiki.json or all full_wiki_candidate rows. Default: pilot
  --out-dir <path>         Output directory. Default: reports/p0-pilot-eval-<timestamp>
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

function posixRelToFull(root, rel) {
  return path.join(root, ...String(rel).split("/"));
}

function safeFilePart(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    .replace(/[^\w.-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "source";
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

function fullRepresentativeCandidates(triageDir) {
  const dispositionFile = path.join(triageDir, "p0-disposition-full.json");
  if (!fs.existsSync(dispositionFile)) {
    throw new Error(`Disposition file not found: ${dispositionFile}`);
  }
  const rows = JSON.parse(fs.readFileSync(dispositionFile, "utf8"));
  if (!Array.isArray(rows)) throw new Error(`Disposition file must be an array: ${dispositionFile}`);
  return rows
    .filter((row) => row.disposition === "full_wiki_candidate")
    .sort((a, b) => {
      if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
      if ((b.groupSize || 0) !== (a.groupSize || 0)) return (b.groupSize || 0) - (a.groupSize || 0);
      if ((b.normalizedChars || 0) !== (a.normalizedChars || 0)) return (b.normalizedChars || 0) - (a.normalizedChars || 0);
      return String(a.sourcePath).localeCompare(String(b.sourcePath));
    })
    .map((row, index) => ({
      pilotRank: index + 1,
      ...row,
    }));
}

function pilotCandidates(triageDir) {
  const pilotFile = path.join(triageDir, "p0-pilot-full-wiki.json");
  if (!fs.existsSync(pilotFile)) {
    throw new Error(`Pilot file not found: ${pilotFile}`);
  }
  const rows = JSON.parse(fs.readFileSync(pilotFile, "utf8"));
  if (!Array.isArray(rows)) throw new Error(`Pilot file must be an array: ${pilotFile}`);
  return rows;
}

const extractionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["source", "document", "sourceSummary", "entities", "concepts", "evidence", "reviewFlags"],
  properties: {
    source: {
      type: "object",
      additionalProperties: false,
      required: ["queueId", "sourcePath", "canonicalGroupId"],
      properties: {
        queueId: { type: "string" },
        sourcePath: { type: "string" },
        canonicalGroupId: { type: "string" },
      },
    },
    document: {
      type: "object",
      additionalProperties: false,
      required: [
        "title",
        "documentType",
        "productModels",
        "authorityOrJurisdiction",
        "revisionOrVersion",
        "documentDate",
        "standards",
      ],
      properties: {
        title: { type: "string" },
        documentType: { type: "string" },
        productModels: { type: "array", items: { type: "string" } },
        authorityOrJurisdiction: { type: "array", items: { type: "string" } },
        revisionOrVersion: { type: "string" },
        documentDate: { type: "string" },
        standards: { type: "array", items: { type: "string" } },
      },
    },
    sourceSummary: {
      type: "object",
      additionalProperties: false,
      required: ["oneLine", "officialUse", "keyPoints"],
      properties: {
        oneLine: { type: "string" },
        officialUse: { type: "string" },
        keyPoints: { type: "array", items: { type: "string" } },
      },
    },
    entities: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "type", "evidence"],
        properties: {
          name: { type: "string" },
          type: { type: "string" },
          evidence: { type: "string" },
        },
      },
    },
    concepts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "pageTarget", "evidence"],
        properties: {
          name: { type: "string" },
          pageTarget: { type: "string" },
          evidence: { type: "string" },
        },
      },
    },
    evidence: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["claim", "evidenceText", "pageTarget", "confidence"],
        properties: {
          claim: { type: "string" },
          evidenceText: { type: "string" },
          pageTarget: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
      },
    },
    reviewFlags: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["severity", "reason"],
        properties: {
          severity: { type: "string", enum: ["info", "warning", "blocker"] },
          reason: { type: "string" },
        },
      },
    },
  },
};

function promptTemplate() {
  return [
    "You are extracting official RA/regulatory wiki facts from one preprocessed source document.",
    "",
    "Return only valid JSON conforming to `extraction-schema.json`.",
    "",
    "Rules:",
    "- Preserve traceability. Every factual claim must be grounded in the provided source text.",
    "- Do not invent document dates, revision numbers, product models, standards, authorities, or status.",
    "- If a field is not present, use an empty string or empty array.",
    "- Prefer concise official wording over broad summaries.",
    "- Use pageTarget values suitable for wiki entity/concept pages.",
    "- Add reviewFlags for missing key metadata, ambiguous authority, low OCR quality, or conflicting evidence.",
    "",
    "Source metadata will be provided with:",
    "- queueId",
    "- sourcePath",
    "- canonicalGroupId",
    "- productSignal",
    "- authoritySignal",
    "",
    "Source text follows after a `SOURCE_TEXT` marker.",
    "",
  ].join("\n");
}

function qaRubric() {
  return [
    "# P0 Pilot QA Rubric",
    "",
    "A pilot extraction passes only if all required checks are satisfied.",
    "",
    "## Required Checks",
    "",
    "- JSON parses and conforms to `extraction-schema.json`.",
    "- `source.queueId`, `source.sourcePath`, and `source.canonicalGroupId` match the manifest.",
    "- `sourceSummary.oneLine` states what the source is, not a generic description.",
    "- Product/model, authority, revision/date, and standards are extracted when present.",
    "- Each evidence item has a concrete `evidenceText` copied or tightly paraphrased from the source.",
    "- Page targets are stable and reusable across duplicate sources.",
    "- Missing or ambiguous key metadata creates a `reviewFlags` entry.",
    "- No unsupported claims are introduced.",
    "",
    "## Pilot Decision Gate",
    "",
    "- Expand from 30 to 300 only if JSON pass rate is at least 90%.",
    "- Expand only if no blocker review flag pattern indicates prompt/schema failure.",
    "- Expand only if source traceability is correct for every passed extraction.",
    "- Revise the prompt/schema before expansion if duplicate/canonical page targets fragment badly.",
    "",
  ].join("\n");
}

function main() {
  const args = parseArgs(process.argv);
  const outDir = args.outDir || path.join("reports", `p0-pilot-eval-${timestamp()}`);
  const inputDir = path.join(outDir, "inputs");
  fs.mkdirSync(inputDir, { recursive: true });

  const candidates = args.source === "full"
    ? fullRepresentativeCandidates(args.triageDir)
    : pilotCandidates(args.triageDir);
  const selected = candidates.slice(args.startRank - 1, args.startRank - 1 + args.count);
  if (selected.length === 0) {
    throw new Error(`No representatives selected: source=${args.source}, startRank=${args.startRank}, count=${args.count}`);
  }
  const manifest = [];

  for (const row of selected) {
    const combinedFull = posixRelToFull(args.vaultRoot, row.combinedPath);
    const raw = fs.readFileSync(combinedFull, "utf8");
    const text = stripPreprocessMetadata(raw);
    const fileName = `${String(row.pilotRank).padStart(3, "0")}-${row.canonicalGroupId}-${safeFilePart(row.sourcePath)}.txt`;
    const inputPath = path.join("inputs", fileName);
    const header = [
      `queueId: ${row.queueId}`,
      `sourcePath: ${row.sourcePath}`,
      `combinedPath: ${row.combinedPath}`,
      `canonicalGroupId: ${row.canonicalGroupId}`,
      `productSignal: ${row.productSignal}`,
      `authoritySignal: ${row.authoritySignal}`,
      `pilotRank: ${row.pilotRank}`,
      "",
      "SOURCE_TEXT",
      "",
    ].join("\n");
    fs.writeFileSync(path.join(outDir, inputPath), `${header}${text}\n`, "utf8");
    manifest.push({
      pilotRank: row.pilotRank,
      queueId: row.queueId,
      sourcePath: row.sourcePath,
      combinedPath: row.combinedPath,
      canonicalGroupId: row.canonicalGroupId,
      productSignal: row.productSignal,
      authoritySignal: row.authoritySignal,
      workstream: row.workstream,
      score: row.score,
      groupSize: row.groupSize,
      normalizedChars: row.normalizedChars,
      inputPath,
      expectedOutputPath: `outputs/${String(row.pilotRank).padStart(3, "0")}-${row.canonicalGroupId}.json`,
    });
  }

  const byProduct = {};
  const byAuthority = {};
  for (const row of manifest) {
    byProduct[row.productSignal] = (byProduct[row.productSignal] || 0) + 1;
    byAuthority[row.authoritySignal] = (byAuthority[row.authoritySignal] || 0) + 1;
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    triageDir: args.triageDir,
    vaultRoot: args.vaultRoot,
    source: args.source,
    totalAvailableRepresentatives: candidates.length,
    startRank: args.startRank,
    endRank: args.startRank + manifest.length - 1,
    selectedCount: manifest.length,
    byProduct,
    byAuthority,
    totalNormalizedChars: manifest.reduce((sum, row) => sum + (row.normalizedChars || 0), 0),
    estimatedTokensCharsPer4: Math.ceil(manifest.reduce((sum, row) => sum + (row.normalizedChars || 0), 0) / 4),
  };

  fs.mkdirSync(path.join(outDir, "outputs"), { recursive: true });
  fs.writeFileSync(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  writeCsv(path.join(outDir, "manifest.csv"), manifest, [
    "pilotRank",
    "queueId",
    "score",
    "productSignal",
    "authoritySignal",
    "groupSize",
    "normalizedChars",
    "inputPath",
    "expectedOutputPath",
    "sourcePath",
  ]);
  fs.writeFileSync(path.join(outDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(outDir, "extraction-schema.json"), `${JSON.stringify(extractionSchema, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(outDir, "prompt-template.md"), promptTemplate(), "utf8");
  fs.writeFileSync(path.join(outDir, "qa-rubric.md"), qaRubric(), "utf8");

  console.log(JSON.stringify({ outDir, ...summary }, null, 2));
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.stack || err.message : String(err));
  process.exit(1);
}
