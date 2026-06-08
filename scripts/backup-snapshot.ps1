# scripts/backup-snapshot.ps1
# file-snapshot.json 스캔 완료 대기 후 백업 생성

$vaultPath = "D:\vault\llm-wiki-vault"
$snapshotPath = "$vaultPath\.llm-wiki\file-snapshot.json"
$bakPath = "$vaultPath\.llm-wiki\file-snapshot.bak"

if (-not (Test-Path $snapshotPath)) {
    Write-Host "file-snapshot.json 없음: $snapshotPath" -ForegroundColor Red
    exit 1
}

# 스캔 완료 감지: 30분 주기 체크, 2회 연속 무변화(=60분) 시 완료 판정
Write-Host "스캔 완료 대기 중 (30분 주기, 연속 2회 무변화 시 완료)..." -ForegroundColor Yellow
$prevSize = 0
$stableCount = 0

while ($stableCount -lt 2) {
    $currentSize = (Get-Item $snapshotPath).Length
    if ($currentSize -eq $prevSize -and $currentSize -gt 100) {
        $stableCount++
        Write-Host "  [$(Get-Date -Format 'HH:mm')] 무변화 $stableCount/2 (크기: $([math]::Round($currentSize/1MB, 2)) MB)" -ForegroundColor Gray
    } else {
        $stableCount = 0
        Write-Host "  [$(Get-Date -Format 'HH:mm')] 스캔 진행 중... (크기: $([math]::Round($currentSize/1MB, 2)) MB)" -ForegroundColor Gray
    }
    $prevSize = $currentSize
    Start-Sleep -Seconds 1800
}
Write-Host "  [$(Get-Date -Format 'HH:mm')] 60분간 무변화 확인 — 스캔 완료" -ForegroundColor Green

# 백업 실행
Copy-Item $snapshotPath $bakPath -Force
$bakSize = (Get-Item $bakPath).Length
Write-Host "`n백업 완료!" -ForegroundColor Green
Write-Host "  원본: $snapshotPath ($([math]::Round((Get-Item $snapshotPath).Length/1MB, 2)) MB)"
Write-Host "  백업: $bakPath ($([math]::Round($bakSize/1MB, 2)) MB)"
