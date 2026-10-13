@echo off
setlocal EnableDelayedExpansion

title KHOI CHAY HE THONG (LOCAL STANDALONE MODE)

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "ROOT_DIR=%%~fI"
cd /d "%ROOT_DIR%"

echo ====================================================================
echo   KHOI CHAY HE THONG: CHE DO LOCAL STANDALONE
echo   (Node.js + Redis-bin noi bo - Khong yeu cau Docker)
echo ====================================================================
echo Thu muc du an: "%ROOT_DIR%"
echo.

REM 1. Tu dong tao .env neu thieu
if not exist ".env" (
    if exist ".env.example" (
        copy /y ".env.example" ".env" >nul
        echo [THONG TIN] Da tu dong khoi tao .env tu .env.example.
    )
)

REM 2. Kiem tra va giai phong port neu Docker containers dang chiem
where docker >nul 2>&1
if !errorlevel! equ 0 (
    docker ps --format "{{.Names}}" 2>nul | findstr /I "nosql_redis" >nul 2>&1
    if !errorlevel! equ 0 (
        echo [CHU Y] Phat hien Docker container nosql_redis dang chay.
        echo Dang dung Docker containers de chuyen sang Che do Local...
        docker compose down >nul 2>&1
    )
)

REM 3. Kiem tra Node.js
echo [1/5] Kiem tra moi truong Node.js...
where node >nul 2>&1
if !errorlevel! neq 0 (
    if exist "%ProgramFiles%\nodejs\node.exe" (
        set "PATH=%ProgramFiles%\nodejs;!PATH!"
    ) else if exist "%ProgramFiles(x86)%\nodejs\node.exe" (
        set "PATH=%ProgramFiles(x86)%\nodejs;!PATH!"
    ) else if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" (
        set "PATH=%LOCALAPPDATA%\Programs\nodejs;!PATH!"
    )
)

where node >nul 2>&1
if !errorlevel! neq 0 goto :err_no_node

for /f "tokens=*" %%v in ('node -v 2^>nul') do set "NODE_VER=%%v"
echo       [PASS] Node.js san sang: !NODE_VER!

REM 4. Kiem tra node_modules
if not exist "node_modules" (
    echo.
    echo [!] Phat hien chua co thu muc node_modules.
    echo     Dang tu dong cai dat thu vien qua npm install...
    call npm install
    if !errorlevel! neq 0 (
        echo [LOI] Khong the cai dat cac goi npm dependencies!
        pause
        exit /b 1
    )
    echo       [PASS] Da cai dat xong cac goi npm.
)

REM 5. Kiem tra va khoi chay Redis Server noi bo
echo.
echo [2/5] Kiem tra Redis Server tren cong 6379...
netstat -ano | findstr /R /C:":6379 " >nul 2>&1
if !errorlevel! neq 0 (
    if exist "redis-bin\redis-server.exe" (
        echo       Dang khoi chay Redis Server tu redis-bin...
        start "Redis-Server" cmd /c ".\redis-bin\redis-server.exe .\redis\redis.conf || pause"
        ping -n 3 127.0.0.1 >nul 2>&1
        netstat -ano | findstr /R /C:":6379 " >nul 2>&1
        if !errorlevel! equ 0 (
            echo       [PASS] Redis Server da khoi dong thanh cong tren cong 6379!
        ) else (
            echo       [CANH BAO] Redis Server dang khoi dong, vui long kiem tra cua so Redis-Server.
        )
    ) else (
        goto :err_no_redis_bin
    )
) else (
    echo       [PASS] Redis Server da dang hoat dong tren cong 6379.
)

REM 6. Kiem tra va khoi chay Web Server Express
echo.
echo [3/5] Kiem tra Web Server API tren cong 3000...
netstat -ano | findstr /R /C:":3000 " >nul 2>&1
if !errorlevel! neq 0 (
    echo       Dang khoi chay Web Server Express tren cong 3000...
    start "Web-Server-Express" cmd /c "node src/server.js || pause"
    ping -n 3 127.0.0.1 >nul 2>&1
    netstat -ano | findstr /R /C:":3000 " >nul 2>&1
    if !errorlevel! equ 0 (
        echo       [PASS] Web Server Express da khoi dong thanh cong tren cong 3000!
    ) else (
        echo       [CANH BAO] Web Server dang khoi dong, vui long kiem tra cua so Web-Server-Express.
    )
) else (
    echo       [PASS] Web Server Express da dang hoat dong tren cong 3000.
)

REM 7. Khoi chay Background Queue Worker
echo.
echo [4/5] Khoi chay Background Queue Worker doc lap...
start "Redis-Queue-Worker" cmd /c "node src/worker/worker.js || pause"
echo       [PASS] Da khoi chay tien trinh Queue Worker doc lap.

REM 8. Mo P3X Redis UI
echo.
echo [5/5] Kiem tra P3X Redis UI Desktop...
set "P3X_OPENED=0"
if exist "%LOCALAPPDATA%\Programs\p3x-redis-ui\P3X-Redis-UI.exe" (
    start "" "%LOCALAPPDATA%\Programs\p3x-redis-ui\P3X-Redis-UI.exe"
    echo       [PASS] Da mo ung dung P3X Redis UI Desktop.
    set "P3X_OPENED=1"
) else if exist "%ProgramFiles%\p3x-redis-ui\P3X-Redis-UI.exe" (
    start "" "%ProgramFiles%\p3x-redis-ui\P3X-Redis-UI.exe"
    echo       [PASS] Da mo ung dung P3X Redis UI Desktop.
    set "P3X_OPENED=1"
) else (
    echo       [THONG TIN] P3X Desktop chua cai dat tren may.
    echo       Ban co the cai dat: winget install PatrikLaszlo.P3XRedisUI
    echo       Hoac chay Docker Mode de dung P3X Web UI tai http://localhost:7843
)

echo.
echo ====================================================================
echo   HE THONG DA KHOI CHAY HOAN TAT (LOCAL MODE)
echo ====================================================================
echo   * Giao dien Mua Hang:     http://localhost:3000
echo   * Dashboard Quan Tri:     http://localhost:3000/admin
if "!P3X_OPENED!"=="1" (
    echo   * P3X Redis UI:           Cua so Desktop App da duoc mo
) else (
    echo   * P3X Redis UI:           Desktop chua cai (Co the dung Docker: http://localhost:7843)
)
echo.
echo   Luu y: Cac cua so Redis-Server, Web-Server, Worker dang chay ngam.
echo   De dung he thong an toan, ban chi can chay: scripts\stop-all.bat
echo ====================================================================
echo.
pause
exit /b 0

:err_no_node
echo ====================================================================
echo [LOI] Khong tim thay Node.js tren he thong!
echo.
echo Huong dan xu ly:
echo 1. Cai dat Node.js tu trang chu: https://nodejs.org/
echo 2. Hoac mo PowerShell va chay lenh:
echo    winget install OpenJS.NodeJS.LTS
echo 3. Sau khi cai dat, vui long chay lai script nay.
echo ====================================================================
echo.
pause
exit /b 1

:err_no_redis_bin
echo ====================================================================
echo [LOI] Khong tim thay thu muc redis-bin\redis-server.exe!
echo.
echo Nguyen nhan:
echo Neu ban clone tu Git, thu muc redis-bin co the bi gitignore.
echo.
echo Cach xu ly:
echo 1. Chay bang Docker Mode (khong can redis-bin): scripts\start-docker.bat
echo 2. Hoac sao chep thu muc redis-bin tu ban goc vao project.
echo ====================================================================
echo.
pause
exit /b 1