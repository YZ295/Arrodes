import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createServer } from 'node:net';

const base = mkdtempSync(path.join(tmpdir(), 'arrodes-isolation-'));
const roots = [path.resolve('Agent'), path.resolve('Butler')];
const ids = ['arrodes','arrodes-butler'];
const tokens = ids.map((id) => `${id}-${crypto.randomUUID()}-${crypto.randomUUID()}`);
const children = [];
const logs = [[],[]];
async function freePort() { const s=createServer(); s.listen(0,'127.0.0.1'); await once(s,'listening'); const p=s.address().port; await new Promise(r=>s.close(r)); return p; }
const ports = [await freePort(),await freePort()];
const url = (i,p) => `http://127.0.0.1:${ports[i]}${p}`;
async function api(i,p,init={}) { return fetch(url(i,p), {...init, headers:{'x-arrodes-local-token':tokens[i], 'Content-Type':'application/json',...init.headers}, signal:AbortSignal.timeout(3000)}); }
async function boot(i) {
  const data=path.join(base,ids[i]); mkdirSync(data,{recursive:true});
  const proc=spawn(process.execPath,[path.join(roots[i],'server/dist/index.js')],{
    cwd:path.join(roots[i],'server'),windowsHide:true,stdio:['ignore','pipe','pipe','ipc'],
    env:{...process.env,NODE_OPTIONS:'',PORT:String(ports[i]),DB_PATH:data,NODE_ENV:'production',ARRODES_LOCAL_TOKEN:tokens[i],ARRODES_UI_ORIGIN:`http://127.0.0.1:${ports[i]}`,BUTLER_DATA_DIR:path.join(base,'activities'),ARRODES_REPO_ROOT:roots[i]},
  });
  children[i]=proc;
  proc.stdout.on('data',d=>logs[i].push(d.toString()));proc.stderr.on('data',d=>logs[i].push(d.toString()));
  for(let n=0;n<100;n++) {
    if(proc.exitCode!==null) throw Error(`child ${i} exited: ${logs[i].join('').slice(-4000)}`);
    try { const r=await fetch(url(i,'/api/health')); if(r.ok){assert.equal((await r.json()).appId,ids[i]);return;} } catch(e) { if(e.code==='ERR_ASSERTION')throw e; }
    await new Promise(r=>setTimeout(r,100));
  }
  throw Error(`startup timeout ${i}: ${logs[i].join('').slice(-4000)}`);
}
async function stop(i) {
  const p=children[i];if(!p||p.exitCode!==null)return;
  p.send('shutdown');
  await Promise.race([once(p,'exit'),new Promise((_,reject)=>setTimeout(()=>reject(Error('shutdown timeout')),5000).unref())]);
}
try {
  await Promise.all([boot(0),boot(1)]);
  console.log('PASS both real backends start independently');
  for(const i of [0,1]) {
    assert.equal((await api(i,'/api/v1/sessions',{headers:{'x-arrodes-local-token':tokens[1-i]}})).status,401);
    assert.equal((await api(i,'/api/v1/sessions',{headers:{Origin:`http://127.0.0.1:${ports[1-i]}`}})).status,403);
  }
  console.log('PASS cross-project credentials and origins rejected');
  assert.equal((await api(0,'/api/v1/butler/status')).status,404);
  assert.equal((await api(1,'/api/v1/butler/status')).status,200);
  console.log('PASS collector controls are exclusive to Butler');
  const sessionIds=[];
  for(const i of [0,1]) {
    const r=await api(i,'/api/v1/sessions',{method:'POST',body:JSON.stringify({title:ids[i],topic:'other'})});
    assert.equal(r.status,201);sessionIds[i]=(await r.json()).id;
  }
  for(const i of [0,1]) { const r=await api(i,'/api/v1/sessions'); const sessions=(await r.json()).sessions;assert.equal(sessions.length,1);assert.equal(sessions[0].id,sessionIds[i]);assert.equal((await api(i,`/api/v1/sessions/${sessionIds[1-i]}`)).status,404); }
  console.log('PASS separate persistent sessions and databases');
  await stop(0); assert.equal((await api(1,'/api/v1/sessions')).status,200); await boot(0);
  assert.equal((await api(0,`/api/v1/sessions/${sessionIds[0]}`)).status,200);
  await stop(1); assert.equal((await api(0,'/api/v1/sessions')).status,200); await boot(1);
  assert.equal((await api(1,`/api/v1/sessions/${sessionIds[1]}`)).status,200);
  console.log('PASS stopping/restarting either app preserves the other and its own data');
} finally {
  await Promise.allSettled(children.map((_,i)=>stop(i)));
  for(const p of children)if(p?.exitCode===null)p.kill();
  logs.forEach((lines,i)=>writeFileSync(path.join(base,ids[i]+'.log'),lines.join('')));
  console.log('Evidence directory:',base);
}
