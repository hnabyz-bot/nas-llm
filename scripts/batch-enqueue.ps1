# batch-enqueue.ps1
# raw/sources/ 하위 폴더의 미처리 파일을 ingest-queue에 배치 투입
# 사용법: .\batch-enqueue.ps1 -SourceFolder "DHF (인허가)" [-BatchSize 200] [-IncludeCached] [-DryRun]
#
# 기본 동작: ingest-cache에 없는 파일만 투입 (미처리 우선)
# -IncludeCached: 스텁 재처리 — 캐시에 있어도 투입 (품질 업그레이드용)

param(
    [Parameter(Mandatory=$true)]
    [string]$SourceFolder,     # raw/sources/ 하위 폴더명 (예: "DHF (인허가)")

    [int]$BatchSize = 200,     # 한 번에 투입할 최대 항목 수

    [switch]$IncludeCached,    # 이미 처리된(캐시 있는) 파일도 포함

    [switch]$DryRun            # 실제 큐 수정 없이 대상 파일만 출력
)

$VaultRoot   = "D:\vault\llm-wiki-vault"
$QueuePath   = "$VaultRoot\.llm-wiki\ingest-queue.json"
$CachePath   = "$VaultRoot\.llm-wiki\ingest-cache.json"
$ProjectId   = "2da34b71-49aa-4919-a66a-90f1683772f9"
$RawSources  = "$VaultRoot\raw\sources"
$TargetDir   = Join-Path $RawSources $SourceFolder

if (-not (Test-Path $TargetDir)) {
    Write-Error "폴더를 찾을 수 없음: $TargetDir"
    exit 1
}

Write-Host "대상 폴더: $TargetDir"

$extensions = @(".docx", ".xlsx", ".txt", ".xls", ".doc")

# ingest-cache 파일명 집합 로드 (basename 기준)
$cacheSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
if ((Test-Path $CachePath) -and (-not $IncludeCached)) {
    $cacheRaw = [System.IO.File]::ReadAllText($CachePath, [System.Text.Encoding]::UTF8)
    [regex]::Matches($cacheRaw, '"([^"]+\.(?:docx|xlsx|txt|xls|doc))"',
        [System.Text.RegularExpressions.RegexOptions]::IgnoreCase) | ForEach-Object {
        [void]$cacheSet.Add($_.Groups[1].Value)
    }
    Write-Host "인제스트 캐시 로드: $($cacheSet.Count)개 파일명"
}

# 현재 큐 로드 (이미 투입된 sourcePath 집합)
$queuePaths = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
$queueList  = [System.Collections.Generic.List[object]]::new()
if (Test-Path $QueuePath) {
    $q = [System.IO.File]::ReadAllText($QueuePath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
    foreach ($item in $q) {
        $queueList.Add($item)
        [void]$queuePaths.Add($item.sourcePath)
    }
    Write-Host "현재 큐: $($queueList.Count)개"
}

function New-IngestId {
    $ts   = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $rand = -join ((65..90) + (97..122) | Get-Random -Count 6 | ForEach-Object { [char]$_ })
    return "ingest-$ts-$rand"
}

# 대상 파일 스캔
$added   = 0
$skipped = 0
$preview = @()

Get-ChildItem $TargetDir -Recurse -File |
    Where-Object { $extensions -contains $_.Extension.ToLower() } |
    Sort-Object FullName |
    ForEach-Object {
        if ($added -ge $BatchSize) { return }

        $file = $_

        # sourcePath: vault root 기준 상대 경로 (슬래시)
        $relPath = $file.FullName.Substring($VaultRoot.Length + 1) -replace '\\', '/'

        # 이미 큐에 있으면 스킵
        if ($queuePaths.Contains($relPath)) { $skipped++; return }

        # 캐시에 있으면 스킵 (IncludeCached 미지정 시)
        if ($cacheSet.Contains($file.Name)) { $skipped++; return }

        # folderContext: raw/sources/ 이하 폴더 계층
        $relFromRaw = $file.DirectoryName.Substring($RawSources.Length).TrimStart('\')
        $parts      = $relFromRaw -split '\\' | Where-Object { $_ -ne "" }
        $ctx        = $parts -join " > "

        if ($DryRun) {
            $preview += "  $($file.Name) ($([math]::Round($file.Length/1KB))KB)"
            $added++
            return
        }

        $entry = [pscustomobject]@{
            id            = New-IngestId
            projectId     = $ProjectId
            sourcePath    = $relPath
            folderContext = $ctx
            status        = "pending"
            addedAt       = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
            retryCount    = 0
            error         = $null
        }
        $queueList.Add($entry)
        [void]$queuePaths.Add($relPath)
        $added++
    }

Write-Host "투입 대상: ${added}개 / 스킵: ${skipped}개"

if ($DryRun) {
    Write-Host "`n[DRY RUN] 첫 10개:"
    $preview | Select-Object -First 10 | ForEach-Object { Write-Host $_ }
    exit 0
}

if ($added -eq 0) {
    Write-Host "새로 투입할 파일 없음"
    exit 0
}

$json = $queueList | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText($QueuePath, $json, [System.Text.UTF8Encoding]::new($false))
Write-Host "큐 저장 완료 — 총 $($queueList.Count)개 (새 항목 $added)"
Write-Host "llm-wiki 재시작 또는 watchdog가 자동 처리합니다."
