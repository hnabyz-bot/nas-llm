# 07. Preprocess Exception Research

Date: 2026-06-12

## Update: 2026-06-17 RA Priority Review

The continuation queue was classified before further bulk ingest so that
official wiki quality can be secured for RA/regulatory service needs first.

Inputs:

- active source-level `_combined` queue: 69,549
- missing combined files: 0
- classifier: `scripts/classify-ra-ingest-priority.js`
- latest local report: `reports/ra-ingest-priority-20260617052118`
- review document: `docs/08-RA-INGEST-PRIORITY-REVIEW.md`
- GitHub issue: https://github.com/hnabyz-bot/nas-llm/issues/17

Classification result:

- `P0_ACTIVE_SUBMISSION`: 9,027
- `P1_CORE_RA_EVIDENCE`: 7,941
- `P2_STANDARDS_QMS_TRACEABILITY`: 7,959
- `P3_SUPPORTING_REFERENCE`: 1,203
- `P4_ARCHIVE_DUPLICATE`: 43,403
- `P5_LOW_VALUE_ARTIFACT`: 16

Decision:

- P0 is the first official-quality ingest target.
- P4/P5 must not consume initial ingest capacity.
- Current single-lane llm-wiki throughput remains insufficient for a weeks-scale
  P0 target, so the next work item is a P0-first official-quality acceleration
  plan with controlled merge/index/overview handling.

## Update: 2026-06-16

The ingest gate failed again after local sources changed: the audit showed stale/missing
preprocess manifest entries rather than a queue-structure problem.

Actions taken:

- Ran approved-folder sync and NAS/local/preprocess coverage audit.
- Reran full preprocessing: 136 changed or missing documents were processed successfully.
- Ran Excel COM recovery: 5 spreadsheet exceptions were recovered.
- Fixed `classify-preprocess-exceptions.ps1` so rerunning classification on already
  `excluded` empty entries preserves concrete classes instead of downgrading them to
  `unclassified_preprocess_exception`.
- Reclassified remaining terminal exceptions: 103 excluded documents.
- Rebuilt the production queue in source-level `_combined` mode.
- Deduplicated active queue entries and applied priority ordering.

Verified result:

- `success`: 70,120 source documents
- `excluded`: 103 source documents
- ingest queue: 70,120 source-level `_preprocessed` combined TXT entries
- queue `processing`: 0
- `verify-ingest-gate.ps1`: PASS
- app state: stopped
- `ingest-ready.flag`: absent

## Update: 2026-06-16 Continuation Queue

The 70,120-entry queue was a full rebuild from successful preprocess outputs, not a
remaining-work queue. Existing wiki output and `ingest-cache.json` were preserved, so
the queue was pruned before starting the app.

Safe pruning policy:

- Remove queue entries with an exact original-source path match in `ingest-cache.json`
  when all cached `filesWritten` still exist.
- Remove queue entries with a basename cache hit only when that basename is unique in
  the current queue and all cached `filesWritten` still exist.
- Do not remove duplicate-basename hits automatically. Many regulatory files repeat
  the same filename in different folders; pruning them by basename would risk missing
  distinct source documents.

Applied result:

- queue before pruning: 70,120
- pruned as already ingested: 506
- queue after pruning: 69,614
- duplicate-basename cache hits intentionally left queued: 21,937
- stale cache hits left queued: 55
- prune report: `.llm-wiki/ingest-queue-prune-report-20260616-113952.json`
- `verify-ingest-gate.ps1`: PASS

## 2026-06-16 Ingest Start

Before starting the app, the continuation-pruned queue was rechecked:

- queue total: 69,614
- `pending`: 69,614
- `processing`: 0
- `failed`: 0
- latest prune report: `.llm-wiki/ingest-queue-prune-report-20260616-113952.json`
- `verify-ingest-gate.ps1 -SkipCoverageAudit`: PASS

The app was started intentionally by creating `.llm-wiki/ingest-ready.flag`,
enabling `LLM-Wiki-Watchdog`, and running `startup-llm-wiki.ps1`.

