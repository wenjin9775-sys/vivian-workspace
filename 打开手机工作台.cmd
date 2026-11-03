@echo off
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-local.ps1" -NoBrowser
if errorlevel 1 goto done
node "%~dp0scripts\start-phone.js"
:done
pause
