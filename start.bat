@echo off
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js not found!
  echo  1. Download LTS from https://nodejs.org
  echo  2. Install it, then run start.bat again
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo First run: installing engine, 2-3 minutes... do not close this window.
  call npm install
  if errorlevel 1 (
    echo.
    echo npm install failed - screenshot this window and send it to me.
    pause
    exit /b 1
  )
)

echo Starting sp...
call npm start

echo.
echo If the sp window did not open - screenshot this window and send it.
pause
