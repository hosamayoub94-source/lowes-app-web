@echo off
title Lowes App - Dev Server
cd /d "%~dp0"
echo.
echo  ==========================================
echo   Lowes Professional App - Dev Server
echo  ==========================================
echo.
echo  Starting Vite on http://localhost:5173 ...
echo  Press Ctrl+C to stop the server.
echo.
npm run dev
pause