Runtime correction made during start:

- `watchdog-ingest.ps1` now recognizes app-owned Codex work by walking the
  full descendant process tree (`llm-wiki.exe -> cmd.exe -> node.exe ->
  codex.exe`) instead of checking only the direct parent process.
- stale `stuckSince` values from a previous app run are not carried into a
  newly started ingest session.
- GitHub issue: https://github.com/hnabyz-bot/nas-llm/issues/13

Observed start state:

- `llm-wiki.exe` started at 2026-06-16 14:16:59 KST.
- queue changed to `processing=1`, `pending=69,613`.
- `LLM-Wiki-Watchdog` is enabled and running on schedule.

Early throughput finding:

- By 2026-06-16 14:42:39 KST, one source had completed and the active queue
  dropped to 69,613.
- The second source remained in `processing` past 2026-06-16 15:11 KST while
  the app-owned Codex process was still alive.
- By 2026-06-16 15:16:50 KST, the second source completed and the active queue
  dropped to 69,612 (`processing=1`, `pending=69,611`).
- The first two observed combined TXT files were about 14 KB each, so the
  early approximately 30 minute/source rate is an operational throughput risk.
- Straight-line projection from the first two completed items is multi-year
  scale for the remaining queue. This is a low-confidence early estimate
  because the first items are SBOM/regulatory documents, but it is not an
  acceptable bulk-ingest rate if it persists.
- GitHub issue: https://github.com/hnabyz-bot/nas-llm/issues/14

Stale processing recovery:

- By 2026-06-16 15:38:33 KST, the third source completed and the active queue
  dropped to 69,611.
- At 2026-06-16 16:00 KST, the queue still showed `processing=1`, but no
  app-owned Codex process existed under `llm-wiki.exe`.
- GitHub issue: https://github.com/hnabyz-bot/nas-llm/issues/15
- Queue backup before intervention:
  `.llm-wiki/ingest-queue.json.bak-20260616-160054-before-stale-processing-restart`
- Recovery action: restarted `llm-wiki` through `startup-llm-wiki.ps1` so
  `restoreQueue()` could requeue the stale processing item without skipping it.
- Post-restart app start time: 2026-06-16 16:01:02 KST.
- Watchdog follow-up: if a new app start is newer than the previous
  `lastCheckTime`, `lastCheckTime` is advanced to the new app start time so
  stale elapsed time from the previous app session cannot carry over.

Idle pending recovery:

- After the same source completed, the queue reached `pending=69,610`,
  `processing=0`, with the app still running and no app-owned Codex process.
- GitHub issue: https://github.com/hnabyz-bot/nas-llm/issues/16
- Watchdog follow-up: added an idle-pending recovery threshold. If `pending > 0`,
  `processing = 0`, and no app-owned Codex process is running while the app is
  alive, Watchdog restarts `llm-wiki` after the idle threshold.
- Manual recovery restarted `llm-wiki` at 2026-06-16 16:25:53 KST.
- Post-recovery queue: `processing=1`, `pending=69,609`; active queue 69,610,
  meaning four sources had been removed as completed.
- Watchdog state was refreshed to `progress=69610`, `stuckSince=null`.

Stability and ETA update:

- By 2026-06-16 17:11:22 KST, six sources had been removed as completed.
- Queue at 2026-06-16 17:13 KST: `processing=1`, `pending=69,607`; active
  queue 69,608.
- App-owned Codex was active and Watchdog was running successfully.
- Observed straight-line rate from app start: about 2 sources/hour.
- Straight-line ETA at that rate: about 1,423 days. This confirms GitHub #14
  is a real bulk-ingest throughput blocker, not only a first-document anomaly.
- By 2026-06-16 18:05 KST, seven sources had been removed as completed and
  the active queue was 69,607 (`processing=1`, `pending=69,606`). Watchdog and
  app-owned Codex remained active. The observed rate stayed around 1.8-2.0
  sources/hour, with straight-line ETA still around 1,500 days.

## Result

