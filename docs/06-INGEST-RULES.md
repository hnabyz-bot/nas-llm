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

## RA priority classification rule

For the 2026-06-17 continuation ingest, do not treat the active queue as one
flat set. Run the RA priority classifier and review the report before applying
any queue reorder:

```powershell
node D:\agent-work\nas-llm\scripts\classify-ra-ingest-priority.js --scope active --sample-bytes 0
```

The classifier is dry-run only. It writes reports under `reports/` and does not
modify `.llm-wiki\ingest-queue.json`.

Priority classes:

1. `P0_ACTIVE_SUBMISSION`: active RA submission, authority response,
   certification, current package evidence.
2. `P1_CORE_RA_EVIDENCE`: DHF/DMR, verification/validation, safety, software,
   cybersecurity, risk, usability, clinical evidence.
3. `P2_STANDARDS_QMS_TRACEABILITY`: standards, QMS, traceability, certificates,
   and supporting submission material.
4. `P3_SUPPORTING_REFERENCE`: predicate, competitor, manual, and general
   references.
5. `P4_ARCHIVE_DUPLICATE`: backup, old version, `RA/99_...`,
   `Restricted_Backup`, copy/archive-like material.
6. `P5_LOW_VALUE_ARTIFACT`: build artifacts and low-value technical files.

Latest reviewed report:

- `reports/ra-ingest-priority-20260617052118`
- `docs/08-RA-INGEST-PRIORITY-REVIEW.md`
- GitHub issue: https://github.com/hnabyz-bot/nas-llm/issues/17

Initial official-quality ingest capacity must go to P0 first. P4/P5 must stay
out of the first service-quality wave unless a user explicitly requests the
source or a P0/P1 package directly depends on it.

## Meaningful content disposition rule

Successful preprocessing does not mean every source must receive full LLM wiki
generation. It means every source must receive an explicit disposition before
service publication.

Run P0 meaningful-content triage after RA priority classification:

```powershell
node D:\agent-work\nas-llm\scripts\triage-p0-meaningful-content.js --pilot-size 300
```

The triage script is dry-run only. It reads `_combined/*.txt` outputs, strips
preprocessing source/path wrappers, groups sources by normalized body hash, and
writes reports under `reports/`.

Allowed P0 dispositions:

1. `full_wiki_candidate`: representative source has meaningful text and may go
   to Codex/Claude CLI fact extraction.
2. `canonical_duplicate`: source has the same normalized body as a
   representative and must inherit representative facts while preserving its own
   source traceability.
3. `needs_review_low_text`: preprocessed body is too short for reliable full
   wiki extraction and requires human/OCR/recovery review before official use.
4. `needs_recovery_empty_text`: preprocessed body is effectively empty and must
   not enter full wiki ingest until recovered or explicitly excluded.

Do not silently drop a successful preprocessed source. Every P0 source must
appear in the disposition manifest and later end as a generated source page, a
canonical duplicate link, a source stub with a concrete reason, or an explicit
recovery/exclusion record.

## Priority staging-to-vault rule

Direct CLI extraction is an acceleration stage, not the final operating ingest.
A priority class is complete only after its QA-passed staging outputs are
reflected into `D:\vault\llm-wiki-vault\wiki\`, vault QA passes, and the vault
`wiki/` changes are committed and pushed.

Default sequence:

1. run classification and disposition for the priority.
2. run representative staging extraction.
3. run staging QA.
4. publish the approved set through an app-compatible vault gate.
5. commit and push vault `wiki/`.
6. commit and push the operations repo checkpoint.
7. only then move to the next priority.

Do not continue from P0 to P1, or from P1 to P2, only because staging extraction
is complete. See `docs/10-PRIORITY-STAGING-TO-VAULT-WORKFLOW.md`.

Latest reviewed triage:

- `reports/p0-meaningful-triage-20260618153500`
- P0 sources: 9,027
- full-wiki representative candidates: 1,775
- canonical duplicates: 6,491
- low-text review: 94
- empty-text recovery: 667
- first full-wiki pilot: 300 representative sources

## App start rule

The app may be started only when:

- `audit-sync-preprocess.ps1 -CheckNas` returns PASS.
- `verify-ingest-gate.ps1` returns PASS.
- priority review is complete.
- `.llm-wiki\ingest-ready.flag` is intentionally created.

If the flag is missing, `watchdog-ingest.ps1` and `startup-llm-wiki.ps1` must refuse to start `llm-wiki`.

`startup-llm-wiki.ps1` must start the app with Machine + User `PATH` explicitly injected so the app can find `codex`.

`watchdog-ingest.ps1` must treat only `codex.exe` processes in the `llm-wiki.exe` descendant process tree as active ingest work. On Windows the observed chain is `llm-wiki.exe -> cmd.exe -> node.exe -> codex.exe`; other Codex sessions on the machine must not block stuck-item recovery.

When the app is restarted after an older stuck marker was recorded, the watchdog must not carry that previous run's `stuckSince` into the new ingest session.

If the app start time is newer than the previous watchdog `lastCheckTime`, the watchdog must move `lastCheckTime` forward to that app start time as well. Otherwise the next no-progress calculation can recreate a stale elapsed time from the previous app session.

The watchdog must also recover an app-running idle queue: when `pending > 0`,
`processing = 0`, and no app-owned Codex process is running for the idle
threshold, restart `llm-wiki`. This covers the case where one item completes
and is removed, but the app does not start the next pending item.

The watchdog must also recover stale processing without waiting for the general
60-minute stuck timeout: when `processing > 0` and no app-owned Codex process is
running for the short processing/no-Codex threshold, stop `llm-wiki`, reset
`processing` items back to `pending`, and restart the app. This is an app
orchestration failure, not a source-document failure, so the item must not be
marked `failed` by this fast recovery path.

## Queue cardinality rule

`rebuild-queue-from-preprocessed.ps1` must use the default source-level combined mode. It creates one `_combined/*.txt` queue item for each manifest entry with `status = success`.

Do not queue every chunk in `_by_source` for normal ingest. `_by_source` outputs are internal preprocessing parts. Queueing them directly inflates the active queue from source-document count to chunk count and causes duplicated ingest work. The `--queue-mode outputs` option is diagnostic only and must not be used for production ingest without explicit approval.

## Continuation prune rule

After a full source-level queue rebuild, prune already-ingested entries before starting the app.

Use:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File D:\vault\llm-wiki-vault\scripts\prune-ingest-queue-from-cache.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File D:\vault\llm-wiki-vault\scripts\prune-ingest-queue-from-cache.ps1 -Apply
```

The prune step may remove only safe cache hits:

- exact original-source path matches in `ingest-cache.json` whose `filesWritten` still exist.
- basename cache hits only when that basename is unique in the current queue and `filesWritten` still exist.

Do not automatically remove duplicate-basename hits. Many approved-scope files repeat the same filename in different folders; pruning them by basename can skip distinct source documents.

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
