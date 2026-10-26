@echo off
setlocal
cd /d "%~dp0.."
REM Only stop Compose services belonging to this project; retain volumes.
docker info >nul 2>&1
if %errorlevel% equ 0 (
    docker compose stop
    if errorlevel 1 exit /b 1
)
echo Local mode: stop the API and Worker in their own consoles with Ctrl+C.
echo Then stop the intended Redis instance with SHUTDOWN SAVE after checking host/port.
echo This script never kills all Redis/Node processes or sends SHUTDOWN NOSAVE.
exit /b 0
