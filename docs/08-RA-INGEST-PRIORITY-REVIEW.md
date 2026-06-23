# 08. RA Ingest Priority Review

Date: 2026-06-17
Scope: active source-level `_combined` ingest queue
Vault: `D:\vault\llm-wiki-vault`

## Purpose

The full continuation ingest queue is too large to treat as one flat work set.
The immediate operating goal is to secure official wiki quality for the most
important RA/regulatory material first, then expand to the remaining corpus in
controlled waves.

This review classifies preprocessed source-level combined files before ingest.
It does not modify the live queue by itself.

## Input State

- Active queue candidates: 69,549
- Missing combined files: 0
- Preprocessed queue mode: one `_combined/*.txt` item per successful source
  document
- Classification script:
  `scripts/classify-ra-ingest-priority.js`
- Latest local report:
  `reports/ra-ingest-priority-20260617052118`

## Priority Classes

| Priority | Count | Bytes | Meaning |
| --- | ---: | ---: | --- |
| P0_ACTIVE_SUBMISSION | 9,027 | 595,910,246 | Active RA submission, authority response, certification, or current regulatory package evidence |
| P1_CORE_RA_EVIDENCE | 7,941 | 389,703,263 | Core DHF/DMR, V&V, safety, software, cybersecurity, risk, usability, or clinical evidence |
| P2_STANDARDS_QMS_TRACEABILITY | 7,959 | 213,144,922 | Standards, QMS, traceability, certificates, and supporting submission material |
| P3_SUPPORTING_REFERENCE | 1,203 | 21,548,714 | Predicate, competitor, manual, and general reference material |
| P4_ARCHIVE_DUPLICATE | 43,403 | 1,644,148,226 | Backups, old versions, RA/99 handover folders, Restricted_Backup, duplicated/archive-like material |
| P5_LOW_VALUE_ARTIFACT | 16 | 1,497,222 | Build artifacts or low-value technical files |

## P0 Distribution

By top folder:

- `RA`: 8,146
- `DHF (인허가)`: 876
- `Project`: 5

By product signal:

- `HnX`: 4,483
- `HAD/A/F 1417-1717`: 3,880
- `CYAN`: 535
- `ADD`: 67
- `AspenView`: 31
- `HnVUE`: 30
- Unclassified: 1

Largest P0 source areas:

- `RA/04_제품별 인허가 진행 문서/06_HnX-P1, HnX-PB`: 1,953
- `RA/04_제품별 인허가 진행 문서/04_2G & 3G (A1417MCW, A1717MCW, F1417MCW)`: 1,623
- `RA/04_제품별 인허가 진행 문서/07_Retrofit (HnX-R1)`: 539
- `RA/05_해외 등록 서류 (영업팀 F-up)/260526 베트남 2,3G, HnX-P1 등록서류`: 433
- `RA/02_회사 인증서/유럽 대리인(EC Representative)`: 407
- `DHF (인허가)/07_(CYAN) GT1717C, GT1717CP/91_인증 - 국내`: 376

## Classification Rules

The classifier uses deterministic signals from:

- original source path
- `_combined` queue path
- manifest output names
- optional combined-file text sample

P0 requires active RA/submission signals plus core evidence signals. Archive-like
paths are demoted even when they contain RA keywords. This intentionally pushes
`Restricted_Backup`, `RA/99_...`, `OLD`, `구버전`, `구 자료`, backup, copy, and
similar paths behind active working folders.

P1 captures core official evidence that may not be in an active submission
folder but is still needed for official wiki quality.

P2 captures regulatory standards, QMS, traceability, certificates, and
submission support records.

## Commands

Generate a dry-run classification report:

```powershell
node scripts/classify-ra-ingest-priority.js --scope active --sample-bytes 0
```

Generate a slower report that samples combined text content:

```powershell
node scripts/classify-ra-ingest-priority.js --scope active --sample-bytes 16384
```

The script writes:

- `priority-summary.json`
- `priority-full.json`
- `priority-full.csv`
- `priority-top1000.csv`
- `sorted-queue-preview.json`
- `priority-report.md`

## Official-Quality Ingest Plan

The current sequential llm-wiki ingest path is not fast enough for the full
queue. The observed rate was about 65 source documents/day. At that rate:

- P0 only: about 139 days
- P0 + P1: about 261 days
- all active queue: about 1,070 days

