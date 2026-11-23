@echo off
title Netvelox Local Companion
cd /d "%~dp0"
cd companion

echo.
echo ============================================================
echo  Netvelox Local Companion - Windows launcher
echo ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was NOT found on PATH.
  echo Install Node.js 18 or newer from https://nodejs.org/ and run this file again.
  echo.
  pause
  exit /b 1
)

echo Starting the companion on http://127.0.0.1:8787 ...
echo Keep this window open while using the Netvelox diagnostics page.
echo Set AGENT_PORT before running this file to use a different local port.
echo.
node src/index.js
echo.
echo Companion stopped. Close this window, or press any key to close it.
pause >nul
