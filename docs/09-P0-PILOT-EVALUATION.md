# 09. P0 Pilot Evaluation

Date: 2026-06-19
Scope: subscription-only direct processing before app ingest restart
Tracking issue: https://github.com/hnabyz-bot/nas-llm/issues/17

## Decision

Do not start `llm-wiki` for the current bulk P0 work. The app ingest path is
still valid for normal single-source use, but the current corpus is too large
for flat app ingest. P0 must first be evaluated through a direct staging pilot:

1. meaningful-content disposition
2. representative-source extraction through Codex/Claude CLI
3. deterministic source/entity/concept page assembly
4. QA gate
5. expand only after measured quality is acceptable

## Evaluation Inputs

P0 meaningful-content triage:

- `reports/p0-meaningful-triage-20260618153500`
- P0 sources: 9,027
- full-wiki representative candidates: 1,775
- canonical duplicates: 6,491
- low-text review: 94
- empty-text recovery: 667
- avoided full LLM calls before pilot: 7,252 (80.3%)

First evaluation bundle:

- `reports/p0-pilot-eval-20260618153600`
- selected representatives: 30
- estimated input size: 662,833 chars/4 tokens
- product distribution:
  - HnX: 22
  - HAD/A/F 1417-1717: 5
  - CYAN: 3
- authority distribution:
  - MFDS/domestic: 16
  - CE/MDR: 10
  - FDA: 4

The bundle includes:

- `manifest.json`
- `manifest.csv`
- `inputs/*.txt`
- `extraction-schema.json`
- `prompt-template.md`
- `qa-rubric.md`
- `outputs/`

300-source evaluation bundle:

- `reports/p0-pilot-eval-300-20260618173500`
- selected representatives: 300
- estimated input size: 5,536,577 chars/4 tokens
- product distribution:
  - HnX: 211
  - HAD/A/F 1417-1717: 58
  - CYAN: 28
  - HnVUE: 3
- authority distribution:
  - MFDS/domestic: 153
  - FDA: 75
  - CE/MDR: 54
  - general: 14
  - overseas: 4

## 30-Source Extraction Result

Codex CLI extraction was run for all 30 representatives from the evaluation
bundle. The app was not started.

Command pattern:

```powershell
node scripts/run-p0-pilot-extraction.js --bundle-dir reports\p0-pilot-eval-20260618153600 --provider codex --start 1 --limit 30 --run
```

Result:

- completed outputs: 30
- JSON/required-field validation pass: 30
- failures: 0
- blocker review flags: 0
- observed average runtime: 80.2 seconds/source
- observed total runtime: 40.1 minutes
- total extracted evidence records: 572
- total review flags: 103

Observed quality:

- cybersecurity labeling, lifecycle, software validation, risk management, CB
  report, FMEA, threat modeling, SBOM, and development-report sources produced
  structured extraction records.
- the extractor preserved `queueId`, `sourcePath`, and `canonicalGroupId` for
  validation.
- review flags captured source-path/body revision mismatch, authority inferred
  only from path metadata, missing standards, and OCR/text extraction artifacts.
- page-marker-only test report sources were removed from the full-wiki pilot by
  the updated triage rule and moved to recovery disposition.

Interpretation: the extraction schema, prompt, and page-marker triage rule are
viable for expanding to the 300 representative-source pilot.

## 300-Source Extraction Result

Codex CLI extraction was run for all 300 representatives from the 300-source
evaluation bundle. The app was not started.

Command pattern:

```powershell
node scripts/run-p0-pilot-extraction.js --bundle-dir reports\p0-pilot-eval-300-20260618173500 --provider codex --start 41 --limit 260 --timeout-ms 900000 --run
node scripts/run-p0-chunked-extraction.js --bundle-dir reports\p0-pilot-eval-300-20260618173500 --failed --chunk-chars 180000 --timeout-ms 900000 --run
```

Result:

- completed outputs: 300
- JSON/required-field/source-field validation pass: 300
- failures after chunked retry: 0
- chunked fallback passes: 5
- validation errors after final QA: 0
- total extracted evidence records: 6,491
- average evidence records/source: 21.6
- minimum evidence records/source: 4
- total review flags: 1,113
- average review flags/source: 3.7
- recorded runtime: 27,833.6 seconds total, 92.8 seconds/source average

Chunked fallback was required for large/context-heavy test report sources:

- rank 70: 1,294,537 chars, 8 chunks
- rank 76: 384,102 chars, 3 chunks
- rank 88: 974,183 chars, 6 chunks
- rank 123: 948,370 chars, 6 chunks
- rank 182: 1,292,145 chars, 8 chunks

Observed quality:

- all final outputs are parseable JSON and preserve `queueId`, `sourcePath`,
  and `canonicalGroupId`.
- no page-marker-only source leaked into final outputs.
- low evidence counts are limited to short confirmation/form sources and are
  accompanied by review flags.
- large IEC/CB test reports need chunked extraction instead of flat single
  prompt extraction.

Interpretation: the 300-source staged extraction has passed the service-quality
pilot gate. The next step is deterministic page assembly and QA in staging, not
starting the app bulk ingest path.

## P0 Expansion Checkpoint: Ranks 301-400

Codex CLI extraction was run for the next 100 P0 representative candidates from
the full ranked representative set. The app was not started.

Bundle:

- `reports/p0-pilot-eval-p0-r301-r400-202606190145`
- representative rank range: 301-400
- selected representatives: 100
- estimated input size: 1,959,491 chars/4 tokens
- product distribution:
  - HnX: 68
  - HAD/A/F 1417-1717: 23
  - ADD/AspenView: 6
  - CYAN: 3
