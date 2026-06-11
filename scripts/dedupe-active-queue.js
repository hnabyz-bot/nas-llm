const fs = require('fs');

const queuePath = process.argv[2] || 'D:/vault/llm-wiki-vault/.llm-wiki/ingest-queue.json';

const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
if (!Array.isArray(queue)) {
  throw new Error('Queue JSON root is not an array');
}

const backup = `${queuePath}.bak-${new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)}`;
fs.copyFileSync(queuePath, backup);

const seen = new Set();
let duplicates = 0;

for (const item of queue) {
  const active = item.status === 'pending' || item.status === 'processing';
  if (!active) continue;

  const sourcePath = String(item.sourcePath || '').toLowerCase();
  if (seen.has(sourcePath)) {
    item.status = 'failed';
    item.error = 'Duplicate active queue item: kept first occurrence';
    item.retryCount = 3;
    duplicates += 1;
  } else {
    seen.add(sourcePath);
  }
}

fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2), 'utf8');

console.log(`Backup: ${backup}`);
console.log(`Duplicate active entries marked failed: ${duplicates}`);
console.log(`Final total: ${queue.length}`);
