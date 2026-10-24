const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function api() {
  const source = fs.readFileSync(path.join(__dirname, '../src/feedState.ts'), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  new Function('exports', 'module', js)(module.exports, module);
  return module.exports;
}
const empty = () => ({ data: {}, updatedAt: {}, errors: {} });
test('successful refresh records per-stop timestamp', () => {
  const a = api();
  assert.deepEqual(a.mergeFeedResults(empty(), [{ id: 'a', data: { buses: [] } }], 100), { data: { a: { buses: [] } }, updatedAt: { a: 100 }, errors: {} });
});
test('failure preserves previous data and timestamp, marks error', () => {
  const a = api(); const old = a.mergeFeedResults(empty(), [{ id: 'a', data: { buses: [1] } }], 100);
  const next = a.mergeFeedResults(old, [{ id: 'a', data: null }], 200);
  assert.deepEqual(next.data, old.data); assert.deepEqual(next.updatedAt, old.updatedAt);
  assert.equal(next.errors.a, true); assert.equal(a.isFeedStale(next, 'a', 200), true);
  assert.deepEqual(old.errors, {});
});
test('partial success updates only successful stop', () => {
  const a = api(); const old = a.mergeFeedResults(empty(), [{ id: 'a', data: 1 }, { id: 'b', data: 2 }], 100);
  const next = a.mergeFeedResults(old, [{ id: 'a', data: null }, { id: 'b', data: 3 }], 200);
  assert.deepEqual(next.updatedAt, { a: 100, b: 200 }); assert.deepEqual(next.data, { a: 1, b: 3 });
});
test('retry success clears error without touching other stops', () => {
  const a = api(); const old = a.mergeFeedResults(empty(), [{ id: 'a', data: null }, { id: 'b', data: null }], 100);
  const next = a.mergeFeedResults(old, [{ id: 'a', data: 1 }], 200);
  assert.deepEqual(next.errors, { b: true });
});
test('view isolation and stale-action protections remain wired', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/App.tsx'), 'utf8');
  assert.ok(source.includes("viewMode === 'board' && (loading ?"));
  assert.ok(source.includes('stale ? null : getDepartureGuidance'));
  assert.ok(source.includes('isFeedStale(feed, fromStopCode, clock)'));
  assert.ok(source.includes('AbortSignal.timeout(12000)'));
  assert.ok(!source.includes('setData(newData)'));
});

test('missing and aged data are stale; fresh data is not', () => {
  const a = api(); const state = a.mergeFeedResults(empty(), [{ id: 'a', data: 1 }], 100);
  assert.equal(a.isFeedStale(state, 'b', 100), true);
  assert.equal(a.isFeedStale(state, 'a', 100 + a.STALE_AFTER_MS - 1), false);
  assert.equal(a.isFeedStale(state, 'a', 100 + a.STALE_AFTER_MS), true);
});
