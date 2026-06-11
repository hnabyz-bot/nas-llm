# sync-approved-folders.ps1
# Node-based NAS sync with long-path fallback.

param(
    [string]$NasDrive = "Z:\",
    [string]$VaultRoot = "D:\vault\llm-wiki-vault",
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" +
            [System.Environment]::GetEnvironmentVariable("PATH", "User")

$script = Join-Path (Split-Path $MyInvocation.MyCommand.Path) "sync-approved-folders.js"
$argsList = @($script, "--nasDrive", $NasDrive, "--vaultRoot", $VaultRoot)
if ($DryRun) { $argsList += "--dry-run" }
& node $argsList
exit $LASTEXITCODE