- authority distribution:
  - FDA: 59
  - CE/MDR: 19
  - general: 16
  - MFDS/domestic: 3
  - overseas: 3

Command pattern:

```powershell
node scripts/prepare-p0-pilot-eval.js --triage-dir reports\p0-meaningful-triage-20260618153500 --source full --start-rank 301 --count 100 --out-dir reports\p0-pilot-eval-p0-r301-r400-202606190145
node scripts/run-p0-pilot-extraction.js --bundle-dir reports\p0-pilot-eval-p0-r301-r400-202606190145 --provider codex --start 1 --limit 100 --timeout-ms 900000 --run
node scripts/run-p0-chunked-extraction.js --bundle-dir reports\p0-pilot-eval-p0-r301-r400-202606190145 --failed --chunk-chars 180000 --timeout-ms 900000 --run
node scripts/summarize-p0-eval.js --bundle-dir reports\p0-pilot-eval-p0-r301-r400-202606190145
```

Result:

- completed outputs: 100
- JSON parse pass: 100
- JSON/required-field/source-field validation pass: 100
- failures after chunked retry: 0
- chunked fallback passes: 1
- validation errors after final QA: 0
- page-marker leakage after final QA: 0
- outputs missing evidence: 0
- total extracted evidence records: 1,958
- average evidence records/source: 19.6
- minimum evidence records/source: 1
- total review flags: 375
- average review flags/source: 3.8
- recorded runtime: 8,493.3 seconds total, 84.9 seconds/source average

Chunked fallback was required for one context-heavy reference source:

- rank 328: 1,033,486 input chars, 6 chunks

Observed quality:

- all final outputs are parseable JSON and preserve `queueId`, `sourcePath`,
  and `canonicalGroupId`.
- no preprocessing page-marker wrappers leaked into final outputs.
- every output has at least one evidence record.
- review flags captured missing or inferred metadata, OCR/text quality issues,
  and document/source-path ambiguity without blocking extraction.

Interpretation: the ranks 301-400 expansion checkpoint passed the same staging
QA gate as the 300-source pilot. Continue P0 representative extraction in
100-300 source checkpoints, using chunked extraction for context-heavy inputs.

## P0 Expansion Checkpoint: Ranks 401-500

Codex CLI extraction was run for the next 100 P0 representative candidates from
the full ranked representative set. The app was not started.

Bundle:

- `reports/p0-pilot-eval-p0-r401-r500-202606190409`
- representative rank range: 401-500
- selected representatives: 100
- estimated input size: 1,333,393 chars/4 tokens
- product distribution:
  - HnX: 56
  - HAD/A/F 1417-1717: 34
  - CYAN: 10
- authority distribution:
  - FDA: 45
  - MFDS/domestic: 27
  - CE/MDR: 14
  - general: 13
  - overseas: 1

Command pattern:

```powershell
node scripts/prepare-p0-pilot-eval.js --triage-dir reports\p0-meaningful-triage-20260618153500 --source full --start-rank 401 --count 100 --out-dir reports\p0-pilot-eval-p0-r401-r500-202606190409
node scripts/run-p0-pilot-extraction.js --bundle-dir reports\p0-pilot-eval-p0-r401-r500-202606190409 --provider codex --start 1 --limit 100 --timeout-ms 900000 --run
node scripts/summarize-p0-eval.js --bundle-dir reports\p0-pilot-eval-p0-r401-r500-202606190409
```

Result:

- completed outputs: 100
- JSON parse pass: 100
- JSON/required-field/source-field validation pass: 100
- failures after retry: 0
- chunked fallback passes: 0
- validation errors after final QA: 0
- page-marker leakage after final QA: 0
- outputs missing evidence: 0
- total extracted evidence records: 2,076
- average evidence records/source: 20.8
- minimum evidence records/source: 5
- total review flags: 379
- average review flags/source: 3.8
- recorded runtime: 8,055.5 seconds total, 80.6 seconds/source average

Observed quality:

- all final outputs are parseable JSON and preserve `queueId`, `sourcePath`,
  and `canonicalGroupId`.
- no preprocessing page-marker wrappers leaked into final outputs.
- every output has at least five evidence records.
- review flags captured missing or inferred metadata, OCR/text quality issues,
  and document/source-path ambiguity without blocking extraction.

Interpretation: the ranks 401-500 expansion checkpoint passed the same staging
QA gate as prior P0 checkpoints. Continue P0 representative extraction with
the next checkpoint starting at rank 501.

## P0 Expansion Checkpoint: Ranks 501-600

Codex CLI extraction was run for the next 100 P0 representative candidates from
the full ranked representative set. The app was not started.

Bundle:

- `reports/p0-pilot-eval-p0-r501-r600-202606190628`
- representative rank range: 501-600
- selected representatives: 100
- estimated input size: 1,750,521 chars/4 tokens
- product distribution:
  - HnX: 92
  - HAD/A/F 1417-1717: 6
  - ADD/AspenView: 2
- authority distribution:
  - CE/MDR: 44
  - FDA: 37
  - MFDS/domestic: 17
  - overseas: 1
  - general: 1

Command pattern:

```powershell
node scripts/prepare-p0-pilot-eval.js --triage-dir reports\p0-meaningful-triage-20260618153500 --source full --start-rank 501 --count 100 --out-dir reports\p0-pilot-eval-p0-r501-r600-202606190628
node scripts/run-p0-pilot-extraction.js --bundle-dir reports\p0-pilot-eval-p0-r501-r600-202606190628 --provider codex --start 1 --limit 100 --timeout-ms 900000 --run
node scripts/run-p0-chunked-extraction.js --bundle-dir reports\p0-pilot-eval-p0-r501-r600-202606190628 --failed --chunk-chars 180000 --timeout-ms 900000 --run
node scripts/summarize-p0-eval.js --bundle-dir reports\p0-pilot-eval-p0-r501-r600-202606190628
```

