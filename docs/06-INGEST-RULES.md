# 06. Ingest Operation Rules

## Hard gate

`llm-wiki` must not run until all steps below are complete and verified:

1. NAS sync has copied only the approved 7 folders into local `raw/sources`.
2. NAS/local coverage audit shows no approved-scope NAS files missing from local raw.
3. Local `raw/sources` contains only the approved 7 folders plus `_preprocessed`.
4. Every local PDF/MD/TXT/DOCX/XLS/XLSX/PPTX in the approved folders has a manifest result.
5. Files with `excluded` preprocessing status must remain out of the ingest queue and be listed in `.preprocess-exceptions.csv`.
6. Active queue entries are all under `raw/sources/_preprocessed/<approved-folder>/`.
7. The default queue is source-level: one active combined TXT entry per successful source document.
8. Every active queue entry points to an existing file.
9. Queue has `processing = 0`.
10. `LLM-Wiki-Watchdog`, `LLM-Wiki-Startup`, and `LLM-Wiki-Auth-Check` are disabled during sync/preprocess/priority work.
11. `ingest-ready.flag` is absent until the operator intentionally approves ingest start.

Approved folders:

- `DHF (인허가)`
- `RA`
- `Standard(국제)`
- `연구소 문서등록대장`
- `타사 메뉴얼`
- `Project`
- `Restricted_Backup`

## Required order

1. Keep `llm-wiki` stopped.
2. Keep auto-start tasks disabled.
3. Run NAS sync for approved folders only.
4. Run NAS/local coverage audit.
5. Run preprocessing.
6. Deduplicate active queue entries.
7. Run gate verification.
8. Review and apply queue priority.
9. Run gate verification again.
10. Create `.llm-wiki/ingest-ready.flag` only after approval.
11. Enable/start ingest automation or start `llm-wiki`.

## Commands

Run before any ingest start:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File D:\vault\llm-wiki-vault\scripts\sync-nas.ps1 -DryRun -SummaryOnly
powershell -NoProfile -ExecutionPolicy Bypass -File D:\vault\llm-wiki-vault\scripts\sync-approved-folders.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File D:\vault\llm-wiki-vault\scripts\audit-sync-preprocess.ps1 -CheckNas
powershell -NoProfile -ExecutionPolicy Bypass -File D:\vault\llm-wiki-vault\scripts\preprocess-all-docs.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File D:\vault\llm-wiki-vault\scripts\rebuild-queue-from-preprocessed.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File D:\vault\llm-wiki-vault\scripts\dedupe-active-queue.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File D:\vault\llm-wiki-vault\scripts\verify-ingest-gate.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File D:\vault\llm-wiki-vault\scripts\prioritize-ingest-queue.ps1
```

Apply queue priority only after reviewing the dry run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File D:\vault\llm-wiki-vault\scripts\prioritize-ingest-queue.ps1 -Apply
```

## Priority policy

Pending `_preprocessed` entries are ordered by this default priority:

1. `RA`: regulatory affairs, submissions, certificates, certification evidence.
2. `DHF (인허가)`: design history, DMR, BOM, validation, safety/performance evidence.
3. `연구소 문서등록대장`: QMS document registry and traceability records.
4. `Standard(국제)`: IEC/ISO and other standard references.
5. `타사 메뉴얼`: predicate or competitor manuals.
6. `Project`: project artifacts not already covered above.
7. `Restricted_Backup`: archival backup material.

Keyword boost applies inside each folder for active regulatory work:

- `HnVUE`, `CYAN`, `HnX`, `FDA`, `국내`, `인증`, `보완`, `사이버보안`, `Cybersecurity`
- `DHF`, `DMR`, `BOM`, `출하검사`, `성능`, `안전`, `검증`, `validation`, `verification`
- `manual`, `Manual`, `메뉴얼`, `IFU`, `Instructions`

## App start rule

The app may be started only when:

- `audit-sync-preprocess.ps1 -CheckNas` returns PASS.
- `verify-ingest-gate.ps1` returns PASS.
- priority review is complete.
- `.llm-wiki\ingest-ready.flag` is intentionally created.

If the flag is missing, `watchdog-ingest.ps1` and `startup-llm-wiki.ps1` must refuse to start `llm-wiki`.

## Queue cardinality rule

`rebuild-queue-from-preprocessed.ps1` must use the default source-level combined mode. It creates one `_combined/*.txt` queue item for each manifest entry with `status = success`.

Do not queue every chunk in `_by_source` for normal ingest. `_by_source` outputs are internal preprocessing parts. Queueing them directly inflates the active queue from source-document count to chunk count and causes duplicated ingest work. The `--queue-mode outputs` option is diagnostic only and must not be used for production ingest without explicit approval.

## Batch enqueue rule

`batch-enqueue.ps1` may add raw paths temporarily, but it must immediately run `preprocess-active-originals.ps1` before returning.

It must not restart `llm-wiki`. After any batch enqueue, run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File D:\vault\llm-wiki-vault\scripts\dedupe-active-queue.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File D:\vault\llm-wiki-vault\scripts\verify-ingest-gate.ps1
```

## Current Exception Rule

The ingest queue may contain only `success` manifest outputs. `empty` and `error` manifest entries require OCR, password removal, source-file repair, or explicit human exclusion before the full gate can pass.

After research and recovery attempts, known non-ingestable failures must be converted to `excluded` with a concrete class:

- `requires_password`: password or decrypted source required.
- `requires_pdf_repair`: qpdf/Ghostscript/MuPDF repair required.
- `image_only_office_file` or `image_only_pdf`: OCR pipeline required.
- `empty_text_file` or `empty_spreadsheet`: no usable text content found.
- `corrupt_or_mislabeled_office_file`: source replacement or manual conversion required.

## No-Retry Rule For Excluded Items

`excluded` is a terminal operational state unless the source condition changes. Do not repeatedly retry excluded files, do not place them back into `pending`, and do not enqueue their raw paths.

Allowed reasons to revisit an excluded item:

- password or decrypted source was provided.
- damaged PDF was repaired or replaced.
- corrupt or mislabeled Office source was replaced with a valid file.
- a new OCR/repair tool was installed that directly targets the recorded `exclusionClass`.
- the source file changed and the sync manifest records a new file state.

OCR must be used only for image-only documents where text extraction failed but images are available. OCR is not a valid recovery path for empty text files, empty spreadsheets, password-protected files, damaged PDFs, or corrupt/mislabeled Office files.

The gate must fail if any excluded item appears in the active ingest queue. The correct queue source is always the manifest `success` outputs under `_preprocessed`.
