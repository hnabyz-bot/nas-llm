# preprocess-active-originals.ps1
# Convert active non-preprocessed queue entries to _preprocessed TXT entries.

param(
    [string]$QueuePath = "D:\vault\llm-wiki-vault\.llm-wiki\ingest-queue.json",
    [string]$VaultRoot = "D:\vault\llm-wiki-vault",
    [string]$ProjectId = "2da34b71-49aa-4919-a66a-90f1683772f9"
)

$ErrorActionPreference = "Stop"
$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" +
            [System.Environment]::GetEnvironmentVariable("PATH", "User")
$env:NODE_PATH = "C:\Users\admin\AppData\Roaming\npm\node_modules"

$PreprocRoot = "raw/sources/_preprocessed"
$XlsxScript = Join-Path (Split-Path $MyInvocation.MyCommand.Path) "preprocess-xlsx.js"
$TargetFolders = @(
    "DHF (인허가)",
    "RA",
    "Standard(국제)",
    "연구소 문서등록대장",
    "타사 메뉴얼",
    "Project",
    "Restricted_Backup"
)

function New-IngestId {
    $ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $rand = -join ((65..90) + (97..122) | Get-Random -Count 6 | ForEach-Object { [char]$_ })
    return "ingest-$ts-$rand"
}

function Safe-Name([string]$name) {
    $safe = $name -replace '[\\/:*?"<>|]', '_'
    return $safe.Substring(0, [Math]::Min(120, $safe.Length))
}

function Get-FolderContext([string]$sourcePath) {
    $rel = $sourcePath -replace '^raw/sources/', ''
    $parts = ($rel -split '/') | Select-Object -SkipLast 1
    return $parts -join ' > '
}

function Get-SourceTopFolder([string]$sourcePath) {
    $rel = $sourcePath -replace '^raw/sources/', ''
    return ($rel -split '/')[0]
}

function Test-AllowedOriginalPath([string]$sourcePath) {
    if ($sourcePath -notmatch '^raw/sources/') { return $false }
    if ($sourcePath -match '^raw/sources/_preprocessed/') { return $false }
    return $TargetFolders -contains (Get-SourceTopFolder $sourcePath)
}

function New-FailedCopy($item, [string]$message) {
    return [pscustomobject]@{
        id            = $item.id
        projectId     = $item.projectId
        sourcePath    = $item.sourcePath
        folderContext = $item.folderContext
        status        = 'failed'
        addedAt       = $item.addedAt
        error         = $message
        retryCount    = 3
    }
}

function Convert-DocxToTextFiles([string]$docxPath, [string]$outDir, [string]$fallbackDir) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem

    $zip = [System.IO.Compression.ZipFile]::OpenRead($docxPath)
    try {
        $entry = $zip.Entries | Where-Object { $_.FullName -eq 'word/document.xml' }
        if (-not $entry) { return @() }
        $reader = [System.IO.StreamReader]::new($entry.Open())
        $xmlText = $reader.ReadToEnd()
        $reader.Close()
    } finally {
        $zip.Dispose()
    }

    $xml = [xml]$xmlText
    $lines = @(
        $xml.SelectNodes('//*[local-name()=''t'']') |
            ForEach-Object { $_.InnerText } |
            Where-Object { $_ -and $_.Trim() }
    )
    if ($lines.Count -eq 0) { return @() }

    $base = Safe-Name ([System.IO.Path]::GetFileNameWithoutExtension($docxPath))
    $results = @()
    $chunkSize = 400

    for ($i = 0; $i -lt $lines.Count; $i += $chunkSize) {
        $part = [int]($i / $chunkSize) + 1
        $slice = $lines[$i..([Math]::Min($i + $chunkSize - 1, $lines.Count - 1))]
        $outName = if ($lines.Count -le $chunkSize) { "$base.txt" } else { "${base}_part${part}.txt" }
        $content = "[Source: $([System.IO.Path]::GetFileName($docxPath)) / Part $part]`n`n$($slice -join "`n")`n"

        $targetDir = $outDir
        $target = Join-Path $targetDir $outName
        try {
            [System.IO.File]::WriteAllText($target, $content, [System.Text.UTF8Encoding]::new($false))
        } catch {
            if (-not (Test-Path $fallbackDir)) { New-Item -ItemType Directory -Force -Path $fallbackDir | Out-Null }
            $short = "docx_${part}_" + (Safe-Name ([System.IO.Path]::GetFileNameWithoutExtension($docxPath)))
            if ($short.Length -gt 80) { $short = $short.Substring(0, 80) }
            $outName = "$short.txt"
            $targetDir = $fallbackDir
            [System.IO.File]::WriteAllText((Join-Path $targetDir $outName), $content, [System.Text.UTF8Encoding]::new($false))
        }

        $results += [pscustomobject]@{
            file = $outName
            section = "Part $part"
            fallback = ($targetDir -eq $fallbackDir)
        }
    }

    return @($results)
}

if (-not (Test-Path $QueuePath)) {
    Write-Host "Queue not found: $QueuePath"
    exit 0
}

