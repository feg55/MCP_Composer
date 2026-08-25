[CmdletBinding()]
param(
    [ValidateSet("Start", "Stop", "Update", "Logs", "Status", "Uninstall")]
    [string]$Action = "Start",
    [int]$Port = 0,
    [string]$Version = "",
    [switch]$NoBrowser,
    [switch]$PurgeConfig
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$BundleDirectory = $ScriptDirectory
if (-not (Test-Path -LiteralPath (Join-Path $BundleDirectory "compose.release.yaml"))) {
    $BundleDirectory = (Resolve-Path (Join-Path $ScriptDirectory "../..")).Path
}

$ComposeFile = Join-Path $BundleDirectory "compose.release.yaml"
$VersionFile = Join-Path $BundleDirectory "VERSION"
$LocalData = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
$ConfigDirectory = if ($env:MCP_COMPOSER_LAUNCHER_CONFIG_DIR) {
    $env:MCP_COMPOSER_LAUNCHER_CONFIG_DIR
} else {
    Join-Path $LocalData "MCP Composer"
}
$ConfigFile = Join-Path $ConfigDirectory "composer.env"
$ProjectName = "mcp-composer"

function Stop-WithError([string]$Message) {
    Write-Error $Message
    exit 1
}

function Get-BundleVersion {
    if (Test-Path -LiteralPath $VersionFile) {
        return (Get-Content -Raw -LiteralPath $VersionFile).Trim().TrimStart("v")
    }
    return "0.1.0"
}

function Assert-Version([string]$Value) {
    if ($Value -notmatch '^\d+\.\d+\.\d+([-.][0-9A-Za-z.-]+)?$') {
        Stop-WithError "Invalid release version: $Value"
    }
}

function Assert-Port([int]$Value) {
    if ($Value -lt 1 -or $Value -gt 65535) {
        Stop-WithError "Port must be between 1 and 65535."
    }
}

function Write-Utf8File([string]$Path, [string[]]$Lines) {
    $Encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllLines($Path, $Lines, $Encoding)
}

function Initialize-Config {
    if (Test-Path -LiteralPath $ConfigFile) {
        return
    }

    New-Item -ItemType Directory -Force -Path $ConfigDirectory | Out-Null
    $InitialVersion = Get-BundleVersion
    Assert-Version $InitialVersion
    Write-Utf8File $ConfigFile @(
        "MCP_COMPOSER_VERSION=$InitialVersion",
        "MCP_COMPOSER_IMAGE=ghcr.io/feg55/mcp-composer",
        "MCP_COMPOSER_PORT=8000"
    )
    Write-Host "Created configuration: $ConfigFile"
}

function Get-ConfigValue([string]$Key, [string]$Fallback) {
    if (-not (Test-Path -LiteralPath $ConfigFile)) {
        return $Fallback
    }
    foreach ($Line in [System.IO.File]::ReadAllLines($ConfigFile)) {
        if ($Line -match "^$([Regex]::Escape($Key))=(.*)$") {
            return $Matches[1].Trim()
        }
    }
    return $Fallback
}

function Set-ConfigValue([string]$Key, [string]$Value) {
    $Lines = [System.Collections.Generic.List[string]]::new()
    $Found = $false
    foreach ($Line in [System.IO.File]::ReadAllLines($ConfigFile)) {
        if ($Line -match "^$([Regex]::Escape($Key))=") {
            $Lines.Add("$Key=$Value")
            $Found = $true
        } else {
            $Lines.Add($Line)
        }
    }
    if (-not $Found) {
        $Lines.Add("$Key=$Value")
    }
    Write-Utf8File $ConfigFile $Lines.ToArray()
}

function Assert-Docker {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Stop-WithError "Docker was not found. Install and start Docker Desktop, then retry."
    }
    & docker info *> $null
    if ($LASTEXITCODE -ne 0) {
        Stop-WithError "Docker Desktop is installed but its engine is not running."
    }
    & docker compose version *> $null
    if ($LASTEXITCODE -ne 0) {
        Stop-WithError "Docker Compose v2 is required."
    }
}

