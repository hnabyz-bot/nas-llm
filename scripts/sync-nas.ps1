# scripts/sync-nas.ps1
# NAS 동기화 스테이징에서 vault raw/sources로 선별 복사

param(
    [string]$Source = "D:\nas-sync",
    [string]$Destination = "D:\vault\raw\sources",
    [string[]]$Extensions = @("*.pdf", "*.md", "*.txt", "*.docx", "*.xlsx"),
    [switch]$DryRun
)

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
