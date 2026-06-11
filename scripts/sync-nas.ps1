# scripts/sync-nas.ps1
# NAS(SMB 네트워크 드라이브)에서 vault raw/sources로 선별 복사
# 대상: 인허가/RA 관련 7개 폴더만 동기화
# NAS 연결: net use Z: \\10.11.1.40\DR_Dev\공통자료 /persistent:yes

param(
    [string]$NasDrive = "Z:\",
    [string]$Destination = "D:\vault\llm-wiki-vault\raw\sources",
    [string[]]$Extensions = @("*.pdf", "*.md", "*.txt", "*.docx", "*.xlsx", "*.xls", "*.pptx"),
    [switch]$DryRun,
    [switch]$SummaryOnly
)

# ── 동기화 대상 폴더 (인허가/RA 업무 범위) ──
# 추가/제거 시 이 배열만 수정. docs/01-SYSTEM-SPEC.md §1.3과 동기화 유지할 것.
$TargetFolders = @(
    "DHF (인허가)",        # Design History File — 제품별 인허가 문서
    "RA",                  # Regulatory Affairs — 인증서, 규제대응, 해외등록, 시험소
    "Standard(국제)",      # IEC/ISO 국제규격 — Safety, EMC, Biocompatibility, QMS
    "연구소 문서등록대장",  # QMS 문서관리 체계, 문서 추적성 증빙
    "타사 메뉴얼",         # 타사 제품 User Manual, Predicate device 참조
    "Project",             # 프로젝트별 산출물 — 설계/검증/이관 문서
    "Restricted_Backup"    # 제한 백업 — 핵심 규제문서 아카이브
)

# ── NAS 접근 확인 ──
if (-not (Test-Path -LiteralPath $NasDrive)) {
    Write-Host "NAS 드라이브 접근 불가: $NasDrive" -ForegroundColor Red
    Write-Host "  net use Z: \\10.11.1.40\DR_Dev\공통자료 /persistent:yes" -ForegroundColor Yellow
    exit 1
}

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Write-Host "[$timestamp] NAS → vault 동기화 시작" -ForegroundColor Cyan
Write-Host "  NAS Drive:   $NasDrive"
Write-Host "  Destination: $Destination"
Write-Host "  대상 폴더:   $($TargetFolders.Count)개"
if ($DryRun) { Write-Host "  모드: DRY RUN (실제 복사 없음)" -ForegroundColor Yellow }

$totalNew = 0
$totalSkip = 0
$totalError = 0

foreach ($folder in $TargetFolders) {
    $sourcePath = Join-Path $NasDrive $folder

    if (-not (Test-Path -LiteralPath $sourcePath)) {
        Write-Host "`n  [WARN] 폴더 없음: $folder" -ForegroundColor Yellow
        continue
    }

    Write-Host "`n── $folder ──" -ForegroundColor White
    $folderNew = 0
    $folderSkip = 0

    foreach ($ext in $Extensions) {
        $files = Get-ChildItem -LiteralPath $sourcePath -Filter $ext -Recurse -File -ErrorAction SilentlyContinue
        foreach ($file in $files) {
            # 상대 경로 계산 (NAS 폴더 구조 보존)
            $relativePath = $file.FullName.Substring($NasDrive.Length).TrimStart('\')
            $destFile = Join-Path $Destination $relativePath
            $destDir = Split-Path $destFile -Parent

            $destExists = $false
            try {
                $destExists = Test-Path -LiteralPath $destFile
            } catch {
                Write-Host "  [ERR]  $relativePath — destination path check failed: $($_.Exception.Message)" -ForegroundColor Red
                $totalError++
                continue
            }

            if (-not $destExists) {
                if (-not $DryRun) {
                    try {
                        if (-not (Test-Path -LiteralPath $destDir)) {
                            New-Item -ItemType Directory -Path $destDir -Force | Out-Null
                        }
                        Copy-Item -LiteralPath $file.FullName -Destination $destFile -ErrorAction Stop
                    } catch {
                        Write-Host "  [ERR]  $relativePath — $($_.Exception.Message)" -ForegroundColor Red
                        $totalError++
                        continue
                    }
                }
                $sizeMB = [math]::Round($file.Length / 1MB, 1)
                if (-not $SummaryOnly) {
                    Write-Host "  [NEW]  $relativePath (${sizeMB}MB)" -ForegroundColor Green
                }
                $folderNew++
            } else {
                $folderSkip++
            }
        }
    }

    Write-Host "  소계: 신규 ${folderNew}개, 스킵 ${folderSkip}개"
    $totalNew += $folderNew
    $totalSkip += $folderSkip
}

Write-Host "`n════════════════════════════════════" -ForegroundColor Cyan
Write-Host "결과: 신규 ${totalNew}개, 스킵 ${totalSkip}개, 에러 ${totalError}개" -ForegroundColor Cyan
Write-Host "════════════════════════════════════" -ForegroundColor Cyan
