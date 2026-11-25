const { test } = require('node:test');
const assert = require('node:assert/strict');
const { planRestore, mapRestore, restoreGroups } = require('../desktop/migration.cjs');

const app = { id: 'target', name: 'Player B', handlers: { '.one': 'Player.B.One', '.two': 'Player.B.Two' } };
const backup = { associations: ['.one', '.two', '.three'].map((extension) => ({
  extension, progId: 'Old', name: 'Old Player', appUserModelId: '', executable: 'old.exe',
})) };

test('migration exposes both apps, reports unsupported formats and respects the chosen subset', () => {
  const catalog = { apps: [app, { id: 'current', name: 'Player A', handlers: {} }],
    types: [{ extension: '.one', currentAppId: 'current', currentProgId: 'Player.A.One' }] };
  const rows = planRestore(backup, catalog);
  const mapping = mapRestore(rows, rows[0].source, app);
  assert.equal(mapping.mapped, 2);
  assert.equal(mapping.unsupported, 1);
  assert.equal(mapping.rows[0].currentName, 'Player A');
  assert.equal(mapping.rows[0].name, 'Player B');
  assert.equal(mapping.rows[2].status, 'missing');
  assert.equal(mapping.rows[2].unsupportedBy, 'Player B');
  assert.deepEqual(restoreGroups(mapping.rows, 'all', ['.one', '.three'], () => undefined)[0].extensions, ['.one']);
  assert.deepEqual(restoreGroups(mapping.rows, 'all', [], () => undefined), []);
  assert.deepEqual(restoreGroups(mapping.rows, 'all', ['.one'], () => undefined)[0].expected, { '.one': 'Player.A.One' });
});

test('retry uses only failed rows and retains the original preview comparison', () => {
  const rows = [
    { extension: '.one', appId: 'target', status: 'changed' },
    { extension: '.two', appId: 'target', status: 'failed', currentProgId: 'Player.A.Two' },
    { extension: '.three', appId: 'target', status: 'ready' },
  ];
  const [group] = restoreGroups(rows, 'retry', [], () => undefined);
  assert.deepEqual(group.extensions, ['.two']);
  assert.deepEqual(group.expected, { '.two': 'Player.A.Two' });
});
