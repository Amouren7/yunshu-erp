@echo off
setlocal EnableExtensions
chcp 65001 >nul 2>nul
title Yunshu ERP - Enterprise Resource Planning
cd /d "%~dp0"
echo.
echo  ==================================================
echo    Yunshu ERP  -  starting, please wait ...
echo  ==================================================
echo.
where node >nul 2>nul
if errorlevel 1 goto NO_NODE

node scripts\boot.mjs
set "ERP_EXIT=%ERRORLEVEL%"

echo.
if not "%ERP_EXIT%"=="0" (
  echo  [ERROR] ERP exited with code %ERP_EXIT%.
  echo  [TIP]  Copy the messages above when asking for support.
  echo         Startup log: logs\boot.log
) else (
  echo  [OK] ERP stopped normally.
)
echo.
echo  Press any key to close this window.
pause >nul
exit /b %ERP_EXIT%

:NO_NODE
echo.
echo  [ERROR] Node.js was not found in PATH.
echo  [TIP]  Install Node.js 22.5 or newer from https://nodejs.org/
echo         then double-click this file again.
echo.
echo  Press any key to close this window.
pause >nul
exit /b 1
