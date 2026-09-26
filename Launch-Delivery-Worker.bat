@echo off
setlocal
cd /d "%~dp0"
title Photo Delivery - Delivery Package Worker
if not exist ".env.local" (
  echo [ERROR] .env.local not found. Run Launch-Photo-Delivery.bat first.
  pause
  exit /b 1
)
call npm run worker:deliveries:local
if errorlevel 1 (
  echo.
  echo [ERROR] Delivery Package Worker stopped with an error.
  pause
)
