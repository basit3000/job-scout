#Requires -Version 5.1
param([switch]$Doctor)
$ErrorActionPreference = 'Stop'
$previousPath = $env:PATH
try {
    . (Join-Path $PSScriptRoot 'scripts/windows/common.ps1')
    Initialize-JobScout $PSScriptRoot
    Add-JobScoutPath
    $nodeExe = Find-Application 'node.exe'
    if (-not (Test-NodeVersion $nodeExe)) { throw 'Run .\setup.ps1 first (Node >=22.13 is required).' }
    Push-Location $PSScriptRoot
    try {
        Invoke-Checked $nodeExe @('scripts/doctor.mjs', '--goose')
        if (-not $Doctor) {
            Invoke-Checked $nodeExe @('scripts/setup.mjs', '--quiet')
            Invoke-Checked $nodeExe @('web/server.mjs')
        }
    } finally { Pop-Location }
} catch {
    Write-Error -Message $_.Exception.Message -ErrorAction Continue
    exit 1
} finally { $env:PATH = $previousPath }
