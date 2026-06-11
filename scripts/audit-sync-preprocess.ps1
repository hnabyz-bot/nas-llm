# audit-sync-preprocess.ps1
# Read-only coverage audit for NAS -> local -> _preprocessed readiness.

param(
    [string]$NasDrive = "Z:\",
    [string]$VaultRoot = "D:\vault\llm-wiki-vault",
    [switch]$CheckNas,
    [switch]$AllowUnsupported
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
$PreprocessableExtensions = @(".docx", ".xlsx", ".txt")

$RawRoot = Join-Path $VaultRoot "raw\sources"
$PreprocessedRoot = Join-Path $RawRoot "_preprocessed"

function Safe-Name([string]$name, [int]$limit) {
    $safe = $name -replace '[\\/:*?"<>|]', '_'
    return $safe.Substring(0, [Math]::Min($limit, $safe.Length))
}

function Get-RelativePath([string]$fullPath, [string]$root) {
    return $fullPath.Substring($root.Length).TrimStart('\')
}

function Test-HasPreprocessedOutput([System.IO.FileInfo]$file, [string]$folder) {
    $folderRoot = Join-Path $RawRoot $folder
    $relParent = Get-RelativePath $file.DirectoryName $folderRoot
    $outDir = Join-Path (Join-Path $PreprocessedRoot $folder) $relParent
    $fallbackDir = Join-Path (Join-Path $PreprocessedRoot $folder) "_longpath"

    $ext = $file.Extension.ToLowerInvariant()
    $base = [System.IO.Path]::GetFileNameWithoutExtension($file.Name)
    $patterns = @()
    if ($ext -eq ".xlsx") {
        $patterns += "$(Safe-Name $base 60)_*.txt"
    } elseif ($ext -eq ".docx") {
        $patterns += "$(Safe-Name $base 120)*.txt"
        $patterns += "$($base -replace '[\\/:*?""<>|]', '_')*.txt"
    } elseif ($ext -eq ".txt") {
        $patterns += "$(Safe-Name $file.Name 120)"
    }

    foreach ($dir in @($outDir, $fallbackDir)) {
        if (-not (Test-Path -LiteralPath $dir)) { continue }
        foreach ($pattern in $patterns) {
            $match = Get-ChildItem -LiteralPath $dir -Filter $pattern -File -ErrorAction SilentlyContinue |
                Select-Object -First 1
            if ($match) { return $true }
        }
    }
    return $false
}

$failures = [System.Collections.Generic.List[string]]::new()
$rows = [System.Collections.Generic.List[object]]::new()

if (-not (Test-Path -LiteralPath $RawRoot)) {
    throw "Raw root not found: $RawRoot"
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
                Where-Object { $SyncedExtensions -contains $_.Extension.ToLowerInvariant() }
        )
    } else {
        $failures.Add("missing local raw folder: $folder") | Out-Null
    }

    $preFiles = @()
    if (Test-Path -LiteralPath $preDir) {
        $preFiles = @(Get-ChildItem -LiteralPath $preDir -Recurse -File -Filter *.txt -ErrorAction SilentlyContinue)
    }

    $preprocessable = @($localFiles | Where-Object { $PreprocessableExtensions -contains $_.Extension.ToLowerInvariant() })
    $unsupported = @($localFiles | Where-Object { $PreprocessableExtensions -notcontains $_.Extension.ToLowerInvariant() })
    $missingPre = 0
    foreach ($file in $preprocessable) {
        if (-not (Test-HasPreprocessedOutput $file $folder)) {
            $missingPre++
        }
    }

    $nasDocs = $null
    $localMissing = $null
    if ($CheckNas -and $nasAvailable -and (Test-Path -LiteralPath $nasDir)) {
        $nasFiles = @(
            Get-ChildItem -LiteralPath $nasDir -Recurse -File -ErrorAction SilentlyContinue |
                Where-Object { $SyncedExtensions -contains $_.Extension.ToLowerInvariant() }
        )
        $nasDocs = $nasFiles.Count
        $localMissing = 0
        foreach ($file in $nasFiles) {
            $rel = $file.FullName.Substring($NasDrive.Length).TrimStart('\')
            $dest = Join-Path $RawRoot $rel
            $exists = $false
            try {
                $exists = Test-Path -LiteralPath $dest
            } catch {
                $exists = $false
            }
            if (-not $exists) { $localMissing++ }
        }
    } elseif ($CheckNas -and $nasAvailable) {
        $failures.Add("missing NAS source folder: $folder") | Out-Null
    }

    if ($missingPre -gt 0) {
        $failures.Add("$folder has local preprocessable files without verified _preprocessed output: $missingPre") | Out-Null
    }
    if ((-not $AllowUnsupported) -and ($unsupported.Count -gt 0)) {
        $failures.Add("$folder has unsupported local document types without preprocessing path: $($unsupported.Count)") | Out-Null
    }
    if ($CheckNas -and $localMissing -and $localMissing -gt 0) {
        $failures.Add("$folder has NAS files not present in local raw: $localMissing") | Out-Null
    }

    $rows.Add([pscustomobject]@{
        Folder = $folder
        NasDocs = $nasDocs
        LocalDocs = $localFiles.Count
        Preprocessable = $preprocessable.Count
        Unsupported = $unsupported.Count
        PreprocessedTxt = $preFiles.Count
        MissingPreprocessed = $missingPre
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
