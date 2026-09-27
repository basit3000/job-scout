#Requires -Version 5.1
<#
.SYNOPSIS
Install Job Scout on Windows x64, with Goose and optional browser, Git and CV tools.
.DESCRIPTION
Prompts for optional components unless -NonInteractive or -Plan is supplied.
Downloads pinned, checksum-verified portable tools into .workspace/tools; reuses
compatible Node and existing optional tools. Never replaces local profile or CV files.
Chrome installation, only if requested and no browser exists, requires WinGet.
.EXAMPLE
.\setup.ps1
.EXAMPLE
.\setup.ps1 -NonInteractive -All
.EXAMPLE
.\setup.ps1 -NonInteractive -WithCvTools
.EXAMPLE
.\setup.ps1 -Plan -All
#>
[CmdletBinding()]
param(
    [switch]$NonInteractive,
    [switch]$All,
    [switch]$WithCvTools,
    [switch]$WithGit,
    [switch]$WithBrowser,
    [switch]$Start,
    [switch]$Plan
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'scripts/windows/common.ps1')
Initialize-JobScout $PSScriptRoot
$supplied = $PSBoundParameters

function Select-Component([string]$Name, [string]$Question, [bool]$Default = $true) {
    if ($supplied.ContainsKey($Name)) { return [bool]$supplied[$Name] }
    if ($All -and $Name -ne 'Start') { return $true }
    if ($NonInteractive -or $Plan) { return $false }
    if ([Console]::IsInputRedirected) { throw 'Input is redirected. Use -NonInteractive and explicit component flags, or -All.' }
    $hint = if ($Default) { 'Y/n' } else { 'y/N' }
    while ($true) {
        $answer = Read-Host "$Question [$hint]"
        if ([string]::IsNullOrWhiteSpace($answer)) { return $Default }
        if ($answer -match '^(y|yes)$') { return $true }
        if ($answer -match '^(n|no)$') { return $false }
        Write-Host 'Enter yes or no.'
    }
}

try {
    Write-Host 'Job Scout setup - Windows x64'
    Write-Host 'Base: Node + npm, uv-managed Python, locked packages, local templates.'
    $choices = [ordered]@{
        Goose = $true
        CvTools = Select-Component 'WithCvTools' 'Install/check LaTeX PDF tools (first run downloads fonts/packages)?'
        Git = Select-Component 'WithGit' 'Install/check Git for Overleaf and agent git operations?'
        Browser = Select-Component 'WithBrowser' 'Check Chrome/Edge; install Chrome via WinGet if neither exists?'
        Start = Select-Component 'Start' 'Start Job Scout after setup?' $false
    }
    Write-Host ''
    foreach ($entry in $choices.GetEnumerator()) { Write-Host ("  {0}: {1}" -f $entry.Key, $entry.Value) }
    if ($Plan) {
        Write-Host 'Preview only: no downloads, installs, configuration writes, or app startup.'
        return
    }

    $previousPath = $env:PATH
    $previousPythonDir = $env:UV_PYTHON_INSTALL_DIR
    $previousUvEnvironment = $env:UV_PROJECT_ENVIRONMENT
    Push-Location $PSScriptRoot
    try {
        Add-JobScoutPath
        # Resolve prerequisites that could require user action before large downloads.
        if ($choices.Browser -and -not (Find-JobScoutBrowser)) {
            $winget = Find-Application 'winget.exe'
            if (-not $winget) {
                throw 'Chrome/Edge was not found and WinGet is unavailable. Install Chrome/Edge, or rerun with -WithBrowser:$false. See docs/windows-setup.md.'
            }
            Invoke-Checked $winget @('install', '--id', 'Google.Chrome', '--exact', '--source', 'winget', '--accept-source-agreements', '--accept-package-agreements', '--disable-interactivity')
            if (-not (Find-JobScoutBrowser)) { throw 'Browser installation did not produce a detectable Chrome/Edge executable. Restart the terminal and rerun setup.' }
        }

        $nodeExe = Find-Application 'node.exe'
        if (-not (Test-NodeVersion $nodeExe)) { $nodeExe = Install-LocalTool 'node' }
        if (-not (Test-NodeVersion $nodeExe)) { throw 'Node >=22.13 is required.' }
        $npmCli = Get-NpmCli $nodeExe
        $uvExe = Install-LocalTool 'uv'
        Invoke-Checked $uvExe @('--version')

        # Pin Python selection independently of the machine's default Python.
        $env:UV_PYTHON_INSTALL_DIR = Join-Path $PSScriptRoot '.workspace/tools/python'
        $env:UV_PROJECT_ENVIRONMENT = Join-Path $PSScriptRoot '.venv'
        Write-Host 'Installing the locked Python environment...'
        Invoke-Checked $uvExe @('sync', '--locked', '--python', (Get-Content -LiteralPath '.python-version' -Raw).Trim())
        Write-Host 'Installing the locked Node packages...'
        Invoke-Checked $nodeExe @($npmCli, 'ci', '--no-audit', '--no-fund')
        Invoke-Checked $nodeExe @('scripts/setup.mjs')

        foreach ($pair in @(@('Git', 'git'), @('Goose', 'goose'), @('CvTools', 'tectonic'))) {
            if (-not $choices[$pair[0]]) { continue }
            $name = $pair[1]
            $exe = Find-Application "$name.exe"
            if (-not $exe) { $exe = Install-LocalTool $name }
            Invoke-Checked $exe @('--version')
        }
        $doctorArgs = @('scripts/doctor.mjs')
        if ($choices.Goose) { $doctorArgs += '--goose' }
        if ($choices.Git) { $doctorArgs += '--git' }
        if ($choices.Browser) { $doctorArgs += @('--browser', '--render-html') }
        if ($choices.CvTools) { $doctorArgs += '--cv-tools' }
        Invoke-Checked $nodeExe $doctorArgs
        Write-Host ''
        Write-Host 'Setup complete. Start: .\start.ps1   Check again: .\start.ps1 -Doctor'
        if ($choices.Goose) {
            Write-Host 'Configure your model separately: .\goose.ps1 configure'
            Write-Host 'Goose is available standalone; the Job Scout UI provider adapter is not implemented yet.'
        }
        Write-Host 'Enter your own profile in the app. Credentials stay in your local configuration.'
        if ($choices.Start) { & (Join-Path $PSScriptRoot 'start.ps1') }
    } finally {
        Pop-Location
        $env:PATH = $previousPath
        $env:UV_PYTHON_INSTALL_DIR = $previousPythonDir
        $env:UV_PROJECT_ENVIRONMENT = $previousUvEnvironment
    }
} catch {
    Write-Error -Message ("Setup stopped: " + $_.Exception.Message) -ErrorAction Continue
    exit 1
}