Result:

- completed outputs: 100
- JSON parse pass: 100
- JSON/required-field/source-field validation pass: 100
- failures after retry: 0
- chunked fallback passes: 0
- validation errors after final QA: 0
- page-marker leakage after final QA: 0
- outputs missing evidence: 0
- total extracted evidence records: 2,204
- average evidence records/source: 22.0
- minimum evidence records/source: 6
- total review flags: 395
- average review flags/source: 4.0
- recorded runtime: 8,606.5 seconds total, 86.1 seconds/source average

Observed quality:

- all final outputs are parseable JSON and preserve `queueId`, `sourcePath`,
  and `canonicalGroupId`.
- no preprocessing page-marker wrappers leaked into final outputs.
- every output has at least six evidence records.
- review flags captured missing or inferred metadata, OCR/text quality issues,
  and document/source-path ambiguity without blocking extraction.

Interpretation: the ranks 501-600 expansion checkpoint passed the same staging
QA gate as prior P0 checkpoints. Continue P0 representative extraction with
the next checkpoint starting at rank 601.

## P0 Expansion Checkpoint: Ranks 601-700

Codex CLI extraction was run for the next 100 P0 representative candidates from
the full ranked representative set. The app was not started.

Bundle:

- `reports/p0-pilot-eval-p0-r601-r700-202606191056`
- representative rank range: 601-700
- selected representatives: 100
- estimated input size: 940,831 chars/4 tokens
- product distribution:
  - HnX: 79
  - HAD/A/F 1417-1717: 13
  - ADD/AspenView: 4
  - CYAN: 3
  - HnVUE: 1
- authority distribution:
  - FDA: 48
  - CE/MDR: 30
  - MFDS/domestic: 16
  - general: 6

Command pattern:

```powershell
node scripts/prepare-p0-pilot-eval.js --triage-dir reports\p0-meaningful-triage-20260618153500 --source full --start-rank 601 --count 100 --out-dir reports\p0-pilot-eval-p0-r601-r700-202606191056
node scripts/run-p0-pilot-extraction.js --bundle-dir reports\p0-pilot-eval-p0-r601-r700-202606191056 --provider codex --start 1 --limit 100 --timeout-ms 900000 --run
node scripts/run-p0-chunked-extraction.js --bundle-dir reports\p0-pilot-eval-p0-r601-r700-202606191056 --failed --chunk-chars 180000 --timeout-ms 900000 --run
node scripts/summarize-p0-eval.js --bundle-dir reports\p0-pilot-eval-p0-r601-r700-202606191056
```

Result:

- completed outputs: 100
- JSON parse pass: 100
- JSON/required-field/source-field validation pass: 100
- failures after retry: 0
- chunked fallback passes: 0
- validation errors after final QA: 0
- page-marker leakage after final QA: 0
- outputs missing evidence: 0
- total extracted evidence records: 2,123
- average evidence records/source: 21.2
- minimum evidence records/source: 8
- total review flags: 360
- average review flags/source: 3.6
- recorded runtime: 7,684.5 seconds total, 76.8 seconds/source average

Observed quality:

- all final outputs are parseable JSON and preserve `queueId`, `sourcePath`,
  and `canonicalGroupId`.
- no preprocessing page-marker wrappers leaked into final outputs.
- every output has at least eight evidence records.
- review flags captured missing or inferred metadata, OCR/text quality issues,
  and document/source-path ambiguity without blocking extraction.

Interpretation: the ranks 601-700 expansion checkpoint passed the same staging
QA gate as prior P0 checkpoints. Continue P0 representative extraction with
the next checkpoint starting at rank 701.

## P0 Expansion Checkpoint: Ranks 701-800

Codex CLI extraction was run for the next 100 P0 representative candidates from
the full ranked representative set. The app was not started.

Bundle:

- `reports/p0-pilot-eval-p0-r701-r800-202606230941`
- representative rank range: 701-800
- selected representatives: 100
- estimated input size: 1,176,168 chars/4 tokens
- product distribution:
  - HnX: 62
  - HAD/A/F 1417-1717: 29
  - CYAN: 8
  - ADD/AspenView: 1
- authority distribution:
  - FDA: 70
  - general: 12
  - MFDS/domestic: 9
  - CE/MDR: 8
  - overseas: 1

Command pattern:

```powershell
node scripts/prepare-p0-pilot-eval.js --triage-dir reports\p0-meaningful-triage-20260618153500 --source full --start-rank 701 --count 100 --out-dir reports\p0-pilot-eval-p0-r701-r800-202606230941
node scripts/run-p0-pilot-extraction.js --bundle-dir reports\p0-pilot-eval-p0-r701-r800-202606230941 --provider codex --start 1 --limit 100 --timeout-ms 900000 --run
node scripts/run-p0-pilot-extraction.js --bundle-dir reports\p0-pilot-eval-p0-r701-r800-202606230941 --provider codex --start 3 --limit 1 --timeout-ms 900000 --run --overwrite
node scripts/summarize-p0-eval.js --bundle-dir reports\p0-pilot-eval-p0-r701-r800-202606230941
```

Result:

- completed outputs: 100
- JSON parse pass: 100
- JSON/required-field/source-field validation pass: 100
- failures after retry: 0
- chunked fallback passes: 0
- validation errors after final QA: 0
- page-marker leakage after final QA: 0
- outputs missing evidence: 0
- total extracted evidence records: 1,656
- average evidence records/source: 16.6
- minimum evidence records/source: 4
- total review flags: 377
- average review flags/source: 3.8
- recorded runtime: 7,175.8 seconds total, 71.8 seconds/source average

