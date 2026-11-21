@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo ============================================================
  echo   Node.js не найден на этом ноуте :^(
  echo   1) скачай LTS отсюда: https://nodejs.org
  echo   2) установи (галочка "Add to PATH" стоит сама)
  echo   3) снова запусти start.bat
  echo ============================================================
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Первый запуск: ставлю движок, это 2-3 минуты... я подожду, не закрывай окошко ♡
  call npm install
  if errorlevel 1 (
    echo npm install не сработал — пришли мне скриншот этого окна.
    pause
    exit /b 1
  )
)

echo Запускаю sp ♡
call npm start

echo.
echo Если окно sp не открылось — сделай скриншот этого окна и пришли мне ♡
pause
