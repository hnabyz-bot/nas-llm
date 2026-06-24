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
