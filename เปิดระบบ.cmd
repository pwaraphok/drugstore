@echo off
cd /d "%~dp0"
docker compose up -d mariadb
if errorlevel 1 goto failed
call npm start
exit /b
:failed
echo Please open Docker Desktop and try again.
pause
