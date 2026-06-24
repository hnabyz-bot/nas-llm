#!/usr/bin/env node
// Non-mutating app/API smoke QA for the P0-published vault.
//
// Requires a running llm-wiki app with local API enabled. This script only calls
// read endpoints: health, projects, files, content, search, and graph.

const fs = require("fs");
const path = require("path");

const DEFAULT_BASE_URL = "http://127.0.0.1:19828";
const DEFAULT_PROJECT_ID = "2da34b71-49aa-4919-a66a-90f1683772f9";
const DEFAULT_VAULT = "D:\\vault\\llm-wiki-vault";
const DEFAULT_APPLY_DIR = "reports\\p0-vault-materialize-apply-202606241458";
const REPORTS_ROOT = "reports";

function parseArgs(argv) {
  const args = {
    baseUrl: DEFAULT_BASE_URL,
    projectId: DEFAULT_PROJECT_ID,
    vaultRoot: DEFAULT_VAULT,
    applyDir: DEFAULT_APPLY_DIR,
    outDir: "",
    token: process.env.API_TOKEN || process.env.LLM_WIKI_API_TOKEN || "",
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--base-url") args.baseUrl = argv[++i];
    else if (arg === "--project-id") args.projectId = argv[++i];
    else if (arg === "--vaultRoot") args.vaultRoot = argv[++i];
    else if (arg === "--apply-dir") args.applyDir = argv[++i];
    else if (arg === "--out-dir") args.outDir = argv[++i];
    else if (arg === "--token") args.token = argv[++i];
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!args.outDir) args.outDir = path.join(REPORTS_ROOT, `p0-app-smoke-${timestamp()}`);
  return args;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/smoke-p0-app-api.js [options]

Options:
  --base-url <url>       LLM Wiki API base URL. Default: ${DEFAULT_BASE_URL}
  --project-id <id>      Project id. Default: ${DEFAULT_PROJECT_ID}
  --vaultRoot <path>     Vault root. Default: ${DEFAULT_VAULT}
  --apply-dir <path>     P0 apply report directory. Default: ${DEFAULT_APPLY_DIR}
  --out-dir <path>       Report output directory. Default: reports/p0-app-smoke-<timestamp>
  --token <token>        Optional API token.
`);
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
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function flatten(nodes) {
  const out = [];
  const visit = (items) => {
    for (const item of items || []) {
      out.push(item);
      if (item.children) visit(item.children);
    }
  };
  visit(nodes);
  return out;
}

async function request(args, method, apiPath, body = undefined) {
  const headers = {};
  if (args.token) headers.Authorization = `Bearer ${args.token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${args.baseUrl}${apiPath}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text };
  }
  return { status: response.status, body: parsed };
}

function pickSourcePage(applyDir) {
  const files = readJson(path.join(applyDir, "materialize-files.json"));
  const source = files.find((item) => item.relPath && item.relPath.startsWith("wiki/sources/"));
  if (!source) throw new Error("No source page found in materialize-files.json");
  return source.relPath;
}

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

