# 10. Priority Staging To Vault Workflow

Date: 2026-06-24
Scope: P0/P1/P2 priority work after direct CLI staging extraction

## Decision

Do not continue to the next priority class only because staging extraction is
complete. A priority class is complete only after its QA-passed staging outputs
are reflected into the service vault and the vault `wiki/` changes are committed
and pushed.

This keeps the acceleration work aligned with the real operating target:
usable knowledge in `D:\vault\llm-wiki-vault\wiki\`.

## Completion Definition

For each priority class, the completion definition is:

1. priority classification is frozen and documented.
2. meaningful-content disposition is complete.
3. representative sources have QA-passed staging extraction outputs.
4. duplicates, low-text sources, and empty/recovery sources have explicit
   dispositions.
5. a vault publish gate selects only approved staging outputs.
6. the selected outputs are materialized through an app-compatible path.
7. `D:\vault\llm-wiki-vault\wiki\` contains the resulting source, entity,
   concept, finding, query, index, and overview updates.
8. vault QA passes.
9. vault `wiki/` changes are committed and pushed.
10. the operations repo records the checkpoint and is committed and pushed.

P1 must not begin as the default next step until P0 reaches this completion
definition. The same rule applies to P2 after P1.

## App-Compatible Publish Rule

The live app remains the authority for normal ingest semantics:

- source identity is derived from paths under `raw/sources/`.
- source summaries live under `wiki/sources/`.
- generated pages must preserve frontmatter `sources`.
- existing pages must be merged, not blindly overwritten.
- `wiki/index.md` and `wiki/overview.md` must be regenerated or updated from a
  corpus/page registry, not by parallel workers racing on the same files.
- `ingest-cache.json` may only be updated when the corresponding wiki files
  exist and pass QA.

The staging-to-vault publisher must therefore be either:

1. an app queue mode that consumes only the approved priority set, or
2. a deterministic materializer that reproduces the app's source identity,
   page path, merge, cache, and QA contracts before writing `wiki/`.

Direct writes to `wiki/` without this compatibility layer are not allowed.

## P0 Publish Gate

P0 is currently staging-complete:

- P0 sources: 9,027
- full-wiki representatives: 1,775
- canonical duplicates: 6,491
- low-text review: 94
- empty/recovery: 667
- QA-passed representative staging outputs: 1,775/1,775

Before opening app ingest or publishing P0 to the service vault:

1. stop `llm-wiki`.
2. keep `LLM-Wiki-Watchdog`, `LLM-Wiki-Startup`, and
   `LLM-Wiki-Auth-Check` disabled.
3. keep `.llm-wiki\ingest-ready.flag` absent until the publish set is approved.
4. resolve stale live queue state, including any `processing` item without an
   app-owned Codex process.
5. do not release the full 69k pending queue.
6. build a P0-only publish set from QA-passed staging outputs and disposition
   records.
7. dry-run materialization and report all files that would be written,
   modified, merged, skipped, or stubbed.
8. run vault QA on the dry-run output.
9. apply only after dry-run approval.
10. commit and push vault `wiki/`.

Latest dry-run:

- report: `reports/p0-vault-publish-plan-202606241407`
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

Interpretation: the publish set is complete enough for the next implementation
step, but the apply step must first resolve the stale live `processing` item and
must implement deterministic merge handling for colliding page targets.

Latest apply:

- report: `reports/p0-vault-materialize-apply-202606241458`
- materializer: `scripts/materialize-p0-vault-publish.js`
- representative outputs loaded: 1,775/1,775
- P0 disposition rows covered: 9,027/9,027
- wiki contributions materialized: 70,763
- unique wiki files written/merged: 41,145
- new wiki files: 40,967
- existing wiki files merged: 178
- validation failures: 0
- vault queue count after stale reset: `{"pending":69549}`
- vault commit pushed: `f36083933 wiki: publish P0 staging knowledge`

Interpretation: P0 is published to the vault `wiki/` and committed. P1 must
still wait for vault/app usability QA, then repeat this same workflow.

Latest static QA:

- report: `reports/p0-vault-qa-202606241625`
- QA script: `scripts/qa-p0-vault-publish.js`
- result: PASS
- errors: 0
- warnings: 0
- materialized files checked: 41,145/41,145
- P0 source queueIds found: 9,027/9,027
- pages with frontmatter, non-empty `sources`, and P0 markers: 41,145
- vault `wiki/` dirty: false
- app running: false
- queue count: `{"pending":69549}`

Interpretation: P0 static vault QA passed. A manual/app usability smoke check
can now be run before P1 starts.

Latest app API smoke QA:

- report: `reports/p0-app-smoke-202606241708`
- smoke script: `scripts/smoke-p0-app-api.js`
- result: PASS
- errors: 0
- warnings: 0
- API project: `llm-wiki-vault`
- source page content read through app API: PASS
- search query `HnX cybersecurity labeling`: 10 keyword results
- first hits included `wiki/concepts/cybersecurity-labeling.md`,
  `wiki/entities/hnx-p1.md`, and `wiki/entities/hnx-pb.md`
- graph endpoint returned 200 nodes
- app was stopped and app-state restored after the smoke check

Interpretation: P0 has passed static vault QA and app API smoke QA. P1 may
start, using the same completion definition and vault commit rule.

## Vault Git Rule

The vault repo is separate from this operations repo.

Vault commit rules:

- worktree: `D:\vault\llm-wiki-vault`
- stage only `wiki/` for normal knowledge updates.
- do not `git add -A` from the vault root.
- do not commit `raw/`, `.llm-wiki/`, `logs/`, or script working copies unless
  a separate operations change explicitly requires it.
- after a vault publish, run:

```powershell
cd D:\vault\llm-wiki-vault
git status --porcelain wiki/
git add wiki/
git commit -m "wiki: publish <priority> <checkpoint>"
git push
```

If `git status --porcelain wiki/` is empty, no vault knowledge change exists
and there is nothing to commit.

Operations repo commit rules:

- worktree: `D:\agent-work\nas-llm`
- commit reports, checkpoint metadata, scripts, and documentation that explain
  what was staged or published.
- push `main` after every accepted checkpoint.

## P1/P2 Rule

After P0 is published to the vault:

1. repeat the same flow for P1.
2. do not skip the disposition stage.
3. do not let P1/P2 inherit the old flat queue behavior.
4. publish each priority to vault before moving to the next priority.
5. record both repos' commit hashes in the handoff.

This prevents a growing backlog of high-quality staging artifacts that are not
usable in the live LLM Wiki.

## P1 Status

P1 started after P0 static QA and app API smoke QA passed.

Latest P1 triage:

- report: `reports/p1-meaningful-triage-202606241713`
- script: `scripts/triage-priority-meaningful-content.js`
- P1 sources: 7,941
- full-wiki representatives: 2,275
- canonical duplicates: 4,363
- low-text review: 209
- empty/recovery: 1,094
- avoided full LLM calls before pilot: 5,666 (71.4%)

Latest P1 extraction bundle:

- bundle: `reports/p1-pilot-eval-p1-r1-r100-202606241715`
- script: `scripts/prepare-priority-pilot-eval.js`
- rank range: 1-100
- selected representatives: 100
- extraction status: PASS
- QA summary: 100/100 JSON outputs, 100 pass, 0 fail, validation invalid 0,
  missing evidence 0, page marker leakage 0
- note: rank 9 and rank 34 required chunked fallback because their source text
  exceeded the Codex CLI context window

Next P1 bundle:

- bundle: `reports/p1-pilot-eval-p1-r101-r200-202606242001`
- rank range: 101-200
- selected representatives: 100
- total normalized chars: 6,199,536
- extraction status: PASS
- QA summary: 100/100 JSON outputs, 100 pass, 0 fail, validation invalid 0,
  missing evidence 0, page marker leakage 0
- note: rank 137 and rank 170 required chunked fallback because their source
  text exceeded direct Codex extraction limits

Next P1 bundle:

- bundle: `reports/p1-pilot-eval-p1-r201-r300-202606242201`
- rank range: 201-300
- selected representatives: 100
- total normalized chars: 6,909,952
- extraction status: PASS
- QA summary: 100/100 JSON outputs, 100 pass, 0 fail, validation invalid 0,
  missing evidence 0, page marker leakage 0
- note: all 100 rows passed direct extraction; no chunked fallback was needed

Next P1 bundle:

- bundle: `reports/p1-pilot-eval-p1-r301-r400-202606251300`
- rank range: 301-400
- selected representatives: 100
- total normalized chars: 5,115,899
- extraction status: PASS
- QA summary: 100/100 JSON outputs, 100 pass, 0 fail, validation invalid 0,
  missing evidence 0, page marker leakage 0
- ops commit: `31bbbf0 feat: complete P1 ranks 301-400 extraction outputs`

Next P1 bundle:

- bundle: `reports/p1-pilot-eval-p1-r401-r500-202606252307`
- rank range: 401-500
- selected representatives: 100
- total normalized chars: 7,050,726
- extraction status: PASS
- QA summary: 100/100 JSON outputs, 100 pass, 0 fail, validation invalid 0,
  missing evidence 0, page marker leakage 0
- note: rank 412 and rank 417 required chunked fallback
- ops commit: `e72301c feat: complete P1 ranks 401-500 extraction outputs`

Next P1 bundle:

- bundle: `reports/p1-pilot-eval-p1-r501-r600-202606261312`
- rank range: 501-600
- selected representatives: 100
- total normalized chars: 5,284,081
- extraction status: PASS
- QA summary: 100/100 JSON outputs, 100 pass, 0 fail, validation invalid 0,
  missing evidence 0, page marker leakage 0
- note: rank 567 required chunked fallback
- ops commit: `4813329 feat: complete P1 ranks 501-600 extraction outputs`

Next P1 bundle:

- bundle: `reports/p1-pilot-eval-p1-r601-r700-202606261523`
- rank range: 601-700
- selected representatives: 100
- total normalized chars: 4,653,408
- extraction status: PASS
- QA summary: 100/100 JSON outputs, 100 pass, 0 fail, validation invalid 0,
  missing evidence 0, page marker leakage 0
- note: rank 641 had a transient JSON parse failure and passed on direct retry;
  no chunked fallback was required
- ops commit: `49d3ef8 feat: complete P1 ranks 601-700 extraction outputs`

Next P1 bundle:

- bundle: `reports/p1-pilot-eval-p1-r701-r800-202606261744`
- rank range: 701-800
- selected representatives: 100
- total normalized chars: 2,938,495
- extraction status: PASS
- QA summary: 100/100 JSON outputs, 100 pass, 0 fail, validation invalid 0,
  missing evidence 0, page marker leakage 0
- note: no chunked fallback was required
- ops commit: `b9c472c feat: complete P1 ranks 701-800 extraction outputs`

Next P1 bundle:

- bundle: `reports/p1-pilot-eval-p1-r801-r900-202606261943`
- rank range: 801-900
- selected representatives: 100
- total normalized chars: 2,326,961
- extraction status: PASS
- QA summary: 100/100 JSON outputs, 100 pass, 0 fail, validation invalid 0,
  missing evidence 0, page marker leakage 0
- note: no chunked fallback was required
- ops commit: `1d5680d feat: complete P1 ranks 801-900 extraction outputs`

Next P1 bundle:

- bundle: `reports/p1-pilot-eval-p1-r901-r1000-202606262132`
- rank range: 901-1000
- selected representatives: 100
- total normalized chars: 2,656,584
- extraction status: PASS
- QA summary: 100/100 JSON outputs, 100 pass, 0 fail, validation invalid 0,
  missing evidence 0, page marker leakage 0
- note: no chunked fallback was required
- ops commit: `4946b26 feat: complete P1 ranks 901-1000 extraction outputs`

Next P1 bundle:

- bundle: `reports/p1-pilot-eval-p1-r1001-r1100-202606262331`
- rank range: 1001-1100
- selected representatives: 100
- total normalized chars: 2,853,375
- extraction status: PASS
- QA summary: 100/100 JSON outputs, 100 pass, 0 fail, validation invalid 0,
  missing evidence 0, page marker leakage 0
- note: no chunked fallback was required
- ops commit: `75e5689 feat: complete P1 ranks 1001-1100 extraction outputs`

Next P1 bundle:

- bundle: `reports/p1-pilot-eval-p1-r1101-r1200-202606270128`
- rank range: 1101-1200
- selected representatives: 100
- total normalized chars: 2,347,579
- extraction status: PASS
- QA summary: 100/100 JSON outputs, 100 pass, 0 fail, validation invalid 0,
  missing evidence 0, page marker leakage 0
- note: no chunked fallback was required
- ops commit: `fd6c906 feat: complete P1 ranks 1101-1200 extraction outputs`

Next P1 bundle:

- bundle: `reports/p1-pilot-eval-p1-r1201-r1300-202606270309`
- rank range: 1201-1300
- selected representatives: 100
- total normalized chars: 4,226,180
- extraction status: PASS
- QA summary: 100/100 JSON outputs, 100 pass, 0 fail, validation invalid 0,
  missing evidence 0, page marker leakage 0
- note: ranks 1202 and 1235 passed on direct retry after transient JSON format
  failures; ranks 1245 and 1253 required chunked fallback
- ops commit: `1eee3d5 feat: complete P1 ranks 1201-1300 extraction outputs`
