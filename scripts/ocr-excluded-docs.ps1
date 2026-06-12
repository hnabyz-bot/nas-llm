# ocr-excluded-docs.ps1
# OCR image-only excluded documents and update preprocess manifest.

param(
    [string]$VaultRoot = "D:\vault\llm-wiki-vault",
    [int]$Limit = 0
)

$ErrorActionPreference = "Stop"
$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" +
            [System.Environment]::GetEnvironmentVariable("PATH", "User")
$env:NODE_PATH = "C:\Users\admin\AppData\Roaming\npm\node_modules"

$script = Join-Path (Split-Path $MyInvocation.MyCommand.Path) "ocr-excluded-docs.js"
$argsList = @($script, "--vaultRoot", $VaultRoot)
if ($Limit -gt 0) { $argsList += @("--limit", "$Limit") }

& node $argsList
exit $LASTEXITCODE
