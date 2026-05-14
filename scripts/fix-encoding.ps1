# scripts/fix-encoding.ps1
# All .ps1 files: UTF-8 BOM encoding fix
# PowerShell 5.1 requires BOM for Korean text

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$files = Get-ChildItem $scriptDir -Filter "*.ps1" | Where-Object { $_.Name -ne "fix-encoding.ps1" }
$utf8Bom = New-Object System.Text.UTF8Encoding($true)

foreach ($file in $files) {
    $content = [System.IO.File]::ReadAllText($file.FullName, [System.Text.Encoding]::UTF8)
    [System.IO.File]::WriteAllText($file.FullName, $content, $utf8Bom)
    Write-Host "  BOM added: $($file.Name)" -ForegroundColor Green
}
Write-Host "Done. $($files.Count) files fixed." -ForegroundColor Cyan
