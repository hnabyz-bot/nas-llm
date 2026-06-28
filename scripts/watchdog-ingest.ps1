# watchdog-ingest.ps1
# 인제스트 진전 없으면 stuck 항목 failed 처리 후 llm-wiki 재시작
# 매 5분 실행 (Task Scheduler)

$QueuePath   = "D:\vault\llm-wiki-vault\.llm-wiki\ingest-queue.json"
$StatePath   = "D:\vault\llm-wiki-vault\scripts\watchdog-state.json"
$PreprocessScript = "D:\vault\llm-wiki-vault\scripts\preprocess-active-originals.ps1"
$AppExe      = "D:\vault\llm-wiki-vault\bin\llm-wiki.exe"
$IngestReadyFlag = "D:\vault\llm-wiki-vault\.llm-wiki\ingest-ready.flag"
$StuckMinutes = 60
$IdlePendingMinutes = 10
$ProcessingNoCodexMinutes = 10

# PATH에 npm 포함
$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" +
            [System.Environment]::GetEnvironmentVariable("PATH","User")

function Get-QueueCounts {
    $c = [System.IO.File]::ReadAllText($QueuePath, [System.Text.Encoding]::UTF8)
    return @{
        pending    = ([regex]::Matches($c, '"status":\s*"pending"')).Count
        processing = ([regex]::Matches($c, '"status":\s*"processing"')).Count
        done       = ([regex]::Matches($c, '"status":\s*"done"')).Count
        failed     = ([regex]::Matches($c, '"status":\s*"failed"')).Count
    }
}

function Start-AppWithPath {
    if (-not (Test-Path $IngestReadyFlag)) {
        Write-Host ">>> ingest-ready.flag 없음: llm-wiki 자동 시작 금지"
        return $false
    }

    # Start-Process는 수정된 $env:PATH를 자식 프로세스에 전달하지 않으므로
    # ProcessStartInfo로 PATH를 명시적으로 지정
    $pinfo = New-Object System.Diagnostics.ProcessStartInfo
    $pinfo.FileName = $AppExe
    $pinfo.UseShellExecute = $false
    $pinfo.CreateNoWindow = $false
    $pinfo.EnvironmentVariables["PATH"] = $env:PATH
    [System.Diagnostics.Process]::Start($pinfo) | Out-Null
    return $true
}

function Convert-ActiveOriginals {
    if (Test-Path $PreprocessScript) {
        Write-Host ">>> active 원본 큐 전처리 확인"
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $PreprocessScript
    }
}

function Kill-StuckItem {
    $lines = [System.IO.File]::ReadAllLines($QueuePath, [System.Text.Encoding]::UTF8)
    $fixed = 0
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match '"status":\s*"processing"') {
            $lines[$i] = $lines[$i] -replace '"processing"', '"failed"'
            $fixed++
        }
        if ($fixed -gt 0 -and $lines[$i] -match '"retryCount"') {
            $lines[$i] = [regex]::Replace($lines[$i], '"retryCount":\s*\d+', '"retryCount": 3')
            break
        }
    }
    [System.IO.File]::WriteAllLines($QueuePath, $lines, [System.Text.UTF8Encoding]::new($false))
    return $fixed
}

