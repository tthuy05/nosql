@echo off
setlocal EnableDelayedExpansion

title PHUC HOI DU LIEU REDIS (RESTORE SCRIPT)

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "ROOT_DIR=%%~fI"
cd /d "%ROOT_DIR%"

echo ====================================================================
echo   PHUC HOI DU LIEU REDIS (RESTORE SCRIPT - CHUONG 4)
echo ====================================================================
echo Thu muc: "%ROOT_DIR%"
echo.

if not exist "backup\dump_latest.rdb" (
    echo [LOI] Khong tim thay ban sao luu: backup\dump_latest.rdb!
    echo Vui long chay scripts\backup_redis.bat de tao ban sao luu truoc.
    echo.
    pause
    exit /b 1
)

REM 1. Dung Redis an toan
echo [1/3] Dung tien trinh Redis Server hien tai...
if exist "redis-bin\redis-cli.exe" (
    .\redis-bin\redis-cli.exe SHUTDOWN NOSAVE >nul 2>&1
)
ping -n 2 127.0.0.1 >nul 2>&1
taskkill /f /im redis-server.exe >nul 2>&1
echo       Da dung Redis Server.

REM 2. Ghi de file snapshot tu ban sao luu
echo.
echo [2/3] Khoi phuc tep dump_latest.rdb vao thu muc goc...
copy /y "backup\dump_latest.rdb" "dump.rdb" >nul
if !errorlevel! equ 0 (
    echo       [PASS] Da ghi de dump_latest.rdb thanh cong.
) else (
    echo       [LOI] Khong the ghi de dump.rdb!
    pause
    exit /b 1
)

REM 3. Khoi dong lai Redis Server
echo.
echo [3/3] Khoi dong lai Redis Server de tu dong nap du lieu vao RAM...
if exist "redis-bin\redis-server.exe" (
    start "Redis-Server" cmd /c ".\redis-bin\redis-server.exe .\redis\redis.conf"
    ping -n 3 127.0.0.1 >nul 2>&1
    netstat -ano | findstr /R /C:":6379 " >nul 2>&1
    if !errorlevel! equ 0 (
        echo       [PASS] Redis Server da khoi dong lai thanh cong tren cong 6379!
    ) else (
        echo       [CANH BAO] Redis Server dang khoi dong, vui long kiem tra cua so Redis.
    )
) else (
    echo       [LOI] Khong tim thay redis-bin\redis-server.exe de khoi dong lai!
)

echo.
echo ====================================================================
echo   DA PHUC HOI DU LIEU REDIS THANH CONG!
echo   Ban co the mo P3X Redis UI de kiem tra cac don hang da phuc hoi.
echo ====================================================================
echo.
pause