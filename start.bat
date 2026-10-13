@echo off
setlocal EnableDelayedExpansion

title HE THONG QUAN LY HANG DOI REDIS - KHOI CHAY 1-CLICK

REM 1. Xac dinh thu muc goc cua project
set "SCRIPT_DIR=%~dp0"
if exist "%SCRIPT_DIR%package.json" (
    set "ROOT_DIR=%SCRIPT_DIR%"
    cd /d "%SCRIPT_DIR%"
) else if exist "%SCRIPT_DIR%..\package.json" (
    for %%I in ("%SCRIPT_DIR%..") do set "ROOT_DIR=%%~fI\"
    cd /d "%ROOT_DIR%"
) else (
    set "ROOT_DIR=%CD%\"
)

REM 2. Tu dong khoi tao .env neu thieu (khi clone tu Git)
if not exist ".env" (
    if exist ".env.example" (
        copy /y ".env.example" ".env" >nul
        echo [THONG TIN] Da tu dong khoi tao .env tu .env.example.
    )
)

REM 3. Xu ly tham so dong lenh neu co
if /i "%~1"=="docker" goto :do_docker
if /i "%~1"=="local" goto :do_local
if /i "%~1"=="stop" goto :do_stop
if /i "%~1"=="check" goto :do_check

:main_menu
cls
echo ====================================================================
echo   KHOI CHAY HE THONG QUAN LY HANG DOI XU LY DON HANG REDIS
echo   DO AN MON HOC DU LIEU NOSQL - DH CONG THUONG TP.HCM [HUIT]
echo ====================================================================
echo Thu muc project: "%CD%"
echo.

REM 4. Kiem tra nhanh moi truong
set "NODE_OK=0"
where node >nul 2>&1
if !errorlevel! neq 0 (
    if exist "%ProgramFiles%\nodejs\node.exe" (
        set "PATH=%ProgramFiles%\nodejs;!PATH!"
        set "NODE_OK=1"
    ) else if exist "%ProgramFiles(x86)%\nodejs\node.exe" (
        set "PATH=%ProgramFiles(x86)%\nodejs;!PATH!"
        set "NODE_OK=1"
    ) else if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" (
        set "PATH=%LOCALAPPDATA%\Programs\nodejs;!PATH!"
        set "NODE_OK=1"
    )
) else (
    set "NODE_OK=1"
)

set "DOCKER_ENGINE_OK=0"
where docker >nul 2>&1
if !errorlevel! equ 0 (
    docker info >nul 2>&1
    if !errorlevel! equ 0 (
        set "DOCKER_ENGINE_OK=1"
    )
)

if "!DOCKER_ENGINE_OK!"=="1" (
    echo [TRANG THAI MOI TRUONG]
    echo * Docker Engine:        [PASS] DANG HOAT DONG SAN SANG
    if "!NODE_OK!"=="1" (
        echo * Node.js va Redis-bin: [PASS] SAN SANG
    ) else (
        echo * Node.js:              [CHUA CO] - Khong anh huong vi Docker da san sang
    )
    echo.
    echo ====================================================================
    echo   CHON CHE DO KHOI CHAY
    echo ====================================================================
    echo   [1] KHOI CHAY BANG DOCKER COMPOSE [Khuyen dung - 4 containers]
    echo   [2] KHOI CHAY BANG CHE DO LOCAL STANDALONE [Node.js + Redis-bin]
    echo   [3] KIEM TRA VA CHAN DOAN MOI TRUONG [Diagnostic Tool]
    echo   [4] DUNG TOAN BO HE THONG [Stop All Services]
    echo   [0] THOAT
    echo ====================================================================
    set /p "CHOICE=Nhap lua chon cua ban [1-4, Mac dinh Enter=1]: "
    if "!CHOICE!"=="" set "CHOICE=1"
    if "!CHOICE!"=="1" goto :do_docker
    if "!CHOICE!"=="2" goto :do_local
    if "!CHOICE!"=="3" goto :do_check
    if "!CHOICE!"=="4" goto :do_stop
    if "!CHOICE!"=="0" exit /b 0
    goto :main_menu
) else (
    echo [TRANG THAI MOI TRUONG]
    echo * Docker Engine:        [CHUA BAT / CHUA CO]
    if "!NODE_OK!"=="1" (
        echo * Node.js va Redis-bin: [PASS] DA SAN SANG DE CHAY NGAY
    ) else (
        echo * Node.js:              [CHUA CO]
    )
    echo.
    echo ====================================================================
    echo   CHON CHE DO KHOI CHAY
    echo ====================================================================
    echo   [1] KHOI CHAY BANG CHE DO LOCAL STANDALONE [Khuyen dung - Khong can Docker]
    echo   [2] THU KHOI CHAY DOCKER COMPOSE [Neu ban vua mo Docker Desktop]
    echo   [3] KIEM TRA VA CHAN DOAN MOI TRUONG [Diagnostic Tool]
    echo   [4] DUNG TOAN BO HE THONG [Stop All Services]
    echo   [0] THOAT
    echo ====================================================================
    set /p "CHOICE=Nhap lua chon cua ban [1-4, Mac dinh Enter=1]: "
    if "!CHOICE!"=="" set "CHOICE=1"
    if "!CHOICE!"=="1" goto :do_local
    if "!CHOICE!"=="2" goto :do_docker
    if "!CHOICE!"=="3" goto :do_check
    if "!CHOICE!"=="4" goto :do_stop
    if "!CHOICE!"=="0" exit /b 0
    goto :main_menu
)

:do_docker
call "%ROOT_DIR%scripts\start-docker.bat"
goto :ask_exit

:do_local
call "%ROOT_DIR%scripts\start-local.bat"
goto :ask_exit

:do_check
call "%ROOT_DIR%scripts\check-env.bat"
goto :main_menu

:do_stop
call "%ROOT_DIR%scripts\stop-all.bat"
goto :main_menu

:ask_exit
echo.
echo Nhap [M] de quay ve Menu chinh hoac [Enter] de dong cua so.
set /p "RET=Lua chon: "
if /i "!RET!"=="m" goto :main_menu
exit /b 0