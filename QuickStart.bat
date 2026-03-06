@echo off
cd /d "%~dp0"
echo [QuickStart] Starting markdown-reader in dev mode...
if "%~1"=="" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "npm run tauri dev"
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "npm run tauri dev -- ""%~1"""
)
