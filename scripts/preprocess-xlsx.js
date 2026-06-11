#!/usr/bin/env node
// preprocess-xlsx.js
// XLSX 파일을 시트별 TXT로 분할. 출력: JSON 배열 [{file, sheet, rows}]
// Usage: node preprocess-xlsx.js <input.xlsx> <outputDir>

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const xlsxPath = process.argv[2];
const outputDir = process.argv[3];
const MAX_ROWS_PER_CHUNK = 300;

if (!xlsxPath || !outputDir) {
  process.stderr.write('Usage: node preprocess-xlsx.js <input.xlsx> <outputDir>\n');
  process.exit(1);
}

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

function sanitizeName(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_').substring(0, 60);
}

let wb;
try {
  wb = XLSX.readFile(xlsxPath, { sheetStubs: false, cellFormula: false, cellHTML: false });
} catch (e) {
  process.stderr.write('XLSX read error: ' + e.message + '\n');
  process.exit(2);
}

const baseName = path.basename(xlsxPath, path.extname(xlsxPath));
const results = [];

for (const sheetName of wb.SheetNames) {
  const ws = wb.Sheets[sheetName];
  if (!ws || !ws['!ref']) continue;

  const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false, RS: '\n' });
  const rows = csv.split('\n').filter(r => r.replace(/,/g, '').trim().length > 0);
  if (rows.length === 0) continue;

  const header = rows[0];
  const safeSheet = sanitizeName(sheetName);

  if (rows.length <= MAX_ROWS_PER_CHUNK) {
    const outName = `${sanitizeName(baseName)}_${safeSheet}.txt`;
    const content = `[출처: ${baseName}.xlsx / 시트: ${sheetName}]\n\n${rows.join('\n')}\n`;
    fs.writeFileSync(path.join(outputDir, outName), content, 'utf8');
    results.push({ file: outName, sheet: sheetName, rows: rows.length });
  } else {
    // 첫 행(헤더)을 각 청크에 포함
    let partNum = 0;
    for (let i = 1; i < rows.length; i += MAX_ROWS_PER_CHUNK - 1) {
      partNum++;
      const chunk = [header, ...rows.slice(i, i + MAX_ROWS_PER_CHUNK - 1)];
      const outName = `${sanitizeName(baseName)}_${safeSheet}_part${partNum}.txt`;
      const content = `[출처: ${baseName}.xlsx / 시트: ${sheetName} / Part ${partNum}]\n\n${chunk.join('\n')}\n`;
      fs.writeFileSync(path.join(outputDir, outName), content, 'utf8');
      results.push({ file: outName, sheet: sheetName, part: partNum, rows: chunk.length });
    }
  }
}

process.stdout.write(JSON.stringify(results) + '\n');
