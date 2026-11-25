const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, writeFile, mkdir, rm } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { journal } = require('../desktop/history.cjs');

const defaultApp = (progId) => ({ progId, name: progId });
const time = '2026-11-24T10:00:00Z';
const filename = 'apply-1234abcd.jsonl';
const intent = (id, extension) => ({ kind: 'start', id, extension, time, before: defaultApp('A'), desired: 'B' });
const finish = (id) => ({ kind: 'finish', id, result: { time, after: defaultApp('B') } });

async function createFixture(t, events) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'fta-recovery-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const pending = path.join(directory, 'pending-associations');
  await mkdir(pending);
  const file = path.join(pending, filename);
  await writeFile(file, events.map((event) => JSON.stringify(event)).join('\n') + '\n{"torn":');
  return { directory, file, history: journal(directory) };
}

test('recovers completed and provable interrupted changes, without inventing uncertain history', async (t) => {
  const { history } = await createFixture(t, [
    intent('complete', '.one'), finish('complete'), intent('interrupted', '.two'),
    intent('uncertain', '.three'), intent('untouched', '.four'),
  ]);
  const states = async () => ({ '.two': defaultApp('B'), '.three': defaultApp('C'), '.four': defaultApp('A') });
  const report = await history.reconcile(states);
  assert.deepEqual(report.uncertain, ['.three']);
  assert.deepEqual((await history.read()).map(({ id, recovered }) => [id, recovered]), [['interrupted', true], ['complete', false]]);
  await history.reconcile(states);
  assert.equal((await history.read()).length, 2);
});

test('retains the worker journal after history persistence fails and reports the affected extension', async (t) => {
  const { directory, history } = await createFixture(t, [intent('complete', '.one'), finish('complete')]);
  const ledger = path.join(directory, 'association-history.jsonl');
  await mkdir(ledger);
  const report = await history.reconcile(async () => ({}));
  assert.deepEqual(report.failures.map((item) => item.extensions), [['.one']]);
  await rm(ledger, { recursive: true });
  assert.equal((await history.reconcile(async () => ({}))).failures.length, 0);
  assert.equal((await history.read())[0].id, 'complete');
});