For a weeks-scale official wiki service target, P0 must be handled by a
P0-first official-quality pipeline. Additional API batch processing is not an
available assumption; only the existing Codex CLI and Claude Code CLI
subscriptions may be used.

1. Freeze a queue snapshot and classification report.
2. Run meaningful-content disposition before full LLM wiki generation.
3. Preserve official wiki quality by keeping source summaries, entity/concept
   pages, frontmatter source traceability, review items, index, overview, and
   page merge safeguards.
4. Avoid naive same-vault parallel ingest because `index.md` and `overview.md`
   are overwritten by each ingest.
5. Use local CLI extraction only for meaningful representative sources, not for
   every duplicate or empty/low-text source.
6. Rebuild `wiki/index.md` and `wiki/overview.md` from the assembled page
   registry, not from each parallel document worker.

## Acceleration Options

| Option | Fit for P0 | Quality risk | Calendar estimate | Decision |
| --- | --- | --- | --- | --- |
| Current single-vault queue | Poor | Low | about 139 days for P0 | Reject for P0 service target |
| Same-vault parallel llm-wiki | Poor | High | unpredictable | Reject; global files can overwrite each other |
| Sharded official ingest | Medium | Medium | about 18-35 days at 4-8 effective lanes, before merge QA | Possible fallback |
| Additional API batch pipeline | Not available | Medium, controllable | target weeks-scale if quota exists | Reject under current subscription-only constraint |
| Local CLI meaningful-content pipeline | Best | Medium, controllable | target P0 pilot first, then reassess | Preferred |

The preferred path is a local CLI meaningful-content pipeline, not a search-only
fast index. It must produce official wiki artifacts, not just retrievable
chunks.

## Meaningful-Content Triage Result

Generated on 2026-06-18:

```powershell
node scripts/triage-p0-meaningful-content.js --pilot-size 300
```

Latest triage report:

- `reports/p0-meaningful-triage-20260618153500`

Result:

- P0 sources: 9,027
- P0 bytes: 568.3 MB
- Canonical normalized body groups: 1,817
- Full-wiki representative candidates: 1,775
- Canonical duplicate sources: 6,491
- Needs review for low text: 94
- Needs recovery for empty text: 667
- Representative input: 84.6 MB, about 22,177,857 chars/4 tokens
- Avoided full LLM calls before pilot: 7,252 (80.3%)
- First full-wiki pilot: 300 representative sources

Pilot product distribution:

- HnX: 211
- HAD/A/F 1417-1717: 58
- CYAN: 28
- HnVUE: 3

This confirms that P0 can be evaluated as a service-quality pilot without
waiting for all 9,027 P0 sources to pass through full LLM generation.

Pilot evaluation bundle:

- 30-source bundle: `reports/p0-pilot-eval-20260618153600`
- 300-source bundle: `reports/p0-pilot-eval-300-20260618173500`
- ranks 301-400 checkpoint bundle:
  `reports/p0-pilot-eval-p0-r301-r400-202606190145`
- ranks 401-500 checkpoint bundle:
  `reports/p0-pilot-eval-p0-r401-r500-202606190409`
- ranks 501-600 checkpoint bundle:
  `reports/p0-pilot-eval-p0-r501-r600-202606190628`
- ranks 601-700 checkpoint bundle:
  `reports/p0-pilot-eval-p0-r601-r700-202606191056`
- ranks 701-800 checkpoint bundle:
  `reports/p0-pilot-eval-p0-r701-r800-202606230941`
- ranks 801-900 checkpoint bundle:
  `reports/p0-pilot-eval-p0-r801-r900-202606231226`
- ranks 901-1000 checkpoint bundle:
  `reports/p0-pilot-eval-p0-r901-r1000-202606231431`
- evaluation doc: `docs/09-P0-PILOT-EVALUATION.md`
- 30-source extraction: 30/30 JSON validation pass using Codex CLI
- 300-source extraction: 300/300 final JSON/source validation pass using Codex
  CLI plus chunked fallback for 5 large/context-heavy sources
- final 300-source QA: validation errors 0, evidence records 6,491, review
  flags 1,113
- ranks 301-400 extraction: 100/100 final JSON/source validation pass using
  Codex CLI plus chunked fallback for 1 context-heavy source; final QA:
  validation errors 0, page-marker leakage 0, evidence records 1,958, review
  flags 375
- ranks 401-500 extraction: 100/100 final JSON/source validation pass using
  Codex CLI without chunked fallback; final QA: validation errors 0,
  page-marker leakage 0, evidence records 2,076, review flags 379
