# scripts/sync-nas.ps1
# NAS(SMB 네트워크 드라이브)에서 vault raw/sources로 선별 복사
# NAS 연결: net use Z: \\10.11.1.40\R_Dev\공용\자료 /persistent:yes

param(
    [string]$Source = "Z:\",
    [string]$Destination = "D:\vault\raw\sources",
    [string[]]$Extensions = @("*.pdf", "*.md", "*.txt", "*.docx", "*.xlsx"),
    [switch]$DryRun
)

# NAS 네트워크 드라이브 접근 확인
if (-not (Test-Path $Source)) {
    Write-Host "NAS 드라이브 접근 불가: $Source" -ForegroundColor Red
    Write-Host "  net use Z: \\10.11.1.40\R_Dev\공용\자료 /user:계정 비밀번호 /persistent:yes" -ForegroundColor Yellow
    exit 1
}

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Write-Host "[$timestamp] NAS → vault 동기화 시작" -ForegroundColor Cyan
Write-Host "  Source:      $Source"
Write-Host "  Destination: $Destination"
if ($DryRun) { Write-Host "  모드: DRY RUN (실제 복사 없음)" -ForegroundColor Yellow }

$newCount = 0
$skipCount = 0

# 소스 디렉터리의 하위 폴더 구조를 보존하며 복사
foreach ($ext in $Extensions) {
    $files = Get-ChildItem -Path $Source -Filter $ext -Recurse -File -ErrorAction SilentlyContinue
    foreach ($file in $files) {
        # 상대 경로 계산 (NAS 폴더 구조 보존)
        $relativePath = $file.FullName.Substring($Source.Length).TrimStart('\')
        $destFile = Join-Path $Destination $relativePath
        $destDir = Split-Path $destFile -Parent

        if (-not (Test-Path $destFile)) {
            if (-not $DryRun) {
                if (-not (Test-Path $destDir)) {
                    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
                }
                Copy-Item $file.FullName $destFile
            }
            Write-Host "  [NEW] $relativePath" -ForegroundColor Green
            $newCount++
        } else {
            $skipCount++
        }
    }
}

Write-Host "`n결과: 신규 ${newCount}개, 스킵 ${skipCount}개" -ForegroundColor Cyan