Retry note:

- rank 703 initially returned JSON with a bad control character in a string.
  A single-row overwrite retry passed and preserved source identity fields.
- no chunked fallback was required.

Observed quality:

- all final outputs are parseable JSON and preserve `queueId`, `sourcePath`,
  and `canonicalGroupId`.
- no preprocessing page-marker wrappers leaked into final outputs.
- every output has at least four evidence records.
- review flags captured missing or inferred metadata, OCR/text quality issues,
  and document/source-path ambiguity without blocking extraction.

Interpretation: the ranks 701-800 expansion checkpoint passed the same staging
QA gate as prior P0 checkpoints. Continue P0 representative extraction with
the next checkpoint starting at rank 801.

## P0 Expansion Checkpoint: Ranks 801-900

Codex CLI extraction was run for the next 100 P0 representative candidates from
the full ranked representative set. The app was not started.

Bundle:

- `reports/p0-pilot-eval-p0-r801-r900-202606231226`
- representative rank range: 801-900
- selected representatives: 100
- estimated input size: 1,172,766 chars/4 tokens
- product distribution:
  - HnX: 60
  - HAD/A/F 1417-1717: 40
- authority distribution:
  - FDA: 55
  - CE/MDR: 22
  - general: 13
  - overseas: 7
  - MFDS/domestic: 3

Command pattern:

```powershell
node scripts/prepare-p0-pilot-eval.js --triage-dir reports\p0-meaningful-triage-20260618153500 --source full --start-rank 801 --count 100 --out-dir reports\p0-pilot-eval-p0-r801-r900-202606231226
node scripts/run-p0-pilot-extraction.js --bundle-dir reports\p0-pilot-eval-p0-r801-r900-202606231226 --provider codex --start 1 --limit 100 --timeout-ms 900000 --run
node scripts/run-p0-pilot-extraction.js --bundle-dir reports\p0-pilot-eval-p0-r801-r900-202606231226 --provider codex --start 26 --limit 1 --timeout-ms 900000 --run --overwrite
node scripts/run-p0-pilot-extraction.js --bundle-dir reports\p0-pilot-eval-p0-r801-r900-202606231226 --provider codex --start 33 --limit 1 --timeout-ms 900000 --run --overwrite
node scripts/summarize-p0-eval.js --bundle-dir reports\p0-pilot-eval-p0-r801-r900-202606231226
```

Result:

- completed outputs: 100
- JSON parse pass: 100
- JSON/required-field/source-field validation pass: 100
- failures after retry: 0
- chunked fallback passes: 0
- validation errors after final QA: 0
- page-marker leakage after final QA: 0
- outputs missing evidence: 0
- total extracted evidence records: 1,782
- average evidence records/source: 17.8
- minimum evidence records/source: 7
- total review flags: 378
- average review flags/source: 3.8
- recorded runtime: 7,107.0 seconds total, 71.1 seconds/source average

Retry note:

- ranks 826 and 833 initially returned JSON with bad control characters in
  strings. Single-row overwrite retries passed and preserved source identity
  fields.
- no chunked fallback was required.

Observed quality:

- all final outputs are parseable JSON and preserve `queueId`, `sourcePath`,
  and `canonicalGroupId`.
- no preprocessing page-marker wrappers leaked into final outputs.
- every output has at least seven evidence records.
- review flags captured missing or inferred metadata, OCR/text quality issues,
  and document/source-path ambiguity without blocking extraction.

Interpretation: the ranks 801-900 expansion checkpoint passed the same staging
QA gate as prior P0 checkpoints. Continue P0 representative extraction with
the next checkpoint starting at rank 901.

## P0 Expansion Checkpoint: Ranks 901-1000

Codex CLI extraction was run for the next 100 P0 representative candidates from
the full ranked representative set. The app was not started.

Bundle:

- `reports/p0-pilot-eval-p0-r901-r1000-202606231431`
- representative rank range: 901-1000
- selected representatives: 100
- estimated input size: 1,259,889 chars/4 tokens
- product distribution:
  - HAD/A/F 1417-1717: 51
  - HnX: 37
  - CYAN: 7
  - ADD/AspenView: 4
  - HnVUE: 1
- authority distribution:
  - FDA: 59
  - general: 25
  - MFDS/domestic: 9
  - CE/MDR: 5
  - overseas: 2

Command pattern:

```powershell
node scripts/prepare-p0-pilot-eval.js --triage-dir reports\p0-meaningful-triage-20260618153500 --source full --start-rank 901 --count 100 --out-dir reports\p0-pilot-eval-p0-r901-r1000-202606231431
node scripts/run-p0-pilot-extraction.js --bundle-dir reports\p0-pilot-eval-p0-r901-r1000-202606231431 --provider codex --start 1 --limit 31 --timeout-ms 900000 --run
node scripts/run-p0-pilot-extraction.js --bundle-dir reports\p0-pilot-eval-p0-r901-r1000-202606231431 --provider codex --start 33 --limit 68 --timeout-ms 900000 --run
node scripts/run-p0-chunked-extraction.js --bundle-dir reports\p0-pilot-eval-p0-r901-r1000-202606231431 --ranks 932 --chunk-chars 180000 --timeout-ms 900000 --run
node scripts/summarize-p0-eval.js --bundle-dir reports\p0-pilot-eval-p0-r901-r1000-202606231431
```

Result:

