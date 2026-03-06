@echo off
cd /d "%~dp0"
if "%~1"=="" (
  start "" wscript.exe "%~dp0MarkdownViewer.vbs"
) else (
  start "" wscript.exe "%~dp0MarkdownViewer.vbs" "%~1"
)
exit /b 0
