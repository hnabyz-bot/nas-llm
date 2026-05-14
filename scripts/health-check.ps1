# scripts/health-check.ps1
# LLM Wiki 시스템 상태 점검

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " LLM Wiki Health Check — $timestamp" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# --- 디스크 ---
Write-Host "`n[디스크]" -ForegroundColor Yellow
Get-PSDrive C, D -ErrorAction SilentlyContinue | ForEach-Object {
    $free = [math]::Round($_.Free / 1GB, 1)
    $total = [math]::Round(($_.Used + $_.Free) / 1GB, 1)
    $pct = [math]::Round($_.Used / ($_.Used + $_.Free) * 100, 0)
    $color = if ($free -lt 20) { "Red" } elseif ($free -lt 50) { "Yellow" } else { "Green" }
    Write-Host "  $($_.Name): ${free}GB free / ${total}GB total (${pct}% used)" -ForegroundColor $color
}

# --- Vault 통계 ---
Write-Host "`n[Vault]" -ForegroundColor Yellow
$vaultPath = "D:\vault"
if (Test-Path $vaultPath) {
    $rawCount = (Get-ChildItem "$vaultPath\raw\sources" -Recurse -File -ErrorAction SilentlyContinue).Count
    $wikiCount = (Get-ChildItem "$vaultPath\wiki" -Recurse -Filter "*.md" -ErrorAction SilentlyContinue).Count
    $entityCount = (Get-ChildItem "$vaultPath\wiki\entities" -Filter "*.md" -ErrorAction SilentlyContinue).Count
    $conceptCount = (Get-ChildItem "$vaultPath\wiki\concepts" -Filter "*.md" -ErrorAction SilentlyContinue).Count

    Write-Host "  Raw sources:  $rawCount"
    Write-Host "  Wiki pages:   $wikiCount"
    Write-Host "    Entities:   $entityCount"
    Write-Host "    Concepts:   $conceptCount"
    if ($rawCount -gt 0) {
        Write-Host "    Ratio:      $([math]::Round($wikiCount/$rawCount, 1))x"
    }
} else {
    Write-Host "  Vault not found at $vaultPath" -ForegroundColor Red
}

# --- 프로세스 ---
Write-Host "`n[프로세스]" -ForegroundColor Yellow
$llmProc = Get-Process -Name "*llm*wiki*" -ErrorAction SilentlyContinue
if ($llmProc) {
    $mem = [math]::Round(($llmProc | Measure-Object WorkingSet64 -Sum).Sum / 1MB, 0)
    Write-Host "  llm_wiki: RUNNING (${mem}MB)" -ForegroundColor Green
} else {
    Write-Host "  llm_wiki: STOPPED" -ForegroundColor Red
}

# --- Git ---
Write-Host "`n[Git]" -ForegroundColor Yellow
if (Test-Path "$vaultPath\.git") {
    Push-Location $vaultPath
    $dirty = git status --porcelain wiki/ 2>$null
    $lastCommit = git log -1 --format="%ai %s" 2>$null
    if ($dirty) {
        $dirtyCount = ($dirty | Measure-Object).Count
        Write-Host "  상태: ${dirtyCount}개 미커밋 변경" -ForegroundColor Yellow
    } else {
        Write-Host "  상태: clean" -ForegroundColor Green
    }
    Write-Host "  최근 커밋: $lastCommit"
    Pop-Location
} else {
    Write-Host "  Git 미초기화" -ForegroundColor Red
}

# --- NAS 연결 ---
Write-Host "`n[NAS]" -ForegroundColor Yellow
$nasDrive = "Z:\"
if (Test-Path $nasDrive) {
    Write-Host "  NAS 드라이브 (Z:\): 연결됨" -ForegroundColor Green
    $netUse = net use Z: 2>&1
    Write-Host "  $($netUse | Select-String '원격')" -ForegroundColor Gray
} else {
    Write-Host "  NAS 드라이브 (Z:\): 연결 안 됨" -ForegroundColor Red
    Write-Host "  net use Z: \\10.11.1.40\DR_Dev\공통자료 /persistent:yes" -ForegroundColor Yellow
}

# --- 업타임 ---
Write-Host "`n[시스템]" -ForegroundColor Yellow
$os = Get-CimInstance Win32_OperatingSystem
$uptime = (Get-Date) - $os.LastBootUpTime
Write-Host "  업타임: $([math]::Floor($uptime.TotalDays))일 $($uptime.Hours)시간 $($uptime.Minutes)분"

$ramFree = [math]::Round($os.FreePhysicalMemory / 1MB, 1)
$ramTotal = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
$ramColor = if ($ramFree -lt 2) { "Red" } elseif ($ramFree -lt 4) { "Yellow" } else { "Green" }
Write-Host "  RAM: ${ramFree}GB free / ${ramTotal}GB total" -ForegroundColor $ramColor

Write-Host "`n========================================" -ForegroundColor Cyan