- completed outputs: 100
- JSON parse pass: 100
- JSON/required-field/source-field validation pass: 100
- failures after retry: 0
- chunked fallback passes: 1
- validation errors after final QA: 0
- page-marker leakage after final QA: 0
- outputs missing evidence: 0
- total extracted evidence records: 1,990
- average evidence records/source: 19.9
- minimum evidence records/source: 7
- total review flags: 381
- average review flags/source: 3.8
- recorded runtime: 8,206.0 seconds total, 82.1 seconds/source average

Chunked fallback note:

- rank 932 had about 1,215,904 input chars and was run directly through
  `scripts/run-p0-chunked-extraction.js` in 7 chunks.
- all 7 chunks passed and the merged final output passed source validation.

Observed quality:

- all final outputs are parseable JSON and preserve `queueId`, `sourcePath`,
  and `canonicalGroupId`.
- no preprocessing page-marker wrappers leaked into final outputs.
- every output has at least seven evidence records.
- review flags captured missing or inferred metadata, OCR/text quality issues,
  and document/source-path ambiguity without blocking extraction.

Interpretation: the ranks 901-1000 expansion checkpoint passed the same staging
QA gate as prior P0 checkpoints. Continue P0 representative extraction with
the next checkpoint starting at rank 1001.

## P0 Expansion Checkpoint: Ranks 1001-1100

Codex CLI extraction was run for the next 100 P0 representative candidates from
the full ranked representative set. The app was not started.

Bundle:

- `reports/p0-pilot-eval-p0-r1001-r1100-202606231802`
- representative rank range: 1001-1100
- selected representatives: 100
- estimated input size: 1,020,302 chars/4 tokens
- product distribution:
  - HnX: 67
  - HAD/A/F 1417-1717: 32
  - ADD/AspenView: 1
- authority distribution:
  - FDA: 64
  - CE/MDR: 20
  - MFDS/domestic: 9
  - general: 6
  - overseas: 1

Command pattern:

```powershell
node scripts/prepare-p0-pilot-eval.js --triage-dir reports\p0-meaningful-triage-20260618153500 --source full --start-rank 1001 --count 100 --out-dir reports\p0-pilot-eval-p0-r1001-r1100-202606231802
node scripts/run-p0-pilot-extraction.js --bundle-dir reports\p0-pilot-eval-p0-r1001-r1100-202606231802 --provider codex --start 1 --limit 100 --timeout-ms 900000 --run
node scripts/summarize-p0-eval.js --bundle-dir reports\p0-pilot-eval-p0-r1001-r1100-202606231802
```

Result:

- completed outputs: 100
- JSON parse pass: 100
- JSON/required-field/source-field validation pass: 100
- failures after retry: 0
- chunked fallback passes: 0
- validation errors after final QA: 0
- page-marker leakage after final QA: 0
- outputs missing evidence: 0
- total extracted evidence records: 1,963
- average evidence records/source: 19.6
- minimum evidence records/source: 7
- total review flags: 363
- average review flags/source: 3.6
- recorded runtime: 7,820.2 seconds total, 78.2 seconds/source average

Observed quality:

- all final outputs are parseable JSON and preserve `queueId`, `sourcePath`,
  and `canonicalGroupId`.
- no preprocessing page-marker wrappers leaked into final outputs.
- every output has at least seven evidence records.
- review flags captured missing or inferred metadata, OCR/text quality issues,
  and document/source-path ambiguity without blocking extraction.

Interpretation: the ranks 1001-1100 expansion checkpoint passed the same
staging QA gate as prior P0 checkpoints. Continue P0 representative extraction
with the next checkpoint starting at rank 1101.

## P0 Expansion Checkpoint: Ranks 1101-1200

Codex CLI extraction was run for the next 100 P0 representative candidates from
the full ranked representative set. The app was not started.

Bundle:

- `reports/p0-pilot-eval-p0-r1101-r1200-202606232014`
- representative rank range: 1101-1200
- selected representatives: 100
- estimated input size: 507,540 chars/4 tokens
- product distribution:
  - HnX: 47
  - HAD/A/F 1417-1717: 36
  - ADD/AspenView: 12
  - HnVUE: 4
  - CYAN: 1
- authority distribution:
  - FDA: 68
  - CE/MDR: 11
  - general: 11
  - MFDS/domestic: 10

Command pattern:

```powershell
node scripts/prepare-p0-pilot-eval.js --triage-dir reports\p0-meaningful-triage-20260618153500 --source full --start-rank 1101 --count 100 --out-dir reports\p0-pilot-eval-p0-r1101-r1200-202606232014
node scripts/run-p0-pilot-extraction.js --bundle-dir reports\p0-pilot-eval-p0-r1101-r1200-202606232014 --provider codex --start 1 --limit 100 --timeout-ms 900000 --run
node scripts/summarize-p0-eval.js --bundle-dir reports\p0-pilot-eval-p0-r1101-r1200-202606232014
```

Result:

- completed outputs: 100
- JSON parse pass: 100
- JSON/required-field/source-field validation pass: 100
- failures after retry: 0
- chunked fallback passes: 0
- validation errors after final QA: 0
- page-marker leakage after final QA: 0
- outputs missing evidence: 0
- total extracted evidence records: 1,727
- average evidence records/source: 17.3
- minimum evidence records/source: 6
- total review flags: 373
- average review flags/source: 3.7
- recorded runtime: 6,920.5 seconds total, 69.2 seconds/source average

Observed quality:

- all final outputs are parseable JSON and preserve `queueId`, `sourcePath`,
  and `canonicalGroupId`.
- no preprocessing page-marker wrappers leaked into final outputs.
- every output has at least six evidence records.
- review flags captured missing or inferred metadata, OCR/text quality issues,
  and document/source-path ambiguity without blocking extraction.