The remaining preprocessing exceptions were researched and classified instead of being left as retrying errors.

Current manifest status after OCR recovery:

- `success`: 69,985 source documents
- `excluded`: 105 source documents
- ingest queue: 69,985 source-level `_preprocessed` combined TXT entries
- internal preprocessing outputs: 210,514 `_by_source` TXT part files
- active raw queue paths: 0

Final decision:

- OCR recovery is now part of the preprocessing system.
- OCR recovered 82 previously non-ingestable image-only documents.
- The remaining 105 excluded documents are not retry targets under the current source state.
- They must stay out of ingest until the recorded cause is fixed.
- `_by_source` part files are not the production ingest queue; production ingest uses one `_combined` TXT per successful source document.
- The app must not be started by automation unless the full ingest gate passes and `ingest-ready.flag` is intentionally created.

## Research Findings

OCR for image-only documents is technically possible. Since this machine does not have native `qpdf`, `gswin64c`, `tesseract`, `ocrmypdf`, `mutool`, `winget`, `choco`, or `py` available in PATH, a Node OCR stack was installed instead:

- `tesseract.js`
- `@tesseract.js-data/eng`
- `@tesseract.js-data/kor`
- `pdfjs-dist`
- `@napi-rs/canvas`
- `sharp`

This recovered the image-only Office documents that contained OCR-readable embedded images.

Official references:

- OCRmyPDF installation: https://ocrmypdf.readthedocs.io/en/latest/installation.html
- Tesseract command line usage: https://tesseract-ocr.github.io/tessdoc/Command-Line-Usage.html
- qpdf CLI/password handling: https://qpdf.readthedocs.io/en/stable/cli.html
- qpdf encryption/password behavior: https://qpdf.readthedocs.io/en/stable/encryption.html
- Ghostscript usage: https://ghostscript.readthedocs.io/en/latest/Use.html

## Exception Classes

- `image_only_office_file`: recovered by `ocr-excluded-docs.ps1` where embedded images were present.
- `empty_text_file` / 64: TXT files contain no usable text.
- `requires_pdf_repair` / 15: PDF parser reports invalid structure. These need qpdf, Ghostscript, MuPDF, or source replacement.
- `empty_spreadsheet` / 14: Excel COM opened the workbook, but no usable cell text was found.
- `requires_password` / 10: PDF/XLS files are encrypted or password-protected. Password or decrypted source is required.
- `corrupt_or_mislabeled_office_file` / 1: File extension indicates DOCX but the file is not a valid ZIP-based Office document.
- `no_images_for_ocr` / 1: Office file had neither extractable text nor embedded OCR-able images.

## Policy

The ingest queue may include only manifest entries with `status = success`.

Known non-ingestable entries must be converted to `status = excluded` with:

- `exclusionClass`
- `exclusionAction`
- `excludedAt`

This prevents repeated failures while preserving an explicit audit trail in:

- `D:\vault\llm-wiki-vault\raw\sources\_preprocessed\.preprocess-exceptions.csv`
- `D:\vault\llm-wiki-vault\raw\sources\_preprocessed\.preprocess-exceptions.json`

Do not convert `excluded` entries back to pending work just to retry them. Retry is allowed only when the source file or recovery capability changed:

- password/decrypted file supplied for `requires_password`.
- repaired/replaced file supplied for `requires_pdf_repair`.
- valid Office source supplied for `corrupt_or_mislabeled_office_file`.
- source content changed for `empty_text_file`, `empty_spreadsheet`, or `no_images_for_ocr`.
- OCR/repair tooling was added for an exception class that was not previously recoverable.

If none of those conditions changed, rerunning preprocessing against the same excluded item is an operational error.

## Future Recovery

To recover excluded items later:

1. Install a native PDF repair/OCR stack such as OCRmyPDF + Tesseract + Ghostscript, or qpdf/Ghostscript/MuPDF for damaged PDFs.
2. Provide passwords or decrypted sources for protected files.
3. Replace corrupt/mislabeled Office files with valid source files.
4. Rerun full preprocessing and queue rebuild.
