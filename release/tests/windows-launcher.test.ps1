$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RepositoryDirectory = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$TestDirectory = Join-Path $RepositoryDirectory "tmp/windows-launcher-test-$([Guid]::NewGuid().ToString('N'))"
$DockerLog = Join-Path $TestDirectory "docker.log"
New-Item -ItemType Directory -Force -Path $TestDirectory | Out-Null
$env:MCP_COMPOSER_LAUNCHER_CONFIG_DIR = Join-Path $TestDirectory "config"

function global:docker {
    $Arguments = @($args | ForEach-Object { [string]$_ })
    Add-Content -LiteralPath $DockerLog -Value ($Arguments -join " ")
    $global:LASTEXITCODE = 0
}

function global:Invoke-RestMethod {
    return [pscustomobject]@{
        status = "ok"
        service = "mcp-composer-api"
        mode = "local"
        version = "0.1.0"
    }
}

try {
    $Launcher = Join-Path $RepositoryDirectory "release/windows/start.ps1"
    & $Launcher -Action Start -Port 18080 -Version 0.1.0 -NoBrowser
    $ConfigFile = Join-Path $env:MCP_COMPOSER_LAUNCHER_CONFIG_DIR "composer.env"
    $Config = Get-Content -Raw -LiteralPath $ConfigFile
    if ($Config -notmatch 'MCP_COMPOSER_PORT=18080') {
        throw "Windows launcher did not persist the selected port."
    }
    $DockerCalls = Get-Content -Raw -LiteralPath $DockerLog
    if ($DockerCalls -notmatch 'up --detach --pull always --wait --wait-timeout 120') {
        throw "Windows launcher did not execute the expected Compose startup."
    }

    & $Launcher -Action Update -Version 0.1.0 -NoBrowser
    & $Launcher -Action Status
    & $Launcher -Action Stop
    & $Launcher -Action Uninstall -PurgeConfig
    if (Test-Path -LiteralPath $ConfigFile) {
        throw "Windows launcher did not purge its configuration."
    }
} finally {
    Remove-Item Function:\docker -ErrorAction SilentlyContinue
    Remove-Item Function:\Invoke-RestMethod -ErrorAction SilentlyContinue
    Remove-Item Env:\MCP_COMPOSER_LAUNCHER_CONFIG_DIR -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $TestDirectory -Recurse -Force -ErrorAction SilentlyContinue
}
