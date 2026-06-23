# classify-preprocess-exceptions.ps1
# Mark known non-ingestable preprocessing exceptions as excluded with an actionable reason.

param(
    [string]$VaultRoot = "D:\vault\llm-wiki-vault"
)

$ErrorActionPreference = "Stop"

$ManifestPath = Join-Path $VaultRoot "raw\sources\_preprocessed\.preprocess-manifest.json"
$ExceptionsCsv = Join-Path $VaultRoot "raw\sources\_preprocessed\.preprocess-exceptions.csv"
$ExceptionsJson = Join-Path $VaultRoot "raw\sources\_preprocessed\.preprocess-exceptions.json"

function Get-ExceptionClass($entry) {
    $ext = [IO.Path]::GetExtension([string]$entry.sourcePath).ToLowerInvariant()
    $error = [string]$entry.error
    $status = [string]$entry.status

    if ($error -match 'password|No password given|File is password-protected') {
        return [pscustomobject]@{
            Class = "requires_password"
            Action = "Provide document password or decrypted source file; do not brute-force."
        }
    }
    if ($error -match 'Invalid PDF structure') {
        return [pscustomobject]@{
            Class = "requires_pdf_repair"
            Action = "Repair with qpdf/Ghostscript/MuPDF, then rerun preprocessing."
        }
    }
    if ($error -match 'Corrupted zip|unexpected signature') {
        return [pscustomobject]@{
            Class = "corrupt_or_mislabeled_office_file"
            Action = "Replace source with a valid DOCX/XLSX/PPTX or convert manually."
        }
    }
    if (($status -eq "empty") -or ($error -match 'No extractable text')) {
        if ($ext -eq ".txt") {
            return [pscustomobject]@{
                Class = "empty_text_file"
                Action = "No text content to ingest."
            }
        }
        if (($ext -eq ".docx") -or ($ext -eq ".pptx")) {
            return [pscustomobject]@{
                Class = "image_only_office_file"
                Action = "Requires OCR of embedded images or manual text export."
            }
        }
        if (($ext -eq ".xls") -or ($ext -eq ".xlsx")) {
            return [pscustomobject]@{
                Class = "empty_spreadsheet"
                Action = "Excel reports no usable cell text; verify source manually if needed."
            }
        }
        if ($ext -eq ".pdf") {
            return [pscustomobject]@{
                Class = "image_only_pdf"
                Action = "Requires OCRmyPDF/Tesseract/Ghostscript OCR pipeline."
            }
        }
    }
    return [pscustomobject]@{
        Class = "unclassified_preprocess_exception"
        Action = "Manual review required."
    }
}

$manifest = [System.IO.File]::ReadAllText($ManifestPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
$classified = [System.Collections.Generic.List[object]]::new()

foreach ($prop in $manifest.PSObject.Properties) {
    $entry = $prop.Value
    if ($entry.status -eq "success") { continue }

    $classification = Get-ExceptionClass $entry
    $entry.status = "excluded"
    $entry | Add-Member -NotePropertyName "exclusionClass" -NotePropertyValue $classification.Class -Force
    $entry | Add-Member -NotePropertyName "exclusionAction" -NotePropertyValue $classification.Action -Force
    $entry | Add-Member -NotePropertyName "excludedAt" -NotePropertyValue ([DateTime]::UtcNow.ToString("o")) -Force

    $classified.Add([pscustomobject]@{
        sourcePath = $entry.sourcePath
        status = $entry.status
        exclusionClass = $entry.exclusionClass
        exclusionAction = $entry.exclusionAction
        originalError = $entry.error
    }) | Out-Null
}

[System.IO.File]::WriteAllText($ManifestPath, (ConvertTo-Json $manifest -Depth 8), [System.Text.UTF8Encoding]::new($false))
$classified | Export-Csv -LiteralPath $ExceptionsCsv -NoTypeInformation -Encoding UTF8
$classified | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $ExceptionsJson -Encoding UTF8

$classified | Group-Object exclusionClass | Sort-Object Count -Descending |
    Select-Object Count,Name | Format-Table -AutoSize

Write-Host "Classified exclusions: $($classified.Count)"
