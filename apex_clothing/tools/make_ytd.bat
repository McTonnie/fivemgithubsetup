@echo off
REM ============================================================
REM  Apex Clothing Studio - PNG to .ytd
REM  Double-click this after exporting from the studio.
REM  It reads every PNG in tools\ytd_in\ and writes a real
REM  .ytd (using the matching original as a template) into
REM  tools\ytd_out\. No OpenIV/CodeWalker needed.
REM ============================================================
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js is not installed or not on PATH.
    echo Download it from https://nodejs.org  then run this again.
    pause
    exit /b 1
)
node make_ytd.js --auto
echo.
pause
