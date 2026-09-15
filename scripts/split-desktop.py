from pathlib import Path
import re
A=Path('E:/project/Arrodes/Arrodes');B=Path('E:/project/ArrodesButler')
original=(A/'desktop/main.ts').read_text(encoding='utf-8')
main=original[:original.index('function getUiUrl(')]
main=main.replace("const PORT = Number(process.env.ARRODES_PORT || 3002);", "const PORT = Number(process.env.ARRODES_PORT || 3002);\napp.setName('arrodes');\napp.setAppUserModelId('com.arrodes.desktop');\napp.setPath('userData', resolve(app.getPath('appData'), 'arrodes'));\n")
main=main.replace("  butlerStatusUrl = `${uiUrl.origin}/api/v1/butler/status`;\n",'')
main=main.replace("      preload: join(__dirname, 'butlerPreload.cjs'),\n",'')
main=main.replace("    : resolve(serverDir, 'data');", "    : app.isPackaged ? resolve(app.getPath('userData'), 'data') : resolve(serverDir, 'data');")
main=main.replace("      DB_PATH: dbPath,", "      DB_PATH: dbPath,\n      TTS_OUTPUT_DIR: resolve(dbPath, 'tts-output'),\n      COSYVOICE3_PORT: '12003',\n      COSYVOICE3_SIDECAR_URL: 'http://127.0.0.1:12003',")
gateway=original[original.index('const GATEWAY_CLI ='):original.index('function startVisionSidecar()')]
main+='\nlet gatewayProc: ChildProcess | null = null;\nconst dlog = (msg: string) => console.log(`[Desktop] ${msg}`);\n'+gateway
main+='''
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { mainWindow?.show(); mainWindow?.focus(); });
  app.whenReady().then(async () => {
    try {
      await ensureGateway();
      await startBackend();
      if (!process.argv.includes('--smoke-test')) await createWindow();
      console.log('[Desktop] READY arrodes');
    } catch (error) {
      console.error('[Desktop] STARTUP FAILED', error);
      quitting = true;
      backendProc?.kill();
      if (!process.argv.includes('--smoke-test')) dialog.showErrorBox('阿罗德斯启动失败', String(error));
      app.exit(1);
    }
  });
}
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { quitting = true; backendProc?.kill(); });
'''
(A/'desktop/main.ts').write_text(main,encoding='utf-8')

pet=original.replace('desktopCapturer' ,'desktopCapturer')
pet=pet.replace('session, screen }', 'session, screen, desktopCapturer }')
pet=pet.replace("const PORT = Number(process.env.ARRODES_PORT || 3002);", "const PORT = Number(process.env.ARRODES_PORT || 3003);\napp.setName('arrodes-butler');\napp.setAppUserModelId('com.arrodes.butler');\napp.setPath('userData', resolve(app.getPath('appData'), 'arrodes-butler'));\nconst APP_ROOT = app.isPackaged ? process.resourcesPath : resolve(__dirname, '../..');")
pet=pet.replace("    : resolve(serverDir, 'data');", "    : app.isPackaged ? resolve(app.getPath('userData'), 'data') : resolve(serverDir, 'data');")
pet=pet.replace("      DB_PATH: dbPath,", "      DB_PATH: dbPath,\n      ARRODES_REPO_ROOT: APP_ROOT,\n      BUTLER_PYTHON: process.env.BUTLER_PYTHON || resolve(APP_ROOT, 'vision-sidecar/.venv/Scripts/python.exe'),\n      BUTLER_SIDECAR_URL: 'http://127.0.0.1:12012',\n      COSYVOICE3_PORT: '12013',\n      COSYVOICE3_SIDECAR_URL: 'http://127.0.0.1:12013',\n      TTS_OUTPUT_DIR: resolve(dbPath, 'tts-output'),")
pet=pet.replace("const PET_ONLY = process.argv.includes('--pet');", "const PET_ONLY = true;")
pet=pet.replace("join(homedir(), '.arrodes-desktop.log')", "join(app.getPath('userData'), 'desktop.log')")
pet=pet.replace("join(__dirname, '../vision-sidecar/.venv/Scripts/python.exe')", "join(APP_ROOT, 'vision-sidecar/.venv/Scripts/python.exe')")
pet=pet.replace("join(__dirname, '../vision-sidecar/qwen_vl_sidecar.py')", "join(APP_ROOT, 'vision-sidecar/qwen_vl_sidecar.py')")
pet=pet.replace("spawn(python, ['-u', script],", "spawn(python, ['-u', script, '--port', '12012'],")
pet=pet.replace("  butlerWindow.on('closed', () => { butlerWindow = null; });", "  butlerWindow.on('close', (event) => { if (!quitting) { event.preventDefault(); butlerWindow?.hide(); } });\n  butlerWindow.on('closed', () => { butlerWindow = null; });")
# Console preload gives the user a way to re-open the pet after closing it.
pet=pet.replace("title: '管家控制台',", "title: '阿罗德斯管家',")
needle="      sandbox: true,\n    },\n  });\n  butlerWindow.on"
pet=pet.replace(needle,"      sandbox: true,\n      backgroundThrottling: false,\n      preload: join(__dirname, 'butlerPreload.cjs'),\n    },\n  });\n  butlerWindow.on")
start=pet.index("    await ensureGateway();")
end=pet.index("  } catch (err) {",start)
pet=pet[:start]+'''    await startBackend();
    // Explicit screen sharing belongs to this application's console, never the original App.
    session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
      try {
        const sources = await desktopCapturer.getSources({ types: ['screen'] });
        const source = sources[0];
        callback(source ? { video: source } : {});
      } catch { callback({}); }
    });
    if (!process.argv.includes('--smoke-test')) {
      if (!(await isPortInUse(12012))) startVisionSidecar();
      await createButlerWindow();
      await createPetWindow();
    }
    console.log('[Desktop] READY arrodes-butler');
'''+pet[end:]
pet=pet.replace("    if (!mainWindow && !PET_ONLY) void createWindow();", "    if (!butlerWindow) void createButlerWindow(); else butlerWindow.show();")
# Remove unrelated main window and gateway implementations, not just startup switches.
s=pet.index('async function createWindow()');e=pet.index('function getUiUrl(',s);pet=pet[:s]+pet[e:]
s=pet.index('const GATEWAY_CLI =');e=pet.index('function startVisionSidecar()',s);pet=pet[:s]+pet[e:]
# Do not open a console before credentials are ready.
pet=pet.replace("      if (process.env.ARRODES_OPEN_BUTLER === '1') {\n        void createButlerWindow();\n      }\n",'')
(B/'desktop/main.ts').write_text(pet,encoding='utf-8')

