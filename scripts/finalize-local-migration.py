from pathlib import Path
import json, shutil, sqlite3
ROOT=Path('E:/project/Arrodes');A=ROOT/'Arrodes';B=Path('E:/project/ArrodesButler');BACKUP=ROOT/'.migration-backup/2026-09-10-split'
for root,appdir in [(ROOT,A),(B,B)]:
    vbs='''Option Explicit
Dim shell, fso, root, appDir, exe, args, env
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
appDir = APPDIR
exe = appDir & "\\node_modules\\electron\\dist\\electron.exe"
If Not fso.FileExists(exe) Or Not fso.FileExists(appDir & "\\desktop\\dist\\main.js") Then
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
shell.Run Chr(34) & exe & Chr(34) & " " & Chr(34) & appDir & "\\desktop" & Chr(34) & args, 0, False
'''.replace('appDir = APPDIR','appDir = root & "\\Arrodes"' if root==ROOT else 'appDir = root')
    (root/'start.vbs').write_text(vbs,encoding='ascii')
    (root/'start.cmd').write_text('@echo off\r\nwscript.exe "%~dp0start.vbs" %*\r\n',encoding='ascii')
    (root/'build.cmd').write_text('@echo off\r\ncd /d "%~dp0'+('Arrodes' if root==ROOT else '')+'"\r\ncall npm --prefix desktop run build:assets\r\nif errorlevel 1 exit /b 1\r\ncall npm --prefix desktop run build\r\n',encoding='ascii')
    p=root/'.gitignore';s=p.read_text(encoding='utf-8');s+='\n.retired*/\n';p.write_text(s,encoding='utf-8')
# Fix the old engine command so it uses the independently installed venv.
(B/'butler/start-butler.cmd').write_text('@echo off\r\n"%~dp0..\\vision-sidecar\\.venv\\Scripts\\python.exe" "%~dp0butler.py" %*\r\n',encoding='ascii')
# Preserve richer query/edit console as a separate optional entry within Butler only.
(B/'console.cmd').write_text('@echo off\r\nset "NODE_OPTIONS="\r\nset "ELECTRON_RUN_AS_NODE="\r\nstart "" "%~dp0node_modules\\electron\\dist\\electron.exe" "%~dp0butler-app"\r\n',encoding='ascii')
# Redirect existing desktop launchers after preserving their exact bytes.
desktop=Path('D:/Desktop');backup=BACKUP/'desktop-launchers';backup.mkdir(exist_ok=True)
for name in ['阿罗德斯管家.cmd','阿罗德斯桌宠.cmd','阿罗德斯迁移收尾.cmd','阿罗德斯.cmd']:
    p=desktop/name
    if p.exists():shutil.copy2(p,backup/name)
    if name=='阿罗德斯迁移收尾.cmd':
        p.write_text('@echo off\r\nstart "" "E:\\project\\Arrodes\\MIGRATION.md"\r\n',encoding='ascii')
    else:
        target=ROOT if name=='阿罗德斯.cmd' else B
        extra=' --pet' if name=='阿罗德斯桌宠.cmd' else ''
        p.write_text('@echo off\r\nwscript.exe "'+str(target).replace('/','\\')+'\\start.vbs"'+extra+'\r\n',encoding='ascii')
# Track independently, without a copied git directory or remote.
(B/'ORIGIN.md').write_text('源自 E:/project/Arrodes 当前工作区（HEAD f0a2190 加未提交变更），于 2026-09-10 拆分。\n代码及依赖为独立副本，不通过链接复用主项目。原始快照位于主项目 .migration-backup/2026-09-10-split。\n',encoding='utf-8')
print('Launchers updated with backups; no historical screenshots removed')
