@echo off
setlocal EnableDelayedExpansion

title KHOI CHAY HE THONG (DOCKER COMPOSE MODE)

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "ROOT_DIR=%%~fI"
cd /d "%ROOT_DIR%"

REM Tu dong khoi tao .env neu thieu (khi clone tu Git)
if not exist ".env" (
    if exist ".env.example" (
        copy /y ".env.example" ".env" >nul
        echo [THONG TIN] Da tu dong khoi tao .env tu .env.example.
    ) else (
        echo ADMIN_PASSWORD=admin123 > .env
    )
)

echo ====================================================================
echo   KHOI CHAY HE THONG: CHE DO DOCKER COMPOSE
echo   (Khoi chay 4 Service: Redis, P3X Web UI, Backend API, Worker)
echo ====================================================================
echo Thu muc du an: "%ROOT_DIR%"
echo.

REM 1. Kiem tra Docker CLI
echo [1/4] Kiem tra Docker CLI...
where docker >nul 2>&1
if !errorlevel! neq 0 goto :err_no_docker

for /f "tokens=*" %%v in ('docker --version 2^>nul') do set "DOCKER_VER=%%v"
echo       [PASS] Docker CLI san sang: !DOCKER_VER!

REM 2. Kiem tra Docker Compose
echo.
echo [2/4] Kiem tra Docker Compose...
set "COMPOSE_CMD="
docker compose version >nul 2>&1
if !errorlevel! equ 0 (
    set "COMPOSE_CMD=docker compose"
    for /f "tokens=*" %%v in ('docker compose version 2^>nul') do set "COMPOSE_VER=%%v"
    echo       [PASS] Docker Compose san sang: !COMPOSE_VER!
    goto :check_daemon
)

docker-compose --version >nul 2>&1
if !errorlevel! equ 0 (
    set "COMPOSE_CMD=docker-compose"
    for /f "tokens=*" %%v in ('docker-compose --version 2^>nul') do set "COMPOSE_VER=%%v"
    echo       [PASS] Docker Compose v1 san sang: !COMPOSE_VER!
    goto :check_daemon
)

goto :err_no_compose

:check_daemon
REM 3. Kiem tra Docker Engine Daemon
echo.
echo [3/4] Kiem tra ket noi Docker Engine Daemon...
docker info >nul 2>&1
if !errorlevel! neq 0 goto :err_no_daemon
echo       [PASS] Docker Engine dang hoat dong san sang!

REM Never terminate unrelated Redis/Node processes to free ports.
for %%q in (6379 3000 7843) do (
    netstat -ano | findstr /R /C:":%%q .*LISTENING" >nul 2>&1
    if !errorlevel! equ 0 (
        docker ps --format "{{.Ports}}" | findstr ":%%q->" >nul 2>&1
        if !errorlevel! neq 0 (
            echo [LOI] Port %%q dang duoc su dung. Hay dung dung dich vu cua ban truoc.
            exit /b 1
        )
    )
)

REM 4. Khoi chay cac service bang Docker Compose
echo.
echo [4/4] Dang khoi chay cac container qua Docker Compose...
!COMPOSE_CMD! up -d --build
if !errorlevel! neq 0 goto :err_compose_failed

echo.
echo Dang doi cac container on dinh trong 5 giay...
ping -n 6 127.0.0.1 >nul 2>&1

echo.
echo ====================================================================
echo   TRANG THAI CAC SERVICE DOCKER
echo ====================================================================
!COMPOSE_CMD! ps

echo.
echo ====================================================================
echo   HE THONG DA KHOI CHAY HOAN TAT QUA DOCKER COMPOSE!
echo ====================================================================
echo   * Giao dien Mua Hang:     http://localhost:3000
echo   * Dashboard Quan Tri:     http://localhost:3000/admin
echo   * P3X Redis UI Web:       http://localhost:7843
echo.
echo   De xem log he thong:      docker compose logs -f
echo   De dung he thong an toan: scripts\stop-all.bat
echo ====================================================================
echo.
pause
exit /b 0

:err_no_docker
echo ====================================================================
echo [LOI] Khong tim thay Docker CLI tren he thong!
echo.
echo Huong dan:
echo 1. Cai dat Docker Desktop tu: https://www.docker.com/products/docker-desktop/
echo 2. Hoac chay ngay bang CHE DO LOCAL STANDALONE [Khong can Docker]:
echo    Chay file: scripts\start-local.bat
echo ====================================================================
echo.
pause
exit /b 1

:err_no_compose
echo ====================================================================
echo [LOI] Khong tim thay Docker Compose tren he thong!
echo Vui long cap nhat Docker Desktop len phien ban moi nhat.
echo ====================================================================
echo.
pause
exit /b 1

:err_no_daemon
echo ====================================================================
echo [CANH BAO] Docker Engine chua hoat dong!
echo ====================================================================
echo Nguyen nhan:
echo * Docker Desktop chua duoc bat hoac dang trong qua trinh khoi dong.
echo.
echo Huong dan xu ly:
echo 1. Mo ung dung Docker Desktop tu Start Menu hoac Desktop.
echo 2. Doi bieu tuong Docker ca voi o khay he thong chuyen sang mau xanh
echo    [thong bao: Docker Engine is running].
echo 3. Sau do chay lai script nay.
echo.
echo * LUU Y: Neu may ban khong co Docker, ban co the chay ngay bang
echo   CHE DO LOCAL [Node.js + Redis-bin noi bo] ma khong can bat Docker:
echo   Nhay dup chuot vao file: scripts\start-local.bat
echo ====================================================================
echo.
pause
exit /b 1

:err_compose_failed
echo ====================================================================
echo [LOI] Khong the khoi chay Docker Compose!
echo Vui long kiem tra log chi tiet o tren hoac xung dot port 6379, 3000, 7843.
echo ====================================================================
echo.
pause
exit /b 1