function Reset-ProcessingItems {
    $queue = [System.IO.File]::ReadAllText($QueuePath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
    $fixed = 0
    foreach ($item in $queue) {
        if ($item.status -eq "processing") {
            $item.status = "pending"
            $item.error = $null
            $fixed++
        }
    }
    $json = ConvertTo-Json -InputObject @($queue) -Depth 20
    [System.IO.File]::WriteAllText($QueuePath, $json, [System.Text.UTF8Encoding]::new($false))
    return $fixed
}

function Test-AppOwnedCodexRunning {
    $appProcesses = @(Get-Process -Name "llm-wiki" -ErrorAction SilentlyContinue)
    if ($appProcesses.Count -eq 0) { return $false }

    $appIds = @{}
    foreach ($proc in $appProcesses) {
        $appIds[[int]$proc.Id] = $true
    }

    $processes = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
    $parentsById = @{}
    foreach ($proc in $processes) {
        $parentsById[[int]$proc.ProcessId] = [int]$proc.ParentProcessId
    }

    $codexProcesses = @($processes | Where-Object { $_.Name -eq "codex.exe" })
    foreach ($proc in $codexProcesses) {
        $parentId = [int]$proc.ParentProcessId
        $seen = @{}
        while ($parentId -gt 0 -and -not $seen.ContainsKey($parentId)) {
            if ($appIds.ContainsKey($parentId)) {
                return $true
            }
            $seen[$parentId] = $true
            if (-not $parentsById.ContainsKey($parentId)) {
                break
            }
            $parentId = $parentsById[$parentId]
        }
    }
    return $false
}

# 현재 큐 상태
$counts = Get-QueueCounts
$now    = [datetime]::Now
# 진전 지표: 큐 총 항목 수 (성공 완료 시 제거되어 감소 → 진전으로 인식)
# done 항목은 큐에서 제거되므로 done=0 고정. pending+processing+failed 합이 감소하면 진전.
$progress = $counts.pending + $counts.processing + $counts.failed

# 이전 상태 로드
if (Test-Path $StatePath) {
    $state = Get-Content $StatePath -Raw | ConvertFrom-Json
    $lastProgress  = $state.progress
    $lastCheckTime = [datetime]$state.lastCheckTime
    $stuckSince    = if ($state.stuckSince) { [datetime]$state.stuckSince } else { $null }
} else {
    $lastProgress  = $progress
    $lastCheckTime = $now
    $stuckSince    = $null
}

# 앱이 꺼져 있으면 대기 시간과 무관하게 먼저 복구한다.
# Codex CLI가 실행 중이어도, llm-wiki가 없으면 큐를 소비할 프로세스가 없다.
$appRunning = [bool](Get-Process -Name "llm-wiki" -ErrorAction SilentlyContinue)
if (-not $appRunning -and ($counts.pending -gt 0 -or $counts.processing -gt 0)) {
    if ($counts.processing -gt 0) {
        Write-Host ">>> 앱 미실행 + processing=$($counts.processing): stale 항목 failed 처리"
        $n = Kill-StuckItem
        Write-Host ">>> stale 항목 $n 개 failed 처리 완료"
        $counts = Get-QueueCounts
    }

    if ($counts.pending -gt 0) {
        Convert-ActiveOriginals
        $counts = Get-QueueCounts
        Write-Host ">>> 앱 미실행 감지 (pending=$($counts.pending)): llm-wiki 시작"
        if (Start-AppWithPath) {
            Write-Host ">>> llm-wiki 시작 완료"
        }
    }

    $stuckSince = $null
    $progress = $counts.pending + $counts.processing + $counts.failed
}

# If the app was restarted after an older stuck marker was recorded, do
# not let the previous run's timer carry over into the new ingest session.
$appProcesses = @(Get-Process -Name "llm-wiki" -ErrorAction SilentlyContinue)
if ($stuckSince -and $appProcesses.Count -gt 0) {
    $latestAppStart = ($appProcesses | Sort-Object StartTime -Descending | Select-Object -First 1).StartTime
    if ($latestAppStart -and $latestAppStart -gt $stuckSince) {
        $stuckSince = $null
        if ($latestAppStart -gt $lastCheckTime) {
            $lastCheckTime = $latestAppStart
        }
    }
}

# 진전 여부 판단
if ($progress -ne $lastProgress) {
    # 진전 있음 → stuck 해제
    $stuckSince = $null
    Write-Host "[$now] 진전 있음: pending=$($counts.pending) done=$($counts.done)"
} else {
    # 진전 없음
    if ($null -eq $stuckSince) { $stuckSince = $lastCheckTime }
    $stuckMin = ($now - $stuckSince).TotalMinutes
    Write-Host "[$now] 진전 없음 $([math]::Round($stuckMin,1))분 경과 (processing=$($counts.processing))"

    $appRunning = [bool](Get-Process -Name "llm-wiki" -ErrorAction SilentlyContinue)
    $appOwnedCodexRunning = Test-AppOwnedCodexRunning

    if (
        $appRunning -and
        $counts.processing -gt 0 -and
        -not $appOwnedCodexRunning -and
        $stuckMin -ge $ProcessingNoCodexMinutes
    ) {
        Write-Host ">>> 앱 실행 중이지만 processing=$($counts.processing), llm-wiki 자식 codex 미실행: processing 항목 pending 복구 후 재시작"
        Stop-Process -Name "llm-wiki" -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 3
        $n = Reset-ProcessingItems
        Write-Host ">>> stale processing 항목 $n 개 pending 복구 완료"
        Convert-ActiveOriginals
        $counts = Get-QueueCounts
        if (Start-AppWithPath) {
            Write-Host ">>> llm-wiki 재시작 완료"
        }
        $stuckSince = $null
        $progress = $counts.pending + $counts.processing + $counts.failed
    } elseif (
        $appRunning -and
        $counts.pending -gt 0 -and
        $counts.processing -eq 0 -and
        -not $appOwnedCodexRunning -and
        $stuckMin -ge $IdlePendingMinutes
    ) {
        Write-Host ">>> 앱 실행 중이지만 pending=$($counts.pending), processing=0, codex 미실행: idle 큐 복구 재시작"
        Stop-Process -Name "llm-wiki" -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 3
        Convert-ActiveOriginals
        $counts = Get-QueueCounts
        if (Start-AppWithPath) {
            Write-Host ">>> llm-wiki 재시작 완료"
        }
        $stuckSince = $null
    } elseif ($stuckMin -ge $StuckMinutes) {

        if ($counts.processing -gt 0) {
            # llm-wiki가 직접 띄운 codex만 처리 중으로 본다.
            # 다른 Codex 세션이 떠 있으면 stuck 복구를 막으면 안 된다.
            $codexRunning = Test-AppOwnedCodexRunning
            if ($codexRunning) {
                Write-Host ">>> processing=$($counts.processing) 이지만 llm-wiki 자식 codex 실행 중 → 계속 대기 (stuckSince 리셋)"
                $stuckSince = $null  # codex가 살아있으면 stuck 해제
            } else {
                # codex 없는데 processing 상태 → 진짜 stuck
                Write-Host ">>> STUCK 감지 (codex 미실행): llm-wiki 종료 후 stuck 항목 failed 처리"
                Stop-Process -Name "llm-wiki" -Force -ErrorAction SilentlyContinue
                Start-Sleep -Seconds 3
                $n = Kill-StuckItem
                Write-Host ">>> stuck 항목 $n 개 failed 처리 완료"
                $stuckSince = $null
                if (Start-AppWithPath) {
                    Write-Host ">>> llm-wiki 재시작 완료"
                }
            }
        } elseif (-not $appRunning -and $counts.pending -gt 0) {
            # 앱이 꺼져 있고 pending 항목이 있으면 재시작
            Convert-ActiveOriginals
            $counts = Get-QueueCounts
            Write-Host ">>> 앱 미실행 감지 (pending=$($counts.pending)): llm-wiki 시작"
            if (Start-AppWithPath) {
                Write-Host ">>> llm-wiki 시작 완료"
            }
            $stuckSince = $null
        }
    }
}

# 상태 저장
$stuckStr = if ($stuckSince) { $stuckSince.ToString("o") } else { $null }
@{
    progress      = $progress
    lastCheckTime = $now.ToString("o")
    stuckSince    = $stuckStr
    pending       = $counts.pending
    done          = $counts.done
    failed        = $counts.failed
} | ConvertTo-Json | Set-Content $StatePath -Encoding UTF8



