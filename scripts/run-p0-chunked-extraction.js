#!/usr/bin/env node
// Re-run oversized or context-window-failed P0 pilot extraction rows by splitting
// source text into bounded chunks, extracting each chunk, then merging the
// partial extractions into the normal output schema.

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = {
    bundleDir: "reports\\p0-pilot-eval-300-20260618173500",
    provider: "codex",
    model: "",
    ranks: [],
    failed: false,
    timeoutMs: 10 * 60 * 1000,
    chunkChars: 180000,
    run: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--bundle-dir") args.bundleDir = argv[++i];
    else if (arg === "--provider") args.provider = argv[++i];
    else if (arg === "--model") args.model = argv[++i];
    else if (arg === "--ranks") args.ranks = argv[++i].split(",").map((v) => Number(v.trim())).filter(Boolean);
    else if (arg === "--failed") args.failed = true;
    else if (arg === "--timeout-ms") args.timeoutMs = Number(argv[++i]);
    else if (arg === "--chunk-chars") args.chunkChars = Number(argv[++i]);
    else if (arg === "--run") args.run = true;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!["codex", "claude"].includes(args.provider)) throw new Error(`Invalid --provider: ${args.provider}`);
  if (!args.failed && args.ranks.length === 0) throw new Error("Use --ranks <n,n> or --failed");
  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs < 10000) throw new Error(`Invalid --timeout-ms: ${args.timeoutMs}`);
  if (!Number.isFinite(args.chunkChars) || args.chunkChars < 50000) throw new Error(`Invalid --chunk-chars: ${args.chunkChars}`);
  return args;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/run-p0-chunked-extraction.js --bundle-dir <path> --ranks 70,76 --run
  node scripts/run-p0-chunked-extraction.js --bundle-dir <path> --failed --run

Options:
  --bundle-dir <path>   Evaluation bundle.
  --provider <name>     codex or claude. Default: codex.
  --model <name>        Optional model name passed to the CLI.
  --ranks <csv>         1-based pilot ranks to re-run.
  --failed              Re-run ranks currently marked non-pass in run-results.json.
  --chunk-chars <n>     Approximate source text chars per chunk. Default: 180000.
  --timeout-ms <n>      Per CLI call timeout. Default: 600000.
  --run                 Actually call the CLI. Without this, prints a plan only.
`);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, obj) {
  fs.writeFileSync(file, `${JSON.stringify(obj, null, 2)}\n`, "utf8");
}

function splitText(text, chunkChars) {
  const chunks = [];
  let offset = 0;
  while (offset < text.length) {
    let end = Math.min(text.length, offset + chunkChars);
    if (end < text.length) {
      const newline = text.lastIndexOf("\n", end);
      if (newline > offset + Math.floor(chunkChars * 0.6)) end = newline;
    }
    chunks.push({ index: chunks.length + 1, start: offset, end, text: text.slice(offset, end) });
    offset = end;
  }
  return chunks;
}

function runChild(command, args, stdin, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2000).unref?.();
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: `${stderr}\n${err.message}`, timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
    child.stdin.write(stdin);
    child.stdin.end();
  });
}

async function runCodex(prompt, args) {
  const cliArgs = [
    "-a", "never",
    "exec",
    "--json",
    "--skip-git-repo-check",
    "--sandbox", "read-only",
    "--ephemeral",
  ];
  if (args.model) cliArgs.push("--model", args.model);
  cliArgs.push("-");
  return runChild("codex", cliArgs, prompt, args.timeoutMs);
}

function claudeInput(prompt) {
  return `${JSON.stringify({
    type: "user",
    message: { role: "user", content: [{ type: "text", text: prompt }] },
  })}\n`;
}

async function runClaude(prompt, args) {
  const cliArgs = ["-p", "--output-format", "stream-json", "--input-format", "stream-json", "--verbose"];
  if (args.model) cliArgs.push("--model", args.model);
  return runChild("claude", cliArgs, claudeInput(prompt), args.timeoutMs);
}

async function runProvider(prompt, args) {
  return args.provider === "codex" ? runCodex(prompt, args) : runClaude(prompt, args);
}

function parseCodexAssistantText(stdout) {
  let text = "";
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const evt = JSON.parse(trimmed);
      if (evt?.type === "item.completed" && evt.item?.type === "agent_message" && typeof evt.item.text === "string") {
        text += evt.item.text;
      }
    } catch {
      // Ignore non-JSON diagnostics.
    }
  }
  return text || stdout;
}

function parseClaudeAssistantText(stdout) {
  let deltaText = "";
  let assistantText = "";
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const evt = JSON.parse(trimmed);
      if (evt?.type === "stream_event" && evt.event?.type === "content_block_delta") {
        const delta = evt.event.delta;
        if (delta?.type === "text_delta" && typeof delta.text === "string") deltaText += delta.text;
      } else if (evt?.type === "assistant" && Array.isArray(evt.message?.content)) {
        assistantText = evt.message.content.map((c) => c?.type === "text" ? c.text || "" : "").join("");
      }
    } catch {
      // Ignore non-JSON diagnostics.
    }
  }
  return deltaText || assistantText || stdout;
}

function assistantText(stdout, args) {
  return args.provider === "codex" ? parseCodexAssistantText(stdout) : parseClaudeAssistantText(stdout);
}

function extractJsonObject(text) {
  const stripped = String(text || "").replace(/```json/gi, "```").replace(/```/g, "").trim();
  const start = stripped.indexOf("{");
  if (start < 0) throw new Error("No JSON object found in assistant output");
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < stripped.length; i++) {
    const ch = stripped[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return JSON.parse(stripped.slice(start, i + 1));
    }
  }
  throw new Error("Unterminated JSON object in assistant output");
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

function chunkPrompt(bundleDir, row, chunk, totalChunks) {
  const schema = fs.readFileSync(path.join(bundleDir, "extraction-schema.json"), "utf8");
  return [
    "You are extracting RA/regulatory wiki facts from one chunk of a larger source document.",
    "Return JSON only. Use the provided schema exactly. Do not include markdown fences.",
    "This is a partial chunk, so extract only claims supported by this chunk.",
    "Preserve the exact source.queueId, source.sourcePath, and source.canonicalGroupId values.",
    "Prefer regulatory, safety, performance, cybersecurity, standards, test, certificate, submission, model, revision, and authority facts.",
    "Keep evidence concise but specific. Include enough evidence to preserve formal wiki quality.",
    "",
    `Chunk ${chunk.index} of ${totalChunks}; source character range ${chunk.start}-${chunk.end}.`,
    "",
    "SOURCE_METADATA_JSON",
    "```json",
    JSON.stringify({
      queueId: row.queueId,
      sourcePath: row.sourcePath,
      canonicalGroupId: row.canonicalGroupId,
      productSignal: row.productSignal,
      authoritySignal: row.authoritySignal,
      workstream: row.workstream,
    }, null, 2),
    "```",
    "",
    "EXTRACTION_SCHEMA_JSON",
    "```json",
    schema,
    "```",
    "",
    "SOURCE_CHUNK",
    "```text",
    chunk.text,
    "```",
  ].join("\n");
}

