@echo off
cd /d "%~dp0"
call npm --prefix desktop run build:assets
if errorlevel 1 exit /b 1
call npm --prefix desktop run build
