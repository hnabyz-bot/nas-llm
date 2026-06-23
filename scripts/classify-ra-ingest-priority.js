#!/usr/bin/env node
// Classify preprocessed ingest candidates by RA/regulatory value.
//
// This is a dry-run/reporting tool. It does not modify the live ingest queue.

const fs = require("fs");
const path = require("path");

const DEFAULT_VAULT = "D:\\vault\\llm-wiki-vault";

function parseArgs(argv) {
  const args = {
    vaultRoot: DEFAULT_VAULT,
    scope: "active",
    sampleBytes: 16 * 1024,
    outDir: "",
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--vaultRoot") args.vaultRoot = argv[++i];
    else if (arg === "--scope") args.scope = argv[++i];
    else if (arg === "--sample-bytes") args.sampleBytes = Number(argv[++i]);
    else if (arg === "--out-dir") args.outDir = argv[++i];
    else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!["active", "all-success"].includes(args.scope)) {
    throw new Error(`Invalid --scope: ${args.scope}`);
  }
  if (!Number.isFinite(args.sampleBytes) || args.sampleBytes < 0) {
    throw new Error(`Invalid --sample-bytes: ${args.sampleBytes}`);
  }
  return args;
}

function posixRelToFull(root, rel) {
  return path.join(root, ...String(rel).split("/"));
}

