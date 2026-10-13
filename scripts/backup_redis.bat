@echo off
setlocal EnableDelayedExpansion

title SAO LUU DU LIEU REDIS (BACKUP SCRIPT)

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "ROOT_DIR=%%~fI"
cd /d "%ROOT_DIR%"

echo ====================================================================
echo   SAO LUU DU LIEU REDIS (BACKUP SCRIPT - CHUONG 4)
echo ====================================================================
echo Thu muc: "%ROOT_DIR%"
echo.

if not exist "backup" mkdir backup

REM 1. Goi lenh chup snapshot BGSAVE
echo [1/3] Goi lenh BGSAVE tren Redis Server...
set "BGSAVE_DONE=0"

REM Thu tren Docker truoc
where docker >nul 2>&1
if !errorlevel! equ 0 (
    docker ps --format "{{.Names}}" 2>nul | findstr /I "nosql_redis" >nul 2>&1
    if !errorlevel! equ 0 (
        echo       Phat hien Redis dang chay trong Docker container nosql_redis...
        docker exec nosql_redis redis-cli BGSAVE
        set "BGSAVE_DONE=1"
    )
)

REM Neu chua chay tren Docker, thu goi local redis-cli
if "!BGSAVE_DONE!"=="0" (
    if exist "redis-bin\redis-cli.exe" (
        echo       Phat hien Redis dang chay Local Standalone...
        .\redis-bin\redis-cli.exe BGSAVE
        set "BGSAVE_DONE=1"
    ) else (
        echo       [CANH BAO] Khong tim thay redis-cli.exe de goi BGSAVE!
    )
)

REM 2. Cho snapshot hoan tat
echo.
echo [2/3] Doi Redis ghi file snapshot xuong dia...
ping -n 3 127.0.0.1 >nul 2>&1

REM Tao timestamp an toan (khong dung wmic da bi khai tu)
set "TIMESTAMP="
for /f %%a in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss" 2^>nul') do set "TIMESTAMP=%%a"
if "!TIMESTAMP!"=="" (
    set "d=%date%"
    set "t=%time%"
    set "TIMESTAMP=!d:~-4!!d:~4,2!!d:~7,2!_!t:~0,2!!t:~3,2!!t:~6,2!"
    set "TIMESTAMP=!TIMESTAMP: =0!"
)

REM 3. Sao chep dump.rdb va appendonly.aof sang thu muc backup
echo.
echo [3/3] Sao chep dump.rdb va appendonly.aof sang thu muc backup...

set "FOUND_FILE=0"
if exist "dump.rdb" (
    copy /y "dump.rdb" "backup\dump_!TIMESTAMP!.rdb" >nul
    copy /y "dump.rdb" "backup\dump_latest.rdb" >nul
    echo       [PASS] Da sao luu: backup\dump_!TIMESTAMP!.rdb
    echo       [PASS] Da cap nhat: backup\dump_latest.rdb
    set "FOUND_FILE=1"
)

if exist "appendonly.aof" (
    copy /y "appendonly.aof" "backup\appendonly_!TIMESTAMP!.aof" >nul
    copy /y "appendonly.aof" "backup\appendonly_latest.aof" >nul
    echo       [PASS] Da sao luu: backup\appendonly_!TIMESTAMP!.aof
    echo       [PASS] Da cap nhat: backup\appendonly_latest.aof
    set "FOUND_FILE=1"
)

if "!FOUND_FILE!"=="0" (
    echo       [CANH BAO] Khong tim thay file dump.rdb hoac appendonly.aof tai thu muc goc!
    echo       Kiem tra xem Redis Server co quyen ghi file vao thu muc nay khong.
)

echo.
echo ====================================================================
echo   HOAN TAT SAO LUU DU LIEU REDIS!
echo ====================================================================
echo.
pause