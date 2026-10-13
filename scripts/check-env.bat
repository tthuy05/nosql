@echo off
setlocal EnableDelayedExpansion

title KIEM TRA MOI TRUONG HE THONG (PRE-FLIGHT DIAGNOSTIC)

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "ROOT_DIR=%%~fI"
cd /d "%ROOT_DIR%"

echo ====================================================================
echo   CONG CU KIEM TRA VA CHAN DOAN MOI TRUONG WINDOWS
echo   DO AN: HE THONG QUAN LY HANG DOI DON HANG NOSQL REDIS
echo ====================================================================
echo Thu muc du an: "%ROOT_DIR%"
echo.

REM 1. Kiem tra Node.js
echo [1/6] Kiem tra Node.js va NPM...
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
if !errorlevel! equ 0 (
    for /f "tokens=*" %%v in ('node -v 2^>nul') do set "NODE_VER=%%v"
    echo       [PASS] Node.js da duoc cai dat: !NODE_VER!
) else (
    echo       [CANH BAO] Khong tim thay Node.js trong PATH!
    echo       * Cach cai dat: winget install OpenJS.NodeJS.LTS
)

where npm >nul 2>&1
if !errorlevel! equ 0 (
    for /f "tokens=*" %%v in ('npm -v 2^>nul') do set "NPM_VER=%%v"
    echo       [PASS] NPM da duoc cai dat: v!NPM_VER!
) else (
    echo       [CANH BAO] Khong tim thay NPM!
)

REM 2. Kiem tra Docker va Docker Compose
echo.
echo [2/6] Kiem tra Docker va Docker Compose...
set "HAS_DOCKER=0"
set "HAS_COMPOSE=0"
where docker >nul 2>&1
if !errorlevel! equ 0 (
    for /f "tokens=*" %%v in ('docker --version 2^>nul') do set "DOCKER_VER=%%v"
    echo       [PASS] Docker CLI: !DOCKER_VER!
    set "HAS_DOCKER=1"
) else (
    echo       [THONG TIN] Khong tim thay Docker CLI tren may.
)

docker compose version >nul 2>&1
if !errorlevel! equ 0 (
    for /f "tokens=*" %%v in ('docker compose version 2^>nul') do set "COMPOSE_VER=%%v"
    echo       [PASS] Docker Compose: !COMPOSE_VER!
    set "HAS_COMPOSE=1"
) else (
    docker-compose --version >nul 2>&1
    if !errorlevel! equ 0 (
        for /f "tokens=*" %%v in ('docker-compose --version 2^>nul') do set "COMPOSE_VER=%%v"
        echo       [PASS] Docker Compose v1: !COMPOSE_VER!
        set "HAS_COMPOSE=1"
    ) else (
        echo       [THONG TIN] Khong tim thay Docker Compose.
    )
)

REM 3. Kiem tra Docker Engine
echo.
echo [3/6] Kiem tra trang thai Docker Engine Daemon...
set "DOCKER_ENGINE=0"
if "!HAS_DOCKER!"=="1" (
    docker info >nul 2>&1
    if !errorlevel! equ 0 (
        echo       [PASS] Docker Engine DANG HOAT DONG san sang!
        set "DOCKER_ENGINE=1"
    ) else (
        echo       [CANH BAO] Docker CLI co san nhung Docker Engine CHUA BAT.
        echo       * Neu muon chay Docker: Hay khoi dong Docker Desktop tu Start Menu.
    )
) else (
    echo       [THONG TIN] Bo qua vi may chua cai Docker. Co the chay Che do Local.
)

REM 4. Kiem tra Redis Binary noi bo
echo.
echo [4/6] Kiem tra Redis-bin co san trong project...
if exist "redis-bin\redis-server.exe" (
    echo       [PASS] Tim thay: redis-bin\redis-server.exe
) else (
    echo       [LOI] Thieu redis-bin\redis-server.exe!
)
if exist "redis-bin\redis-cli.exe" (
    echo       [PASS] Tim thay: redis-bin\redis-cli.exe
) else (
    echo       [LOI] Thieu redis-bin\redis-cli.exe!
)
if exist "redis\redis.conf" (
    echo       [PASS] Tim thay: redis\redis.conf
) else (
    echo       [LOI] Thieu redis\redis.conf!
)

REM 5. Kiem tra cac cong mang
echo.
echo [5/6] Kiem tra cac cong mang 6379 va 3000...
netstat -ano | findstr /R /C:":6379 " >nul 2>&1
if !errorlevel! equ 0 (
    echo       [CHU Y] Cong 6379 Redis dang co tien trinh su dung hoac dang mo.
) else (
    echo       [SAN SANG] Cong 6379 dang trong.
)

netstat -ano | findstr /R /C:":3000 " >nul 2>&1
if !errorlevel! equ 0 (
    echo       [CHU Y] Cong 3000 Web Server dang co tien trinh su dung hoac dang mo.
) else (
    echo       [SAN SANG] Cong 3000 dang trong.
)

REM 6. Kiem tra P3X Redis UI
echo.
echo [6/6] Kiem tra P3X Redis UI...
set "P3X_FOUND=0"
if exist "%LOCALAPPDATA%\Programs\p3x-redis-ui\P3X-Redis-UI.exe" (
    echo       [PASS] P3X Desktop App da duoc cai dat.
    set "P3X_FOUND=1"
) else if exist "%ProgramFiles%\p3x-redis-ui\P3X-Redis-UI.exe" (
    echo       [PASS] P3X Desktop App da duoc cai dat.
    set "P3X_FOUND=1"
) else (
    echo       [THONG TIN] P3X Desktop App chua cai dat.
    echo       * Khi chay Docker, ban co the dung P3X Web UI tai http://localhost:7843
    echo       * Hoac cai Desktop qua: winget install PatrikLaszlo.P3XRedisUI
)

echo.
echo ====================================================================
echo   TONG KET PHUONG AN KHOI CHAY CO THE SU DUNG
echo ====================================================================
if "!DOCKER_ENGINE!"=="1" (
    echo   [OK] PHUONG AN 1 - DOCKER COMPOSE: San sang chay 100%%.
) else (
    echo   [--] PHUONG AN 1 - DOCKER COMPOSE: Chua san sang - Can bat Docker Desktop.
)

where node >nul 2>&1
if !errorlevel! equ 0 (
    if exist "redis-bin\redis-server.exe" (
        echo   [OK] PHUONG AN 2 - LOCAL STANDALONE: San sang chay 100%% - Node.js + Redis-bin.
    )
) else (
    echo   [--] PHUONG AN 2 - LOCAL STANDALONE: Can cai Node.js de chay.
)
echo ====================================================================
echo.
pause