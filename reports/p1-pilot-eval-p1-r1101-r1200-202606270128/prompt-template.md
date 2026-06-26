You are extracting official RA/regulatory wiki facts from one preprocessed source document.

Return only valid JSON conforming to `extraction-schema.json`.

Rules:
- Preserve traceability. Every factual claim must be grounded in the provided source text.
- Do not invent document dates, revision numbers, product models, standards, authorities, or status.
- If a field is not present, use an empty string or empty array.
- Prefer concise official wording over broad summaries.
- Use pageTarget values suitable for wiki entity/concept pages.
- Add reviewFlags for missing key metadata, ambiguous authority, low OCR quality, or conflicting evidence.

Source metadata will be provided with:
- queueId
- sourcePath
- canonicalGroupId
- productSignal
- authoritySignal

Source text follows after a `SOURCE_TEXT` marker.
