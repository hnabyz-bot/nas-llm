# scripts/auto-commit.ps1
# wiki/ 변경사항 자동 Git 커밋 및 푸시

$vaultPath = "D:\vault"

if (-not (Test-Path "$vaultPath\.git")) {
    Write-Host "Git 미초기화: $vaultPath" -ForegroundColor Red
    exit 1
}

Push-Location $vaultPath

$changes = git status --porcelain wiki/
if ($changes) {
    git add wiki/
    $date = Get-Date -Format "yyyy-MM-dd HH:mm"
    $count = ($changes | Measure-Object).Count
    git commit -m "wiki: auto-update $date (${count} files)"
    
    git push 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[$date] 커밋 & 푸시 완료 (${count}개 파일)" -ForegroundColor Green
    } else {
        Write-Host "[$date] 커밋 완료, 푸시 실패 (exit $LASTEXITCODE)" -ForegroundColor Yellow
    }
} else {
    $date = Get-Date -Format "yyyy-MM-dd HH:mm"
    Write-Host "[$date] wiki/ 변경 없음, 스킵" -ForegroundColor Gray
}

Pop-Location
