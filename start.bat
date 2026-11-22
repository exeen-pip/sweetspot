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
  call npm install > install-log.txt 2>&1
  if errorlevel 1 (
    echo.
    echo npm install failed - send me the file install-log.txt
    pause
    exit /b 1
  )
)

echo Starting sp... (console is quiet on purpose, app window opens separately)
call npm start > sp-log.txt 2>&1

echo.
echo sp closed. If that was not you - open sp-log.txt and send me a screenshot.
pause
