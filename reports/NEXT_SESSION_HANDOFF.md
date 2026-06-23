# Next Session Handoff

Generated: 2026-06-23

## Operating Rules

- Do not start `llm-wiki`.
- Do not enable `LLM-Wiki-Watchdog`, `LLM-Wiki-Startup`, or `LLM-Wiki-Auth-Check`.
- Continue staging-direct P0 representative extraction only.
- Use 100-300 source checkpoints.
- Reuse existing pass outputs; do not overwrite passed rows unless inspecting a real quality issue.

## Current State

- P0 full-wiki representative candidates: 1,775.
- Baseline 300-source bundle passed:
  `reports/p0-pilot-eval-300-20260618173500`
- Ranks 301-400 passed:
  `reports/p0-pilot-eval-p0-r301-r400-202606190145`
- Ranks 401-500 passed:
  `reports/p0-pilot-eval-p0-r401-r500-202606190409`
  - final outputs: 100/100
  - validation errors: 0
  - page-marker leakage: 0
  - evidence records: 2,076
  - review flags: 379
  - chunked fallback: 0
- Ranks 501-600 passed:
  `reports/p0-pilot-eval-p0-r501-r600-202606190628`
  - final outputs: 100/100
  - validation errors: 0
  - page-marker leakage: 0
  - evidence records: 2,204
  - review flags: 395
  - chunked fallback: 0
- Ranks 601-700 passed:
  `reports/p0-pilot-eval-p0-r601-r700-202606191056`
  - final outputs: 100/100
  - validation errors: 0
  - page-marker leakage: 0
  - evidence records: 2,123
  - review flags: 360
  - chunked fallback: 0
- Ranks 701-800 passed:
  `reports/p0-pilot-eval-p0-r701-r800-202606230941`
  - final outputs: 100/100
  - validation errors: 0
  - page-marker leakage: 0
  - evidence records: 1,656
  - review flags: 377
  - chunked fallback: 0
  - retry note: rank 703 passed after one single-row JSON escape retry
- Ranks 801-900 passed:
  `reports/p0-pilot-eval-p0-r801-r900-202606231226`
  - final outputs: 100/100
  - validation errors: 0
  - page-marker leakage: 0
  - evidence records: 1,782
  - review flags: 378
  - chunked fallback: 0
  - retry note: ranks 826 and 833 passed after single-row JSON escape retries
- Ranks 901-1000 passed:
  `reports/p0-pilot-eval-p0-r901-r1000-202606231431`
  - final outputs: 100/100
  - validation errors: 0
  - page-marker leakage: 0
  - evidence records: 1,990
  - review flags: 381
  - chunked fallback: 1
  - chunked note: rank 932 passed in 7 chunks
- Ranks 1001-1100 passed:
  `reports/p0-pilot-eval-p0-r1001-r1100-202606231802`
  - final outputs: 100/100
  - validation errors: 0
  - page-marker leakage: 0
  - evidence records: 1,963
  - review flags: 363
  - chunked fallback: 0

## Next Resume Point

Prepare and run the next ranks 1101-1200 checkpoint.

```powershell
$bundle = "reports\p0-pilot-eval-p0-r1101-r1200-$(Get-Date -Format yyyyMMddHHmm)"
node scripts/prepare-p0-pilot-eval.js --triage-dir reports\p0-meaningful-triage-20260618153500 --source full --start-rank 1101 --count 100 --out-dir $bundle
node scripts/run-p0-pilot-extraction.js --bundle-dir $bundle --provider codex --start 1 --limit 100 --timeout-ms 900000 --run
```

After that command finishes, classify failures:

```powershell
node scripts/run-p0-chunked-extraction.js --bundle-dir $bundle --failed --chunk-chars 180000 --timeout-ms 900000 --run
```

Then aggregate QA:

```powershell
node scripts/summarize-p0-eval.js --bundle-dir $bundle
```

Expected QA gate:

- JSON parse pass for all 100 final outputs.
- `source.queueId`, `source.sourcePath`, `source.canonicalGroupId` preserved.
- validation errors: 0 target.
- page-marker leakage: 0 target.
- every output has evidence.
- review flags are recorded.

## Documentation After 1101-1200 QA

Update these after the 1101-1200 checkpoint is complete:

- `README.md`
- `Plans.md`
- `docs/08-RA-INGEST-PRIORITY-REVIEW.md`
- `docs/09-P0-PILOT-EVALUATION.md`
- GitHub issue #17

Then continue with ranks 1201-1300.
