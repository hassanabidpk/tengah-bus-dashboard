const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
let guidance;
function load() {
  if (guidance) return guidance;
  const file = path.join(__dirname, '../src/departureGuidance.ts');
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  new Function('exports', 'module', compiled)(module.exports, module);
  return guidance = module.exports;
}

for (const [name, timings, walk, expected] of [
  ['skip bus arriving before walking time', [2, 12, 22], 5, { index: 1, arrivalMins: 12, leaveInMins: 6, status: 'plan' }],
  ['one-minute boarding buffer excludes exact walking time', [5, 6, 15], 5, { index: 1, arrivalMins: 6, leaveInMins: 0, status: 'leave-now' }],
  ['arriving bus is not catchable from home', ['Arr', 10], 3, { index: 1, arrivalMins: 10, leaveInMins: 6, status: 'plan' }],
  ['leave-now includes three-minute departure window', [9], 5, { index: 0, arrivalMins: 9, leaveInMins: 3, status: 'leave-now' }],
  ['outside departure window is plan', [10], 5, { index: 0, arrivalMins: 10, leaveInMins: 4, status: 'plan' }],
  ['no catchable arrivals', ['Arr', 1, 2], 5, null],
  ['empty arrivals', [], 5, null],
  ['invalid arrivals are ignored', [NaN, -1, Infinity, 12], 5, { index: 3, arrivalMins: 12, leaveInMins: 6, status: 'plan' }],
  ['zero-minute walk still requires boarding buffer', ['Arr', 1], 0, { index: 1, arrivalMins: 1, leaveInMins: 0, status: 'leave-now' }],
  ['choose soonest catchable arrival even if feed is out of order', [22, 8, 15], 5, { index: 1, arrivalMins: 8, leaveInMins: 2, status: 'leave-now' }],
]) {
  test(name, () => assert.deepEqual(load().getDepartureGuidance(timings.map(mins => ({ mins })), walk), expected));
}

test('App uses guidance instead of negative walking buffers', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/App.tsx'), 'utf8');
  assert.ok(source.includes('getDepartureGuidance(bus.timings, stop.walkTime)'));
  assert.ok(!source.includes('timeToLeave >= -2'));
  assert.ok(source.includes('Next catchable bus'));
});
