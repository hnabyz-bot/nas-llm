const fs = require("fs")
const path = require("path")

const args = process.argv.slice(2)
let vaultRoot = "D:/vault/llm-wiki-vault"
let apply = false

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--vaultRoot") {
    vaultRoot = args[++i]
  } else if (args[i] === "--apply") {
    apply = true
  }
}

vaultRoot = vaultRoot.replace(/\\/g, "/").replace(/\/+$/, "")

const queuePath = `${vaultRoot}/.llm-wiki/ingest-queue.json`
const cachePath = `${vaultRoot}/.llm-wiki/ingest-cache.json`

function stamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, "0")
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

function fullPath(rel) {
  return path.join(vaultRoot, rel.replace(/\//g, path.sep))
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""))
}

function extractOriginalSource(queueItem) {
  const sourceFile = fullPath(queueItem.sourcePath)
  const fd = fs.openSync(sourceFile, "r")
  try {
    const buf = Buffer.alloc(4096)
    const n = fs.readSync(fd, buf, 0, buf.length, 0)
    const head = buf.slice(0, n).toString("utf8")
    const match = head.match(/^\[Source: (.*?)\]/m)
    return match ? match[1] : null
  } finally {
    fs.closeSync(fd)
  }
}

const queue = readJson(queuePath)
const cacheRoot = readJson(cachePath)
const cache = cacheRoot.entries || {}
const cacheOkMemo = new Map()

function cacheFilesExist(cacheKey) {
  if (cacheOkMemo.has(cacheKey)) return cacheOkMemo.get(cacheKey)
  const entry = cache[cacheKey]
  const ok = !!entry &&
    Array.isArray(entry.filesWritten) &&
    entry.filesWritten.length > 0 &&
    entry.filesWritten.every((rel) => fs.existsSync(fullPath(rel)))
  cacheOkMemo.set(cacheKey, ok)
  return ok
}

const metadata = queue.map((item) => {
  const originalSource = extractOriginalSource(item)
  const baseName = originalSource ? path.basename(originalSource) : ""
  return { item, originalSource, baseName }
})

const baseCounts = new Map()
for (const row of metadata) {
  if (!row.baseName) continue
  baseCounts.set(row.baseName, (baseCounts.get(row.baseName) || 0) + 1)
}

const keep = []
const pruned = []
const skipped = {
  duplicateBasenameCacheHits: 0,
  staleCacheHits: 0,
  noCacheHit: 0,
  noOriginalSourceHeader: 0,
}

for (const row of metadata) {
  const exactHit = row.originalSource && cache[row.originalSource]
  const basenameHit = row.baseName && cache[row.baseName]

  if (exactHit) {
    if (cacheFilesExist(row.originalSource)) {
      pruned.push({ reason: "exact-original-cache-hit", sourcePath: row.item.sourcePath, originalSource: row.originalSource })
    } else {
      skipped.staleCacheHits++
      keep.push(row.item)
    }
    continue
  }

  if (basenameHit) {
    if (!cacheFilesExist(row.baseName)) {
      skipped.staleCacheHits++
      keep.push(row.item)
    } else if (baseCounts.get(row.baseName) === 1) {
      pruned.push({ reason: "unique-basename-cache-hit", sourcePath: row.item.sourcePath, originalSource: row.originalSource })
    } else {
      skipped.duplicateBasenameCacheHits++
      keep.push(row.item)
    }
    continue
  }

  if (!row.originalSource) skipped.noOriginalSourceHeader++
  else skipped.noCacheHit++
  keep.push(row.item)
}

const report = {
  generatedAt: new Date().toISOString(),
  apply,
  queueBefore: queue.length,
  queueAfter: keep.length,
  pruned: pruned.length,
  prunedByReason: pruned.reduce((acc, item) => {
    acc[item.reason] = (acc[item.reason] || 0) + 1
    return acc
  }, {}),
  skipped,
  samples: pruned.slice(0, 20),
}

const reportPath = `${vaultRoot}/.llm-wiki/ingest-queue-prune-report-${stamp()}${apply ? "" : "-dry-run"}.json`
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8")

if (apply) {
  const backupPath = `${queuePath}.bak-${stamp()}-before-cache-prune`
  fs.copyFileSync(queuePath, backupPath)
  fs.writeFileSync(queuePath, JSON.stringify(keep, null, 2), "utf8")
  report.backupPath = backupPath
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8")
}

console.log(JSON.stringify({
  queueBefore: report.queueBefore,
  queueAfter: report.queueAfter,
  pruned: report.pruned,
  prunedByReason: report.prunedByReason,
  skipped: report.skipped,
  reportPath,
  applied: apply,
}, null, 2))