function mergePrompt(bundleDir, row, partials) {
  const schema = fs.readFileSync(path.join(bundleDir, "extraction-schema.json"), "utf8");
  return [
    "Merge partial extraction JSON objects into one final RA/regulatory wiki extraction.",
    "Return JSON only. Use the provided schema exactly. Do not include markdown fences.",
    "Preserve exact source fields from SOURCE_METADATA_JSON.",
    "Deduplicate repeated entities, concepts, evidence, and review flags.",
    "Do not invent facts. Keep only claims supported by the partial evidenceText values.",
    "Prefer the most specific document title, document type, product models, authority, revision, date, and standards found across chunks.",
    "",
    "SOURCE_METADATA_JSON",
    "```json",
    JSON.stringify({
      queueId: row.queueId,
      sourcePath: row.sourcePath,
      canonicalGroupId: row.canonicalGroupId,
    }, null, 2),
    "```",
    "",
    "EXTRACTION_SCHEMA_JSON",
    "```json",
    schema,
    "```",
    "",
    "PARTIAL_EXTRACTIONS_JSON",
    "```json",
    JSON.stringify(partials, null, 2),
    "```",
  ].join("\n");
}

function loadRunResults(bundleDir) {
  const runResultsPath = path.join(bundleDir, "run-results.json");
  return fs.existsSync(runResultsPath) ? readJson(runResultsPath) : [];
}

function upsertRunResult(bundleDir, next) {
  const runResultsPath = path.join(bundleDir, "run-results.json");
  const results = loadRunResults(bundleDir);
  const existing = results.findIndex((row) => row.pilotRank === next.pilotRank);
  if (existing >= 0) results[existing] = next;
  else results.push(next);
  results.sort((a, b) => (a.pilotRank || 0) - (b.pilotRank || 0));
  writeJson(runResultsPath, results);
}

async function callAndParse(prompt, args) {
  const result = await runProvider(prompt, args);
  const text = assistantText(result.stdout, args);
  let parsed = null;
  let parseError = "";
  try {
    parsed = extractJsonObject(text);
  } catch (err) {
    parseError = err instanceof Error ? err.message : String(err);
  }
  return { result, text, parsed, parseError };
}

