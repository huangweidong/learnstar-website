@echo off
chcp 65001 >nul
title xhs-test
powershell -ExecutionPolicy Bypass -File "%~dp0xhs-monitor.ps1" -Secret "6a4ed2e81e021223b83b93a9a793497a" -Test
echo.
echo press any key to close...
pause >nul
