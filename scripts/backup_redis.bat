@echo off
chcp 65001 >nul
echo ====================================================================
echo   SAO LƯU DỮ LIỆU REDIS (BACKUP SCRIPT - CHƯƠNG 4)
echo ====================================================================
echo.

cd /d "%~dp0\.."

if not exist "backup" mkdir backup

echo [1/3] Goi lenh chup anh trang thai BGSAVE tren Redis Server...
.\redis-bin\redis-cli.exe BGSAVE

echo [2/3] Doi Redis hoan tat ghi file snapshot xuong dia...
timeout /t 2 /nobreak >nul

for /f "tokens=2 delims==" %%a in ('wmic OS Get localdatetime /value') do set "dt=%%a"
set "YYYY=%dt:~0,4%"
set "MM=%dt:~4,2%"
set "DD=%dt:~6,2%"
set "HH=%dt:~8,2%"
set "Min=%dt:~10,2%"
set "Sec=%dt:~12,2%"
set "TIMESTAMP=%YYYY%%MM%%DD%_%HH%%Min%%Sec%"

echo [3/3] Sao chep dump.rdb va appendonly.aof sang thu muc backup...
if exist "dump.rdb" (
    copy /y "dump.rdb" "backup\dump_%TIMESTAMP%.rdb" >nul
    copy /y "dump.rdb" "backup\dump_latest.rdb" >nul
    echo       Da sao luu: backup\dump_%TIMESTAMP%.rdb
)

if exist "appendonly.aof" (
    copy /y "appendonly.aof" "backup\appendonly_%TIMESTAMP%.aof" >nul
    copy /y "appendonly.aof" "backup\appendonly_latest.aof" >nul
    echo       Da sao luu: backup\appendonly_%TIMESTAMP%.aof
)

echo.
echo ====================================================================
echo   HOÀN TẤT SAO LƯU THÀNH CÔNG!
echo ====================================================================
pause
