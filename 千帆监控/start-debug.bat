@echo off
chcp 65001 >nul
title xhs-monitor-debug
powershell -ExecutionPolicy Bypass -File "%~dp0xhs-monitor.ps1" -Secret "6a4ed2e81e021223b83b93a9a793497a" -Debug
echo.
echo stopped. press any key to close...
pause >nul
