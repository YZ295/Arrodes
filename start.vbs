Option Explicit
Dim shell, fso, root, appDir, exe, args, env
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
appDir = root & "\Agent"
exe = appDir & "\node_modules\electron\dist\electron.exe"
If Not fso.FileExists(exe) Or Not fso.FileExists(appDir & "\desktop\dist\main.js") Then
  MsgBox "Build the project before starting: " & appDir, 16, "Arrodes"
  WScript.Quit 1
End If
Set env = shell.Environment("PROCESS")
env("NODE_OPTIONS") = ""
env.Remove "ELECTRON_RUN_AS_NODE"
shell.CurrentDirectory = appDir
args = ""
If WScript.Arguments.Count > 0 Then
  If WScript.Arguments(0) = "--pet" Then args = " --pet"
End If
shell.Run Chr(34) & exe & Chr(34) & " " & Chr(34) & appDir & "\desktop" & Chr(34) & args, 0, False
