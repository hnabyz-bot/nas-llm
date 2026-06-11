# rebuild-queue-from-preprocessed.ps1
# Rebuild ingest queue from successful preprocess manifest outputs.

param(
    [string]$VaultRoot = "D:\vault\llm-wiki-vault"
)

$ErrorActionPreference = "Stop"
$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" +
            [System.Environment]::GetEnvironmentVariable("PATH", "User")

$script = Join-Path (Split-Path $MyInvocation.MyCommand.Path) "rebuild-queue-from-preprocessed.js"
& node $script --vaultRoot $VaultRoot
exit $LASTEXITCODE
