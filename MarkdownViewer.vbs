Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

projectDir = fso.GetParentFolderName(WScript.ScriptFullName)
releaseExe = fso.BuildPath(projectDir, "src-tauri\\target\\release\\markdown-reader.exe")

' Debug mode: always rebuild and run latest code.
'If fso.FileExists(releaseExe) Then
'  shell.Run """" & releaseExe & """", 0, False
'  WScript.Quit 0
'End If

projectDirEscaped = Replace(projectDir, "'", "''")
ps = "Set-Location -LiteralPath '" & projectDirEscaped & "'; npm run tauri build; if (Test-Path -LiteralPath '" & Replace(releaseExe, "'", "''") & "') { Start-Process -FilePath '" & Replace(releaseExe, "'", "''") & "' }"
cmd = "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command """ & ps & """"
shell.Run cmd, 0, False
