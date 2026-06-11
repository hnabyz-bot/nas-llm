# 06. Ingest Operation Rules

## Hard gate

`llm-wiki` must not run until all steps below are complete and verified:

1. NAS sync has copied only the approved 7 folders into local `raw/sources`.
2. NAS/local coverage audit shows no approved-scope NAS files missing from local raw.
3. Local `raw/sources` contains only the approved 7 folders plus `_preprocessed`.
4. Every local DOCX/XLSX/TXT in the approved folders has verified `_preprocessed` TXT output.
5. PDF/MD/XLS/PPTX/DOC files are not ingest-ready until a separate preprocessing path or explicit exclusion decision exists.
6. Active queue entries are all under `raw/sources/_preprocessed/<approved-folder>/`.
7. Every active queue entry points to an existing file.
8. Queue has `processing = 0`.
9. `LLM-Wiki-Watchdog`, `LLM-Wiki-Startup`, and `LLM-Wiki-Auth-Check` are disabled during sync/preprocess/priority work.
10. `ingest-ready.flag` is absent until the operator intentionally approves ingest start.

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
powershell -NoProfile -ExecutionPolicy Bypass -File D:\vault\llm-wiki-vault\scripts\audit-sync-preprocess.ps1 -CheckNas
powershell -NoProfile -ExecutionPolicy Bypass -File D:\vault\llm-wiki-vault\scripts\preprocess-active-originals.ps1
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

## Batch enqueue rule

`batch-enqueue.ps1` may add raw paths temporarily, but it must immediately run `preprocess-active-originals.ps1` before returning.

It must not restart `llm-wiki`. After any batch enqueue, run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File D:\vault\llm-wiki-vault\scripts\dedupe-active-queue.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File D:\vault\llm-wiki-vault\scripts\verify-ingest-gate.ps1
```
