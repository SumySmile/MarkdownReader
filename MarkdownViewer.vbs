Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

projectDir = fso.GetParentFolderName(WScript.ScriptFullName)
releaseExe = fso.BuildPath(projectDir, "src-tauri\\target\\release\\markdown-reader.exe")
launchArg = ""
If WScript.Arguments.Count > 0 Then
  launchArg = WScript.Arguments(0)
End If

' Debug mode: always rebuild and run latest code.
'If fso.FileExists(releaseExe) Then
'  shell.Run """" & releaseExe & """", 0, False
'  WScript.Quit 0
'End If

projectDirEscaped = Replace(projectDir, "'", "''")
releaseExeEscaped = Replace(releaseExe, "'", "''")
If launchArg <> "" Then
  launchArgEscaped = Replace(launchArg, "'", "''")
  ps = "Set-Location -LiteralPath '" & projectDirEscaped & "'; npm run tauri build; if (Test-Path -LiteralPath '" & releaseExeEscaped & "') { Start-Process -FilePath '" & releaseExeEscaped & "' -ArgumentList @('" & launchArgEscaped & "') }"
Else
  ps = "Set-Location -LiteralPath '" & projectDirEscaped & "'; npm run tauri build; if (Test-Path -LiteralPath '" & releaseExeEscaped & "') { Start-Process -FilePath '" & releaseExeEscaped & "' }"
End If
cmd = "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command """ & ps & """"
shell.Run cmd, 0, False
