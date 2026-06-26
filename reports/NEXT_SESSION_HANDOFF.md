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
have final QA-passed outputs. Do not continue to P1/P2 by default yet. First
publish P0 to `D:\vault\llm-wiki-vault\wiki\` through the app-compatible gate
described in `docs/10-PRIORITY-STAGING-TO-VAULT-WORKFLOW.md`.

## App Ingest Gate

Before app auto-ingest or bulk ingest, require a disposition gate that consumes
the QA-passed staging outputs and rejects sources without preserved source
identity, evidence, or acceptable review-flag handling.

After P0 is published, commit and push the vault repo with only `wiki/` staged.
Then commit and push the operations repo checkpoint. Record both commit hashes
before starting P1.

## P0 Publish Dry-Run

Latest dry-run bundle:

- `reports/p0-vault-publish-plan-202606241407`
- script: `scripts/plan-p0-vault-publish.js`
- representative outputs loaded: 1,775/1,775
- P0 disposition rows covered: 9,027/9,027
- planned wiki contributions: 70,647
- unique planned wiki file paths: 41,145
- unique create paths: 40,967
- unique update-or-merge paths: 178
- dry-run failures: 0
- dry-run warnings: 2
  - planned path collisions requiring merge: 5,921
  - live queue has processing items: 1

Next implementation step: build the deterministic apply/materialize path with
merge handling, resolve the stale queue `processing` item, then run another
dry-run before writing vault `wiki/`.

## P0 Vault Publish Applied

P0 has been materialized into `D:\vault\llm-wiki-vault\wiki\` and pushed.

- apply report: `reports/p0-vault-materialize-apply-202606241458`
- script: `scripts/materialize-p0-vault-publish.js`
- mode: apply
- P0 disposition rows covered: 9,027/9,027
- representative outputs loaded: 1,775/1,775
- wiki contributions materialized: 70,763
- unique wiki files written/merged: 41,145
- new wiki files: 40,967
- existing wiki files merged: 178
- missing materialized files: 0
- missing P0 marker: 0
- missing frontmatter sources: 0
- vault queue total: 69,549
- vault queue counts after stale reset: `{"pending":69549}`
- vault `wiki/` markdown files after apply: 44,902
- vault `wiki/sources` markdown files after apply: 11,235
- vault commit pushed: `f36083933 wiki: publish P0 staging knowledge`

Stale queue handling:

- backup:
  `D:\vault\llm-wiki-vault\.llm-wiki\ingest-queue.before-p0-vault-publish-20260624145114.json`
- one stale `processing` item was reset to `pending`
- `.llm-wiki/`, `logs/`, `raw/`, and vault `scripts/` were not staged for the
  vault knowledge commit

Next gate: run vault/app usability QA against the P0-published wiki before
starting P1. P1 should use the same revised flow: staging QA, deterministic
publish gate, vault materialize, vault `wiki/` commit/push, then operations
checkpoint commit/push.

## P0 Vault Static QA

Latest QA:

- report: `reports/p0-vault-qa-202606241625`
- script: `scripts/qa-p0-vault-publish.js`
- result: PASS
- errors: 0
- warnings: 0
- materialized files checked: 41,145/41,145
- source pages checked: 9,027
- P0 source queueIds found: 9,027/9,027
- pages with frontmatter: 41,145
- pages with non-empty `sources`: 41,145
- pages with P0 marker: 41,145
- P0 marker begin/end counts: 41,145/41,145
- vault `wiki/` dirty: false
- app running: false
- `ingest-ready.flag`: false
- scheduled tasks disabled: `LLM-Wiki-Watchdog`, `LLM-Wiki-Startup`,
  `LLM-Wiki-Auth-Check`
- queue state: `{"pending":69549}`

Note: `verify-ingest-gate.ps1 -SkipCoverageAudit` was attempted after publish
but exceeded the command timeout because it still checks all 69,549 active queue
file paths. The P0 vault QA script performs the relevant P0 wiki validation and
queue state checks without mutating the vault.

## P0 App API Smoke QA

Latest smoke QA:

- report: `reports/p0-app-smoke-202606241708`
- script: `scripts/smoke-p0-app-api.js`
- result: PASS
- errors: 0
- warnings: 0
- app version: 0.4.16
- project returned by API: `llm-wiki-vault`
  (`2da34b71-49aa-4919-a66a-90f1683772f9`)
- source page content read: PASS
- source page includes P0 marker, `queueId`, and frontmatter `sources`: PASS
- wiki top-level folders returned: `sources`, `entities`, `concepts`,
  `findings`, plus existing wiki folders
- search query: `HnX cybersecurity labeling`
- search mode: keyword
- search results: 10
- first search hits included `wiki/concepts/cybersecurity-labeling.md`,
  `wiki/entities/hnx-p1.md`, and `wiki/entities/hnx-pb.md`
- graph endpoint returned: 200 nodes / 0 edges

Smoke procedure:

- app-state was backed up, API `allowUnauthenticated` was enabled temporarily,
  and source watch/auto ingest remained disabled
- only read endpoints were called: health, projects, files, content, search,
  graph
- rescan, ingest, chat, or mutation endpoints were not called
- app was stopped after smoke QA
- app-state was restored from backup

P0 is now ready for P1 to start through the same revised workflow.

## P1 Started

P1 has started through the revised workflow.

Latest P1 meaningful triage:

- report: `reports/p1-meaningful-triage-202606241713`
- script: `scripts/triage-priority-meaningful-content.js`
- priority report: `reports/ra-ingest-priority-20260617052118/priority-full.json`
- P1 sources: 7,941
- P1 bytes: 371.6 MB
- canonical normalized body groups: 2,413
- full-wiki representative candidates: 2,275
- canonical duplicates: 4,363
- low-text review: 209
- empty/recovery: 1,094
- representative input: 90.6 MB
- estimated representative tokens chars/4: 23,755,841
- avoided full LLM calls before pilot: 5,666 (71.4%)

Latest P1 extraction bundle:

- bundle: `reports/p1-pilot-eval-p1-r1-r100-202606241715`
- script: `scripts/prepare-priority-pilot-eval.js`
- representative rank range: 1-100
- selected representatives: 100
- total available P1 representatives: 2,275
- total normalized chars: 7,114,530
- estimated tokens chars/4: 1,778,633
- output status: PASS
- extraction run: direct Codex extraction for 98 rows, chunked fallback for 2
  context-window rows
- QA summary: 100/100 JSON outputs, 100 pass, 0 fail, validation invalid 0,
  missing evidence 0, page marker leakage 0
- chunked pass rows: rank 9 and rank 34

Next step: commit/push the P1 ranks 1-100 extraction checkpoint, then continue
with the next P1 representative rank range.

Latest P1 extraction bundle queued next:

- bundle: `reports/p1-pilot-eval-p1-r101-r200-202606242001`
- script: `scripts/prepare-priority-pilot-eval.js`
- representative rank range: 101-200
- selected representatives: 100
- total available P1 representatives: 2,275
- total normalized chars: 6,199,536
- estimated tokens chars/4: 1,549,884
- output status: PASS
- extraction run: direct Codex extraction for 98 rows, chunked fallback for 2
  large-input rows
- QA summary: 100/100 JSON outputs, 100 pass, 0 fail, validation invalid 0,
  missing evidence 0, page marker leakage 0
- chunked pass rows: rank 137 and rank 170

Latest P1 extraction bundle queued next:

- bundle: `reports/p1-pilot-eval-p1-r201-r300-202606242201`
- script: `scripts/prepare-priority-pilot-eval.js`
- representative rank range: 201-300
- selected representatives: 100
- total available P1 representatives: 2,275
- total normalized chars: 6,909,952
- estimated tokens chars/4: 1,727,488
- output status: PASS
- extraction run: direct Codex extraction for all 100 rows
- QA summary: 100/100 JSON outputs, 100 pass, 0 fail, validation invalid 0,
  missing evidence 0, page marker leakage 0
- chunked pass rows: none

Latest P1 extraction bundle queued next:

- bundle: `reports/p1-pilot-eval-p1-r301-r400-202606251300`
- script: `scripts/prepare-priority-pilot-eval.js`
- representative rank range: 301-400
- selected representatives: 100
- total available P1 representatives: 2,275
- total normalized chars: 5,115,899
- estimated tokens chars/4: 1,278,975
- output status: PASS
- extraction run: direct Codex extraction plus retry after quota reset
- QA summary: 100/100 JSON outputs, 100 pass, 0 fail, validation invalid 0,
  missing evidence 0, page marker leakage 0
- ops commit: `31bbbf0 feat: complete P1 ranks 301-400 extraction outputs`

Latest P1 extraction bundle queued next:

- bundle: `reports/p1-pilot-eval-p1-r401-r500-202606252307`
- script: `scripts/prepare-priority-pilot-eval.js`
- representative rank range: 401-500
- selected representatives: 100
- total available P1 representatives: 2,275
- total normalized chars: 7,050,726
- estimated tokens chars/4: 1,762,682
- output status: PASS
- extraction run: direct Codex extraction plus chunked fallback for 2 rows
- QA summary: 100/100 JSON outputs, 100 pass, 0 fail, validation invalid 0,
  missing evidence 0, page marker leakage 0
- chunked pass rows: rank 412 and rank 417
- ops commit: `e72301c feat: complete P1 ranks 401-500 extraction outputs`

Latest P1 extraction bundle queued next:

- bundle: `reports/p1-pilot-eval-p1-r501-r600-202606261312`
- script: `scripts/prepare-priority-pilot-eval.js`
- representative rank range: 501-600
- selected representatives: 100
- total available P1 representatives: 2,275
- total normalized chars: 5,284,081
- estimated tokens chars/4: 1,321,021
- output status: PASS
- extraction run: direct Codex extraction plus chunked fallback for 1 row
- QA summary: 100/100 JSON outputs, 100 pass, 0 fail, validation invalid 0,
  missing evidence 0, page marker leakage 0
- chunked pass row: rank 567
- ops commit: `4813329 feat: complete P1 ranks 501-600 extraction outputs`

Latest P1 extraction bundle queued next:

- bundle: `reports/p1-pilot-eval-p1-r601-r700-202606261523`
- script: `scripts/prepare-priority-pilot-eval.js`
- representative rank range: 601-700
- selected representatives: 100
- total available P1 representatives: 2,275
- total normalized chars: 4,653,408
- estimated tokens chars/4: 1,163,352
- output status: PASS
- extraction run: direct Codex extraction; rank 641 passed on direct retry after
  one transient JSON parse failure
- QA summary: 100/100 JSON outputs, 100 pass, 0 fail, validation invalid 0,
  missing evidence 0, page marker leakage 0
- chunked pass rows: none
- ops commit: `49d3ef8 feat: complete P1 ranks 601-700 extraction outputs`

Latest P1 extraction bundle queued next:

- bundle: `reports/p1-pilot-eval-p1-r701-r800-202606261744`
- script: `scripts/prepare-priority-pilot-eval.js`
- representative rank range: 701-800
- selected representatives: 100
- total available P1 representatives: 2,275
- total normalized chars: 2,938,495
- estimated tokens chars/4: 734,624
- output status: PASS
- extraction run: direct Codex extraction only
- QA summary: 100/100 JSON outputs, 100 pass, 0 fail, validation invalid 0,
  missing evidence 0, page marker leakage 0
- chunked pass rows: none
- ops commit: `b9c472c feat: complete P1 ranks 701-800 extraction outputs`
