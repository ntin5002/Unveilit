@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if not exist node_modules (
  echo Installing dependencies...
  call npm install || exit /b 1
)
if not exist .env.local copy .env.local.example .env.local >nul

set "DBMODE=pglite"
for /f "usebackq tokens=1,* delims==" %%A in (`findstr /B /I "PHOTO_LOCAL_DATABASE_MODE=" ".env.local"`) do set "DBMODE=%%B"
if "%DBMODE%"=="" set "DBMODE=pglite"

echo Local database mode: %DBMODE%
call npm run local:setup || exit /b 1

if /I "%DBMODE%"=="pglite" (
  echo PGlite local mode: Photo Worker runs serialized inside the Next.js process; no second worker window is required.
) else (
  start "Photo Delivery Worker" /D "%CD%" cmd /k "npm run worker:local"
)

call npm run local:dev
