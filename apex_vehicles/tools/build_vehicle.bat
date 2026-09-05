@echo off
cd /d "%~dp0"
echo Apex Vehicle Studio - building plug-and-play vehicle(s)...
node build_vehicle.js
echo.
pause
