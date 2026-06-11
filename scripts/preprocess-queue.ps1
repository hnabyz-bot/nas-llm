# preprocess-queue.ps1
# Large XLSX/DOCX pending items -> split into small TXT -> re-inject into ingest queue
# XLSX: per-sheet TXT (preprocess-xlsx.js)
# DOCX: heading-based section split (.NET XML)
# Stops llm-wiki before queue edit, restarts after.

param(
    [int]$XlsxThresholdKB = 300,
    [int]$DocxThresholdKB = 1500,
    [switch]$DryRun
)

$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" +
            [System.Environment]::GetEnvironmentVariable("PATH","User")
$env:NODE_PATH = "C:\Users\admin\AppData\Roaming\npm\node_modules"

$QueuePath   = "D:\vault\llm-wiki-vault\.llm-wiki\ingest-queue.json"
$VaultRoot   = "D:\vault\llm-wiki-vault"
$PreprocRoot = "raw/sources/_preprocessed"
$PreprocFull = Join-Path $VaultRoot ($PreprocRoot -replace '/', '\')
$ScriptDir   = Split-Path $MyInvocation.MyCommand.Path
$XlsxScript  = Join-Path $ScriptDir "preprocess-xlsx.js"
$ProjectId   = "2da34b71-49aa-4919-a66a-90f1683772f9"
$AppExe      = "C:\dev\llm_wiki\src-tauri\target\release\llm-wiki.exe"

function New-IngestId {
    $ts   = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $rand = -join ((65..90) + (97..122) | Get-Random -Count 6 | ForEach-Object { [char]$_ })
    return "ingest-$ts-$rand"
}

function Get-FolderContext([string]$sourcePath) {
    $rel   = $sourcePath -replace '^raw/sources/', ''
    $parts = ($rel -split '/') | Select-Object -SkipLast 1
    return $parts -join ' > '
}

function ConvertTo-DocxSections([string]$docxPath, [string]$outDir) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $results = @()

    $zip = [System.IO.Compression.ZipFile]::OpenRead($docxPath)
    $xmlText = ""
    try {
        $entry = $zip.Entries | Where-Object { $_.FullName -eq 'word/document.xml' }
        if (-not $entry) { $zip.Dispose(); return $results }
        $sr = New-Object System.IO.StreamReader($entry.Open())
        $xmlText = $sr.ReadToEnd()
        $sr.Close()
    } finally { $zip.Dispose() }

    $xml = [xml]$xmlText
    $paragraphs = $xml.document.body.p
    $sections   = [System.Collections.Generic.List[object]]::new()
    $cur        = [pscustomobject]@{ title = 'Intro'; lines = [System.Collections.Generic.List[string]]::new() }

    foreach ($p in $paragraphs) {
        $styleVal  = if ($p.pPr -and $p.pPr.pStyle) { $p.pPr.pStyle.val } else { '' }
        $isHeading = $styleVal -match '^[Hh]eading[123]?$|^[1-6]$'
        $texts     = $p.SelectNodes('.//*[local-name()=''t'']') | ForEach-Object { $_.InnerText }
        $line      = ($texts -join '').Trim()
        if (-not $line) { continue }

        if ($isHeading) {
            if ($cur.lines.Count -gt 3) { $sections.Add($cur) }
            $cur = [pscustomobject]@{ title = $line; lines = [System.Collections.Generic.List[string]]::new() }
            $cur.lines.Add("## $line")
        } else {
            $cur.lines.Add($line)
        }
    }
    if ($cur.lines.Count -gt 3) { $sections.Add($cur) }

    $base = [System.IO.Path]::GetFileNameWithoutExtension($docxPath) -replace '[\\/:*?"<>|]','_'

    if ($sections.Count -le 1) {
        $allLines = $sections | ForEach-Object { $_.lines } | Where-Object { $_ }
        if ($allLines.Count -eq 0) { return $results }
        $chunk = 400; $pn = 0
        for ($i = 0; $i -lt $allLines.Count; $i += $chunk) {
            $pn++
            $slice   = $allLines[$i..[Math]::Min($i+$chunk-1, $allLines.Count-1)]
            $outName = "${base}_part${pn}.txt"
            $src     = [System.IO.Path]::GetFileName($docxPath)
            $content = "[Source: $src / Part $pn]`n`n$($slice -join "`n")`n"
            [System.IO.File]::WriteAllText((Join-Path $outDir $outName), $content, [System.Text.UTF8Encoding]::new($false))
            $results += [pscustomobject]@{ file = $outName; section = "Part $pn"; lines = $slice.Count }
        }
        return $results
    }

    foreach ($sec in $sections) {
        $safeTitle = ($sec.title -replace '[\\/:*?"<>|]','_').Substring(0, [Math]::Min(40,$sec.title.Length))
        $outName   = "${base}_${safeTitle}.txt"
        $src       = [System.IO.Path]::GetFileName($docxPath)
        $content   = "[Source: $src / Section: $($sec.title)]`n`n$($sec.lines -join "`n")`n"
        [System.IO.File]::WriteAllText((Join-Path $outDir $outName), $content, [System.Text.UTF8Encoding]::new($false))
        $results += [pscustomobject]@{ file = $outName; section = $sec.title; lines = $sec.lines.Count }
    }
    return $results
}