async function runRow(bundleDir, row, args) {
  const inputText = fs.readFileSync(path.join(bundleDir, row.inputPath), "utf8");
  const chunks = splitText(inputText, args.chunkChars);
  const rawBase = path.join(bundleDir, "outputs", `${String(row.pilotRank).padStart(3, "0")}-${row.canonicalGroupId}`);
  const chunkDir = path.join(bundleDir, "outputs", "chunked", `${String(row.pilotRank).padStart(3, "0")}-${row.canonicalGroupId}`);
  fs.mkdirSync(chunkDir, { recursive: true });

  const startedAt = new Date().toISOString();
  const partials = [];
  const chunkResults = [];
  for (const chunk of chunks) {
    const call = await callAndParse(chunkPrompt(bundleDir, row, chunk, chunks.length), args);
    fs.writeFileSync(path.join(chunkDir, `chunk-${String(chunk.index).padStart(2, "0")}.stdout.txt`), call.result.stdout, "utf8");
    fs.writeFileSync(path.join(chunkDir, `chunk-${String(chunk.index).padStart(2, "0")}.stderr.txt`), call.result.stderr, "utf8");
    fs.writeFileSync(path.join(chunkDir, `chunk-${String(chunk.index).padStart(2, "0")}.assistant.txt`), call.text, "utf8");
    if (call.parsed) writeJson(path.join(chunkDir, `chunk-${String(chunk.index).padStart(2, "0")}.json`), call.parsed);
    const validationErrors = call.parsed ? validateExtraction(call.parsed, row) : [];
    chunkResults.push({
      chunk: chunk.index,
      exitCode: call.result.code,
      timedOut: call.result.timedOut,
      parseError: call.parseError,
      validationErrors,
      status: call.result.code === 0 && call.parsed && validationErrors.length === 0 ? "pass" : "fail",
    });
    if (call.result.code !== 0 || !call.parsed || validationErrors.length > 0) {
      return {
        final: null,
        runResult: {
          pilotRank: row.pilotRank,
          queueId: row.queueId,
          provider: args.provider,
          mode: "chunked",
          startedAt,
          finishedAt: new Date().toISOString(),
          exitCode: call.result.code,
          timedOut: call.result.timedOut,
          outputPath: "",
          parseError: call.parseError,
          validationErrors,
          chunkResults,
          status: "fail",
        },
      };
    }
    partials.push(call.parsed);
  }

  const merge = await callAndParse(mergePrompt(bundleDir, row, partials), args);
  fs.writeFileSync(`${rawBase}.chunked.stdout.txt`, merge.result.stdout, "utf8");
  fs.writeFileSync(`${rawBase}.chunked.stderr.txt`, merge.result.stderr, "utf8");
  fs.writeFileSync(`${rawBase}.chunked.assistant.txt`, merge.text, "utf8");
  const validationErrors = merge.parsed ? validateExtraction(merge.parsed, row) : [];
  if (merge.parsed) writeJson(path.join(bundleDir, row.expectedOutputPath), merge.parsed);
  return {
    final: merge.parsed,
    runResult: {
      pilotRank: row.pilotRank,
      queueId: row.queueId,
      provider: args.provider,
      mode: "chunked",
      startedAt,
      finishedAt: new Date().toISOString(),
      exitCode: merge.result.code,
      timedOut: merge.result.timedOut,
      outputPath: merge.parsed ? row.expectedOutputPath : "",
      parseError: merge.parseError,
      validationErrors,
      chunkResults,
      status: merge.result.code === 0 && merge.parsed && validationErrors.length === 0 ? "pass" : "fail",
    },
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const manifest = readJson(path.join(args.bundleDir, "manifest.json"));
  const results = loadRunResults(args.bundleDir);
  const failedRanks = new Set(results.filter((row) => row.status !== "pass").map((row) => row.pilotRank));
  const selectedRanks = args.failed ? [...failedRanks] : args.ranks;
  const rows = manifest.filter((row) => selectedRanks.includes(row.pilotRank));
  const plan = rows.map((row) => {
    const inputPath = path.join(args.bundleDir, row.inputPath);
    const chars = fs.readFileSync(inputPath, "utf8").length;
    return {
      pilotRank: row.pilotRank,
      inputPath: row.inputPath,
      outputPath: row.expectedOutputPath,
      chars,
      chunks: splitText(fs.readFileSync(inputPath, "utf8"), args.chunkChars).length,
    };
  });
  if (!args.run) {
    console.log(JSON.stringify({ dryRun: true, bundleDir: args.bundleDir, provider: args.provider, chunkChars: args.chunkChars, plan }, null, 2));
    return;
  }
  for (const row of rows) {
    const result = await runRow(args.bundleDir, row, args);
    upsertRunResult(args.bundleDir, result.runResult);
    console.log(JSON.stringify(result.runResult, null, 2));
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack || err.message : String(err));
  process.exit(1);
});
