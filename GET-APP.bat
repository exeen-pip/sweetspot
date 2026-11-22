@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
echo --------------------------------------------
echo  sp setup - do not close this window
echo --------------------------------------------

if not exist sp.zip.part00 goto miss
if not exist sp.zip.part01 goto miss

for %%F in (sp.zip.part00) do set S0=%%~zF
for %%F in (sp.zip.part01) do set S1=%%~zF
echo part00 size: !S0!  (need 62914560)
echo part01 size: !S1!  (need 52206760)
if not "!S0!"=="62914560" goto badsize
if not "!S1!"=="52206760" goto badsize

rem close sp if it is still running (it locks the folder)
taskkill /f /im sp.exe >nul 2>nul
timeout /t 1 >nul

echo gluing parts together...
copy /b /y sp.zip.part00+sp.zip.part01 sp.zip >nul
if errorlevel 1 goto err

echo unpacking (30-60 sec)...
if exist sp-app rmdir /s /q sp-app
mkdir sp-app 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Expand-Archive -Force -LiteralPath 'sp.zip' -DestinationPath 'sp-app'; exit 0 } catch { Write-Host $_.Exception.Message; exit 1 }"
if errorlevel 1 (
  echo trying second method (tar)...
  tar -xf sp.zip -C sp-app
  if errorlevel 1 goto err
)
if not exist sp-app\sp.exe goto err

echo done! starting sp...
del /q sp.zip.part00 sp.zip.part01 sp.zip >nul 2>nul
start "" "sp-app\sp.exe"
exit /b 0

:miss
echo I do not see both part files in this folder.
echo Files in this folder:
dir /b
echo.
echo Download GET-APP.bat, sp.zip.part00 and sp.zip.part01 from:
echo https://github.com/exeen-pip/sweetspot
goto end

:badsize
echo A part is not fully downloaded - browser cut it off.
echo Delete BOTH part files and download them again.
goto end

:err
echo Something went wrong. Send me a screenshot of this whole window.
:end
echo.
pause
exit /b 1
