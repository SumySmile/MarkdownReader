@echo off
cd /d "%~dp0"
echo [QuickStart] Starting markdown-reader in dev mode...
powershell -NoProfile -ExecutionPolicy Bypass -Command "npm run tauri dev"
