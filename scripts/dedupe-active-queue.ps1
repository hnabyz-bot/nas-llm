# dedupe-active-queue.ps1
# Node wrapper to avoid PowerShell JSON array serialization issues.

param(
    [string]$QueuePath = "D:\vault\llm-wiki-vault\.llm-wiki\ingest-queue.json"
)

$ErrorActionPreference = "Stop"
$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" +
            [System.Environment]::GetEnvironmentVariable("PATH", "User")

$script = Join-Path (Split-Path $MyInvocation.MyCommand.Path) "dedupe-active-queue.js"
& node $script $QueuePath


