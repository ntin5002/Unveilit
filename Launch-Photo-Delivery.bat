@echo off
setlocal EnableExtensions EnableDelayedExpansion

rem ================================================================
rem Photo Delivery 0.5.17 - Windows Local Launcher
rem Node.js 22+ / Next.js 16
rem Default DB: embedded PGlite (NO Docker required)
rem Optional: Docker PostgreSQL or existing PostgreSQL
rem ================================================================

cd /d "%~dp0"
if not defined NEXT_PUBLIC_APP_NAME set "NEXT_PUBLIC_APP_NAME=Photo Delivery"
set "APP_NAME=%NEXT_PUBLIC_APP_NAME%"
title %APP_NAME% - Local Launcher

set "APP_URL=http://localhost:3000"
set "HEALTH_URL=http://localhost:3000/api/health"

echo.
echo ================================================================
echo   %APP_NAME% 0.5.17 - Local Launcher
echo ================================================================
echo.

rem If a healthy server is already on port 3000, only reuse it when it is this version.
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r=Invoke-WebRequest -UseBasicParsing '%HEALTH_URL%' -TimeoutSec 2; if($r.StatusCode -eq 200){ $j=$r.Content | ConvertFrom-Json; if($j.version -eq '0.5.17'){ exit 0 } else { Write-Host ('[ERROR] Port 3000 is running another product version ' + $j.version + ', not 0.5.17.'); exit 2 } } } catch {}; exit 1"
if errorlevel 2 (
    echo Close the older %APP_NAME% Dev Server window/process, then run this launcher again.
    goto :fail
)
if not errorlevel 1 (
    echo [OK] %APP_NAME% 0.5.17 is already running.
    start "" "%APP_URL%"
    goto :success
)

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js was not found.
    echo Install Node.js 22 or newer, then run this file again.
    echo https://nodejs.org/
    goto :fail
)
node -e "const major=Number(process.versions.node.split('.')[0]); process.exit(major>=22?0:1)" >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js 22 or newer is required.
    node --version
    goto :fail
)
echo [OK] Node.js detected:
node --version

where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm was not found. Reinstall Node.js with npm included.
    goto :fail
)

rem Create local environment BEFORE deciding whether Docker is needed.
if not exist ".env.local" (
    if not exist ".env.local.example" (
        echo [ERROR] .env.local.example was not found in:
        echo %CD%
        goto :fail
    )
    copy /Y ".env.local.example" ".env.local" >nul
    echo [OK] Created .env.local from .env.local.example
) else (
    echo [OK] .env.local found.
)

set "DBMODE=pglite"
for /f "usebackq tokens=1,* delims==" %%A in (`findstr /B /I "PHOTO_LOCAL_DATABASE_MODE=" ".env.local"`) do set "DBMODE=%%B"
if "%DBMODE%"=="" set "DBMODE=pglite"
echo [INFO] Local database mode: %DBMODE%

if /I "%DBMODE%"=="docker" (
    where docker >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] Docker mode is selected, but Docker was not found.
        echo.
        echo To launch WITHOUT Docker, edit .env.local and set:
        echo   PHOTO_LOCAL_DATABASE_MODE=pglite
        echo.
        goto :fail
    )
    docker info >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] Docker Desktop is installed but its engine is not running.
        echo Start Docker Desktop or switch PHOTO_LOCAL_DATABASE_MODE=pglite.
        goto :fail
    )
    echo [OK] Docker engine is running.
) else if /I "%DBMODE%"=="pglite" (
    echo [OK] Docker is not required. Using embedded PostgreSQL/PGlite.
) else if /I "%DBMODE%"=="postgres" (
    echo [INFO] Using existing PostgreSQL from .env.local URLs.
) else (
    echo [ERROR] Unknown PHOTO_LOCAL_DATABASE_MODE=%DBMODE%
    echo Valid values: pglite, docker, postgres
    goto :fail
)

if not exist "node_modules\next\package.json" (
    echo.
    echo [SETUP] Installing npm dependencies. This is normally needed only once...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        goto :fail
    )
    echo [OK] npm dependencies installed.
) else if not exist "node_modules\@electric-sql\pglite\package.json" (
    echo.
    echo [SETUP] 0.4.2 adds embedded PostgreSQL support. Updating dependencies...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed while adding PGlite.
        goto :fail
    )
    echo [OK] Dependencies updated.
) else (
    echo [OK] npm dependencies already installed.
)

echo.
echo [SETUP] Preparing local databases and demo data...
call npm run local:setup
if errorlevel 1 (
    echo.
    echo [ERROR] Local database setup failed.
    goto :fail
)
echo [OK] Local data is ready.

if /I "%DBMODE%"=="pglite" (
    echo [INFO] PGlite is single-writer, so a second Photo Worker process is not launched.
    echo [INFO] Upload processing and delivery package generation run through serialized embedded workers inside Next.js.
    echo [INFO] Full local upload -^> process -^> approve -^> package -^> download testing is enabled.
) else (
    echo.
    echo [START] Launching Photo Worker...
    start "Photo Delivery Photo Worker" /D "%CD%" cmd /k "npm run worker:local"
    echo [START] Launching Delivery Package Worker...
    start "Photo Delivery Package Worker" /D "%CD%" cmd /k "npm run worker:deliveries:local"
)

echo [START] Launching Next.js development server...
start "Photo Delivery Dev Server" /D "%CD%" cmd /k "npm run local:dev"

echo [WAIT] Waiting for Photo Delivery at %APP_URL% ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$url='%HEALTH_URL%'; for($i=0; $i -lt 120; $i++){ try { $r=Invoke-WebRequest -UseBasicParsing $url -TimeoutSec 2; if($r.StatusCode -eq 200){ exit 0 } } catch {}; Start-Sleep -Seconds 1 }; exit 1" >nul 2>&1
if errorlevel 1 (
    echo.
    echo [WARNING] The development server did not report healthy within 120 seconds.
    echo Check the "Photo Delivery Dev Server" window for the actual error.
    echo You can still try opening: %APP_URL%
    goto :manualopen
)

echo [OK] Photo Delivery is ready.
start "" "%APP_URL%"
goto :success

:manualopen
set /p OPENNOW=Open the browser anyway? [Y/N]: 
if /I "%OPENNOW%"=="Y" start "" "%APP_URL%"
goto :success

:success
echo.
echo ================================================================
echo   Photo Delivery is running
echo   Dashboard:    %APP_URL%
echo   Demo gallery: %APP_URL%/g/demo-wedding-gallery
echo   Protection test: %APP_URL%/dashboard/protection-test
echo   DB mode:      %DBMODE%
echo ================================================================
echo.
if /I "%DBMODE%"=="pglite" (
    echo Keep the "Photo Delivery Dev Server" window open while testing.
) else (
    echo Keep the Dev Server, Photo Worker, and Delivery Package Worker windows open while testing.
)
echo.
pause
exit /b 0

:fail
echo.
echo ================================================================
echo   Launch failed. Fix the error above and try again.
echo ================================================================
echo.
pause
exit /b 1
