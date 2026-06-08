# watchdog-ingest.ps1
# 인제스트 진전 없으면 stuck 항목 failed 처리 후 llm-wiki 재시작
# 매 5분 실행 (Task Scheduler)

$QueuePath   = "D:\vault\llm-wiki-vault\.llm-wiki\ingest-queue.json"
$StatePath   = "D:\vault\llm-wiki-vault\scripts\watchdog-state.json"
$AppExe      = "C:\dev\llm_wiki\src-tauri\target\release\llm-wiki.exe"
$StuckMinutes = 60

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
    # Start-Process는 수정된 $env:PATH를 자식 프로세스에 전달하지 않으므로
    # ProcessStartInfo로 PATH를 명시적으로 지정
    $pinfo = New-Object System.Diagnostics.ProcessStartInfo
    $pinfo.FileName = $AppExe
    $pinfo.UseShellExecute = $false
    $pinfo.CreateNoWindow = $false
    $pinfo.EnvironmentVariables["PATH"] = $env:PATH
    [System.Diagnostics.Process]::Start($pinfo) | Out-Null
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

    if ($stuckMin -ge $StuckMinutes) {
        $appRunning = [bool](Get-Process -Name "llm-wiki" -ErrorAction SilentlyContinue)

        if ($counts.processing -gt 0) {
            # codex가 실행 중이면 대용량 파일 처리 중 — 아직 중단하지 않음
            $codexRunning = [bool](Get-Process -Name "codex" -ErrorAction SilentlyContinue)
            if ($codexRunning) {
                Write-Host ">>> processing=$($counts.processing) 이지만 codex 실행 중 → 계속 대기 (stuckSince 리셋)"
                $stuckSince = $null  # codex가 살아있으면 stuck 해제
            } else {
                # codex 없는데 processing 상태 → 진짜 stuck
                Write-Host ">>> STUCK 감지 (codex 미실행): llm-wiki 종료 후 stuck 항목 failed 처리"
                Stop-Process -Name "llm-wiki" -Force -ErrorAction SilentlyContinue
                Start-Sleep -Seconds 3
                $n = Kill-StuckItem
                Write-Host ">>> stuck 항목 $n 개 failed 처리 완료"
                $stuckSince = $null
                Start-AppWithPath
                Write-Host ">>> llm-wiki 재시작 완료"
            }
        } elseif (-not $appRunning -and $counts.pending -gt 0) {
            # 앱이 꺼져 있고 pending 항목이 있으면 재시작
            Write-Host ">>> 앱 미실행 감지 (pending=$($counts.pending)): llm-wiki 시작"
            Start-AppWithPath
            Write-Host ">>> llm-wiki 시작 완료"
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
