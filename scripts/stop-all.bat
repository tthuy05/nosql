@echo off
setlocal EnableDelayedExpansion

title DUNG HE THONG (STOP ALL SERVICES)

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "ROOT_DIR=%%~fI"
cd /d "%ROOT_DIR%"

echo ====================================================================
echo   DUNG TOAN BO HE THONG QUAN LY HANG DOI REDIS
echo ====================================================================
echo Thu muc: "%ROOT_DIR%"
echo.

REM 1. Dung cac container Docker neu dang chay
where docker >nul 2>&1
if !errorlevel! equ 0 (
    docker info >nul 2>&1
    if !errorlevel! equ 0 (
        echo [1/3] Kiem tra va dung Docker containers...
        docker compose down >nul 2>&1
        echo       Da gui lenh docker compose down.
    ) else (
        echo [1/3] Docker Engine khong hoat dong, bo qua buoc Docker.
    )
) else (
    echo [1/3] Docker khong cai dat, bo qua buoc Docker.
)

REM 2. Dung Local Redis Server
echo.
echo [2/3] Kiem tra va dung Local Redis Server...
if exist "redis-bin\redis-cli.exe" (
    .\redis-bin\redis-cli.exe SHUTDOWN NOSAVE >nul 2>&1
)
taskkill /f /im redis-server.exe >nul 2>&1
if !errorlevel! equ 0 (
    echo       Da dung tien trinh redis-server.exe.
) else (
    echo       Khong con tien trinh redis-server.exe nao chay.
)

REM 3. Dung Web Server tren cong 3000 va Worker
echo.
echo [3/3] Kiem tra va dung tien trinh Web Server tren cong 3000...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":3000.*LISTENING"') do (
    if not "%%p"=="" (
        taskkill /f /pid %%p >nul 2>&1
        echo       Da dung Web Server tren cong 3000 - PID: %%p
    )
)

echo.
echo ====================================================================
echo   DA DUNG CAC DICH VU THANH CONG!
echo ====================================================================
echo.
pause