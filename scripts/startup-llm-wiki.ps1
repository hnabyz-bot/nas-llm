# scripts/startup-llm-wiki.ps1
# Restore snapshot if needed, then start llm_wiki only when ingest is explicitly approved.

$vaultPath = "D:\vault\llm-wiki-vault"
$appExe = "C:\dev\llm_wiki\src-tauri\target\release\llm-wiki.exe"
$snapshot = "$vaultPath\.llm-wiki\file-snapshot.json"
$snapshotBak = "$vaultPath\.llm-wiki\file-snapshot.bak"
$ingestReadyFlag = "$vaultPath\.llm-wiki\ingest-ready.flag"
$minValidBytes = 1MB

function Write-Log {
    param([string]$msg, [string]$color = "White")
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$ts] $msg" -ForegroundColor $color
}

if (-not (Test-Path $ingestReadyFlag)) {
    Write-Log "ingest-ready.flag 없음: llm-wiki 자동 시작 금지" "Yellow"
    exit 0
}

$snapshotOk = $false
if (Test-Path $snapshot) {
    $size = (Get-Item $snapshot).Length
    if ($size -ge $minValidBytes) {
        $snapshotOk = $true
        Write-Log "file-snapshot.json 정상 ($([math]::Round($size / 1MB, 2)) MB)" "Green"
    } else {
        Write-Log "file-snapshot.json 손상/초기화 상태 ($size bytes)" "Yellow"
    }
} else {
    Write-Log "file-snapshot.json 없음" "Yellow"
}

if (-not $snapshotOk) {
    if (Test-Path $snapshotBak) {
        $bakSize = (Get-Item $snapshotBak).Length
        if ($bakSize -ge $minValidBytes) {
            Copy-Item $snapshotBak $snapshot -Force
            Write-Log "file-snapshot.json 복원 완료 (.bak $([math]::Round($bakSize / 1MB, 2)) MB)" "Cyan"
        } else {
            Write-Log "file-snapshot.bak도 손상 상태 - full rescan 불가피" "Red"
        }
    } else {
        Write-Log "file-snapshot.bak 없음 - full rescan 불가피" "Red"
    }
}

if (-not (Test-Path $appExe)) {
    Write-Log "llm-wiki.exe 없음: $appExe" "Red"
    exit 1
}

$running = Get-Process -Name "llm-wiki" -ErrorAction SilentlyContinue
if ($running) {
    Write-Log "기존 llm-wiki 프로세스 종료 중..." "Yellow"
    $running | Stop-Process -Force
    Start-Sleep -Seconds 2
}

Write-Log "llm_wiki 시작: $appExe" "Green"
Start-Process $appExe
