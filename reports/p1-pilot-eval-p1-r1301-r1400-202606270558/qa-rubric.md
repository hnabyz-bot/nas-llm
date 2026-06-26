# P1 Pilot QA Rubric

A pilot extraction passes only if all required checks are satisfied.

## Required Checks

- JSON parses and conforms to `extraction-schema.json`.
- `source.queueId`, `source.sourcePath`, and `source.canonicalGroupId` match the manifest.
- `sourceSummary.oneLine` states what the source is, not a generic description.
- Product/model, authority, revision/date, and standards are extracted when present.
- Each evidence item has a concrete `evidenceText` copied or tightly paraphrased from the source.
- Page targets are stable and reusable across duplicate sources.
- Missing or ambiguous key metadata creates a `reviewFlags` entry.
- No unsupported claims are introduced.

## Pilot Decision Gate

- Expand from 30 to 300 only if JSON pass rate is at least 90%.
- Expand only if no blocker review flag pattern indicates prompt/schema failure.
- Expand only if source traceability is correct for every passed extraction.
- Revise the prompt/schema before expansion if duplicate/canonical page targets fragment badly.
