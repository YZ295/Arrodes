import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { once } from 'node:events';

const root=mkdtempSync(path.join(tmpdir(),'arrodes-desktop-isolation-'));
const projects=[path.resolve('Agent'),path.resolve('Butler')];
const ids=['arrodes','arrodes-butler'];
const children=[];const logs=[[],[]];
try {
  for(const i of [0,1]) {
    const exe=path.join(projects[i],'node_modules/electron/dist/electron.exe');
    const env={...process.env,NODE_OPTIONS:'',ARRODES_DB_PATH:path.join(root,ids[i],'data')};
    delete env.ELECTRON_RUN_AS_NODE;
    const p=spawn(exe,[path.join(projects[i],'desktop'),'--smoke-test'],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
    children.push(p);p.stdout.on('data',d=>logs[i].push(d.toString()));p.stderr.on('data',d=>logs[i].push(d.toString()));
  }
  for(let n=0;n<60;n++) {if(logs.every(l=>l.join('').includes('READY')))break;await new Promise(r=>setTimeout(r,200));}
  for(const i of [0,1])assert.ok(logs[i].join('').includes('READY '+ids[i]),logs[i].join('').slice(-2500));
  assert.equal((await (await fetch('http://localhost:3002/api/health')).json()).appId,ids[0]);
  assert.equal((await (await fetch('http://localhost:3003/api/health')).json()).appId,ids[1]);
  console.log('PASS two actual Electron applications started without single-instance collision');
  if(children[0].exitCode===null)await once(children[0],'exit');
  for(let n=0;n<20;n++){try{await fetch('http://localhost:3002/api/health');await new Promise(r=>setTimeout(r,100));}catch{break;}}
  assert.equal((await fetch('http://localhost:3003/api/health')).status,200);
  console.log('PASS main Electron quit leaves Butler backend alive');
  if(children[1].exitCode===null)await once(children[1],'exit');
  await new Promise(r=>setTimeout(r,500));
  for(const port of [3002,3003])await assert.rejects(fetch(`http://localhost:${port}/api/health`));
  console.log('PASS owned backends stop when each desktop quits');
} finally {
  children.forEach(p=>{if(p.exitCode===null)p.kill();});
  logs.forEach((l,i)=>writeFileSync(path.join(root,ids[i]+'.log'),l.join('')));
  console.log('Evidence directory:',root);
}
