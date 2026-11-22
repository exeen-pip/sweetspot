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
  rem new npm blocks postinstall scripts by default
  call npm install-scripts approve electron >> install-log.txt 2>&1
)

rem --- auto-heal: electron binary sometimes does not download ---
if exist node_modules\electron\index.js if not exist node_modules\electron\dist\electron.exe (
  echo Healing Electron binary... 1-2 minutes
  call node node_modules\electron\install.js >> install-log.txt 2>&1
  if not exist node_modules\electron\dist\electron.exe (
    echo Trying mirror...
    set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
    call node node_modules\electron\install.js >> install-log.txt 2>&1
  )
  if not exist node_modules\electron\dist\electron.exe (
    echo.
    echo Could not heal Electron - send me the file install-log.txt
    pause
    exit /b 1
  )
)

echo Starting sp... (console is quiet on purpose, app window opens separately)
call npm start > sp-log.txt 2>&1

echo.
echo sp closed. If that was not you - open sp-log.txt and send me a screenshot.
pause
