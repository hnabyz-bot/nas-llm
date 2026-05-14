# scripts/install-deps.ps1
# Phase 1: Node.js 20 LTS + Rust toolchain install
# Requires: winget (Windows 10 built-in)

#Requires -RunAsAdministrator

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Phase 1: SW Install" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# --- Node.js ---
Write-Host "`n[1/2] Node.js 20 LTS..." -ForegroundColor Yellow
$nodeVer = node --version 2>$null
if ($nodeVer -and $nodeVer -match "^v(2[0-9]|[3-9])") {
    Write-Host "  OK: $nodeVer" -ForegroundColor Green
} else {
    Write-Host "  Installing Node.js 20 LTS..." -ForegroundColor White
    winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    Write-Host "  Done. Restart PowerShell to use node." -ForegroundColor Yellow
}

# --- Rust ---
Write-Host "`n[2/2] Rust toolchain..." -ForegroundColor Yellow
$rustVer = rustc --version 2>$null
if ($rustVer) {
    Write-Host "  OK: $rustVer" -ForegroundColor Green
} else {
    Write-Host "  Installing Rustup..." -ForegroundColor White
    winget install Rustlang.Rustup --accept-source-agreements --accept-package-agreements
    Write-Host "  Done. Restart PowerShell, then run: rustup default stable" -ForegroundColor Yellow
}

# --- Summary ---
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host " 설치 완료. 새 PowerShell 창에서 확인:" -ForegroundColor Cyan
Write-Host "   node --version   (v20 이상)" -ForegroundColor White
Write-Host "   rustc --version  (1.70 이상)" -ForegroundColor White
Write-Host "   git --version    (2.x)" -ForegroundColor White
Write-Host "`n 다음 단계 — llm_wiki 빌드:" -ForegroundColor Cyan
Write-Host "   .\scripts\build-llm-wiki.ps1" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Cyan