# ---- main ----
Write-Host "Loading queue..."
$queueJson = [System.IO.File]::ReadAllText($QueuePath, [System.Text.Encoding]::UTF8)
$queue     = $queueJson | ConvertFrom-Json

$xlsxBytes = $XlsxThresholdKB * 1024
$docxBytes = $DocxThresholdKB * 1024

$targets = $queue | Where-Object {
    $_.status -eq 'pending' -and ($_.sourcePath -match '\.(xlsx|docx)$')
} | ForEach-Object {
    $full = Join-Path $VaultRoot ($_.sourcePath -replace '/', '\')
    if (Test-Path $full) {
        $sz   = (Get-Item $full).Length
        $ext  = [System.IO.Path]::GetExtension($full).ToLower()
        $thr  = if ($ext -eq '.xlsx') { $xlsxBytes } else { $docxBytes }
        if ($sz -ge $thr) {
            [pscustomobject]@{ Task=$_; FullPath=$full; Size=$sz; Ext=$ext }
        }
    }
}

$xlsxCount = ($targets | Where-Object { $_.Ext -eq '.xlsx' }).Count
$docxCount = ($targets | Where-Object { $_.Ext -eq '.docx' }).Count
Write-Host "Targets: $($targets.Count) (XLSX=$xlsxCount DOCX=$docxCount)"

if ($DryRun) {
    $targets | Select-Object -First 15 | ForEach-Object {
        Write-Host "  $([math]::Round($_.Size/1KB))KB  $($_.Task.sourcePath)"
    }
    Write-Host "DryRun: no changes."
    exit 0
}

if ($targets.Count -eq 0) {
    Write-Host "No targets. Exit."
    exit 0
}

# Stop llm-wiki
$llmWasRunning = $false
if (Get-Process -Name "llm-wiki" -ErrorAction SilentlyContinue) {
    Write-Host "Stopping llm-wiki..."
    Stop-Process -Name "llm-wiki" -Force
    Start-Sleep -Seconds 3
    $llmWasRunning = $true
}

$queueList = [System.Collections.Generic.List[object]]::new()
foreach ($item in $queue) { $queueList.Add($item) }

$totalNew  = 0
$totalSkip = 0

foreach ($t in $targets) {
    $task        = $t.Task
    $relPath     = $task.sourcePath
    $parentRel   = ($relPath -replace '^raw/sources/', '' -replace '[^/]+$', '').TrimEnd('/')
    $fileName    = [System.IO.Path]::GetFileNameWithoutExtension($t.FullPath)
    $origCtx     = Get-FolderContext $relPath

    $outRelDir   = ("$PreprocRoot/$parentRel").TrimEnd('/')
    $outFullDir  = Join-Path $VaultRoot ($outRelDir -replace '/', '\')
    if (-not (Test-Path $outFullDir)) { New-Item -ItemType Directory -Force -Path $outFullDir | Out-Null }

    Write-Host "$([math]::Round($t.Size/1KB))KB  $([System.IO.Path]::GetFileName($t.FullPath))"

    $newFiles = @()
    if ($t.Ext -eq '.xlsx') {
        $raw = & node $XlsxScript $t.FullPath $outFullDir 2>&1
        try   { $newFiles = $raw | ConvertFrom-Json }
        catch { Write-Host "  WARN xlsx error: $raw"; $totalSkip++; continue }
    } else {
        $newFiles = ConvertTo-DocxSections $t.FullPath $outFullDir
    }
    $newFiles = @($newFiles)

    if ($newFiles.Count -eq 0) { Write-Host "  WARN: no output"; $totalSkip++; continue }
    Write-Host "  -> $($newFiles.Count) files"

    # Mark original as failed (preprocessed)
    $orig = $queueList | Where-Object { $_.id -eq $task.id }
    if ($orig) {
        $orig.status    = 'failed'
        $orig.error     = "Preprocessed: split into $($newFiles.Count) chunks"
        $orig.retryCount = 3
    }

    # Inject new entries
    foreach ($nf in $newFiles) {
        $newRel  = "$outRelDir/$($nf.file)" -replace '\\', '/'
        $secLabel = if ($nf.section) { $nf.section } elseif ($nf.sheet) { $nf.sheet } else { "Part $($nf.part)" }
        $newCtx  = if ($origCtx) { "$origCtx > $fileName > $secLabel" } else { "$fileName > $secLabel" }

        $entry = [pscustomobject]@{
            id            = New-IngestId
            projectId     = $ProjectId
            sourcePath    = $newRel
            folderContext = $newCtx
            status        = 'pending'
            addedAt       = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
            error         = $null
            retryCount    = 0
        }
        $queueList.Add($entry)
        $totalNew++
    }
}

Write-Host "New entries: $totalNew / Skipped: $totalSkip"

$newJson = $queueList | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText($QueuePath, $newJson, [System.Text.UTF8Encoding]::new($false))
Write-Host "Queue saved."

# Restart llm-wiki if it was running
if ($llmWasRunning) {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $AppExe
    $psi.UseShellExecute = $false
    $psi.EnvironmentVariables["PATH"] = $env:PATH
    [System.Diagnostics.Process]::Start($psi) | Out-Null
    Write-Host "llm-wiki restarted."
}

Write-Host "Done."
