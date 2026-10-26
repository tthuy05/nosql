@echo off
setlocal
cd /d "%~dp0.."
node scripts\redis_snapshot.js restore %*
exit /b %errorlevel%