Interpretation: the ranks 1101-1200 expansion checkpoint passed the same
staging QA gate as prior P0 checkpoints. Continue P0 representative extraction
with the next checkpoint starting at rank 1201.

## P0 Expansion Checkpoint: Ranks 1201-1300

Codex CLI extraction was run for the next 100 P0 representative candidates from
the full ranked representative set. The app was not started.

Bundle:

- `reports/p0-pilot-eval-p0-r1201-r1300-202606232211`
- representative rank range: 1201-1300
- selected representatives: 100
- estimated input size: 1,575,203 chars/4 tokens
- product distribution:
  - HAD/A/F 1417-1717: 73
  - HnX: 26
  - CYAN: 1
- authority distribution:
  - FDA: 42
  - CE/MDR: 29
  - MFDS/domestic: 28
  - general: 1

Command pattern:

```powershell
node scripts/prepare-p0-pilot-eval.js --triage-dir reports\p0-meaningful-triage-20260618153500 --source full --start-rank 1201 --count 100 --out-dir reports\p0-pilot-eval-p0-r1201-r1300-202606232211
node scripts/run-p0-pilot-extraction.js --bundle-dir reports\p0-pilot-eval-p0-r1201-r1300-202606232211 --provider codex --start 1 --limit 100 --timeout-ms 900000 --run
node scripts/summarize-p0-eval.js --bundle-dir reports\p0-pilot-eval-p0-r1201-r1300-202606232211
```

Result:

- completed outputs: 100
- JSON parse pass: 100
- JSON/required-field/source-field validation pass: 100
- failures after retry: 0
- chunked fallback passes: 0
- validation errors after final QA: 0
- page-marker leakage after final QA: 0
- outputs missing evidence: 0
- total extracted evidence records: 1,978
- average evidence records/source: 19.8
- minimum evidence records/source: 7
- total review flags: 393
- average review flags/source: 3.9
- recorded runtime: 7,513.5 seconds total, 75.1 seconds/source average

Observed quality:

- all final outputs are parseable JSON and preserve `queueId`, `sourcePath`,
  and `canonicalGroupId`.
- no preprocessing page-marker wrappers leaked into final outputs.
- every output has at least seven evidence records.
- review flags captured missing or inferred metadata, OCR/text quality issues,
  and document/source-path ambiguity without blocking extraction.

Interpretation: the ranks 1201-1300 expansion checkpoint passed the same
staging QA gate as prior P0 checkpoints. Continue P0 representative extraction
with the next checkpoint starting at rank 1301.

## P0 Expansion Checkpoint: Ranks 1301-1400

Codex CLI extraction was run for the next 100 P0 representative candidates from
the full ranked representative set. The app was not started.

Bundle:

- `reports/p0-pilot-eval-p0-r1301-r1400-202606240018`
- representative rank range: 1301-1400
- selected representatives: 100
- estimated input size: 983,208 chars/4 tokens
- product distribution:
  - HAD/A/F 1417-1717: 52
  - HnX: 35
  - CYAN: 10
  - HnVUE: 3
- authority distribution:
  - FDA: 34
  - MFDS/domestic: 34
  - CE/MDR: 20
  - general: 12

Command pattern:

```powershell
node scripts/prepare-p0-pilot-eval.js --triage-dir reports\p0-meaningful-triage-20260618153500 --source full --start-rank 1301 --count 100 --out-dir reports\p0-pilot-eval-p0-r1301-r1400-202606240018
node scripts/run-p0-pilot-extraction.js --bundle-dir reports\p0-pilot-eval-p0-r1301-r1400-202606240018 --provider codex --start 1 --limit 100 --timeout-ms 900000 --run
node scripts/run-p0-chunked-extraction.js --bundle-dir reports\p0-pilot-eval-p0-r1301-r1400-202606240018 --failed --chunk-chars 180000 --timeout-ms 900000 --run
node scripts/summarize-p0-eval.js --bundle-dir reports\p0-pilot-eval-p0-r1301-r1400-202606240018
```

Result:

- completed outputs: 100
- JSON parse pass: 100
- JSON/required-field/source-field validation pass: 100
- failures after retry: 0
- chunked fallback passes: 1
- validation errors after final QA: 0
- page-marker leakage after final QA: 0
- outputs missing evidence: 0
- total extracted evidence records: 1,998
- average evidence records/source: 20.0
- minimum evidence records/source: 7
- total review flags: 368
- average review flags/source: 3.7
- recorded runtime: 8,472.0 seconds total, 84.7 seconds/source average

Chunked fallback note:

- rank 1335 passed through `scripts/run-p0-chunked-extraction.js`.

Observed quality:

- all final outputs are parseable JSON and preserve `queueId`, `sourcePath`,
  and `canonicalGroupId`.
- no preprocessing page-marker wrappers leaked into final outputs.
- every output has at least seven evidence records.
- review flags captured missing or inferred metadata, OCR/text quality issues,
  and document/source-path ambiguity without blocking extraction.

Interpretation: the ranks 1301-1400 expansion checkpoint passed the same
staging QA gate as prior P0 checkpoints. Continue P0 representative extraction
with the next checkpoint starting at rank 1401.

## P0 Expansion Checkpoint: Ranks 1401-1500

Codex CLI extraction was run for the next 100 P0 representative candidates from
the full ranked representative set. The app was not started.

Bundle:

- `reports/p0-pilot-eval-p0-r1401-r1500-202606240243`
- representative rank range: 1401-1500
- selected representatives: 100
- estimated input size: 366,518 chars/4 tokens
- product distribution:
  - HnX: 64
  - HAD/A/F 1417-1717: 31
  - CYAN: 2
  - HnVUE: 2
  - ADD/AspenView: 1
