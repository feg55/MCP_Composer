@echo off
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" -Action Update %*
set "MCP_COMPOSER_EXIT=%ERRORLEVEL%"
if not "%MCP_COMPOSER_EXIT%"=="0" pause
exit /b %MCP_COMPOSER_EXIT%
