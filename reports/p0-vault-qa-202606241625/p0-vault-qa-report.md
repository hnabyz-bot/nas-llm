# P0 Vault QA Report

Generated: 2026-06-24T06:58:21.223Z
Result: PASS
Vault: `D:\vault\llm-wiki-vault`
Apply report: `reports\p0-vault-materialize-apply-202606241458`

## Coverage

- P0 disposition rows: 9027
- materialized unique files: 41145
- materialized source pages: 9027
- source queueIds seen: 9027/9027
- contribution sum: 70763
- action counts: {"create":40967,"update-or-merge":178}

## Markdown QA

- existing materialized files: 41145/41145
- pages with frontmatter: 41145
- pages with non-empty sources: 41145
- pages with P0 marker: 41145
- P0 marker begin/end counts: 41145/41145

## Vault State

- app running: false
- ingest-ready.flag: false
- scheduled tasks: {"LLM-Wiki-Watchdog":"Disabled","LLM-Wiki-Startup":"Disabled","LLM-Wiki-Auth-Check":"Disabled"}
- queue: {"pending":69549} (69549 total)
- wiki dirty: false
- vault HEAD: `f36083933 (HEAD -> main, origin/main) wiki: publish P0 staging knowledge`

## Errors

- none

## Warnings

- none

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
- replacementChars: 0
- suspiciousTokens: 0
- missingSourceSections: 0
- missingQueueIds: 0
