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
- Ranks 1101-1200 passed:
  `reports/p0-pilot-eval-p0-r1101-r1200-202606232014`
  - final outputs: 100/100
  - validation errors: 0
  - page-marker leakage: 0
  - evidence records: 1,727
  - review flags: 373
  - chunked fallback: 0
- Ranks 1201-1300 passed:
  `reports/p0-pilot-eval-p0-r1201-r1300-202606232211`
  - final outputs: 100/100
  - validation errors: 0
  - page-marker leakage: 0
  - evidence records: 1,978
  - review flags: 393
  - chunked fallback: 0
- Ranks 1301-1400 passed:
  `reports/p0-pilot-eval-p0-r1301-r1400-202606240018`
  - final outputs: 100/100
  - validation errors: 0
  - page-marker leakage: 0
  - evidence records: 1,998
  - review flags: 368
  - chunked fallback: 1
  - chunked note: rank 1335 passed
- Ranks 1401-1500 passed:
  `reports/p0-pilot-eval-p0-r1401-r1500-202606240243`
  - final outputs: 100/100
  - validation errors: 0
  - page-marker leakage: 0
  - evidence records: 1,650
  - review flags: 334
  - chunked fallback: 0
- Ranks 1501-1600 passed:
  `reports/p0-pilot-eval-p0-r1501-r1600-202606240433`
  - final outputs: 100/100
  - validation errors: 0
  - page-marker leakage: 0
  - evidence records: 2,036
  - review flags: 373
  - chunked fallback: 0
- Ranks 1601-1700 passed:
  `reports/p0-pilot-eval-p0-r1601-r1700-202606240649`
  - final outputs: 100/100
  - validation errors: 0
  - page-marker leakage: 0
  - evidence records: 1,725
  - review flags: 360
  - chunked fallback: 0
- Final ranks 1701-1775 passed:
  `reports/p0-pilot-eval-p0-r1701-r1775-202606240843`
  - final outputs: 75/75
  - validation errors: 0
  - page-marker leakage: 0
  - evidence records: 1,148
  - review flags: 291
  - chunked fallback: 0

## Next Decision Point

P0 representative staging extraction is complete: 1,775/1,775 representatives
have final QA-passed outputs. Decide whether to open the app ingest path behind
a disposition gate.

## App Ingest Gate

Before app auto-ingest or bulk ingest, require a disposition gate that consumes
the QA-passed staging outputs and rejects sources without preserved source
identity, evidence, or acceptable review-flag handling.
