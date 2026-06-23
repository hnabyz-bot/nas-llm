#!/usr/bin/env node
// Run direct CLI extraction for a prepared P0 pilot evaluation bundle.
//
// This script intentionally does not touch the app queue or live wiki vault. It
// reads `reports/p0-pilot-eval-*/manifest.json`, sends one input at a time to
// Codex CLI or Claude Code CLI, writes JSON outputs, and records validation
// status. Use --run to execute; without --run it only prints the selected work.

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const DEFAULT_BUNDLE = "reports\\p0-pilot-eval-20260618144923";

function parseArgs(argv) {
  const args = {
    bundleDir: DEFAULT_BUNDLE,
    provider: "codex",
    model: "",
    limit: 1,
    start: 1,
    timeoutMs: 10 * 60 * 1000,
    run: false,
    overwrite: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--bundle-dir") args.bundleDir = argv[++i];
    else if (arg === "--provider") args.provider = argv[++i];
    else if (arg === "--model") args.model = argv[++i];
    else if (arg === "--limit") args.limit = Number(argv[++i]);
    else if (arg === "--start") args.start = Number(argv[++i]);
    else if (arg === "--timeout-ms") args.timeoutMs = Number(argv[++i]);
    else if (arg === "--run") args.run = true;
    else if (arg === "--overwrite") args.overwrite = true;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!["codex", "claude"].includes(args.provider)) {
    throw new Error(`Invalid --provider: ${args.provider}`);
  }
  if (!Number.isFinite(args.limit) || args.limit < 1) throw new Error(`Invalid --limit: ${args.limit}`);
  if (!Number.isFinite(args.start) || args.start < 1) throw new Error(`Invalid --start: ${args.start}`);
  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs < 10000) {
    throw new Error(`Invalid --timeout-ms: ${args.timeoutMs}`);
  }
  return args;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/run-p0-pilot-extraction.js [options]

Options:
  --bundle-dir <path>   Evaluation bundle. Default: ${DEFAULT_BUNDLE}
  --provider <name>     codex or claude. Default: codex
  --model <name>        Optional model name passed to the CLI.
  --start <n>           1-based manifest row to start from. Default: 1
  --limit <n>           Number of rows to process. Default: 1
  --timeout-ms <n>      Per-source timeout. Default: 600000
  --run                 Actually call the CLI. Without this, only prints plan.
  --overwrite           Re-run rows whose output already exists.
`);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function buildPrompt(bundleDir, row) {
  const template = fs.readFileSync(path.join(bundleDir, "prompt-template.md"), "utf8");
  const schema = fs.readFileSync(path.join(bundleDir, "extraction-schema.json"), "utf8");
  const input = fs.readFileSync(path.join(bundleDir, row.inputPath), "utf8");
  return [
    template,
    "",
    "EXTRACTION_SCHEMA_JSON",
    "```json",
    schema,
    "```",
    "",
    "SOURCE_INPUT",
    "```text",
    input,
    "```",
    "",
    "Return JSON only. Do not include markdown fences.",
  ].join("\n");
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
    message: {
      role: "user",
      content: [{ type: "text", text: prompt }],
    },
  })}\n`;
}

async function runClaude(prompt, args) {
  const cliArgs = [
    "-p",
    "--output-format", "stream-json",
    "--input-format", "stream-json",
    "--verbose",
  ];
  if (args.model) cliArgs.push("--model", args.model);
  return runChild("claude", cliArgs, claudeInput(prompt), args.timeoutMs);
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

function extractJsonObject(text) {
  const stripped = String(text || "")
    .replace(/```json/gi, "```")
    .replace(/```/g, "")
    .trim();
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

async function main() {
  const args = parseArgs(process.argv);
  const manifest = readJson(path.join(args.bundleDir, "manifest.json"));
  const rows = manifest.slice(args.start - 1, args.start - 1 + args.limit);
  fs.mkdirSync(path.join(args.bundleDir, "outputs"), { recursive: true });
  const runResultsPath = path.join(args.bundleDir, "run-results.json");

  const plan = rows.map((row) => ({
    pilotRank: row.pilotRank,
    provider: args.provider,
    inputPath: row.inputPath,
    outputPath: row.expectedOutputPath,
    normalizedChars: row.normalizedChars,
  }));

  if (!args.run) {
    console.log(JSON.stringify({ dryRun: true, bundleDir: args.bundleDir, plan }, null, 2));
    return;
  }

  const results = fs.existsSync(runResultsPath) ? readJson(runResultsPath) : [];
  const upsertResult = (next) => {
    const existing = results.findIndex((row) => row.pilotRank === next.pilotRank);
    if (existing >= 0) results[existing] = next;
    else results.push(next);
    results.sort((a, b) => (a.pilotRank || 0) - (b.pilotRank || 0));
    fs.writeFileSync(runResultsPath, `${JSON.stringify(results, null, 2)}\n`, "utf8");
  };
  for (const row of rows) {
    const outputPath = path.join(args.bundleDir, row.expectedOutputPath);
    if (fs.existsSync(outputPath) && !args.overwrite) {
      if (!results.some((result) => result.pilotRank === row.pilotRank)) {
        upsertResult({
          pilotRank: row.pilotRank,
          queueId: row.queueId,
          provider: args.provider,
          outputPath: row.expectedOutputPath,
          status: "skipped_existing",
        });
      }
      continue;
    }

    const prompt = buildPrompt(args.bundleDir, row);
    const startedAt = new Date().toISOString();
    const result = args.provider === "codex"
      ? await runCodex(prompt, args)
      : await runClaude(prompt, args);
    const assistantText = args.provider === "codex"
      ? parseCodexAssistantText(result.stdout)
      : parseClaudeAssistantText(result.stdout);

    let parsed = null;
    let validationErrors = [];
    let parseError = "";
    try {
      parsed = extractJsonObject(assistantText);
      validationErrors = validateExtraction(parsed, row);
    } catch (err) {
      parseError = err instanceof Error ? err.message : String(err);
    }

    const rawBase = path.join(args.bundleDir, "outputs", `${String(row.pilotRank).padStart(3, "0")}-${row.canonicalGroupId}`);
    fs.writeFileSync(`${rawBase}.stdout.txt`, result.stdout, "utf8");
    fs.writeFileSync(`${rawBase}.stderr.txt`, result.stderr, "utf8");
    fs.writeFileSync(`${rawBase}.assistant.txt`, assistantText, "utf8");
    if (parsed) fs.writeFileSync(outputPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");

    const runResult = {
      pilotRank: row.pilotRank,
      queueId: row.queueId,
      provider: args.provider,
      startedAt,
      finishedAt: new Date().toISOString(),
      exitCode: result.code,
      timedOut: result.timedOut,
      outputPath: parsed ? row.expectedOutputPath : "",
      parseError,
      validationErrors,
      status: result.code === 0 && parsed && validationErrors.length === 0 ? "pass" : "fail",
    };
    upsertResult(runResult);
    console.log(JSON.stringify(runResult, null, 2));
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack || err.message : String(err));
  process.exit(1);
});
