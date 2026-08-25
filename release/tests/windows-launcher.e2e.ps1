[CmdletBinding()]
param(
    [string]$BundleDirectory = "",
    [string]$Image = "mcp-composer",
    [string]$Version = "0.1.2",
    [int]$OccupiedPort = 0
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RepositoryDirectory = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
if (-not $BundleDirectory) {
    $BundleDirectory = $RepositoryDirectory
}
$BundleDirectory = (Resolve-Path $BundleDirectory).Path
$Launcher = Join-Path $BundleDirectory "start.ps1"
if (-not (Test-Path -LiteralPath $Launcher)) {
    $Launcher = Join-Path $RepositoryDirectory "release/windows/start.ps1"
}
$ComposeFile = Join-Path $BundleDirectory "compose.release.yaml"
$TestDirectory = Join-Path ([IO.Path]::GetTempPath()) "mcp-composer-windows-e2e-$([Guid]::NewGuid().ToString('N'))"
$ConfigDirectory = Join-Path $TestDirectory "config"
$ConfigFile = Join-Path $ConfigDirectory "composer.env"
$ProjectName = "mcp-composer-e2e-windows-$([Guid]::NewGuid().ToString('N').Substring(0, 12))"
$BlockerName = "mcp-composer-e2e-blocker-$([Guid]::NewGuid().ToString('N').Substring(0, 12))"

function Get-ProjectContainerIds {
    $DockerArguments = @(
        "ps",
        "--filter", "label=com.docker.compose.project=$ProjectName",
        "--filter", "label=com.docker.compose.service=composer",
        "--format", "{{.ID}}"
    )
    $Ids = @(& docker @DockerArguments)
    if ($LASTEXITCODE -ne 0) {
        throw "Could not inspect the Windows E2E container."
    }
    return $Ids
}

New-Item -ItemType Directory -Force -Path $ConfigDirectory | Out-Null
$ImageReference = "${Image}:${Version}"
$PublishSpec = if ($OccupiedPort -eq 0) {
    "127.0.0.1::8000"
} else {
    "127.0.0.1:${OccupiedPort}:8000"
}
$BlockerArguments = @(
    "run",
    "--detach",
    "--rm",
    "--name", $BlockerName,
    "--pull", "never",
    "--publish", $PublishSpec,
    $ImageReference,
    "python", "-m", "http.server", "8000"
)
$BlockerId = (& docker @BlockerArguments).Trim()
if ($LASTEXITCODE -ne 0 -or -not $BlockerId) {
    throw "Could not start the occupied-port Docker fixture."
}
$PublishedPort = (& docker port $BlockerName "8000/tcp").Trim()
if ($LASTEXITCODE -ne 0 -or $PublishedPort -notmatch '127\.0\.0\.1:(\d+)$') {
    throw "Could not determine the occupied Docker port."
}
$OccupiedPort = [int]$Matches[1]
$Encoding = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllLines($ConfigFile, @(
    "MCP_COMPOSER_VERSION=$Version",
    "MCP_COMPOSER_IMAGE=$Image",
    "MCP_COMPOSER_PORT=$OccupiedPort"
), $Encoding)

$env:MCP_COMPOSER_LAUNCHER_CONFIG_DIR = $ConfigDirectory
$env:MCP_COMPOSER_LAUNCHER_PROJECT_NAME = $ProjectName

try {
    & $Launcher -Action Start -NoBrowser

    $SelectedPortLine = Get-Content -LiteralPath $ConfigFile |
        Where-Object { $_ -like "MCP_COMPOSER_PORT=*" } |
        Select-Object -Last 1
    $SelectedPort = [int]($SelectedPortLine -replace '^MCP_COMPOSER_PORT=', '')
    if ($SelectedPort -eq $OccupiedPort) {
        throw "The Windows launcher did not replace an occupied port."
    }

    $BaseUrl = "http://127.0.0.1:$SelectedPort"
    $Health = Invoke-RestMethod -Uri "$BaseUrl/api/health" -TimeoutSec 5
    if ($Health.status -ne "ok" -or $Health.service -ne "mcp-composer-api" -or $Health.version -ne $Version) {
        throw "The Windows launcher returned an invalid health response."
    }
    $HomePage = Invoke-WebRequest -UseBasicParsing -Uri $BaseUrl -TimeoutSec 5
    if ($HomePage.Content -notmatch '<div id="root"></div>') {
        throw "The Windows launcher did not serve the frontend."
    }

    $ContainerIds = @(Get-ProjectContainerIds)
    if ($ContainerIds.Count -ne 1) {
        throw "Expected exactly one Windows E2E container, found $($ContainerIds.Count)."
    }
    $ContainerId = $ContainerIds[0]
    if ((& docker inspect --format "{{.Config.User}}" $ContainerId).Trim() -ne "composer") {
        throw "The Windows E2E container is not running as the composer user."
    }
    if ((& docker inspect --format "{{.HostConfig.ReadonlyRootfs}}" $ContainerId).Trim() -ne "true") {
        throw "The Windows E2E container does not have a read-only root filesystem."
    }

    & $Launcher -Action Start -NoBrowser
    $RepeatedContainerIds = @(Get-ProjectContainerIds)
    if ($RepeatedContainerIds.Count -ne 1 -or $RepeatedContainerIds[0] -ne $ContainerId) {
        throw "Repeated Windows start created or replaced the running container."
    }

    & $Launcher -Action Status
    & $Launcher -Action Stop
    if (@(Get-ProjectContainerIds).Count -ne 0) {
        throw "The Windows launcher did not stop and remove its container."
    }
    & $Launcher -Action Uninstall -PurgeConfig
    if (Test-Path -LiteralPath $ConfigFile) {
        throw "The Windows launcher did not purge its configuration."
    }
} finally {
    $PreviousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    & docker compose --project-name $ProjectName -f $ComposeFile down --remove-orphans *> $null
    & docker rm --force $BlockerName *> $null
    $ErrorActionPreference = $PreviousErrorActionPreference
    Remove-Item Env:\MCP_COMPOSER_LAUNCHER_CONFIG_DIR -ErrorAction SilentlyContinue
    Remove-Item Env:\MCP_COMPOSER_LAUNCHER_PROJECT_NAME -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $TestDirectory -Recurse -Force -ErrorAction SilentlyContinue
}
