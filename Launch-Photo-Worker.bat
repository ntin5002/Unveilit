@echo off
setlocal
cd /d "%~dp0"
if not exist ".env.local" copy /Y ".env.local.example" ".env.local" >nul
if not exist "node_modules\tsx\package.json" (
  echo Installing dependencies...
  call npm install || exit /b 1
)
title Photo Delivery Worker
call npm run worker:local
pause
