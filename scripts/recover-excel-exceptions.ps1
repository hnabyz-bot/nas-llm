# recover-excel-exceptions.ps1
# Recover XLS/XLSX preprocessing failures using local Microsoft Excel COM.

param(
    [string]$VaultRoot = "D:\vault\llm-wiki-vault"
)

$ErrorActionPreference = "Stop"

$ExceptionsPath = Join-Path $VaultRoot "raw\sources\_preprocessed\.preprocess-exceptions.csv"
$ManifestPath = Join-Path $VaultRoot "raw\sources\_preprocessed\.preprocess-manifest.json"
$PreprocessedRoot = Join-Path $VaultRoot "raw\sources\_preprocessed"

function ConvertTo-Slash([string]$value) {
    return $value -replace '\\', '/'
}

function Get-Sha1([string]$value) {
    $sha = [System.Security.Cryptography.SHA1]::Create()
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($value)
    $hash = $sha.ComputeHash($bytes)
    return (($hash | ForEach-Object { $_.ToString("x2") }) -join "").Substring(0, 12)
}

function Safe-Name([string]$value, [int]$limit = 80) {
    $safe = ($value -replace '[\\/:*?"<>|]', '_' -replace '\s+', ' ').Trim()
    if (-not $safe) { $safe = "document" }
    return $safe.Substring(0, [Math]::Min($limit, $safe.Length))
}

function Get-CellText($value) {
    if ($null -eq $value) { return "" }
    return ([string]$value).Trim()
}

function Convert-RangeToLines($range) {
    $rows = $range.Rows.Count
    $cols = $range.Columns.Count
    $values = $range.Value2
    $lines = [System.Collections.Generic.List[string]]::new()

    if ($rows -eq 1 -and $cols -eq 1) {
        $text = Get-CellText $values
        if ($text) { $lines.Add($text) }
        return $lines
    }

    for ($r = 1; $r -le $rows; $r++) {
        $cells = [System.Collections.Generic.List[string]]::new()
        for ($c = 1; $c -le $cols; $c++) {
            $text = Get-CellText $values[$r, $c]
            $cells.Add($text)
        }
        $line = (($cells.ToArray()) -join "`t").Trim()
        if ($line) { $lines.Add($line) }
    }
    return $lines
}

if (-not (Test-Path -LiteralPath $ExceptionsPath)) {
    Write-Host "exceptions file not found: $ExceptionsPath"
    exit 0
}

$exceptions = Import-Csv -LiteralPath $ExceptionsPath
$targets = @(
    $exceptions | Where-Object {
        $ext = [IO.Path]::GetExtension($_.sourcePath).ToLowerInvariant()
        (($ext -eq ".xlsx") -or ($ext -eq ".xls")) -and
            ($_.error -notlike "*password*") -and
            ($_.error -notlike "*Password*")
    }
)

if ($targets.Count -eq 0) {
    Write-Host "No Excel exceptions to recover."
    exit 0
}

$manifest = [System.IO.File]::ReadAllText($ManifestPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

$recovered = 0
$empty = 0
$failed = 0

try {
    foreach ($item in $targets) {
        $sourcePath = [string]$item.sourcePath
        $fullPath = Join-Path $VaultRoot ($sourcePath.Replace('/', '\'))
        $stat = Get-Item -LiteralPath $fullPath -ErrorAction Stop
        $relFromRaw = $sourcePath -replace '^raw/sources/', ''
        $parts = $relFromRaw -split '/'
        $folder = $parts[0]
        $id = Get-Sha1 $sourcePath
        $base = [IO.Path]::GetFileNameWithoutExtension($sourcePath)
        $outDir = Join-Path $PreprocessedRoot (Join-Path $folder (Join-Path "_by_source" $id))
        if (-not (Test-Path -LiteralPath $outDir)) {
            New-Item -ItemType Directory -Path $outDir -Force | Out-Null
        }

        $outputs = [System.Collections.Generic.List[string]]::new()
        try {
            $wb = $excel.Workbooks.Open($fullPath, $null, $true)
            foreach ($ws in @($wb.Worksheets)) {
                $lines = @(Convert-RangeToLines $ws.UsedRange)
                if ($lines.Count -eq 0) { continue }
                $sheetName = Safe-Name $ws.Name 40
                $outName = "$(Safe-Name $base 80)__${id}_${sheetName}.txt"
                $outFull = Join-Path $outDir $outName
                $content = "[Source: $relFromRaw / Sheet: $($ws.Name)]`n`n$($lines -join "`n")`n"
                [System.IO.File]::WriteAllText($outFull, $content, [System.Text.UTF8Encoding]::new($false))
                $outputs.Add((ConvertTo-Slash ($outFull.Substring($VaultRoot.Length + 1)))) | Out-Null
            }
            $wb.Close($false)

            $prop = $manifest.PSObject.Properties[$sourcePath]
            if (-not $prop) {
                $manifest | Add-Member -NotePropertyName $sourcePath -NotePropertyValue ([pscustomobject]@{}) -Force
                $prop = $manifest.PSObject.Properties[$sourcePath]
            }
            $entry = $prop.Value

            $entry.sourcePath = $sourcePath
            $entry.size = $stat.Length
            $entry.mtimeMs = [double]$stat.LastWriteTimeUtc.Subtract([datetime]'1970-01-01').TotalMilliseconds
            $entry.processedAt = [DateTime]::UtcNow.ToString("o")
            $entry.outputs = @($outputs.ToArray())
            if ($outputs.Count -gt 0) {
                $entry.status = "success"
                $entry.error = $null
                $recovered++
            } else {
                $entry.status = "empty"
                $entry.error = "No extractable text produced by Excel COM"
                $empty++
            }
        } catch {
            $prop = $manifest.PSObject.Properties[$sourcePath]
            $entry = if ($prop) { $prop.Value } else { $null }
            if ($entry) {
                $entry.status = "error"
                $entry.error = "Excel COM recovery failed: $($_.Exception.Message)"
            }
            $failed++
        }
    }
} finally {
    $excel.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
}

[System.IO.File]::WriteAllText($ManifestPath, (ConvertTo-Json $manifest -Depth 8), [System.Text.UTF8Encoding]::new($false))
Write-Host "Recovered: $recovered"
Write-Host "Empty: $empty"
Write-Host "Failed: $failed"
