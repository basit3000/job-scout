#Requires -Version 5.1
# Forward arguments, e.g. .\goose.ps1 configure or .\goose.ps1 session.
$ErrorActionPreference = 'Stop'
$previousPath = $env:PATH
try {
    . (Join-Path $PSScriptRoot 'scripts/windows/common.ps1')
    Initialize-JobScout $PSScriptRoot
    Add-JobScoutPath
    $gooseExe = Find-Application 'goose.exe'
    if (-not $gooseExe) { throw 'Run .\setup.ps1 -NonInteractive -WithGoose first.' }
    Push-Location $PSScriptRoot
    try { Invoke-Checked $gooseExe $args } finally { Pop-Location }
} catch {
    Write-Error -Message $_.Exception.Message -ErrorAction Continue
    exit 1
} finally { $env:PATH = $previousPath }
