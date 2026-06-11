# 07. Preprocess Exception Research

Date: 2026-06-12

## Result

The remaining preprocessing exceptions were researched and classified instead of being left as retrying errors.

Current manifest status:

- `success`: 69,903 source documents
- `excluded`: 187 source documents
- ingest queue: 210,432 `_preprocessed` TXT entries
- active raw queue paths: 0

## Research Findings

OCR for image-only PDFs is technically possible, but it requires an OCR stack. OCRmyPDF's Windows guidance requires Python, Tesseract, and Ghostscript. This machine currently has none of `qpdf`, `gswin64c`, `tesseract`, `ocrmypdf`, `mutool`, `winget`, `choco`, or `py` available in PATH.

Official references:

- OCRmyPDF installation: https://ocrmypdf.readthedocs.io/en/latest/installation.html
- Tesseract command line usage: https://tesseract-ocr.github.io/tessdoc/Command-Line-Usage.html
- qpdf CLI/password handling: https://qpdf.readthedocs.io/en/stable/cli.html
- qpdf encryption/password behavior: https://qpdf.readthedocs.io/en/stable/encryption.html
- Ghostscript usage: https://ghostscript.readthedocs.io/en/latest/Use.html

## Exception Classes

- `image_only_office_file` / 83: DOCX/PPTX had no extractable text. These need OCR of embedded images or manual text export.
- `empty_text_file` / 64: TXT files contain no usable text.
- `requires_pdf_repair` / 15: PDF parser reports invalid structure. These need qpdf, Ghostscript, MuPDF, or source replacement.
- `empty_spreadsheet` / 14: Excel COM opened the workbook, but no usable cell text was found.
- `requires_password` / 10: PDF/XLS files are encrypted or password-protected. Password or decrypted source is required.
- `corrupt_or_mislabeled_office_file` / 1: File extension indicates DOCX but the file is not a valid ZIP-based Office document.

## Policy

The ingest queue may include only manifest entries with `status = success`.

Known non-ingestable entries must be converted to `status = excluded` with:

- `exclusionClass`
- `exclusionAction`
- `excludedAt`

This prevents repeated failures while preserving an explicit audit trail in:

- `D:\vault\llm-wiki-vault\raw\sources\_preprocessed\.preprocess-exceptions.csv`
- `D:\vault\llm-wiki-vault\raw\sources\_preprocessed\.preprocess-exceptions.json`

## Future Recovery

To recover excluded items later:

1. Install an OCR/repair stack such as OCRmyPDF + Tesseract + Ghostscript, or qpdf/Ghostscript/MuPDF for damaged PDFs.
2. Provide passwords or decrypted sources for protected files.
3. Replace corrupt/mislabeled Office files with valid source files.
4. Rerun full preprocessing and queue rebuild.
