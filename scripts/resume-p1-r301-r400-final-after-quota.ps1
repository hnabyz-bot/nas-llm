param(
  [string]$ResumeAt = "2026-06-26T03:55:00"
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
$LogPath = Join-Path $LogDir "p1-r301-r400-final-resume-20260626.log"

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

  Run-Native -File node -Arguments @("scripts\run-p0-pilot-extraction.js", "--bundle-dir", $BundleDir, "--provider", "codex", "--start", "92", "--limit", "1", "--timeout-ms", "900000", "--overwrite", "--run")
  Run-Native -File node -Arguments @("scripts\run-p0-pilot-extraction.js", "--bundle-dir", $BundleDir, "--provider", "codex", "--start", "96", "--limit", "3", "--timeout-ms", "900000", "--overwrite", "--run")
  Run-Native -File node -Arguments @("scripts\run-p0-pilot-extraction.js", "--bundle-dir", $BundleDir, "--provider", "codex", "--start", "100", "--limit", "1", "--timeout-ms", "900000", "--overwrite", "--run")

  Run-Native -File node -Arguments @("scripts\summarize-p0-eval.js", "--bundle-dir", $BundleDir)
  Run-Native -File node -Arguments @("scripts\run-p0-chunked-extraction.js", "--bundle-dir", $BundleDir, "--failed", "--chunk-chars", "180000", "--timeout-ms", "900000", "--run")
  Run-Native -File node -Arguments @("scripts\summarize-p0-eval.js", "--bundle-dir", $BundleDir)

  Run-Native -File git -Arguments @("add", "-f", "$BundleDir\outputs", "$BundleDir\run-results.json", "$BundleDir\evaluation-summary.json", "$BundleDir\qa-report.md")
  Run-Native -File git -Arguments @("diff", "--cached", "--check")

  git diff --cached --quiet
  if ($LASTEXITCODE -eq 0) {
    Write-Host "No staged changes to commit."
  } else {
    Run-Native -File git -Arguments @("commit", "-m", "feat: complete P1 ranks 301-400 extraction outputs")
    Run-Native -File git -Arguments @("push", "origin", "main")
  }
} finally {
  Stop-Transcript | Out-Null
}
