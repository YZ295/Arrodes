"""One-time local migration, kept as an audit record. Do not rerun on live projects."""
from pathlib import Path
import json, re, shutil, sqlite3, os

ROOT = Path('E:/project/Arrodes')
A = ROOT / 'Arrodes'
B = Path('E:/project/ArrodesButler')
BACKUP = ROOT / '.migration-backup/2026-09-10-split'

def edit(root, file, old, new):
    p=root/file
    text=p.read_text(encoding='utf-8-sig')
    if old not in text: raise RuntimeError(f'Expected text missing: {p}: {old[:60]}')
    p.write_text(text.replace(old,new),encoding='utf-8')

def put(root,file,text):
    p=root/file;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text,encoding='utf-8')

def package(root,file,fn):
    p=root/file;obj=json.loads(p.read_text(encoding='utf-8-sig'));fn(obj);put(root,file,json.dumps(obj,ensure_ascii=False,indent=2)+'\n')

# Consistent SQLite backup includes committed WAL; source is never replaced.
for name,src in [('main',A/'server/data'),('packaged',A/'desktop/release3-pet28/win-unpacked/resources/server/data')]:
    if not src.exists(): continue
    dest=BACKUP/('data-'+name)
    dest.mkdir(parents=True,exist_ok=True)
    for f in src.iterdir():
        if f.is_file() and not f.name.startswith('arrodes.db'):shutil.copy2(f,dest/f.name)
    db=src/'arrodes.db'
    if db.exists():
        with sqlite3.connect(db.as_uri()+'?mode=ro',uri=True) as source, sqlite3.connect(dest/'arrodes.db') as target:source.backup(target)

# Initial independent history snapshot; neither project reads the other's DB afterwards.
shutil.copytree(A/'server/data',B/'server/data',ignore=shutil.ignore_patterns('arrodes.db*','tts'),dirs_exist_ok=True)
shutil.copy2(BACKUP/'data-main/arrodes.db',B/'server/data/arrodes.db')

# Credentials remain local, independently editable. Exclude old runtime/location overrides.
private=Path.home()/'.arrodes/.env'
if private.exists():
    shutil.copy2(private,BACKUP/'private-env.before')
    lines=[line for line in private.read_text(encoding='utf-8-sig').splitlines() if not re.match(r'\s*(PORT|NODE_ENV|DB_PATH|EXTRA_ENV_PATH)\s*=',line)]
    private.write_text('\n'.join(lines)+'\n',encoding='utf-8')
    target=Path.home()/'.arrodes-butler/.env'
    target.parent.mkdir(parents=True,exist_ok=True)
    if target.exists():raise RuntimeError('Butler private config exists; do not overwrite')
    target.write_text('\n'.join(lines)+'\n',encoding='utf-8')

