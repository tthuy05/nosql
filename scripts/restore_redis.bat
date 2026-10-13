@echo off
chcp 65001 >nul
echo ====================================================================
echo   PHỤC HỒI DỮ LIỆU REDIS (RESTORE SCRIPT - CHƯƠNG 4)
echo ====================================================================
echo.

cd /d "%~dp0\.."

if not exist "backup\dump_latest.rdb" (
    echo [LOI] Khong tim thay ban sao luu tai backup\dump_latest.rdb!
    pause
    exit /b 1
)

echo [1/3] Dung tien trinh Redis Server an toan...
.\redis-bin\redis-cli.exe SHUTDOWN NOSAVE >nul 2>&1
timeout /t 2 /nobreak >nul

echo [2/3] Ghi de tep snapshot dump_latest.rdb vao thu muc Redis...
copy /y "backup\dump_latest.rdb" "dump.rdb" >nul

echo [3/3] Khoi dong lai Redis Server de tu dong nap du lieu vao RAM...
start "Redis-Server" cmd /c ".\redis-bin\redis-server.exe .\redis\redis.conf"
timeout /t 2 /nobreak >nul

echo.
echo ====================================================================
echo   ĐÃ PHỤC HỒI DỮ LIỆU THÀNH CÔNG!
echo   Hay mo P3X Redis UI de kiem tra cac don hang da duoc khoi phuc day du.
echo ====================================================================
pause
