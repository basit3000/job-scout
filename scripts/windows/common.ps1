# Shared by setup.ps1, start.ps1 and goose.ps1. No downloads or changes on import.
Set-StrictMode -Version Latest

function Initialize-JobScout([string]$RepoRoot) {
    if ($env:OS -ne 'Windows_NT' -or -not [Environment]::Is64BitProcess -or
        $env:PROCESSOR_ARCHITECTURE -ne 'AMD64') {
        throw 'These scripts support 64-bit PowerShell on Windows x64. Use the manual guide on other platforms.'
    }
    $script:JobScoutRoot = [IO.Path]::GetFullPath($RepoRoot)
    $package = Get-Content -LiteralPath (Join-Path $script:JobScoutRoot 'package.json') -Raw | ConvertFrom-Json
    if ($package.name -ne 'job-scout') { throw 'Expected the Job Scout repository.' }
    $script:Toolchain = Get-Content -LiteralPath (Join-Path $script:JobScoutRoot 'toolchain.windows.json') -Raw | ConvertFrom-Json
}

function Get-LocalToolPath([string]$Name) {
    $spec = $script:Toolchain.$Name
    return Join-Path $script:JobScoutRoot ('.workspace/tools/{0}-{1}/{2}' -f $Name, $spec.version, $spec.executable)
}

function Add-JobScoutPath {
    $dirs = @()
    foreach ($name in @('node', 'uv', 'goose', 'git', 'tectonic')) {
        $exe = Get-LocalToolPath $name
        if (Test-Path -LiteralPath $exe -PathType Leaf) { $dirs += Split-Path -Parent $exe }
    }
    if ($dirs.Count) { $env:PATH = ((@($dirs) + @($env:PATH -split ';') | Select-Object -Unique) -join ';') }
}

function Find-Application([string]$Name) {
    $command = Get-Command $Name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command) { return $command.Source }
    return $null
}

function Invoke-Checked {
    param([string]$File, [string[]]$Arguments = @())
    & $File @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Command failed (exit $LASTEXITCODE): $([IO.Path]::GetFileName($File)) $($Arguments -join ' ')" }
}

function Test-NodeVersion([string]$Executable) {
    if (-not $Executable) { return $false }
    try {
        $text = & $Executable --version
        if ($LASTEXITCODE -ne 0) { return $false }
        return ([version]($text.Trim().TrimStart('v')) -ge [version]'22.13.0')
    } catch { return $false }
}

function Get-NpmCli([string]$NodeExe) {
    $cli = Join-Path (Split-Path -Parent $NodeExe) 'node_modules/npm/bin/npm-cli.js'
    if (-not (Test-Path -LiteralPath $cli -PathType Leaf)) { throw 'npm is missing from the Node installation. Repair Node and rerun setup.' }
    return $cli
}

function Install-LocalTool([string]$Name) {
    $spec = $script:Toolchain.$Name
    $exe = Get-LocalToolPath $Name
    if (Test-Path -LiteralPath $exe -PathType Leaf) { return $exe }
    $cache = Join-Path $script:JobScoutRoot '.workspace/setup/downloads'
    New-Item -ItemType Directory -Path $cache -Force | Out-Null
    $archive = Join-Path $cache "$Name-$($spec.version).zip"
    if (-not (Test-Path -LiteralPath $archive) -or (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $spec.sha256) {
        Write-Host "Downloading $Name $($spec.version)..."
        [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
        $previousProgress = $ProgressPreference
        try {
            $ProgressPreference = 'SilentlyContinue'
            Invoke-WebRequest -UseBasicParsing -Uri $spec.url -OutFile $archive -TimeoutSec 600
        } finally { $ProgressPreference = $previousProgress }
    }
    if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $spec.sha256) {
        throw "Checksum mismatch for $Name. Nothing from this archive was executed. Remove the cached ZIP and retry."
    }
    $destination = Join-Path $script:JobScoutRoot ".workspace/tools/$Name-$($spec.version)"
    Expand-Archive -LiteralPath $archive -DestinationPath $destination -Force
    if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) { throw "The $Name archive did not contain the expected executable. Check toolchain.windows.json." }
    Add-JobScoutPath
    return $exe
}

function Find-JobScoutBrowser {
    $candidates = @()
    if ($env:CHROME_PATH) { $candidates += $env:CHROME_PATH }
    else {
        $envFile = Join-Path $script:JobScoutRoot '.env'
        if (Test-Path -LiteralPath $envFile) {
            foreach ($line in Get-Content -LiteralPath $envFile) {
                if ($line -match '^\s*CHROME_PATH\s*=(.*)$') { $candidates += $Matches[1].Trim().Trim('"').Trim("'"); break }
            }
        }
    }
    foreach ($base in @($env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:LOCALAPPDATA)) {
        if ($base) {
            $candidates += Join-Path $base 'Google/Chrome/Application/chrome.exe'
            $candidates += Join-Path $base 'Microsoft/Edge/Application/msedge.exe'
        }
    }
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
    }
    return $null
}