for root, identity, port, ttsport in [(A,'arrodes',3002,12003),(B,'arrodes-butler',3003,12013)]:
    # No inherited cwd-dependent persistent files, and no shared mutable credential file.
    edit(root,'server/src/config.ts',"resolve(homedir(), '.arrodes/.env')",f"resolve(homedir(), '.{identity}/.env')") if identity!='arrodes' else None
    edit(root,'server/src/config.ts',"port: parseInt(process.env.PORT || '3002', 10),",f"appId: '{identity}',\n  port: parseInt(process.env.PORT || '{port}', 10),")
    edit(root,'server/src/config.ts',"dbPath: process.env.DB_PATH || './data',","dbPath: resolve(process.env.DB_PATH || resolve(__dirname, '../data')),")
    edit(root,'server/src/index.ts',"res.json({ status: 'ok', version: '0.1.0' });","res.json({ status: 'ok', appId: config.appId, version: '0.1.0' });")
    edit(root,'server/src/services/cosyVoiceProxy.ts',"process.env.COSYVOICE3_PORT || 12003",f"process.env.COSYVOICE3_PORT || {ttsport}")
    edit(root,'server/src/services/MemoryGateway.ts',"const PROFILE_DIR = './data';","const PROFILE_DIR = config.dbPath;")
    p=root/'server/src/services/MemoryGateway.ts';p.write_text("import { config } from '../config.js';\n"+p.read_text(encoding='utf-8'),encoding='utf-8')
    changes={
      'services/skillMode.ts':("join(resolve(__dirname, '../data'), 'skill-mode.json')","join(config.dbPath, 'skill-mode.json')"),
      'services/modelRegistry.ts':("join(resolve(__dirname, '../data'), 'custom-models.json')","join(config.dbPath, 'custom-models.json')"),
      'services/promptShell.ts':("join(resolve(__dirname, '../data/prompt-shell'), 'shell.json')","join(config.dbPath, 'prompt-shell', 'shell.json')"),
      'services/customAgents.ts':("resolve(process.cwd(), 'data', 'custom-agents.json')","resolve(config.dbPath, 'custom-agents.json')"),
      'services/skillProfile.ts':("resolve(process.cwd(), 'data', 'skill-profiles.json')","resolve(config.dbPath, 'skill-profiles.json')"),
      'skills/reminder.ts':("resolve(__dirname, '../data/reminders.json')","resolve(config.dbPath, 'reminders.json')"),
      'skills/knowledge.ts':("resolve(__dirname, '../data/knowledge.json')","resolve(config.dbPath, 'knowledge.json')"),
      'skills/utility.ts':("path.resolve('./data/tts')","path.resolve(config.dbPath, 'tts')"),
    }
    for file,(old,new) in changes.items():
        p=root/'server/src'/file;txt=p.read_text(encoding='utf-8')
        if old not in txt:raise RuntimeError(f'path missing {file}')
        txt=txt.replace(old,new)
        if "import { config }" not in txt:txt="import { config } from '../config.js';\n"+txt
        p.write_text(txt,encoding='utf-8')
    edit(root,'server/src/workspace/connectors.ts',"'E:/project/Crow5/Arrodes/.workbuddy'","resolve(process.cwd(), '../../.workbuddy')" if root==A else "resolve(process.cwd(), '../.workbuddy')")
    # connectors already imports path? add named resolver independently.
    p=root/'server/src/workspace/connectors.ts';txt=p.read_text(encoding='utf-8')
    if not re.search(r'import\s*\{[^}]*\bresolve\b[^}]*\}\s*from\s*[\'"](?:node:)?path',txt):txt="import { resolve } from 'node:path';\n"+txt
    p.write_text(txt,encoding='utf-8')
    env=root/'server/.env'
    txt=env.read_text(encoding='utf-8-sig')
    txt=re.sub(r'^\s*DB_PATH=.*$', '# DB_PATH defaults to this project server/data',txt,flags=re.M)
    txt=txt.replace('E:\\project\\Crow5\\Arrodes','E:\\project\\Arrodes').replace('E:/project/Crow5/Arrodes','E:/project/Arrodes')
    txt=re.sub(r'^\s*PORT=.*$',f'PORT={port}',txt,flags=re.M)
    if root==B:txt+='\nBUTLER_SIDECAR_URL=http://127.0.0.1:12012\nCOSYVOICE3_PORT=12013\n'
    env.write_text(txt,encoding='utf-8')
    edit(root,'client/src/components/WorkspacePanel.tsx','E:/project/Crow5/Arrodes',str(ROOT if root==A else B))
    edit(root,'client/vite.config.ts',"port: 5173",f"port: {5173 if root==A else 5174},\n    strictPort: true")
    if root==B:
        edit(root,'client/vite.config.ts','localhost:3002','localhost:3003')
        edit(root,'server/src/services/repoRoot.ts',"resolve(process.cwd(), '..', '..')","resolve(process.cwd(), '..')")
        edit(root,'server/src/services/workspaceProjectDir.ts',"resolve(process.cwd(), '..', '..')","resolve(process.cwd(), '..')")
    package(root,'desktop/tsconfig.json',lambda x:x.update(include=['*.ts','*.cts']))
    # Model assets stay read-only external; generated audio belongs to each data root.
    edit(root,'tts-sidecar/tts_sidecar.py', 'OUTPUT_DIR = Path(__file__).resolve().parent / "output"', 'OUTPUT_DIR = Path(os.environ.get("TTS_OUTPUT_DIR", str(Path(__file__).resolve().parent / "output")))')
    edit(root,'tts-sidecar/tts_sidecar.py','OUTPUT_DIR.mkdir(exist_ok=True)','OUTPUT_DIR.mkdir(parents=True, exist_ok=True)')