function topFolderFromRaw(sourcePath) {
  return String(sourcePath || "").replace(/^raw\/sources\//, "").split("/")[0] || "";
}

function topFolderFromPreprocessed(sourcePath) {
  return String(sourcePath || "").replace(/^raw\/sources\/_preprocessed\//, "").split("/")[0] || "";
}

function sourceIdFromOutput(output) {
  const m = String(output || "").match(/\/_by_source\/([^/]+)\//);
  return m ? m[1] : "";
}

function sourceIdFromCombined(sourcePath) {
  const m = String(sourcePath || "").match(/\/_combined\/([^/]+)\//);
  return m ? m[1] : "";
}

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readSample(file, bytes) {
  if (!bytes) return "";
  try {
    const fd = fs.openSync(file, "r");
    try {
      const buf = Buffer.alloc(bytes);
      const read = fs.readSync(fd, buf, 0, bytes, 0);
      return buf.subarray(0, read).toString("utf8");
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return "";
  }
}

function normalizeText(value) {
  return String(value || "").replace(/\\/g, "/");
}

function has(re, text) {
  return re.test(text);
}

const folderBase = [
  { re: /^RA$/i, score: 100, reason: "RA folder" },
  { re: /^DHF \(.*\)$/i, score: 92, reason: "DHF folder" },
  { re: /^Standard/i, score: 64, reason: "standards folder" },
  { re: /^연구소 문서등록대장$/i, score: 72, reason: "document registry" },
  { re: /^Project$/i, score: 48, reason: "project folder" },
  { re: /^타사 메뉴얼$/i, score: 42, reason: "predicate/manual folder" },
  { re: /^Restricted_Backup$/i, score: 12, reason: "backup folder" },
];

const positiveRules = [
  {
    name: "authority_submission",
    score: 42,
    re: /(FDA|MFDS|MDR|CE\s*MDR|510\s*\(?k\)?|510k|KFDA|NMPA|EUDAMED|UDI|GUDID|CB\b|NRTL|TUV|SGS|Intertek|UL\b|KTC|KTR|KTL|submission|technical documentation|technical file|STED|audit|inspection|품목|허가|인허가|인증|보완|심사|신청|제출|접수|승인|등록|갱신|질의|답변)/i,
  },
  {
    name: "active_product",
    score: 22,
    re: /(HnX|HnXR1|HnVUE|CYAN|GT1717|HAD1717|HAD1417|A1417|A1717|F1417|AspenView|ADD\b)/i,
  },
  {
    name: "dhf_dmr_design",
    score: 28,
    re: /(DHF|DMR|design history|design review|design input|design output|BOM|bill of materials|설계|개발문서|요구사항|사양|도면|원재료|제조|생산|출하검사)/i,
  },
  {
    name: "verification_validation",
    score: 32,
    re: /(verification|validation|V&V|V\s*&\s*V|검증|밸리데이션|성능시험|performance|test report|시험성적|시험보고|평가보고|A-PTR|A-SVR|A-UVR|A-TD)/i,
  },
  {
    name: "safety_emc",
    score: 30,
    re: /(IEC\s*60601|60601-1|60601-1-2|EMC|electromagnetic|safety|electrical safety|CB report|안전|전기.?기계|전자파|내전압|누설전류)/i,
  },
  {
    name: "software_cybersecurity",
    score: 30,
    re: /(software|firmware|SW\b|SRS|SDS|SVR|SBOM|cybersecurity|cyber security|보안|사이버|IEC\s*62304|62304|81001-5-1|source code|버전|release)/i,
  },
  {
    name: "risk_usability_clinical",
    score: 28,
    re: /(risk management|ISO\s*14971|14971|usability|IEC\s*62366|62366|clinical|CER\b|clinical evaluation|PMCF|PMS|biocompatibility|ISO\s*10993|10993|위험|사용적합성|유효성|임상|생물학적|독성|멸균)/i,
  },
  {
    name: "labeling_ifu_manual",
    score: 22,
    re: /(label|labeling|IFU|instructions for use|user manual|manual|package|UDI|outer box|사용설명서|라벨|표시|포장|카탈로그)/i,
  },
  {
    name: "standards_qms",
    score: 20,
    re: /(ISO|IEC|EN\s|KS\s|AAMI|ASTM|MEDDEV|MDCG|guidance|guideline|regulation|QMS|ISO\s*13485|13485|CAPA|SOP|AQP|절차|규정|품질|문서관리|관리대장|표준)/i,
  },
  {
    name: "recent",
    score: 16,
    re: /(2026|2025|2024|260[1-9]\d{2}|25[0-1]\d{2}|24[0-1]\d{2})/,
  },
  {
    name: "final_or_response",
    score: 18,
    re: /(final|finalized|최종|완료|보완|response|reply|answer|질의|답변|제출본|신청본|심사|승인)/i,
  },
  {
    name: "ra_works_backup",
    score: 22,
    re: /(RA Works|인허가|RA업무|해외.?등록|진행.?문서)/i,
  },
];

const negativeRules = [
  {
    name: "archive_backup",
    score: -58,
    re: /(Restricted_Backup|raw\/sources\/RA\/99_|\/99_[^/]*RA|backup|백업|OLD|old|구본|구버전|구 자료|구자료|과거|obsolete|폐기|archive|이전|copy|복사본)/i,
  },
  {
    name: "low_value_build_artifact",
    score: -80,
    re: /(FileListAbsolute|\.vcxproj|\.sln|Debug\/|Release\/|node_modules|obj\/|bin\/|\.pdb|\.dll|\.exe|\.lib|\.obj|desktop\.ini|~\$)/i,
  },
  {
    name: "sample_temp",
    score: -35,
    re: /(sample|temp|tmp|임시|테스트용|참고문서|draft|초안|시안)/i,
  },
  {
    name: "label_artwork_only",
    score: -18,
    re: /(label 시안|Label 시안|라벨 도안|outer box|artwork|박스|box label)/i,
  },
  {
    name: "very_old",
    score: -12,
    re: /(2015|2016|2017|2018|2019|150[1-9]\d{2}|160[1-9]\d{2}|170[1-9]\d{2}|180[1-9]\d{2}|190[1-9]\d{2})/,
  },
];

const workstreams = [
  { name: "submission_authority", re: positiveRules[0].re },
  { name: "software_cybersecurity", re: positiveRules[5].re },
  { name: "safety_emc", re: positiveRules[4].re },
  { name: "verification_validation", re: positiveRules[3].re },
  { name: "risk_usability_clinical", re: positiveRules[6].re },
  { name: "dhf_dmr_design", re: positiveRules[2].re },
  { name: "labeling_ifu_manual", re: positiveRules[7].re },
  { name: "standards_qms", re: positiveRules[8].re },
  { name: "predicate_reference", re: /(predicate|equivalent|competitor|타사|비교|comparison|manual)/i },
];

function classifyItem(item) {
  const text = item.classificationText;
  const reasons = [];
  let score = 0;

  const baseRule = folderBase.find((rule) => rule.re.test(item.topFolder));
  if (baseRule) {
    score += baseRule.score;
    reasons.push(baseRule.reason);
  }

  const tags = [];
  for (const rule of positiveRules) {
    if (has(rule.re, text)) {
      score += rule.score;
      tags.push(rule.name);
      reasons.push(rule.name);
    }
  }
  for (const rule of negativeRules) {
    if (has(rule.re, text)) {
      score += rule.score;
      tags.push(rule.name);
      reasons.push(rule.name);
    }
  }

  let workstream = "general_ra";
  const ws = workstreams.find((rule) => has(rule.re, text));
  if (ws) workstream = ws.name;
  if (tags.includes("archive_backup")) workstream = "archive_or_duplicate";
  if (tags.includes("low_value_build_artifact")) workstream = "low_value_artifact";

  const hasSubmission = tags.includes("authority_submission");
  const hasCoreEvidence =
    tags.includes("dhf_dmr_design") ||
    tags.includes("verification_validation") ||
    tags.includes("safety_emc") ||
    tags.includes("software_cybersecurity") ||
    tags.includes("risk_usability_clinical");
  const hasActiveProduct = tags.includes("active_product");
  const hasRecent = tags.includes("recent");
  const hasFinalOrResponse = tags.includes("final_or_response");
  const isArchiveLike = tags.includes("archive_backup") || tags.includes("sample_temp");
  const isBackupFolder = item.topFolder === "Restricted_Backup";
  const isLabelArtworkOnly =
    tags.includes("label_artwork_only") &&
    !tags.includes("risk_usability_clinical") &&
    !tags.includes("software_cybersecurity") &&
    !tags.includes("safety_emc");

  let priority = "P3_SUPPORTING_REFERENCE";
  let rank = 3;
  if (tags.includes("low_value_build_artifact")) {
    priority = "P5_LOW_VALUE_ARTIFACT";
    rank = 5;
  } else if (isBackupFolder && !(hasSubmission && hasCoreEvidence && hasRecent)) {
    priority = "P4_ARCHIVE_DUPLICATE";
    rank = 4;
  } else if (isArchiveLike) {
    priority = "P4_ARCHIVE_DUPLICATE";
    rank = 4;
  } else if (
    score >= 176 &&
    hasSubmission &&
    hasCoreEvidence &&
    hasActiveProduct &&
    hasRecent &&
    !isLabelArtworkOnly
  ) {
    priority = "P0_ACTIVE_SUBMISSION";
    rank = 0;
  } else if (score >= 128 && hasCoreEvidence && !isLabelArtworkOnly) {
    priority = "P1_CORE_RA_EVIDENCE";
    rank = 1;
  } else if (score >= 108 && (tags.includes("standards_qms") || hasSubmission)) {
    priority = "P2_STANDARDS_QMS_TRACEABILITY";
    rank = 2;
  } else if (score >= 112) {
    priority = "P2_STANDARDS_QMS_TRACEABILITY";
    rank = 2;
  } else if (score < 55 || tags.includes("archive_backup")) {
    priority = "P4_ARCHIVE_DUPLICATE";
    rank = 4;
  }

  return {
    score,
    priority,
    rank,
    workstream,
    tags: [...new Set(tags)],
    reasons: [...new Set(reasons)].slice(0, 12),
  };
}

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeCsv(file, rows) {
  const header = [
    "priority",
    "rank",
    "score",
    "workstream",
    "topFolder",
    "sizeBytes",
    "sourcePath",
    "combinedPath",
    "outputCount",
    "tags",
    "reasons",
  ];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(header.map((key) => csvEscape(Array.isArray(row[key]) ? row[key].join("|") : row[key])).join(","));
  }
  fs.writeFileSync(file, `${lines.join("\n")}\n`, "utf8");
}

function summarize(rows, keyFn) {
  const result = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    const cur = result.get(key) || { count: 0, bytes: 0 };
    cur.count++;
    cur.bytes += row.sizeBytes || 0;
    result.set(key, cur);
  }
  return Object.fromEntries(
    [...result.entries()].sort((a, b) => {
      if (a[1].count !== b[1].count) return b[1].count - a[1].count;
      return String(a[0]).localeCompare(String(b[0]));
    }),
  );
}

function main() {
  const args = parseArgs(process.argv);
  const vaultRoot = path.resolve(args.vaultRoot);
  const manifestPath = path.join(vaultRoot, "raw", "sources", "_preprocessed", ".preprocess-manifest.json");
  const queuePath = path.join(vaultRoot, ".llm-wiki", "ingest-queue.json");

  const manifest = loadJson(manifestPath);
  const entries = Object.values(manifest);
  const bySourceId = new Map();
  for (const entry of entries) {
    const id = sourceIdFromOutput((entry.outputs || [])[0]);
    if (id) bySourceId.set(id, entry);
  }

  let candidates = [];
  if (args.scope === "active") {
    const queue = loadJson(queuePath);
    candidates = queue
      .filter((item) => item.status === "pending" || item.status === "processing")
      .map((item) => {
        const combinedPath = item.sourcePath;
        const id = sourceIdFromCombined(combinedPath);
        const entry = bySourceId.get(id) || {};
        return {
          queueId: item.id,
          queueStatus: item.status,
          combinedPath,
          sourcePath: entry.sourcePath || "",
          outputs: entry.outputs || [],
        };
      });
  } else {
    candidates = entries
      .filter((entry) => entry.status === "success")
      .map((entry) => ({
        queueId: "",
        queueStatus: "",
        combinedPath: "",
        sourcePath: entry.sourcePath || "",
        outputs: entry.outputs || [],
      }));
  }

  const rows = [];
  let missingCombined = 0;
  for (const candidate of candidates) {
    const sourcePath = normalizeText(candidate.sourcePath);
    const combinedPath = normalizeText(candidate.combinedPath);
    const topFolder = combinedPath
      ? topFolderFromPreprocessed(combinedPath)
      : topFolderFromRaw(sourcePath);
    const combinedFull = combinedPath ? posixRelToFull(vaultRoot, combinedPath) : "";
    let sizeBytes = 0;
    let sample = "";
    if (combinedFull) {
      try {
        sizeBytes = fs.statSync(combinedFull).size;
        sample = readSample(combinedFull, args.sampleBytes);
      } catch {
        missingCombined++;
      }
    }
    const outputText = (candidate.outputs || []).slice(0, 8).join("\n");
    const classificationText = [
      sourcePath,
      combinedPath,
      outputText,
      sample,
    ].join("\n");
    const classified = classifyItem({
      topFolder,
      classificationText,
    });
    rows.push({
      ...classified,
      queueId: candidate.queueId,
      queueStatus: candidate.queueStatus,
      topFolder,
      sizeBytes,
      sourcePath,
      combinedPath,
      outputCount: (candidate.outputs || []).length,
    });
  }

  rows.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    if (a.score !== b.score) return b.score - a.score;
    const folderDiff = a.topFolder.localeCompare(b.topFolder);
    if (folderDiff !== 0) return folderDiff;
    return String(a.sourcePath || a.combinedPath).localeCompare(String(b.sourcePath || b.combinedPath));
  });

  const stamp = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const outDir = args.outDir
    ? path.resolve(args.outDir)
    : path.resolve(process.cwd(), "reports", `ra-ingest-priority-${stamp}`);
  fs.mkdirSync(outDir, { recursive: true });

  const summary = {
    generatedAt: new Date().toISOString(),
    vaultRoot,
    scope: args.scope,
    sampleBytes: args.sampleBytes,
    total: rows.length,
    missingCombined,
    byPriority: summarize(rows, (row) => row.priority),
    byWorkstream: summarize(rows, (row) => row.workstream),
    byFolder: summarize(rows, (row) => row.topFolder),
    top20: rows.slice(0, 20),
  };

  fs.writeFileSync(path.join(outDir, "priority-summary.json"), JSON.stringify(summary, null, 2), "utf8");
  fs.writeFileSync(path.join(outDir, "priority-full.json"), JSON.stringify(rows, null, 2), "utf8");
  writeCsv(path.join(outDir, "priority-full.csv"), rows);
  writeCsv(path.join(outDir, "priority-top1000.csv"), rows.slice(0, 1000));

  const sortedQueuePreview = rows
    .filter((row) => row.combinedPath)
    .map((row) => ({
      sourcePath: row.combinedPath,
      sourceOriginalPath: row.sourcePath,
      priority: row.priority,
      score: row.score,
      workstream: row.workstream,
      tags: row.tags,
    }));
  fs.writeFileSync(path.join(outDir, "sorted-queue-preview.json"), JSON.stringify(sortedQueuePreview, null, 2), "utf8");

  const md = [
    "# RA Ingest Priority Report",
    "",
    `Generated: ${summary.generatedAt}`,
    `Scope: ${summary.scope}`,
    `Total candidates: ${summary.total}`,
    `Missing combined files: ${summary.missingCombined}`,
    "",
    "## Priority Counts",
    "",
    ...Object.entries(summary.byPriority).map(([key, value]) => `- ${key}: ${value.count} (${Math.round(value.bytes / 1024 / 1024)} MB)`),
    "",
    "## Workstream Counts",
    "",
    ...Object.entries(summary.byWorkstream).map(([key, value]) => `- ${key}: ${value.count} (${Math.round(value.bytes / 1024 / 1024)} MB)`),
    "",
    "## Top 20",
    "",
    ...rows.slice(0, 20).map((row, idx) => `${idx + 1}. ${row.priority} score=${row.score} ${row.workstream} - ${row.sourcePath || row.combinedPath}`),
    "",
  ].join("\n");
  fs.writeFileSync(path.join(outDir, "priority-report.md"), md, "utf8");

  console.log(JSON.stringify({
    outDir,
    total: rows.length,
    byPriority: summary.byPriority,
    byWorkstream: summary.byWorkstream,
    top5: rows.slice(0, 5).map((row) => ({
      priority: row.priority,
      score: row.score,
      workstream: row.workstream,
      sourcePath: row.sourcePath || row.combinedPath,
    })),
  }, null, 2));
}

main();