- authority distribution:
  - FDA: 65
  - MFDS/domestic: 20
  - general: 9
  - CE/MDR: 6

Command pattern:

```powershell
node scripts/prepare-p0-pilot-eval.js --triage-dir reports\p0-meaningful-triage-20260618153500 --source full --start-rank 1401 --count 100 --out-dir reports\p0-pilot-eval-p0-r1401-r1500-202606240243
node scripts/run-p0-pilot-extraction.js --bundle-dir reports\p0-pilot-eval-p0-r1401-r1500-202606240243 --provider codex --start 1 --limit 100 --timeout-ms 900000 --run
node scripts/summarize-p0-eval.js --bundle-dir reports\p0-pilot-eval-p0-r1401-r1500-202606240243
```

Result:

- completed outputs: 100
- JSON parse pass: 100
- JSON/required-field/source-field validation pass: 100
- failures after retry: 0
- chunked fallback passes: 0
- validation errors after final QA: 0
- page-marker leakage after final QA: 0
- outputs missing evidence: 0
- total extracted evidence records: 1,650
- average evidence records/source: 16.5
- minimum evidence records/source: 5
- total review flags: 334
- average review flags/source: 3.3
- recorded runtime: 6,522.3 seconds total, 65.2 seconds/source average

Observed quality:

- all final outputs are parseable JSON and preserve `queueId`, `sourcePath`,
  and `canonicalGroupId`.
- no preprocessing page-marker wrappers leaked into final outputs.
- every output has at least five evidence records.
- review flags captured missing or inferred metadata, OCR/text quality issues,
  and document/source-path ambiguity without blocking extraction.

Interpretation: the ranks 1401-1500 expansion checkpoint passed the same
staging QA gate as prior P0 checkpoints. Continue P0 representative extraction
with the next checkpoint starting at rank 1501.

## P0 Expansion Checkpoint: Ranks 1501-1600

Codex CLI extraction was run for the next 100 P0 representative candidates from
the full ranked representative set. The app was not started.

Bundle:

- `reports/p0-pilot-eval-p0-r1501-r1600-202606240433`
- representative rank range: 1501-1600
- selected representatives: 100
- estimated input size: 1,641,485 chars/4 tokens
- product distribution:
  - HAD/A/F 1417-1717: 69
  - HnX: 24
  - ADD/AspenView: 6
  - CYAN: 1
- authority distribution:
  - FDA: 43
  - general: 29
  - CE/MDR: 19
  - MFDS/domestic: 6
  - overseas: 3

Command pattern:

```powershell
node scripts/prepare-p0-pilot-eval.js --triage-dir reports\p0-meaningful-triage-20260618153500 --source full --start-rank 1501 --count 100 --out-dir reports\p0-pilot-eval-p0-r1501-r1600-202606240433
node scripts/run-p0-pilot-extraction.js --bundle-dir reports\p0-pilot-eval-p0-r1501-r1600-202606240433 --provider codex --start 1 --limit 100 --timeout-ms 900000 --run
node scripts/summarize-p0-eval.js --bundle-dir reports\p0-pilot-eval-p0-r1501-r1600-202606240433
```

Result:

- completed outputs: 100
- JSON parse pass: 100
- JSON/required-field/source-field validation pass: 100
- failures after retry: 0
- chunked fallback passes: 0
- validation errors after final QA: 0
- page-marker leakage after final QA: 0
- outputs missing evidence: 0
- total extracted evidence records: 2,036
- average evidence records/source: 20.4
- minimum evidence records/source: 7
- total review flags: 373
- average review flags/source: 3.7
- recorded runtime: 8,010.2 seconds total, 80.1 seconds/source average

Observed quality:

- all final outputs are parseable JSON and preserve `queueId`, `sourcePath`,
  and `canonicalGroupId`.
- no preprocessing page-marker wrappers leaked into final outputs.
- every output has at least seven evidence records.
- review flags captured missing or inferred metadata, OCR/text quality issues,
  and document/source-path ambiguity without blocking extraction.

Interpretation: the ranks 1501-1600 expansion checkpoint passed the same
staging QA gate as prior P0 checkpoints. Continue P0 representative extraction
with the next checkpoint starting at rank 1601.

## P0 Expansion Checkpoint: Ranks 1601-1700

Codex CLI extraction was run for the next 100 P0 representative candidates from
the full ranked representative set. The app was not started.

Bundle:

- `reports/p0-pilot-eval-p0-r1601-r1700-202606240649`
- representative rank range: 1601-1700
- selected representatives: 100
- estimated input size: 494,003 chars/4 tokens
- product distribution:
  - HAD/A/F 1417-1717: 80
  - HnX: 19
  - ADD/AspenView: 1
- authority distribution:
  - FDA: 46
  - CE/MDR: 27
  - general: 25
  - MFDS/domestic: 2

Command pattern:

```powershell
node scripts/prepare-p0-pilot-eval.js --triage-dir reports\p0-meaningful-triage-20260618153500 --source full --start-rank 1601 --count 100 --out-dir reports\p0-pilot-eval-p0-r1601-r1700-202606240649
node scripts/run-p0-pilot-extraction.js --bundle-dir reports\p0-pilot-eval-p0-r1601-r1700-202606240649 --provider codex --start 1 --limit 100 --timeout-ms 900000 --run
node scripts/summarize-p0-eval.js --bundle-dir reports\p0-pilot-eval-p0-r1601-r1700-202606240649
```

Result:

- completed outputs: 100
- JSON parse pass: 100
- JSON/required-field/source-field validation pass: 100
- failures after retry: 0
- chunked fallback passes: 0
- validation errors after final QA: 0
- page-marker leakage after final QA: 0
- outputs missing evidence: 0
- total extracted evidence records: 1,725
- average evidence records/source: 17.3
- minimum evidence records/source: 5
- total review flags: 360
- average review flags/source: 3.6
- recorded runtime: 6,742.7 seconds total, 67.4 seconds/source average

