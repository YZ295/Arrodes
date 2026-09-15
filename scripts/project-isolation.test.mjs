import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const main = path.join(root, 'Agent');
const butler = process.env.BUTLER_PROJECT_ROOT || path.join(root, 'Butler');
const read = (base, file) => readFileSync(path.join(base, file), 'utf8');

test('main no longer exposes Butler process control routes', () => {
  const entry = read(main, 'server/src/index.ts');
  assert.doesNotMatch(entry, /app\.use\('\/api\/v1\/butler/);
});
test('main launch has no pet or collector lifecycle', () => {
  const entry = read(main, 'desktop/main.ts');
  assert.doesNotMatch(entry, /await createPetWindow\(|startVisionSidecar\(\);/);
});
test('relocated config does not address the old project', () => {
  assert.doesNotMatch(read(main, 'server/.env'), /Crow5[\\/]Arrodes/i);
});
test('independent butler project exists with distinct installation identity', () => {
  assert.ok(existsSync(path.join(butler, 'desktop/package.json')), 'standalone project missing');
  const a = JSON.parse(read(main, 'desktop/package.json'));
  const b = JSON.parse(read(butler, 'desktop/package.json'));
  assert.notEqual(a.build.appId, b.build.appId);
  assert.notEqual(a.build.productName, b.build.productName);
});
test('Butler console cannot kill another app by executable name', () => {
  const base = existsSync(path.join(butler, 'butler-app/main.cjs')) ? butler : main;
  assert.doesNotMatch(read(base, 'butler-app/main.cjs'), /taskkill\s+\/IM/i);
});
