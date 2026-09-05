@echo off
REM Apex Vehicle Studio — convert all your .ydd clothes to .glb.
REM Double-click this file (needs Node.js + Blender with Sollumz).
REM If Blender isn't found automatically, edit the line below to point
REM at your blender.exe.

cd /d "%~dp0"

REM set BLENDER_PATH=C:\Program Files\Blender Foundation\Blender 4.2\blender.exe

node convert.js %*

echo.
pause
