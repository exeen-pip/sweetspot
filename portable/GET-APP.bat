@echo off
setlocal
cd /d "%~dp0"

if not exist sp-portable-win-x64.zip.part00 goto err
if not exist sp-portable-win-x64.zip.part01 goto err

echo Assembling the archive...
copy /b /y sp-portable-win-x64.zip.part00+sp-portable-win-x64.zip.part01 sp-portable-win-x64.zip >nul
if errorlevel 1 goto err

echo Unpacking, 30-60 seconds...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Force -LiteralPath 'sp-portable-win-x64.zip' -DestinationPath 'sp-app'"
if errorlevel 1 goto err

echo Done. Starting sp...
start "" "sp-app\sp.exe"

del /q sp-portable-win-x64.zip.part00 sp-portable-win-x64.zip.part01 sp-portable-win-x64.zip
echo ...and part files cleaned up. From now on just run sp-app\sp.exe
exit /b 0

:err
echo Something went wrong - send me a screenshot of this window.
pause
exit /b 1
