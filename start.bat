@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo первый раз: ставим движок, это пару минут...
  call npm install
)
call npm start
