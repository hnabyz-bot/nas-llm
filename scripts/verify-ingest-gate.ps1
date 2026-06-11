# verify-ingest-gate.ps1
# Pre-ingest gate: verify sync/preprocess state before llm-wiki may start.

param(
    [string]$VaultRoot = "D:\vault\llm-wiki-vault",
    [switch]$RequireAppStopped = $true,
    [switch]$SkipCoverageAudit
)

$ErrorActionPreference = "Stop"

$AllowedFolders = @(
    "DHF (인허가)",
    "RA",
    "Standard(국제)",
    "연구소 문서등록대장",
    "타사 메뉴얼",
    "Project",
    "Restricted_Backup"
)

$QueuePath = Join-Path $VaultRoot ".llm-wiki\ingest-queue.json"
$ReadyFlag = Join-Path $VaultRoot ".llm-wiki\ingest-ready.flag"
$RawRoot = Join-Path $VaultRoot "raw\sources"
$PreprocessedRoot = Join-Path $RawRoot "_preprocessed"
$ScriptDir = Split-Path $MyInvocation.MyCommand.Path
$CoverageAudit = Join-Path $ScriptDir "audit-sync-preprocess.ps1"

$failures = [System.Collections.Generic.List[string]]::new()

function Add-Failure([string]$message) {
    $script:failures.Add($message) | Out-Null
}

function Get-TopFolderFromPreprocessed([string]$sourcePath) {
    $prefix = "raw/sources/_preprocessed/"
    if (-not $sourcePath.StartsWith($prefix)) { return $null }
    return ($sourcePath.Substring($prefix.Length) -split '/')[0]
}

if ($RequireAppStopped -and (Get-Process -Name "llm-wiki" -ErrorAction SilentlyContinue)) {
    Add-Failure "llm-wiki is running. Stop the app before sync/preprocess validation."
}

if (Test-Path $ReadyFlag) {
    Add-Failure "ingest-ready.flag exists. Remove it until sync, preprocessing, and priority review are complete."
}

foreach ($taskName in @("LLM-Wiki-Watchdog", "LLM-Wiki-Startup", "LLM-Wiki-Auth-Check")) {
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($task -and $task.State -ne "Disabled") {
        Add-Failure "$taskName is $($task.State); it must be Disabled before ingest readiness is approved."
    }
}

if (-not (Test-Path $RawRoot)) {
    Add-Failure "raw sources folder not found: $RawRoot"
} else {
    $rawTop = @(Get-ChildItem $RawRoot -Directory -ErrorAction Stop | Select-Object -ExpandProperty Name)
    foreach ($folder in $AllowedFolders) {
        if ($rawTop -notcontains $folder) {
            Add-Failure "missing local raw folder: $folder"
        }
    }
    foreach ($folder in $rawTop) {
        if (($AllowedFolders + "_preprocessed") -notcontains $folder) {
            Add-Failure "unexpected local raw folder: $folder"
        }
    }
}

if (Test-Path $PreprocessedRoot) {
    $preTop = @(Get-ChildItem $PreprocessedRoot -Directory -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name)
    foreach ($folder in $preTop) {
        if ($AllowedFolders -notcontains $folder) {
            Add-Failure "unexpected _preprocessed folder: $folder"
        }
    }
} else {
    Add-Failure "_preprocessed folder not found: $PreprocessedRoot"
}

if (-not (Test-Path $QueuePath)) {
    Add-Failure "queue file not found: $QueuePath"
} else {
    $queue = [System.IO.File]::ReadAllText($QueuePath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
    if ($queue -isnot [array]) {
        Add-Failure "ingest queue JSON root is not an array"
        $queue = @($queue)
    }

    $pending = 0
    $processing = 0
    $failed = 0
    $activeOriginal = 0
    $badScope = 0
    $missingFiles = 0
    $activePathCounts = @{}

    foreach ($item in $queue) {
        if ($item.status -eq "pending") { $pending++ }
        elseif ($item.status -eq "processing") { $processing++ }
        elseif ($item.status -eq "failed") { $failed++ }

        if (($item.status -eq "pending") -or ($item.status -eq "processing")) {
            $path = [string]$item.sourcePath
            if (-not $activePathCounts.ContainsKey($path)) { $activePathCounts[$path] = 0 }
            $activePathCounts[$path]++

            if (-not $path.StartsWith("raw/sources/_preprocessed/")) {
                $activeOriginal++
                continue
            }

            $top = Get-TopFolderFromPreprocessed $path
            if ($AllowedFolders -notcontains $top) {
                $badScope++
            }

            $fullPath = Join-Path $VaultRoot ($path.Replace('/', '\'))
            if (-not (Test-Path -LiteralPath $fullPath)) {
                $missingFiles++
            }
        }
    }

    if ($processing -ne 0) { Add-Failure "queue has processing items: $processing" }
    if ($activeOriginal -ne 0) { Add-Failure "queue has active original paths: $activeOriginal" }
    if ($badScope -ne 0) { Add-Failure "queue has active items outside approved folders: $badScope" }
    if ($missingFiles -ne 0) { Add-Failure "queue has active items whose files do not exist: $missingFiles" }

    $duplicateActivePaths = @($activePathCounts.GetEnumerator() | Where-Object { $_.Value -gt 1 })
    if ($duplicateActivePaths.Count -ne 0) {
        $duplicateEntries = ($duplicateActivePaths | ForEach-Object { $_.Value - 1 } | Measure-Object -Sum).Sum
        Add-Failure "queue has duplicate active source paths: $($duplicateActivePaths.Count) paths / $duplicateEntries extra entries"
    }

    Write-Host "Queue: total=$($queue.Count), pending=$pending, processing=$processing, failed=$failed"
}

if (-not $SkipCoverageAudit) {
    if (-not (Test-Path -LiteralPath $CoverageAudit)) {
        Add-Failure "coverage audit script not found: $CoverageAudit"
    } else {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $CoverageAudit -VaultRoot $VaultRoot
        if ($LASTEXITCODE -ne 0) {
            Add-Failure "sync/preprocess coverage audit failed"
        }
    }
}

if ($failures.Count -gt 0) {
    Write-Host "INGEST GATE: FAIL" -ForegroundColor Red
    foreach ($failure in $failures) {
        Write-Host "  - $failure" -ForegroundColor Red
    }
    exit 1
}

Write-Host "INGEST GATE: PASS" -ForegroundColor Green
Write-Host "Do not start llm-wiki until priority review is complete and ingest-ready.flag is intentionally created."



