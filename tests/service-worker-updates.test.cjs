const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const swPath = path.join(__dirname, '../public/sw.js');
const swSource = fs.readFileSync(swPath, 'utf8');
const indexSource = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const viteConfig = fs.readFileSync(path.join(__dirname, '../vite.config.ts'), 'utf8');

test('cache names are stamped per deploy via a build-time placeholder', () => {
  assert.match(swSource, /tengah-bus-dashboard-v5-__DEPLOY_VERSION__/);
  assert.match(swSource, /tengah-bus-static-assets-v5-__DEPLOY_VERSION__/);
  assert.ok(!swSource.includes('v4'), 'hard-coded v4 cache names must be gone');
});

test('vite build replaces the deploy placeholder so every deploy bytes-diffs', () => {
  assert.match(viteConfig, /__DEPLOY_VERSION__/, 'vite plugin must rewrite the placeholder');
  assert.match(viteConfig, /VERCEL_GIT_COMMIT_SHA|buildStamp/, 'build stamp source must be defined');
});

test('activate keeps only current deploy caches and claims clients', async () => {
  const stored = new Map([
    ['tengah-bus-dashboard-v4', 1],
    ['tengah-bus-static-assets-v4', 2],
    ['tengah-bus-dashboard-v5-old', 3],
    ['unrelated-cache', 4],
  ]);
  const cachesMock = {
    keys: async () => [...stored.keys()],
    delete: async (key) => stored.delete(key),
  };
  const events = {};
  const self = {
    skipWaiting: () => {},
    clients: { claim: () => { self.claimed = true; } },
    addEventListener: (type, fn) => { events[type] = fn; },
    claimed: false,
  };
  const script = swSource.replace(/__DEPLOY_VERSION__/g, 'testdeploy');
  new Function('self', 'caches', script)(self, cachesMock);
  const waitQueue = [];
  events.activate({ waitUntil: p => waitQueue.push(p) });
  await Promise.all(waitQueue);
  assert.deepEqual([...stored.keys()], ['unrelated-cache'], 'all previous deploy caches must be purged');
  assert.equal(self.claimed, true, 'clients.claim must run');
});

test('registration checks for updates and reloads exactly once on takeover', () => {
  assert.match(indexSource, /reg\.update\(\)/, 'registration must poll for worker updates');
  assert.match(indexSource, /controllerchange/, 'page must reload when a new worker takes control');
  assert.match(indexSource, /sessionStorage/, 'reload must be guarded against loops');
  assert.match(indexSource, /SW_RELOADED/, 'explicit reload-once flag required');
});
