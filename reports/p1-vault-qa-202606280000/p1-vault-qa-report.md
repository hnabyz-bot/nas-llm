# P1 Vault QA Report

Generated: 2026-06-27T19:48:09.246Z
Result: FAIL
Vault: `D:\vault\llm-wiki-vault`
Apply report: `reports\p1-vault-materialize-apply-202606280000`

## Coverage

- P1 disposition rows: 7941
- materialized unique files: 51239
- materialized source pages: 7941
- source queueIds seen: 7941/7941
- contribution sum: 78853
- action counts: {"create":44121,"update-or-merge":7118}

## Markdown QA

- existing materialized files: 51239/51239
- pages with frontmatter: 51239
- pages with non-empty sources: 51239
- pages with P1 marker: 51239
- P1 marker begin/end counts: 51239/51239

## Vault State

- app running: false
- ingest-ready.flag: false
- scheduled tasks: {"LLM-Wiki-Watchdog":"Disabled","LLM-Wiki-Startup":"Disabled","LLM-Wiki-Auth-Check":"Disabled"}
- queue: {"processing":1,"pending":69548} (69549 total)
- wiki dirty: true
- vault HEAD: `f36083933 (HEAD -> main, origin/main) wiki: publish P0 staging knowledge`

## Errors

- queue has processing items: 1
- vault wiki has uncommitted changes

## Warnings

- pages containing Unicode replacement character: 1+

## Issue Counts

- missingFiles: 0
- unsafePaths: 0
- missingFrontmatter: 0
- missingFrontmatterKeys: 0
- emptySources: 0
- missingMarker: 0
- mismatchedMarker: 0
- trailingWhitespace: 0
- nulBytes: 0
- replacementChars: 1
- suspiciousTokens: 0
- missingSourceSections: 0
- missingQueueIds: 0
