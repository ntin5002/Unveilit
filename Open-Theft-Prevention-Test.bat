@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Photo Delivery - Theft Prevention Test

set "APP_URL=http://localhost:3000"
set "HEALTH_URL=http://localhost:3000/api/health"
set "TEST_URL=http://localhost:3000/dashboard/protection-test"

echo.
echo ================================================================
echo   Photo Delivery 0.4.8 - Theft Prevention Test
echo ================================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r=Invoke-WebRequest -UseBasicParsing '%HEALTH_URL%' -TimeoutSec 2; if($r.StatusCode -eq 200){ exit 0 } } catch {}; exit 1" >nul 2>&1
if not errorlevel 1 (
    echo [OK] Photo Delivery is already running.
    start "" "%TEST_URL%"
    exit /b 0
)

echo [INFO] Photo Delivery is not running. Starting the local launcher...
start "Photo Delivery Launcher" /D "%CD%" cmd /c "Launch-Photo-Delivery.bat"

echo [WAIT] Waiting for the application...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$url='%HEALTH_URL%'; for($i=0; $i -lt 150; $i++){ try { $r=Invoke-WebRequest -UseBasicParsing $url -TimeoutSec 2; if($r.StatusCode -eq 200){ exit 0 } } catch {}; Start-Sleep -Seconds 1 }; exit 1" >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Photo Delivery did not become healthy within 150 seconds.
    echo Check the launcher / dev-server window for the actual error.
    pause
    exit /b 1
)

echo [OK] Opening Theft Prevention Test Panel...
start "" "%TEST_URL%"
exit /b 0