# Main application has no live access to the collector or pet controllers.
p=A/'server/src/index.ts';txt=p.read_text(encoding='utf-8')
txt='\n'.join(line for line in txt.splitlines() if not any(s in line for s in ["import { createButlerRouter", "import { createButlerAvatarRouter", "import { butlerService", "app.use('/api/v1/butler", "import { createPetRouter", "app.use('/api/v1/pet'"]))+'\n';p.write_text(txt,encoding='utf-8')
put(A,'client/src/main.tsx',"import ReactDOM from 'react-dom/client';\nimport App from './App';\nimport './index.css';\nReactDOM.createRoot(document.getElementById('root')!).render(<App />);\n")
p=A/'client/src/App.tsx';txt=p.read_text(encoding='utf-8')
txt='\n'.join(line for line in txt.splitlines() if not any(s in line for s in ['from \'./desktop-pet/desktopPetBridge\'',"import { setObservationExclusion"]))+'\n'
start=txt.index('  // 桌宠右键菜单');end=txt.index('  const wake =',start);txt=txt[:start]+txt[end:];p.write_text(txt,encoding='utf-8')
p=A/'client/src/components/Sidebar.tsx';txt=p.read_text(encoding='utf-8');txt='\n'.join(line for line in txt.splitlines() if not ("{ id: 'butler'" in line or "{ id: 'pet'" in line))+'\n';p.write_text(txt,encoding='utf-8')
p=A/'client/src/components/PanelView.tsx';txt=p.read_text(encoding='utf-8');txt='\n'.join(line for line in txt.splitlines() if not any(s in line for s in ['import ButlerPanel','import ButlerPetPanel',"{view === 'butler' &&", "{view === 'pet' &&"]))+'\n';p.write_text(txt,encoding='utf-8')

# The Butler snapshot has its own project identity and no need to boot the original App.
def butler_pkg(x):
    x['name']='arrodes-butler-desktop';x['description']='阿罗德斯管家：独立桌宠与活动记录';x['build']['appId']='com.arrodes.butler';x['build']['productName']='阿罗德斯管家';x['build']['win']['artifactName']='ArrodesButler-Setup-${version}.${ext}';x['build']['nsis']['shortcutName']='阿罗德斯管家';x['build']['directories']['output']='release';x['build']['extraResources'].append({'from':'../butler','to':'butler','filter':['butler.py','README.md']});x['build']['extraResources'].append({'from':'../shared','to':'shared','filter':['types/**','package.json']})
package(B,'desktop/package.json',butler_pkg)
package(A,'desktop/package.json',lambda x:x['build']['extraResources'].append({'from':'../shared','to':'shared','filter':['types/**','package.json']}))
put(B,'package.json',json.dumps({'name':'arrodes-butler','version':'1.0.0','private':True,'scripts':{'build':'npm --prefix desktop run build:assets && npm --prefix desktop run build','start':'npm --prefix desktop start','console':'electron butler-app','test':'npm --prefix server test && npm --prefix client test'},'devDependencies':{'electron':'^43.2.0'}},indent=2)+'\n')
edit(B,'server/src/services/butlerService.ts',"'http://127.0.0.1:12002'","'http://127.0.0.1:12012'")
edit(B,'butler/butler.py','http://127.0.0.1:12002','http://127.0.0.1:12012')
edit(B,'vision-sidecar/qwen_vl_sidecar.py','default=12002','default=12012')

print('Source and data snapshot migration applied')
