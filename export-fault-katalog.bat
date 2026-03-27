@echo off
setlocal
cd /d "%~dp0"

set "OUT=%~dp0fault-katalog.txt"

echo Eksporterer katalog til:
echo   %OUT%
echo.

call npx tsx scripts/export-catalog.ts "%OUT%"
set "ERR=%ERRORLEVEL%"

if not "%ERR%"=="0" (
  echo.
  echo Feilet med kode %ERR%.
  pause
  exit /b %ERR%
)

echo.
echo Ferdig. Apne filen i Notepad med:
echo   notepad "%OUT%"
echo.
pause
endlocal
