# audit-sync-preprocess.ps1
# Read-only coverage audit for NAS -> local -> _preprocessed readiness.

param(
    [string]$NasDrive = "Z:\",
    [string]$VaultRoot = "D:\vault\llm-wiki-vault",
    [switch]$CheckNas
)

$ErrorActionPreference = "Stop"

$TargetFolders = @(
    "DHF (인허가)",
    "RA",
    "Standard(국제)",
    "연구소 문서등록대장",
    "타사 메뉴얼",
    "Project",
    "Restricted_Backup"
)

$SyncedExtensions = @(".pdf", ".md", ".txt", ".docx", ".xlsx", ".xls", ".pptx")

$RawRoot = Join-Path $VaultRoot "raw\sources"
$PreprocessedRoot = Join-Path $RawRoot "_preprocessed"
$ManifestPath = Join-Path $PreprocessedRoot ".preprocess-manifest.json"
$SyncManifestPath = Join-Path $RawRoot ".sync-manifest.json"

function Get-SourcePath([System.IO.FileInfo]$file) {
    return (($file.FullName.Substring($VaultRoot.Length + 1)) -replace '\\', '/')
}

function Get-MtimeMs([System.IO.FileInfo]$file) {
    return [double]$file.LastWriteTimeUtc.Subtract([datetime]'1970-01-01').TotalMilliseconds
}

function Test-ManifestSuccess([System.IO.FileInfo]$file, $manifest) {
    $sourcePath = Get-SourcePath $file
    $entry = $manifest.$sourcePath
    if (-not $entry) { return "missing" }
    if ($entry.status -ne "success") { return [string]$entry.status }
    if ([double]$entry.size -ne [double]$file.Length) { return "stale" }
    if ([math]::Abs([double]$entry.mtimeMs - (Get-MtimeMs $file)) -gt 2000) { return "stale" }
    if (-not $entry.outputs -or $entry.outputs.Count -eq 0) { return "missing-output" }

    foreach ($rel in $entry.outputs) {
        $full = Join-Path $VaultRoot (([string]$rel).Replace('/', '\'))
        if (-not (Test-Path -LiteralPath $full)) { return "missing-output" }
    }
    return "success"
}

$failures = [System.Collections.Generic.List[string]]::new()
$rows = [System.Collections.Generic.List[object]]::new()

if (-not (Test-Path -LiteralPath $RawRoot)) {
    throw "Raw root not found: $RawRoot"
}

$manifest = [pscustomobject]@{}
if (Test-Path -LiteralPath $ManifestPath) {
    $manifest = [System.IO.File]::ReadAllText($ManifestPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
} else {
    $failures.Add("preprocess manifest not found: $ManifestPath") | Out-Null
}

$syncManifest = [pscustomobject]@{}
if (Test-Path -LiteralPath $SyncManifestPath) {
    $syncManifest = [System.IO.File]::ReadAllText($SyncManifestPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
}

$nasAvailable = $false
if ($CheckNas) {
    $nasAvailable = Test-Path -LiteralPath $NasDrive
    if (-not $nasAvailable) {
        $failures.Add("NAS drive is not accessible: $NasDrive") | Out-Null
    }
}

foreach ($folder in $TargetFolders) {
    $localDir = Join-Path $RawRoot $folder
    $preDir = Join-Path $PreprocessedRoot $folder
    $nasDir = Join-Path $NasDrive $folder

    $localFiles = @()
    if (Test-Path -LiteralPath $localDir) {
        $localFiles = @(
            Get-ChildItem -LiteralPath $localDir -Recurse -File -ErrorAction SilentlyContinue |
                Where-Object { ($SyncedExtensions -contains $_.Extension.ToLowerInvariant()) -and (-not $_.Name.StartsWith("~$")) }
        )
    } else {
        $failures.Add("missing local raw folder: $folder") | Out-Null
    }

    $preFiles = @()
    if (Test-Path -LiteralPath $preDir) {
        $preFiles = @(Get-ChildItem -LiteralPath $preDir -Recurse -File -Filter *.txt -ErrorAction SilentlyContinue)
    }

    $missing = 0
    $empty = 0
    $errors = 0
    $stale = 0
    $missingOutput = 0
    $excluded = 0
    foreach ($file in $localFiles) {
        $state = Test-ManifestSuccess $file $manifest
        if ($state -eq "success") { continue }
        if ($state -eq "excluded") { $excluded++; continue }
        if ($state -eq "empty") { $empty++ }
        elseif ($state -eq "error") { $errors++ }
        elseif ($state -eq "stale") { $stale++ }
        elseif ($state -eq "missing-output") { $missingOutput++ }
        else { $missing++ }
    }

    $nasDocs = $null
    $localMissing = $null
    if ($CheckNas -and $nasAvailable -and (Test-Path -LiteralPath $nasDir)) {
        $nasFiles = @(
            Get-ChildItem -LiteralPath $nasDir -Recurse -File -ErrorAction SilentlyContinue |
                Where-Object { ($SyncedExtensions -contains $_.Extension.ToLowerInvariant()) -and (-not $_.Name.StartsWith("~$")) }
        )
        $nasDocs = $nasFiles.Count
        $localMissing = 0
        foreach ($file in $nasFiles) {
            $rel = (($file.FullName.Substring($NasDrive.Length).TrimStart('\')) -replace '\\', '/')
            $dest = Join-Path $RawRoot $rel
            $exists = $false
            try {
                $exists = Test-Path -LiteralPath $dest
            } catch {
                $exists = $false
            }
            if (-not $exists) {
                $syncEntry = $syncManifest.$rel
                if ($syncEntry -and $syncEntry.localSourcePath) {
                    $exists = $true
                }
            }
            if (-not $exists) { $localMissing++ }
        }
    } elseif ($CheckNas -and $nasAvailable) {
        $failures.Add("missing NAS source folder: $folder") | Out-Null
    }

    if ($missing -gt 0) { $failures.Add("$folder has files missing from preprocess manifest: $missing") | Out-Null }
    if ($empty -gt 0) { $failures.Add("$folder has files with no extractable text: $empty") | Out-Null }
    if ($errors -gt 0) { $failures.Add("$folder has preprocessing errors: $errors") | Out-Null }
    if ($stale -gt 0) { $failures.Add("$folder has stale preprocess outputs: $stale") | Out-Null }
    if ($missingOutput -gt 0) { $failures.Add("$folder has missing preprocess output files: $missingOutput") | Out-Null }
    if ($CheckNas -and $localMissing -and $localMissing -gt 0) {
        $failures.Add("$folder has NAS files not present in local raw: $localMissing") | Out-Null
    }

    $rows.Add([pscustomobject]@{
        Folder = $folder
        NasDocs = $nasDocs
        LocalDocs = $localFiles.Count
        ManifestMissing = $missing
        EmptyText = $empty
        Errors = $errors
        Excluded = $excluded
        Stale = $stale
        MissingOutput = $missingOutput
        PreprocessedTxt = $preFiles.Count
        NasMissingLocal = $localMissing
    }) | Out-Null
}

$rows | Format-Table -AutoSize

if ($failures.Count -gt 0) {
    Write-Host "SYNC/PREPROCESS COVERAGE: FAIL" -ForegroundColor Red
    foreach ($failure in $failures) {
        Write-Host "  - $failure" -ForegroundColor Red
    }
    exit 1
}

Write-Host "SYNC/PREPROCESS COVERAGE: PASS" -ForegroundColor Green
