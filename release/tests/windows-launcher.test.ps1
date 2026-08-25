$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RepositoryDirectory = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$TestDirectory = Join-Path $RepositoryDirectory "tmp/windows-launcher-test-$([Guid]::NewGuid().ToString('N'))"
$DockerLog = Join-Path $TestDirectory "docker.log"
New-Item -ItemType Directory -Force -Path $TestDirectory | Out-Null
$env:MCP_COMPOSER_LAUNCHER_CONFIG_DIR = Join-Path $TestDirectory "config"
$global:McpComposerMockRunningProject = $false

function global:docker {
    $Arguments = @($args | ForEach-Object { [string]$_ })
    Add-Content -LiteralPath $DockerLog -Value ($Arguments -join " ")
    if ($Arguments.Count -gt 0 -and $Arguments[0] -eq "info") {
        Write-Error "WARNING: No blkio throttle.read_iops_device support"
    }
    if ($global:McpComposerMockRunningProject -and $Arguments.Count -gt 0 -and $Arguments[0] -eq "ps") {
        switch ($Arguments[-1]) {
            "{{.ID}}" { Write-Output "old-container-id" }
            "{{.Ports}}" { Write-Output "127.0.0.1:18080->8000/tcp" }
            "{{.Image}}" { Write-Output "ghcr.io/feg55/mcp-composer:0.1.0" }
        }
    }
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
    if ($DockerCalls -notmatch 'up --detach --pull missing --wait --wait-timeout 120') {
        throw "Windows launcher did not execute the expected Compose startup."
    }

    Clear-Content -LiteralPath $DockerLog
    $global:McpComposerMockRunningProject = $true
    & $Launcher -Action Start -NoBrowser
    $Config = Get-Content -Raw -LiteralPath $ConfigFile
    if ($Config -notmatch 'MCP_COMPOSER_VERSION=0\.1\.3') {
        throw "Windows launcher did not upgrade an existing project to the bundle version."
    }
    $DockerCalls = Get-Content -Raw -LiteralPath $DockerLog
    if ($DockerCalls -notmatch 'up --detach --pull missing --wait --wait-timeout 120') {
        throw "Windows launcher skipped Compose reconciliation for an outdated running image."
    }
    $global:McpComposerMockRunningProject = $false

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
    Remove-Variable McpComposerMockRunningProject -Scope Global -ErrorAction SilentlyContinue
    Remove-Item Env:\MCP_COMPOSER_LAUNCHER_CONFIG_DIR -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $TestDirectory -Recurse -Force -ErrorAction SilentlyContinue
}
