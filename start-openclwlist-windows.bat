@echo off
setlocal

cd /d "%~dp0"

set "APP_URL=http://127.0.0.1:3010"

where npm >nul 2>nul
if errorlevel 1 (
  echo [OpenClwList] npm not found. Install Node.js ^(with npm^) and try again.
  pause
  exit /b 1
)

echo [OpenClwList] Starting server in a new window...
start "OpenClwList Server" cmd /k "cd /d ""%~dp0"" && npm run run:remote"

echo [OpenClwList] Waiting for %APP_URL% ...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$u='%APP_URL%'; $deadline=(Get-Date).AddMinutes(5); while((Get-Date) -lt $deadline){ try { Invoke-WebRequest -UseBasicParsing -Uri $u -TimeoutSec 3 | Out-Null; Start-Process $u; exit 0 } catch { Start-Sleep -Seconds 2 } }; Write-Host 'Server is still starting. Opening browser anyway...'; Start-Process $u"

exit /b 0
