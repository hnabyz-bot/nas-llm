# Prune active ingest queue entries that are already represented by existing ingest cache.
# Default is dry-run; use -Apply to write the pruned queue.

param(
    [string]$VaultRoot = "D:\vault\llm-wiki-vault",
    [switch]$Apply
)

$ErrorActionPreference = "Stop"
$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" +
            [System.Environment]::GetEnvironmentVariable("PATH", "User")

$script = Join-Path (Split-Path $MyInvocation.MyCommand.Path) "prune-ingest-queue-from-cache.js"
$argsList = @("--max-old-space-size=8192", $script, "--vaultRoot", $VaultRoot)
if ($Apply) { $argsList += "--apply" }

& node @argsList
exit $LASTEXITCODE
