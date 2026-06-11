const fs = require('fs');

const queuePath = process.argv[2] || 'D:/vault/llm-wiki-vault/.llm-wiki/ingest-queue.json';
const apply = process.argv.includes('--apply');

const folderPriority = new Map([
  ['RA', 10],
  ['DHF (인허가)', 20],
  ['연구소 문서등록대장', 30],
  ['Standard(국제)', 40],
  ['타사 메뉴얼', 50],
  ['Project', 60],
  ['Restricted_Backup', 70],
]);

const keywordPriority = [
  { pattern: /HnVUE|CYAN|HnX|FDA|국내|인증|보완|사이버보안|Cybersecurity/i, score: -8 },
  { pattern: /DHF|DMR|BOM|출하검사|성능|안전|검증|validation|verification/i, score: -4 },
  { pattern: /manual|Manual|메뉴얼|IFU|Instructions/i, score: -2 },
];

function topFolder(sourcePath) {
  const prefix = 'raw/sources/_preprocessed/';
  if (!sourcePath.startsWith(prefix)) return '<original>';
  return sourcePath.slice(prefix.length).split('/')[0];
}

function score(item) {
  const sourcePath = String(item.sourcePath || '');
  let value = folderPriority.get(topFolder(sourcePath)) ?? 999;
  for (const rule of keywordPriority) {
    if (rule.pattern.test(sourcePath)) value += rule.score;
  }
  return value;
}

const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
if (!Array.isArray(queue)) {
  throw new Error('Queue JSON root is not an array');
}

const nonPending = queue.filter((item) => item.status !== 'pending');
const pending = queue.filter((item) => item.status === 'pending');
const sortedPending = [...pending].sort((a, b) => {
  const scoreDiff = score(a) - score(b);
  if (scoreDiff !== 0) return scoreDiff;
  return String(a.sourcePath || '').localeCompare(String(b.sourcePath || ''));
});

const summary = new Map();
for (const item of sortedPending) {
  const folder = topFolder(String(item.sourcePath || ''));
  summary.set(folder, (summary.get(folder) || 0) + 1);
}

console.log('Pending priority summary:');
[...summary.entries()]
  .sort(([a], [b]) => (folderPriority.get(a) ?? 999) - (folderPriority.get(b) ?? 999))
  .forEach(([folder, count]) => {
    const priority = folderPriority.get(folder) ?? 999;
    console.log(`  P${priority} ${folder}: ${count}`);
  });

console.log('Top 20 pending after priority sort:');
for (const item of sortedPending.slice(0, 20)) {
  console.log(`  ${String(score(item)).padStart(4, ' ')}  ${item.sourcePath}`);
}

if (!apply) {
  console.log('Dry run only. Re-run with -Apply to write sorted queue.');
  process.exit(0);
}

const backup = `${queuePath}.bak-${new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)}`;
fs.copyFileSync(queuePath, backup);
fs.writeFileSync(queuePath, JSON.stringify([...nonPending, ...sortedPending], null, 2), 'utf8');

console.log('Queue sorted and saved.');
console.log(`Backup: ${backup}`);