$backup = "$QueuePath.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item -LiteralPath $QueuePath -Destination $backup -Force

$json = [System.IO.File]::ReadAllText($QueuePath, [System.Text.Encoding]::UTF8)
$parsed = $json | ConvertFrom-Json
$items = if ($parsed -is [array]) { $parsed } else { @($parsed) }
$newList = [System.Collections.Generic.List[object]]::new()

$targets = 0
$converted = 0
$newEntries = 0
$pdfExcluded = 0
$failed = 0

foreach ($item in $items) {
    $activeOriginal = ($item.sourcePath -notlike '*_preprocessed*') -and
        (($item.status -eq 'pending') -or ($item.status -eq 'processing'))

    if (-not $activeOriginal) {
        $newList.Add($item)
        continue
    }

    $targets++
    $relPath = [string]$item.sourcePath
    $topFolder = Get-SourceTopFolder $relPath
    if (-not (Test-AllowedOriginalPath $relPath)) {
        $newList.Add((New-FailedCopy $item "Excluded from preprocessing: source folder is outside the approved sync scope ($topFolder)"))
        $failed++
        continue
    }

    $fullPath = Join-Path $VaultRoot ($relPath.Replace('/', '\'))
    $ext = [System.IO.Path]::GetExtension($relPath).ToLowerInvariant()
    $parentRel = ($relPath -replace '^raw/sources/', '' -replace '[^/]+$', '').TrimEnd('/')
    $outRelDir = ("$PreprocRoot/$parentRel").TrimEnd('/')
    $outFullDir = Join-Path $VaultRoot ($outRelDir.Replace('/', '\'))
    $fallbackRelDir = "$PreprocRoot/$topFolder/_longpath"
    $fallbackFullDir = Join-Path $VaultRoot ($fallbackRelDir.Replace('/', '\'))

    if (-not (Test-Path $outFullDir)) { New-Item -ItemType Directory -Force -Path $outFullDir | Out-Null }

    if ($ext -eq '.pdf') {
        $newList.Add((New-FailedCopy $item 'Excluded from raw ingest: PDF requires separate preprocessing path'))
        $pdfExcluded++
        continue
    }

    $newFiles = @()
    $errorMessage = $null

    try {
        if ($ext -eq '.xlsx') {
            $raw = & node $XlsxScript $fullPath $outFullDir 2>&1
            $parsedFiles = $raw | ConvertFrom-Json
            $newFiles = if ($parsedFiles -is [array]) { $parsedFiles } else { @($parsedFiles) }
        } elseif ($ext -eq '.docx') {
            $newFiles = @(Convert-DocxToTextFiles $fullPath $outFullDir $fallbackFullDir)
        } elseif ($ext -eq '.txt') {
            $outName = Safe-Name ([System.IO.Path]::GetFileName($fullPath))
            Copy-Item -LiteralPath $fullPath -Destination (Join-Path $outFullDir $outName) -Force
            $newFiles = @([pscustomobject]@{ file = $outName; section = 'Plain text copy'; fallback = $false })
        } else {
            $errorMessage = "Excluded from raw ingest: unsupported extension $ext"
        }
    } catch {
        $errorMessage = "Preprocess failed: $($_.Exception.Message)"
    }

    if ($errorMessage) {
        $newList.Add((New-FailedCopy $item $errorMessage))
        $failed++
        continue
    }

    if ($newFiles.Count -eq 0) {
        $newList.Add((New-FailedCopy $item 'Preprocess produced no output'))
        $failed++
        continue
    }

    $newList.Add((New-FailedCopy $item "Preprocessed: replaced by $($newFiles.Count) text item(s)"))
    $converted++

    $ctx = Get-FolderContext $relPath
    $base = [System.IO.Path]::GetFileNameWithoutExtension($relPath)
    foreach ($nf in $newFiles) {
        $entryRelDir = if ($nf.fallback) { $fallbackRelDir } else { $outRelDir }
        $newRel = "$entryRelDir/$($nf.file)" -replace '\\', '/'
        $label = if ($nf.section) { $nf.section } elseif ($nf.sheet) { $nf.sheet } else { 'Text' }
        $newList.Add([pscustomobject]@{
            id            = New-IngestId
            projectId     = $ProjectId
            sourcePath    = $newRel
            folderContext = if ($ctx) { "$ctx > $base > $label" } else { "$base > $label" }
            status        = 'pending'
            addedAt       = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
            error         = $null
            retryCount    = 0
        })
        $newEntries++
    }
}

$array = $newList.ToArray()
$outputJson = ConvertTo-Json -InputObject $array -Depth 6
[System.IO.File]::WriteAllText($QueuePath, $outputJson, [System.Text.UTF8Encoding]::new($false))

Write-Host "Backup: $backup"
Write-Host "Targets: $targets"
Write-Host "Converted: $converted"
Write-Host "New preprocessed entries: $newEntries"
Write-Host "PDF excluded: $pdfExcluded"
Write-Host "Failed: $failed"
Write-Host "Final total: $($array.Count)"



