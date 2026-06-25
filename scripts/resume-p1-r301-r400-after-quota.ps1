param(
  [string]$ResumeAt = "2026-06-25 17:50:00"
)

$ErrorActionPreference = "Stop"

function Run-Native {
  param(
    [Parameter(Mandatory = $true)]
    [string]$File,
    [string[]]$Arguments
  )

  Write-Host ">>> $File $($Arguments -join ' ')"
  & $File @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$File exited with code $LASTEXITCODE"
  }
}

$Repo = "D:\agent-work\nas-llm"
$BundleDir = "reports\p1-pilot-eval-p1-r301-r400-202606251300"
$LogDir = Join-Path $Repo "logs"
$LogPath = Join-Path $LogDir "p1-r301-r400-resume-20260625.log"

Set-Location $Repo
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
Start-Transcript -Path $LogPath -Append | Out-Null

try {
  $resumeTime = Get-Date -Date $ResumeAt
  $now = Get-Date
  if ($now -lt $resumeTime) {
    $sleepSeconds = [int][Math]::Ceiling(($resumeTime - $now).TotalSeconds)
    Write-Host "Waiting $sleepSeconds seconds until $resumeTime"
    Start-Sleep -Seconds $sleepSeconds
  }

  Run-Native -File git -Arguments @("status", "--short")
  Run-Native -File git -Arguments @("pull", "--ff-only", "origin", "main")

  Run-Native -File node -Arguments @("-e", "const fs=require('fs'); const p='reports/p1-pilot-eval-p1-r301-r400-202606251300/run-results.json'; if (fs.existsSync(p)) { const rows=JSON.parse(fs.readFileSync(p,'utf8')).filter(r => r.status === 'pass'); fs.writeFileSync(p, JSON.stringify(rows,null,2)+'\n'); console.log('kept pass rows', rows.length); }")

  $starts = @(17, 27, 37, 47, 57, 67, 77, 87, 97)
  foreach ($start in $starts) {
    $limit = [Math]::Min(10, 101 - $start)
    Run-Native -File node -Arguments @("scripts\run-p0-pilot-extraction.js", "--bundle-dir", $BundleDir, "--provider", "codex", "--start", "$start", "--limit", "$limit", "--timeout-ms", "900000", "--run")
  }

  Run-Native -File node -Arguments @("scripts\summarize-p0-eval.js", "--bundle-dir", $BundleDir)
  Run-Native -File node -Arguments @("scripts\run-p0-chunked-extraction.js", "--bundle-dir", $BundleDir, "--failed", "--chunk-chars", "180000", "--timeout-ms", "900000", "--run")
  Run-Native -File node -Arguments @("scripts\summarize-p0-eval.js", "--bundle-dir", $BundleDir)

  Run-Native -File git -Arguments @("add", "-f", "$BundleDir\outputs", "$BundleDir\run-results.json", "$BundleDir\evaluation-summary.json", "$BundleDir\qa-report.md")
  Run-Native -File git -Arguments @("diff", "--cached", "--check")

  git diff --cached --quiet
  if ($LASTEXITCODE -eq 0) {
    Write-Host "No staged changes to commit."
  } else {
    Run-Native -File git -Arguments @("commit", "-m", "feat: add P1 ranks 301-400 extraction outputs")
    Run-Native -File git -Arguments @("push", "origin", "main")
  }
} finally {
  Stop-Transcript | Out-Null
}
