# preprocess-all-docs.ps1
# Wrapper for full approved-folder preprocessing.

param(
    [string]$VaultRoot = "D:\vault\llm-wiki-vault",
    [string]$Folders = "",
    [switch]$Force,
    [int]$Limit = 0
)

$ErrorActionPreference = "Stop"
$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" +
            [System.Environment]::GetEnvironmentVariable("PATH", "User")
$env:NODE_PATH = "C:\Users\admin\AppData\Roaming\npm\node_modules"

$script = Join-Path (Split-Path $MyInvocation.MyCommand.Path) "preprocess-all-docs.js"
$argsList = @($script, "--vaultRoot", $VaultRoot)
if ($Folders) { $argsList += @("--folders", $Folders) }
if ($Force) { $argsList += "--force" }
if ($Limit -gt 0) { $argsList += @("--limit", "$Limit") }

& node $argsList
exit $LASTEXITCODE
