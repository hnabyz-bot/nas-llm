# scripts/setup-env.ps1
# LLM Wiki 환경 설정 스크립트
# 관리자 권한으로 실행 필요

#Requires -RunAsAdministrator

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " LLM Wiki 환경 설정" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# --- 1. 전원 설정 ---
Write-Host "`n[1/5] 전원 설정 (24시간 운영)..." -ForegroundColor Yellow
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
powercfg /change disk-timeout-ac 0
powercfg /change monitor-timeout-ac 30
powercfg /hibernate off
Write-Host "  전원 설정 완료" -ForegroundColor Green

# --- 2. 디렉터리 생성 ---
Write-Host "`n[2/5] 디렉터리 생성..." -ForegroundColor Yellow
$dirs = @(
    "D:\vault",
    "D:\vault\llm-wiki-vault",
    "D:\vault\llm-wiki-vault\raw\sources",
    "D:\vault\llm-wiki-vault\raw\assets"
)
foreach ($dir in $dirs) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Host "  생성: $dir" -ForegroundColor Green
    } else {
        Write-Host "  존재: $dir" -ForegroundColor Gray
    }
}

# --- 3. PATH 확인 및 보정 ---
Write-Host "`n[3/6] PATH check..." -ForegroundColor Yellow
$nodePath = "C:\Program Files\nodejs"
$cargoPath = "$env:USERPROFILE\.cargo\bin"
$currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
$pathFixed = $false

if (Test-Path "$nodePath\node.exe") {
    if ($currentPath -notlike "*$nodePath*") {
        $currentPath = $currentPath.TrimEnd(';') + ";$nodePath"
        $pathFixed = $true
        Write-Host "  PATH added: $nodePath" -ForegroundColor Green
    }
}
if (Test-Path "$cargoPath\rustc.exe") {
    if ($currentPath -notlike "*$cargoPath*") {
        $currentPath = $currentPath.TrimEnd(';') + ";$cargoPath"
        $pathFixed = $true
        Write-Host "  PATH added: $cargoPath" -ForegroundColor Green
    }
}
if ($pathFixed) {
    [Environment]::SetEnvironmentVariable("Path", $currentPath, "User")
    $env:Path = "$nodePath;$cargoPath;$env:Path"
    Write-Host "  PATH saved (User scope)" -ForegroundColor Green
} else {
    Write-Host "  PATH OK" -ForegroundColor Green
}

# --- 4. 소프트웨어 확인 ---
Write-Host "`n[4/6] SW check..." -ForegroundColor Yellow

$checks = @(
    @{ Name = "Node.js"; Cmd = "node --version"; Min = "20" },
    @{ Name = "Rust";    Cmd = "rustc --version"; Min = "1.70" },
    @{ Name = "Git";     Cmd = "git --version";   Min = "2" }
)

$allOk = $true
foreach ($check in $checks) {
    try {
        $ver = Invoke-Expression $check.Cmd 2>$null
        Write-Host "  $($check.Name): $ver" -ForegroundColor Green
    } catch {
        Write-Host "  $($check.Name): not found" -ForegroundColor Red
        $allOk = $false
    }
}

if (-not $allOk) {
    Write-Host "`n  Run install-deps.ps1 first, then re-run this script." -ForegroundColor Red
    Write-Host "  Or install manually:" -ForegroundColor Yellow
    Write-Host "  Node.js: winget install OpenJS.NodeJS.LTS"
    Write-Host "  Rust:    winget install Rustlang.Rustup"
    Write-Host "  Git:     winget install Git.Git"
}

# --- 5. Windows Update ---
Write-Host "`n[5/6] Windows Update auto-restart disable..." -ForegroundColor Yellow
$auPath = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU"
if (-not (Test-Path $auPath)) {
    New-Item -Path $auPath -Force | Out-Null
}
Set-ItemProperty -Path $auPath -Name "NoAutoRebootWithLoggedOnUsers" -Value 1 -Type DWord
Write-Host "  Done" -ForegroundColor Green

# --- 6. System info ---
Write-Host "`n[6/6] System info..." -ForegroundColor Yellow
$os = Get-CimInstance Win32_OperatingSystem
$cpu = Get-CimInstance Win32_Processor
$ram = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)

Write-Host "  PC:  $env:COMPUTERNAME"
Write-Host "  OS:  $($os.Caption) ($($os.OSArchitecture))"
Write-Host "  CPU: $($cpu.Name)"
Write-Host "  RAM: ${ram}GB"

Get-PSDrive C, D -ErrorAction SilentlyContinue | ForEach-Object {
    $free = [math]::Round($_.Free / 1GB, 1)
    $used = [math]::Round($_.Used / 1GB, 1)
    Write-Host "  $($_.Name): ${used}GB used / ${free}GB free"
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host " 설정 완료. 다음 단계:" -ForegroundColor Cyan
Write-Host " 1. SW 설치:  .\scripts\install-deps.ps1" -ForegroundColor White
Write-Host " 2. 앱 빌드:  .\scripts\build-llm-wiki.ps1" -ForegroundColor White
Write-Host " 3. 프로젝트 생성: docs/02-BUILD-PLAN.md Phase 2 참조" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Cyan
