@echo off
chcp 65001 >nul
echo.
echo ===================================
echo   LOWES - Applying pending DB fixes
echo ===================================
echo.
cd /d "%~dp0\.."
node scripts\apply-pending-fixes.cjs
echo.
pause
