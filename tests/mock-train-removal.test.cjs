const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/App.tsx'), 'utf8');
const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function collect(predicate) {
  const matches = [];
  function visit(node) {
    if (predicate(node)) matches.push(node);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return matches;
}

test('mock train component, rendering, and prediction logic are absent', () => {
  for (const name of ['TrainArrivalCard', 'trainModels', 'intervalSecs', 'nextTrainSecs']) {
    assert.equal(collect(node => ts.isIdentifier(node) && node.text === name).length, 0, `${name} must be removed`);
  }
  assert.ok(!source.includes('Live Schedule'));
  assert.ok(!source.includes('Expected Train Model'));
});

test('unused Train icon import is removed', () => {
  const imports = collect(node => ts.isImportSpecifier(node));
  assert.ok(!imports.some(node => node.name.text === 'Train'));
});

test('real Chinese Garden bus stop and bus 872 destination estimate remain', () => {
  const stops = collect(node => ts.isVariableDeclaration(node) && node.name.getText(ast) === 'STOPS')[0];
  assert.equal(stops.initializer.elements.length, 12);
  assert.match(stops.getText(ast), /id: '28341', name: 'Chinese Gdn Stn'/);
  const routes = collect(node => ts.isVariableDeclaration(node) && node.name.getText(ast) === 'ETA_ROUTES')[0];
  assert.match(routes.getText(ast), /fromStop: '40481', toStop: '28341', busNo: '872'/);
  assert.ok(source.includes('/api/bus-arrival?stopCode='));
});
