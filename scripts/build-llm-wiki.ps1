# scripts/build-llm-wiki.ps1
# Phase 1: nashsu/llm_wiki 클론 + npm install + tauri build
# 선행: install-deps.ps1 실행 완료 (Node.js, Rust, Git 설치)

param(
    [string]$InstallDir = "C:\dev\llm_wiki",
    [switch]$DevOnly   # tauri build 생략하고 dev 실행만 확인
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " llm_wiki Build" -ForegroundColor Cyan
Write-Host " Target: $InstallDir" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# --- 1. 선행 도구 확인 ---
Write-Host "`n[1/4] 선행 도구 확인..." -ForegroundColor Yellow
$missing = @()
foreach ($cmd in @("node","rustc","cargo","git","protoc")) {
    $ver = Invoke-Expression "$cmd --version" 2>$null
    if ($ver) { Write-Host "  OK: $cmd  $ver" -ForegroundColor Green }
    else       { Write-Host "  없음: $cmd" -ForegroundColor Red; $missing += $cmd }
}
if ($missing.Count -gt 0) {
    Write-Host "`n  누락 도구: $($missing -join ', ')" -ForegroundColor Red
    Write-Host "  먼저 .\scripts\install-deps.ps1 를 실행하세요." -ForegroundColor Yellow
    exit 1
}

# --- 2. 디렉터리 준비 ---
Write-Host "`n[2/4] 디렉터리 준비..." -ForegroundColor Yellow
$parentDir = Split-Path $InstallDir -Parent
if (-not (Test-Path $parentDir)) {
    New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
    Write-Host "  생성: $parentDir" -ForegroundColor Green
}

if (Test-Path $InstallDir) {
    Write-Host "  이미 존재: $InstallDir (클론 생략)" -ForegroundColor Gray
} else {
    Write-Host "  클론: https://github.com/nashsu/llm_wiki.git -> $InstallDir" -ForegroundColor White
    git clone https://github.com/nashsu/llm_wiki.git $InstallDir
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  클론 실패" -ForegroundColor Red
        exit 1
    }
    Write-Host "  클론 완료" -ForegroundColor Green
}

# --- 3. npm install ---
Write-Host "`n[3/4] npm install..." -ForegroundColor Yellow
Push-Location $InstallDir
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "  npm install 실패" -ForegroundColor Red
    Pop-Location
    exit 1
}
Write-Host "  npm install 완료" -ForegroundColor Green

# --- 4. tauri build ---
if ($DevOnly) {
    Write-Host "`n[4/4] 개발 모드 실행 (DevOnly)..." -ForegroundColor Yellow
    Write-Host "  npm run tauri dev 를 직접 실행하세요." -ForegroundColor White
    Write-Host "  앱 창이 열리면 Welcome Screen 확인 후 Ctrl+C 로 종료." -ForegroundColor White
} else {
    Write-Host "`n[4/4] tauri build (프로덕션)..." -ForegroundColor Yellow
    npm run tauri build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  빌드 실패. 아래를 확인하세요:" -ForegroundColor Red
        Write-Host "  - Visual Studio Build Tools C++ 워크로드 설치 여부" -ForegroundColor Yellow
        Write-Host "  - rustc 1.70+ 확인: rustc --version" -ForegroundColor Yellow
        Pop-Location
        exit 1
    }
    $bundle = "$InstallDir\src-tauri\target\release\bundle"
    Write-Host "  빌드 완료. 설치 파일 위치: $bundle" -ForegroundColor Green
}

Pop-Location

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host " 완료. 다음 단계:" -ForegroundColor Cyan
Write-Host " 1. 앱 실행: $InstallDir\src-tauri\target\release\llm_wiki.exe" -ForegroundColor White
Write-Host " 2. 또는: cd $InstallDir && npm run tauri dev" -ForegroundColor White
Write-Host " 3. New Project -> D:\vault 선택" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Cyan