# Legacy richer activity console is retained, but may only launch this project.
p=B/'butler-app/main.cjs';s=p.read_text(encoding='utf-8')
s=s.replace("const { spawn, execSync }", "const { spawn, execSync }")
s=s.replace("const APP_ROOT = __dirname;", "app.setName('arrodes-butler-console');\napp.setPath('userData', require('path').join(app.getPath('appData'), 'arrodes-butler-console'));\nconst APP_ROOT = __dirname;")
s=re.sub(r"const ENGINE_PY = .*?;", "const ENGINE_PY = process.env.BUTLER_PYTHON || path.join(ARRODES_ROOT, 'vision-sidecar', '.venv', 'Scripts', 'python.exe');",s,count=1)
s=s.replace('12002','12012').replace('isPortInUse(3002)','isPortInUse(3003)')
s=s.replace("const DATA_DIR = 'E:\\\\project\\\\HermesProject\\\\Obsidian\\\\TheFool';", "const DATA_DIR = process.env.BUTLER_DATA_DIR || 'E:\\\\project\\\\HermesProject\\\\Obsidian\\\\TheFool';")
st=s.index('const PET_EXE_CANDIDATES =');en=s.index('// 形象存放目录',st)
s=s[:st]+"const PET_EXE_CANDIDATES = [path.join(ARRODES_ROOT, 'desktop', 'release', 'win-unpacked', '阿罗德斯管家.exe')];\n"+s[en:]
st=s.index('function findPetExe()');en=s.index('function isPortInUse(',st)
s=s[:st]+'''function findPetExe() {
  for (const p of PET_EXE_CANDIDATES) if (fs.existsSync(p)) return p;
  const electron = path.join(ARRODES_ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');
  return fs.existsSync(electron) ? electron : null;
}

'''+s[en:]
st=s.index('  // 单实例锁清场');en=s.index('  petProc = spawn',st);s=s[:st]+s[en:]
s=s.replace("petProc = spawn(exe, ['--pet'],", "petProc = spawn(exe, /electron\\.exe$/i.test(exe) ? [path.join(ARRODES_ROOT, 'desktop')] : [],")
s=s.replace('未找到桌宠程序（desktop/release-latest/win-unpacked/阿罗德斯.exe）','未找到本项目桌宠程序，请先运行构建')
p.write_text(s,encoding='utf-8')
print('Independent desktop lifecycle and console launcher applied')