async function main() {
  const args = parseArgs(process.argv);
  fs.mkdirSync(args.outDir, { recursive: true });
  const errors = [];
  const warnings = [];
  const sourcePage = pickSourcePage(args.applyDir);

  const health = await request(args, "GET", "/api/v1/health");
  assert(health.status === 200 && health.body.ok === true, `health failed: ${health.status}`, errors);
  assert(health.body.status === "running", `API status is ${health.body.status}`, errors);
  assert(health.body.enabled === true, "API is not enabled", errors);

  const projects = await request(args, "GET", "/api/v1/projects");
  assert(projects.status === 200 && projects.body.ok === true, `projects failed: ${projects.status}`, errors);
  const project = (projects.body.projects || []).find(
    (item) => item.id === args.projectId || String(item.path || "").replace(/\\/g, "/").toLowerCase() === args.vaultRoot.replace(/\\/g, "/").toLowerCase(),
  );
  assert(Boolean(project), "vault project not returned by API projects", errors);

  const topFiles = await request(args, "GET", `/api/v1/projects/${encodeURIComponent(args.projectId)}/files?root=wiki&recursive=false`);
  assert(topFiles.status === 200 && topFiles.body.ok === true, `top files failed: ${topFiles.status}`, errors);
  const topNames = new Set((topFiles.body.files || []).map((item) => item.name));
  for (const required of ["sources", "entities", "concepts", "findings"]) {
    assert(topNames.has(required), `wiki top-level folder missing via API: ${required}`, errors);
  }

  const contentPath = encodeURIComponent(sourcePage);
  const content = await request(args, "GET", `/api/v1/projects/${encodeURIComponent(args.projectId)}/files/content?path=${contentPath}`);
  assert(content.status === 200 && content.body.ok === true, `content failed: ${content.status}`, errors);
  const contentText = String(content.body.content || "");
  assert(contentText.includes("P0-STAGING-PUBLISH:p0:BEGIN"), "source page content missing P0 marker", errors);
  assert(contentText.includes("queueId:"), "source page content missing queueId", errors);
  assert(contentText.includes("sources:"), "source page content missing frontmatter sources", errors);

  const search = await request(args, "POST", `/api/v1/projects/${encodeURIComponent(args.projectId)}/search`, {
    query: "HnX cybersecurity labeling",
    topK: 10,
    includeContent: true,
  });
  assert(search.status === 200 && search.body.ok === true, `search failed: ${search.status} ${JSON.stringify(search.body)}`, errors);
  const searchResults = search.body.results || [];
  assert(searchResults.length > 0, "search returned no results", errors);
  assert(searchResults.some((item) => String(item.path || "").startsWith("wiki/")), "search returned no wiki paths", errors);

  const graph = await request(args, "GET", `/api/v1/projects/${encodeURIComponent(args.projectId)}/graph?limit=200`);
  assert(graph.status === 200 && graph.body.ok === true, `graph failed: ${graph.status}`, errors);
  const graphNodes = graph.body.nodes || [];
  assert(graphNodes.length > 0, "graph returned no nodes", errors);
  assert(graphNodes.some((node) => String(node.path || "").startsWith("wiki/")), "graph returned no wiki nodes", errors);

  const result = {
    generatedAt: new Date().toISOString(),
    pass: errors.length === 0,
    errors,
    warnings,
    api: {
      baseUrl: args.baseUrl,
      health: health.body,
      project,
    },
    checks: {
      sourcePage,
      topLevelWikiEntries: [...topNames].sort(),
      sourcePageContentLength: contentText.length,
      searchMode: search.body.mode,
      searchResultCount: searchResults.length,
      firstSearchResults: searchResults.slice(0, 5).map((item) => ({
        path: item.path,
        title: item.title,
        score: item.score,
      })),
      graphNodeCount: graphNodes.length,
      graphEdgeCount: (graph.body.edges || []).length,
      firstGraphNodes: graphNodes.slice(0, 5).map((item) => ({
        path: item.path,
        label: item.label,
        nodeType: item.nodeType,
      })),
    },
  };

  writeJson(path.join(args.outDir, "p0-app-smoke-summary.json"), result);
  fs.writeFileSync(path.join(args.outDir, "p0-app-smoke-report.md"), renderMarkdown(result), "utf8");

  console.log(`SMOKE ${result.pass ? "PASS" : "FAIL"}`);
  console.log(`report=${args.outDir}`);
  console.log(`searchResults=${result.checks.searchResultCount}, graphNodes=${result.checks.graphNodeCount}, graphEdges=${result.checks.graphEdgeCount}`);
  console.log(`errors=${errors.length}, warnings=${warnings.length}`);
  process.exit(result.pass ? 0 : 1);
}

function renderMarkdown(result) {
  return [
    "# P0 App API Smoke Report",
    "",
    `Generated: ${result.generatedAt}`,
    `Result: ${result.pass ? "PASS" : "FAIL"}`,
    "",
    "## API",
    "",
    `- base URL: ${result.api.baseUrl}`,
    `- health: ${JSON.stringify(result.api.health)}`,
    `- project: ${result.api.project ? `${result.api.project.name} (${result.api.project.id})` : "(missing)"}`,
    "",
    "## Checks",
    "",
    `- source page content: ${result.checks.sourcePage}`,
    `- source page content length: ${result.checks.sourcePageContentLength}`,
    `- wiki top-level entries: ${result.checks.topLevelWikiEntries.join(", ")}`,
    `- search mode: ${result.checks.searchMode}`,
    `- search result count: ${result.checks.searchResultCount}`,
    `- graph nodes/edges: ${result.checks.graphNodeCount}/${result.checks.graphEdgeCount}`,
    "",
    "## Errors",
    "",
    ...(result.errors.length ? result.errors.map((item) => `- ${item}`) : ["- none"]),
    "",
    "## Warnings",
    "",
    ...(result.warnings.length ? result.warnings.map((item) => `- ${item}`) : ["- none"]),
    "",
  ].join("\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