function Sync-ComposeEnvironment {
    $ConfigVersion = Get-ConfigValue "MCP_COMPOSER_VERSION" (Get-BundleVersion)
    $ConfigPort = Get-ConfigValue "MCP_COMPOSER_PORT" "8000"
    $ConfigImage = Get-ConfigValue "MCP_COMPOSER_IMAGE" "ghcr.io/feg55/mcp-composer"
    Assert-Version $ConfigVersion
    $ParsedPort = 0
    if (-not [int]::TryParse($ConfigPort, [ref]$ParsedPort)) {
        Stop-WithError "Configured port must be numeric."
    }
    Assert-Port $ParsedPort
    $env:MCP_COMPOSER_VERSION = $ConfigVersion
    $env:MCP_COMPOSER_PORT = [string]$ParsedPort
    $env:MCP_COMPOSER_IMAGE = $ConfigImage
}

function Invoke-Compose([string[]]$Arguments) {
    & docker compose --project-name $ProjectName --env-file $ConfigFile -f $ComposeFile @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Docker Compose failed with exit code $LASTEXITCODE."
    }
}

function Wait-ForHealth([string]$Url) {
    for ($Attempt = 1; $Attempt -le 30; $Attempt++) {
        try {
            $Health = Invoke-RestMethod -Uri "$Url/api/health" -TimeoutSec 3
            if ($Health.status -eq "ok" -and $Health.service -eq "mcp-composer-api") {
                return
            }
        } catch {
            Start-Sleep -Seconds 1
        }
    }
    throw "MCP Composer did not become healthy at $Url."
}

if (-not (Test-Path -LiteralPath $ComposeFile)) {
    Stop-WithError "compose.release.yaml was not found next to the release launcher."
}

Assert-Docker
Initialize-Config

if ($Port -ne 0) {
    Assert-Port $Port
    Set-ConfigValue "MCP_COMPOSER_PORT" ([string]$Port)
}
if ($Version) {
    $Version = $Version.Trim().TrimStart("v")
    Assert-Version $Version
    Set-ConfigValue "MCP_COMPOSER_VERSION" $Version
}

if ($Action -eq "Update" -and -not $Version) {
    $BundleVersion = Get-BundleVersion
    Assert-Version $BundleVersion
    Set-ConfigValue "MCP_COMPOSER_VERSION" $BundleVersion
}

Sync-ComposeEnvironment
$BaseUrl = "http://127.0.0.1:$($env:MCP_COMPOSER_PORT)"

try {
    switch ($Action) {
        "Start" {
            Invoke-Compose @("up", "--detach", "--pull", "always", "--wait", "--wait-timeout", "120")
            Wait-ForHealth $BaseUrl
            Write-Host "MCP Composer $($env:MCP_COMPOSER_VERSION) is running at $BaseUrl"
            if (-not $NoBrowser) {
                Start-Process $BaseUrl
            }
        }
        "Stop" {
            Invoke-Compose @("down", "--remove-orphans")
            Write-Host "MCP Composer stopped. Configuration was preserved."
        }
        "Update" {
            Invoke-Compose @("pull", "composer")
            Invoke-Compose @("up", "--detach", "--wait", "--wait-timeout", "120")
            Wait-ForHealth $BaseUrl
            Write-Host "MCP Composer updated to $($env:MCP_COMPOSER_VERSION)."
        }
        "Logs" {
            Invoke-Compose @("logs", "--follow", "composer")
        }
        "Status" {
            Invoke-Compose @("ps")
        }
        "Uninstall" {
            Invoke-Compose @("down", "--remove-orphans")
            if ($PurgeConfig -and (Test-Path -LiteralPath $ConfigFile)) {
                Remove-Item -LiteralPath $ConfigFile -Force
                Remove-Item -LiteralPath $ConfigDirectory -ErrorAction SilentlyContinue
                Write-Host "Removed MCP Composer configuration."
            } else {
                Write-Host "Containers removed. Configuration was preserved. Use -PurgeConfig to remove it."
            }
        }
    }
} catch {
    Write-Host "MCP Composer operation failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($Action -in @("Start", "Update")) {
        Write-Host "Check Docker access, registry access, and whether port $($env:MCP_COMPOSER_PORT) is already in use."
        & docker compose --project-name $ProjectName --env-file $ConfigFile -f $ComposeFile logs --tail 80 composer
    }
    exit 1
}
