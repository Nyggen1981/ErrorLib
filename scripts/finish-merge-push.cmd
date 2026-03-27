@echo off
setlocal
REM Vanlig CMD (ikke Cursor). Fullfor merge + push.
cd /d "D:\Cursor Prosjekter\ErrorLib"

git restore --staged list-modules.bat modul-analyse.txt 2>nul
del /f /q list-modules.bat modul-analyse.txt 2>nul

git add -A
git restore --staged list-modules.bat modul-analyse.txt 2>nul

git status
git commit -m "Merge origin/main"
if errorlevel 1 (
  echo commit feilet
  pause
  exit /b 1
)
git push origin main
if errorlevel 1 (
  echo push feilet
  pause
  exit /b 1
)
echo OK
pause