- ranks 501-600 extraction: 100/100 final JSON/source validation pass using
  Codex CLI without chunked fallback; final QA: validation errors 0,
  page-marker leakage 0, evidence records 2,204, review flags 395
- ranks 601-700 extraction: 100/100 final JSON/source validation pass using
  Codex CLI without chunked fallback; final QA: validation errors 0,
  page-marker leakage 0, evidence records 2,123, review flags 360
- ranks 701-800 extraction: 100/100 final JSON/source validation pass using
  Codex CLI after one single-row JSON escape retry and without chunked
  fallback; final QA: validation errors 0, page-marker leakage 0, evidence
  records 1,656, review flags 377
- ranks 801-900 extraction: 100/100 final JSON/source validation pass using
  Codex CLI after two single-row JSON escape retries and without chunked
  fallback; final QA: validation errors 0, page-marker leakage 0, evidence
  records 1,782, review flags 378
- ranks 901-1000 extraction: 100/100 final JSON/source validation pass using
  Codex CLI plus chunked fallback for one large source; final QA: validation
  errors 0, page-marker leakage 0, evidence records 1,990, review flags 381
- current interpretation: continue P0 representative extraction in staging;
  do not start the app bulk ingest path yet

## Preferred P0 Pipeline

1. Build a P0-only queue file from `sorted-queue-preview.json`.
2. Run meaningful-content disposition for all P0 sources.
3. Select the first 300 `full_wiki_candidate` representatives for pilot
   extraction.
4. For each pilot representative, generate an intermediate structured
   extraction record:
   - source summary
   - entities
   - concepts
   - claims and evidence
   - regulatory context
   - suggested page targets
   - citations/source path
   - review items
   - use chunked extraction for CLI context-window failures or large test
     reports
5. Link `canonical_duplicate` sources to representative extraction facts while
   preserving their own source traceability.
6. Keep `needs_review_low_text` and `needs_recovery_empty_text` out of full LLM
   ingest until recovered, reviewed, or explicitly excluded.
7. Build a canonical page registry from all extraction records.
8. Generate source pages and entity/concept pages from the registry.
9. Merge duplicate page targets with the existing page-merge safety model:
   frontmatter union, body merge, shrink rejection, and backup.
10. Generate `wiki/index.md` deterministically from the page registry.
11. Generate `wiki/overview.md` from a corpus-level digest, not per source.
12. Run QA gates before publishing to the service vault.

## P0 QA Gates

The P0 pilot is not accepted unless all checks pass:

- every P0 source has one source summary page or an explicit skip reason.
- every P0 source appears in the disposition manifest.
- every canonical duplicate points to a representative source/facts record.
- every low-text or empty-text source has a review or recovery reason.
- every generated page has valid YAML frontmatter.
- every non-listing page includes source traceability.
- `wiki/index.md` references all generated official pages.
- `wiki/overview.md` reflects the P0 scope without dropping major product areas.
- wikilinks resolve or create review items.
- duplicate slugs are merged or explicitly reviewed.
- page body merge does not shrink below the accepted safety threshold.
- P4/P5 sources do not enter the P0 wave unless explicitly whitelisted.

## Review Decision

Use `P0_ACTIVE_SUBMISSION` as the first official-quality ingest target.

Do not spend initial ingest capacity on P4/P5 unless a user explicitly requests
one of those sources or the active RA package references it.

## Live Queue Check

After classification, the live queue was checked without modifying it.

Result: the live queue is not P0-first.

- Active queue: 69,549
- Current `processing` item priority: `P4_ARCHIVE_DUPLICATE`
- Current `processing` item original source:
  `raw/sources/RA/99_3. 정예지(231211~250521)/01_DHF/08_HnX-P1, HnX-PB/9. Cybersecurity/250605 파생모델 추가 및 DK FDA 보완적용 xx 재수립 필요/2.4_A-SBOM-HNX_Sybersecurity BOM(Rev.2 250605).docx`

Do not continue the current live queue as-is for a P0-first service target.
Before starting P0 execution:

1. Stop or pause `llm-wiki`.
2. Back up `.llm-wiki/ingest-queue.json`.
3. Reset any `processing` item to `pending`.
4. Rebuild the queue order from the classification result, with P0 first.
5. Run `verify-ingest-gate.ps1`.
6. Start ingest only after operator approval.

GitHub tracking issue: https://github.com/hnabyz-bot/nas-llm/issues/17
