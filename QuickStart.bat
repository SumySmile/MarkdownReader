@echo off
cd /d "%~dp0"
start "" wscript.exe "%~dp0MarkdownViewer.vbs"
exit /b 0
