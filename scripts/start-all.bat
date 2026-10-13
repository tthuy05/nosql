@echo off
chcp 65001 >nul
echo ====================================================================
echo   KHỞI CHẠY HỆ THỐNG QUẢN LÝ HÀNG ĐỢI XỬ LÝ ĐƠN HÀNG REDIS
echo   ĐỒ ÁN MÔN HỌC DỮ LIỆU NOSQL - ĐH CÔNG THƯƠNG TP.HCM (HUIT)
echo ====================================================================
echo.

cd /d "%~dp0\.."

:: 1. Kiem tra va khoi chay Redis Server
echo [1/4] Dang kiem tra Redis Server (Cong 6379)...
netstat -ano | findstr 6379 >nul
if %errorlevel% neq 0 (
    echo       Khoi chay Redis Server tu redis-bin...
    start "Redis-Server" cmd /c ".\redis-bin\redis-server.exe .\redis\redis.conf"
    timeout /t 2 /nobreak >nul
) else (
    echo       Redis Server da dang hoat dong!
)

:: 2. Khoi chay Web Server Express
echo [2/4] Dang khoi chay Web Server API (Cong 3000)...
start "Web-Server-Express" cmd /c "node src/server.js"
timeout /t 2 /nobreak >nul

:: 3. Khoi chay Background Worker
echo [3/4] Dang khoi chay Queue Worker doc lap...
start "Redis-Queue-Worker" cmd /c "node src/worker/worker.js"
timeout /t 1 /nobreak >nul

:: 4. Mo P3X Redis UI
echo [4/4] Dang mo P3X Redis UI...
if exist "%LOCALAPPDATA%\Programs\p3x-redis-ui\P3X-Redis-UI.exe" (
    start "" "%LOCALAPPDATA%\Programs\p3x-redis-ui\P3X-Redis-UI.exe"
) else (
    echo       Khong tim thay P3X Desktop. Ban co the truy cap Docker Web UI: http://localhost:7843
)

echo.
echo ====================================================================
echo   HỆ THỐNG ĐÃ SẴN SÀNG!
echo   * Giao diện Mua Hàng:    http://localhost:3000
echo   * Dashboard Quản Trị:    http://localhost:3000/admin
echo   * P3X Redis UI:          Desktop App da mo (hoac http://localhost:7843)
echo ====================================================================
echo.
pause
