@echo off
setlocal
cd /d "%~dp0.."
node scripts\redis_snapshot.js backup %*
exit /b %errorlevel%
