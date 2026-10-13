@echo off
setlocal EnableDelayedExpansion

REM Chuyen den thu muc goc va chuyen tiep cho start.bat
set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "ROOT_DIR=%%~fI"
cd /d "%ROOT_DIR%"

call "%ROOT_DIR%\start.bat" %*