Observed quality:

- all final outputs are parseable JSON and preserve `queueId`, `sourcePath`,
  and `canonicalGroupId`.
- no preprocessing page-marker wrappers leaked into final outputs.
- every output has at least five evidence records.
- review flags captured missing or inferred metadata, OCR/text quality issues,
  and document/source-path ambiguity without blocking extraction.

Interpretation: the ranks 1601-1700 expansion checkpoint passed the same
staging QA gate as prior P0 checkpoints. Continue P0 representative extraction
with the final checkpoint starting at rank 1701.

## P0 Final Checkpoint: Ranks 1701-1775

Codex CLI extraction was run for the final 75 P0 representative candidates from
the full ranked representative set. The app was not started.

Bundle:

- `reports/p0-pilot-eval-p0-r1701-r1775-202606240843`
- representative rank range: 1701-1775
- selected representatives: 75
- estimated input size: 459,967 chars/4 tokens
- product distribution:
  - HAD/A/F 1417-1717: 53
  - HnX: 11
  - CYAN: 4
  - HnVUE: 4
  - ADD/AspenView: 3
- authority distribution:
  - general: 33
  - MFDS/domestic: 26
  - FDA: 9
  - CE/MDR: 6
  - overseas: 1

Command pattern:

```powershell
node scripts/prepare-p0-pilot-eval.js --triage-dir reports\p0-meaningful-triage-20260618153500 --source full --start-rank 1701 --count 75 --out-dir reports\p0-pilot-eval-p0-r1701-r1775-202606240843
node scripts/run-p0-pilot-extraction.js --bundle-dir reports\p0-pilot-eval-p0-r1701-r1775-202606240843 --provider codex --start 1 --limit 100 --timeout-ms 900000 --run
node scripts/summarize-p0-eval.js --bundle-dir reports\p0-pilot-eval-p0-r1701-r1775-202606240843
```

Result:

- completed outputs: 75
- JSON parse pass: 75
- JSON/required-field/source-field validation pass: 75
- failures after retry: 0
- chunked fallback passes: 0
- validation errors after final QA: 0
- page-marker leakage after final QA: 0
- outputs missing evidence: 0
- total extracted evidence records: 1,148
- average evidence records/source: 15.3
- minimum evidence records/source: 5
- total review flags: 291
- average review flags/source: 3.9
- recorded runtime: 4,646.4 seconds total, 62.0 seconds/source average

Observed quality:

- all final outputs are parseable JSON and preserve `queueId`, `sourcePath`,
  and `canonicalGroupId`.
- no preprocessing page-marker wrappers leaked into final outputs.
- every output has at least five evidence records.
- review flags captured missing or inferred metadata, OCR/text quality issues,
  and document/source-path ambiguity without blocking extraction.

Interpretation: the final ranks 1701-1775 checkpoint passed the same staging QA
gate as prior P0 checkpoints. P0 representative staging extraction now covers
1,775/1,775 representatives. The next step is deciding whether to open the app
ingest path behind a disposition gate.

## Expansion Gate

Run 30 representatives first. Do not expand to 300 until all of these are true:

- JSON parse/schema pass rate is at least 90%.
- Every passed extraction preserves `queueId`, `sourcePath`, and
  `canonicalGroupId`.
- Evidence items are grounded in the source text.
- Product/model, authority, revision/date, and standards are extracted when
  present.
- Missing or ambiguous metadata creates review flags instead of unsupported
  claims.
- Page targets are stable enough to merge duplicate source facts.
- No blocker pattern indicates prompt or schema failure.

If the 30-source pilot passes, run the 300 representative-source pilot. If the
300-source pilot passes, expand to all 1,775 P0 representative candidates and
link 6,491 canonical duplicates to the representative facts. Inputs that exceed
the CLI context window must use `scripts/run-p0-chunked-extraction.js`.

## App Ingest Compatibility Check

The app must not be restarted for the current P0 bulk queue until its ingest
path can preserve the same disposition semantics.

Current app path:

1. `project-file-sync.ts` detects raw source changes.
2. `enqueueSourceIngest` enqueues raw source paths.
3. `ingest-queue.ts` processes pending tasks.
4. `processNext` calls `autoIngest`.
5. `autoIngest` reads `wiki/index.md` and `wiki/overview.md`, asks the LLM to
   generate per-source page updates, and writes wiki files.

This path does not yet have a meaningful-content disposition gate. For future
new-source app ingest, add the gate before `autoIngest`:

1. preprocess or resolve the source to a stable text body.
2. strip preprocessing wrappers and compute normalized body hash.
3. write/update a source disposition registry under `.llm-wiki/`.
4. if the source is a canonical duplicate, create/link a source stub and skip
   full LLM extraction.
5. if the source is low-text or empty, create a review/recovery disposition and
   skip retry loops.
6. if the source is meaningful and new, run extraction and deterministic page
   assembly.
7. update `wiki/index.md` and `wiki/overview.md` from the page registry, not
   from each individual source worker.

Until that app gate exists, app ingest is acceptable only for deliberately
selected small/new sources, not for the bulk P0 backlog.

## Current Operating Rule

- Keep `llm-wiki` stopped.
- Keep `LLM-Wiki-Watchdog`, `LLM-Wiki-Startup`, and `LLM-Wiki-Auth-Check`
  disabled.
- Do not create `.llm-wiki/ingest-ready.flag`.
- Run pilot extraction in staging only.
- Publish to the service vault only after QA.
